import { ACCEPTED_IMAGE_TYPES, DEMO_PARSED_DOCUMENT, LANGUAGES, MAX_API_IMAGE_BYTES } from './constants';
import { extractJsonObject, imageFileToPdfFile } from './utils';
import type { ApiAnswer, LanguageCode, ParsedDocument } from '../types';

const SARVAM_BASE_URL = 'https://api.sarvam.ai';
const SARVAM_PROXY_BASE_URL = '/api/sarvam';
const SARVAM_CHAT_MODEL = 'sarvam-30b';
const DOCUMENT_JOB_STATES_DONE = ['Completed', 'PartiallyCompleted'];
const DOCUMENT_JOB_STATES_FAILED = ['Failed'];
const USE_SERVER_PROXY = import.meta.env.PROD;

interface SarvamChatPayload {
  choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
}

interface SarvamJobResponse {
  job_id: string;
  job_state: string;
  error_message?: string | null;
}

interface SarvamUploadResponse {
  upload_urls?: Record<string, { file_url?: string; upload_url?: string; url?: string }>;
}

interface SarvamDownloadResponse {
  download_urls?: Record<
    string,
    { file_url?: string; download_url?: string; url?: string; file_metadata?: { contentType?: string } }
  >;
  error_message?: string | null;
}

function getApiKey() {
  return import.meta.env.VITE_SARVAM_API_KEY ?? '';
}

export function hasSarvamApiKey() {
  return USE_SERVER_PROXY || Boolean(getApiKey());
}

function getLanguage(language: LanguageCode) {
  return LANGUAGES.find((item) => item.code === language) ?? LANGUAGES[0];
}

function getSarvamHeaders(): Record<string, string> {
  if (USE_SERVER_PROXY) {
    return { 'Content-Type': 'application/json' };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Missing Sarvam API key. Add VITE_SARVAM_API_KEY to .env.local and restart the dev server.');
  }

  return {
    'api-subscription-key': apiKey,
    'Content-Type': 'application/json'
  };
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Sarvam API request failed: ${response.status} ${stripHtml(detail)}`);
  }

  return (await response.json()) as T;
}

async function callSarvamChat(messages: Array<{ role: 'system' | 'user'; content: string }>) {
  const payload = await requestJson<SarvamChatPayload>(sarvamUrl('/v1/chat/completions'), {
    method: 'POST',
    headers: getSarvamHeaders(),
    body: JSON.stringify({
      model: SARVAM_CHAT_MODEL,
      temperature: 0.2,
      max_tokens: 1200,
      reasoning_effort: 'low',
      messages
    })
  });

  return payload.choices?.[0]?.message?.content?.trim() ?? '';
}

export async function analyzeDocumentImage(file: File, language: LanguageCode): Promise<ParsedDocument> {
  if (!hasSarvamApiKey()) {
    return {
      ...DEMO_PARSED_DOCUMENT,
      rawText: `${DEMO_PARSED_DOCUMENT.rawText}\n\nDemo mode was used because no Sarvam API key is configured.`
    };
  }

  const directResult = await tryDirectDocumentAnalysis(file, language);
  if (directResult) {
    return directResult;
  }

  const selectedLanguage = getLanguage(language);
  const uploadFile = await prepareSarvamUploadFile(file);
  const job = await requestJson<SarvamJobResponse>(sarvamUrl('/doc-digitization/job/v1'), {
    method: 'POST',
    headers: getSarvamHeaders(),
    body: JSON.stringify({
      job_parameters: {
        language: selectedLanguage.sarvamCode,
        output_format: 'md'
      }
    })
  });

  const upload = await requestJson<SarvamUploadResponse>(sarvamUrl('/doc-digitization/job/v1/upload-files'), {
    method: 'POST',
    headers: getSarvamHeaders(),
    body: JSON.stringify({
      job_id: job.job_id,
      files: [uploadFile.name]
    })
  });

  const uploadUrl = getFileUrl(upload.upload_urls, uploadFile.name);
  if (!uploadUrl) {
    throw new Error('Sarvam did not return an upload URL for the document.');
  }

  await uploadToSignedUrl(uploadUrl, uploadFile);

  await requestJson<SarvamJobResponse>(sarvamUrl(`/doc-digitization/job/v1/${job.job_id}/start`), {
    method: 'POST',
    headers: getSarvamHeaders(),
    body: JSON.stringify({})
  });

  const status = await waitForDocumentJob(job.job_id);
  if (DOCUMENT_JOB_STATES_FAILED.includes(status.job_state)) {
    throw new Error(status.error_message ?? 'Sarvam could not process this document.');
  }

  const extractedText = await downloadDocumentText(job.job_id);
  return structureExtractedText(extractedText, language);
}

async function tryDirectDocumentAnalysis(file: File, language: LanguageCode) {
  if (USE_SERVER_PROXY) {
    return null;
  }

  const selectedLanguage = getLanguage(language);
  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('language_code', selectedLanguage.sarvamCode);

  try {
    const response = await fetch(`${SARVAM_BASE_URL}/docint/v1/analyze`, {
      method: 'POST',
      headers: { 'api-subscription-key': getApiKey() },
      body: formData
    });

    if ([403, 404, 405].includes(response.status)) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Sarvam document analysis failed: ${response.status} ${stripHtml(await response.text())}`);
    }

    const payload = await response.json();
    const raw = JSON.stringify(payload);
    const extractedText = collectText(payload).join('\n').trim() || raw;
    return normalizeParsedDocument(raw, extractedText, language);
  } catch (error) {
    if (error instanceof TypeError) {
      return null;
    }

    throw error;
  }
}

async function waitForDocumentJob(jobId: string) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const status = await requestJson<SarvamJobResponse>(sarvamUrl(`/doc-digitization/job/v1/${jobId}/status`), {
      method: 'GET',
      headers: getSarvamHeaders()
    });

    if (DOCUMENT_JOB_STATES_DONE.includes(status.job_state) || DOCUMENT_JOB_STATES_FAILED.includes(status.job_state)) {
      return status;
    }

    await delay(2500);
  }

  throw new Error('Sarvam is still processing this document. Please retry in a moment.');
}

async function prepareSarvamUploadFile(file: File) {
  if (file.type === 'application/pdf') {
    return file;
  }

  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return imageFileToPdfFile(file, MAX_API_IMAGE_BYTES);
  }

  throw new Error('Unsupported document type. Please upload a JPG, PNG, WEBP, or PDF file.');
}

async function downloadDocumentText(jobId: string) {
  const payload = await requestJson<SarvamDownloadResponse>(sarvamUrl(`/doc-digitization/job/v1/${jobId}/download-files`), {
    method: 'POST',
    headers: getSarvamHeaders(),
    body: JSON.stringify({})
  });

  if (payload.error_message) {
    throw new Error(payload.error_message);
  }

  const entries = Object.entries(payload.download_urls ?? {});
  const preferred =
    entries.find(([name, value]) => {
      const contentType = value.file_metadata?.contentType ?? '';
      return name.toLowerCase().endsWith('.json') || contentType.includes('json');
    }) ??
    entries.find(([name]) => /\.(md|txt|html)$/i.test(name)) ??
    entries.find(([name]) => /\.zip$/i.test(name)) ??
    entries[0];

  const downloadUrl = preferred ? getFileUrl({ [preferred[0]]: preferred[1] }, preferred[0]) : '';
  if (!downloadUrl) {
    throw new Error('Sarvam completed the job but did not return a readable output file.');
  }

  const response = await fetch(storageDownloadUrl(downloadUrl));
  if (!response.ok) {
    throw new Error(`Unable to download Sarvam output: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? preferred?.[1].file_metadata?.contentType ?? '';
  if (contentType.includes('zip') || preferred?.[0].toLowerCase().endsWith('.zip')) {
    return extractTextFromZip(await response.arrayBuffer());
  }

  if (contentType.includes('json') || preferred?.[0].toLowerCase().endsWith('.json')) {
    const json = await response.json();
    return collectText(json).join('\n').trim() || JSON.stringify(json);
  }

  return response.text();
}

async function structureExtractedText(extractedText: string, language: LanguageCode) {
  try {
    const content = await callSarvamChat([
      {
        role: 'system',
        content:
          'You extract structured fields from OCR text of Indian identity documents. Return only valid JSON with keys: Full Name, Document Number, Date of Birth, Address, Gender, Document Type, Issued Date, Other Details.'
      },
      {
        role: 'user',
        content: `OCR text:\n${extractedText.slice(0, 12000)}`
      }
    ]);

    return normalizeParsedDocument(content, extractedText, language);
  } catch (error) {
    console.warn('Sarvam structuring failed, using raw OCR fallback.', error);
    return normalizeParsedDocument('{}', extractedText, language);
  }
}

function normalizeParsedDocument(raw: string, extractedText: string, language: LanguageCode): ParsedDocument {
  const parsed = extractJsonObject(raw);
  const fields = parsed ? flattenFields(parsed) : inferFieldsFromText(extractedText);

  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = fields[key] ?? fields[key.toLowerCase()] ?? fields[key.replace(/\s/g, '_')];
      if (value && value !== 'Not visible' && value !== 'null') {
        return value;
      }
    }

    return undefined;
  };

  return {
    fullName: pick('Full Name', 'Name', 'fullName', 'full_name'),
    documentNumber: pick('Document Number', 'Aadhaar Number', 'PAN Number', 'ID Number', 'documentNumber'),
    dateOfBirth: pick('Date of Birth', 'DOB', 'Birth Date', 'dateOfBirth'),
    address: pick('Address', 'Residential Address'),
    gender: pick('Gender', 'Sex'),
    documentType: pick('Document Type', 'Type') ?? inferDocumentType(extractedText),
    issuedDate: pick('Issued Date', 'Date of Issue'),
    rawText: extractedText || raw,
    fields,
    confidence: parsed ? 0.88 : language === 'en' ? 0.74 : 0.7
  };
}

export async function askQuestionAboutDocument(
  question: string,
  document: ParsedDocument,
  language: LanguageCode
): Promise<ApiAnswer> {
  if (!hasSarvamApiKey()) {
    return localAnswer(question, document, language);
  }

  const selectedLanguage = getLanguage(language);

  try {
    const answer = await callSarvamChat([
      {
        role: 'system',
        content:
          'You answer questions about a parsed Indian identity document. Answer only in the requested language. Be concise, helpful, and avoid exposing more sensitive information than the user asked for.'
      },
      {
        role: 'user',
        content: `Requested language: ${selectedLanguage.nativeName} (${selectedLanguage.sarvamCode})\nDocument context: ${JSON.stringify(document)}\n\nQuestion: ${question}`
      }
    ]);

    return {
      answer: answer || localAnswer(question, document, language).answer,
      confidence: document.confidence
    };
  } catch (error) {
    console.warn('Sarvam chat failed, using local fallback answer.', error);
    return localAnswer(question, document, language);
  }
}

function localAnswer(question: string, document: ParsedDocument, language: LanguageCode): ApiAnswer {
  const lowerQuestion = question.toLowerCase();
  const asksName = /name|correct|नाम|பெயர்|పేరు|নাম/.test(lowerQuestion);
  const asksNumber = /aadhaar|आधार|ஆதார்|ఆధార్|আধার|number|नंबर|எண்|నంబర్|নম্বর|pan/.test(lowerQuestion);
  const asksDob = /birth|dob|जन्म|பிறந்த|పుట్టిన|জন্ম/.test(lowerQuestion);
  const asksAddress = /address|पता|முகவரி|చిరునామా|ঠিকানা/.test(lowerQuestion);
  const asksGender = /gender|male|female|लिंग|பாலினம்|లింగం|লিঙ্গ/.test(lowerQuestion);
  const asksDocumentType = /what is this|document type|which document|कौन सा|என்ன ஆவணம்|ఏ పత్రం|কোন নথি/.test(lowerQuestion);
  const asksAllDetails = /all details|extract all|सारी जानकारी|அனைத்து|అన్ని|সব তথ্য/.test(lowerQuestion);

  const values = {
    name: document.fullName ?? document.fields.Name,
    number: document.documentNumber,
    dob: document.dateOfBirth,
    address: document.address,
    gender: document.gender,
    type: document.documentType ?? 'Indian identity'
  };
  const summary = compactDocumentSummary(document);

  const templates: Record<LanguageCode, Record<string, string>> = {
    en: {
      name: `The name on this document is ${values.name ?? 'not clearly visible'}.`,
      number: `The document number is ${values.number ?? 'not clearly visible'}.`,
      dob: `The date of birth is ${values.dob ?? 'not clearly visible'}.`,
      address: `The address is ${values.address ?? 'not clearly visible'}.`,
      gender: `The gender is ${values.gender ?? 'not clearly visible'}.`,
      type: `This appears to be an ${values.type} document.`,
      details: `I found these details: ${summary}`,
      fallback: `I found these details: ${summary}`
    },
    hi: {
      name: `इस दस्तावेज़ में नाम ${values.name ?? 'स्पष्ट नहीं दिख रहा'} है।`,
      number: `दस्तावेज़ नंबर ${values.number ?? 'स्पष्ट नहीं दिख रहा'} है।`,
      dob: `जन्म तिथि ${values.dob ?? 'स्पष्ट नहीं दिख रही'} है।`,
      address: `पता ${values.address ?? 'स्पष्ट नहीं दिख रहा'} है।`,
      gender: `लिंग ${values.gender ?? 'स्पष्ट नहीं दिख रहा'} है।`,
      type: `यह ${values.type} दस्तावेज़ लगता है।`,
      details: `मुझे ये जानकारी मिली: ${summary}`,
      fallback: `मुझे ये जानकारी मिली: ${summary}`
    },
    ta: {
      name: `இந்த ஆவணத்தில் பெயர் ${values.name ?? 'தெளிவாக தெரியவில்லை'}.`,
      number: `ஆவண எண் ${values.number ?? 'தெளிவாக தெரியவில்லை'}.`,
      dob: `பிறந்த தேதி ${values.dob ?? 'தெளிவாக தெரியவில்லை'}.`,
      address: `முகவரி ${values.address ?? 'தெளிவாக தெரியவில்லை'}.`,
      gender: `பாலினம் ${values.gender ?? 'தெளிவாக தெரியவில்லை'}.`,
      type: `இது ${values.type} ஆவணமாக தெரிகிறது.`,
      details: `நான் கண்ட விவரங்கள்: ${summary}`,
      fallback: `நான் கண்ட விவரங்கள்: ${summary}`
    },
    te: {
      name: `ఈ పత్రంలో పేరు ${values.name ?? 'స్పష్టంగా కనిపించడం లేదు'}.`,
      number: `పత్రం నంబర్ ${values.number ?? 'స్పష్టంగా కనిపించడం లేదు'}.`,
      dob: `పుట్టిన తేదీ ${values.dob ?? 'స్పష్టంగా కనిపించడం లేదు'}.`,
      address: `చిరునామా ${values.address ?? 'స్పష్టంగా కనిపించడం లేదు'}.`,
      gender: `లింగం ${values.gender ?? 'స్పష్టంగా కనిపించడం లేదు'}.`,
      type: `ఇది ${values.type} పత్రంలా కనిపిస్తోంది.`,
      details: `నాకు కనిపించిన వివరాలు: ${summary}`,
      fallback: `నాకు కనిపించిన వివరాలు: ${summary}`
    },
    bn: {
      name: `এই নথিতে নাম ${values.name ?? 'স্পষ্ট দেখা যাচ্ছে না'}।`,
      number: `নথির নম্বর ${values.number ?? 'স্পষ্ট দেখা যাচ্ছে না'}।`,
      dob: `জন্মতারিখ ${values.dob ?? 'স্পষ্ট দেখা যাচ্ছে না'}।`,
      address: `ঠিকানা ${values.address ?? 'স্পষ্ট দেখা যাচ্ছে না'}।`,
      gender: `লিঙ্গ ${values.gender ?? 'স্পষ্ট দেখা যাচ্ছে না'}।`,
      type: `এটি ${values.type} নথি বলে মনে হচ্ছে।`,
      details: `আমি এই তথ্যগুলো পেয়েছি: ${summary}`,
      fallback: `আমি এই তথ্যগুলো পেয়েছি: ${summary}`
    }
  };

  const key = asksName
    ? 'name'
    : asksNumber
      ? 'number'
      : asksDob
        ? 'dob'
        : asksAddress
          ? 'address'
          : asksGender
            ? 'gender'
            : asksDocumentType
              ? 'type'
              : asksAllDetails
                ? 'details'
                : 'fallback';

  return {
    answer: templates[language][key],
    confidence: document.confidence
  };
}

function flattenFields(parsed: Record<string, unknown>) {
  const fields: Record<string, string> = {};

  Object.entries(parsed).forEach(([key, value]) => {
    if (value === null || typeof value === 'undefined') {
      return;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      fields[key] = String(value);
    } else if (Array.isArray(value) || typeof value === 'object') {
      fields[key] = JSON.stringify(value);
    }
  });

  return fields;
}

function inferFieldsFromText(text: string) {
  const fields: Record<string, string> = {};
  const normalized = text.replace(/\s+/g, ' ');
  const nameMatch = normalized.match(/(?:Name|नाम)\s*[:\-]?\s*([A-Z][A-Z\s]{3,})/i);
  const dobMatch = normalized.match(/(?:DOB|Date of Birth|जन्म तिथि)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const genderMatch = normalized.match(/\b(MALE|FEMALE|पुरुष|महिला)\b/i);
  const aadhaarMatch = normalized.match(/\b\d{4}\s\d{4}\s\d{4}\b/);

  if (nameMatch?.[1]) fields['Full Name'] = nameMatch[1].trim();
  if (dobMatch?.[1]) fields['Date of Birth'] = dobMatch[1].trim();
  if (genderMatch?.[1]) fields.Gender = genderMatch[1].trim();
  if (aadhaarMatch?.[0]) fields['Document Number'] = aadhaarMatch[0].trim();
  fields['Document Type'] = inferDocumentType(text);

  return fields;
}

async function extractTextFromZip(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const entries: Array<{ name: string; text: string }> = [];
  let offset = 0;

  while (offset + 30 < bytes.length) {
    const signature = readUInt32(bytes, offset);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const compressionMethod = readUInt16(bytes, offset + 8);
    const compressedSize = readUInt32(bytes, offset + 18);
    const fileNameLength = readUInt16(bytes, offset + 26);
    const extraFieldLength = readUInt16(bytes, offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const dataStart = fileNameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;
    const fileName = decoder.decode(bytes.slice(fileNameStart, fileNameEnd));

    if (dataEnd > bytes.length || compressedSize === 0) {
      offset = dataStart;
      continue;
    }

    if (/\.(md|txt|json|html)$/i.test(fileName)) {
      const compressed = bytes.slice(dataStart, dataEnd);
      const fileBytes =
        compressionMethod === 0
          ? compressed
          : compressionMethod === 8
            ? await inflateRaw(compressed)
            : new Uint8Array();

      if (fileBytes.length) {
        entries.push({ name: fileName, text: decoder.decode(fileBytes) });
      }
    }

    offset = dataEnd;
  }

  const preferred =
    entries.find((entry) => entry.name.toLowerCase().endsWith('.md')) ??
    entries.find((entry) => entry.name.toLowerCase().endsWith('.json')) ??
    entries[0];

  if (!preferred) {
    throw new Error('Sarvam returned a zip, but no readable text output was found inside it.');
  }

  if (preferred.name.toLowerCase().endsWith('.json')) {
    try {
      return collectText(JSON.parse(preferred.text)).join('\n').trim() || preferred.text;
    } catch {
      return preferred.text;
    }
  }

  return preferred.text;
}

async function inflateRaw(bytes: Uint8Array) {
  const DecompressionStreamCtor = globalThis.DecompressionStream;
  if (!DecompressionStreamCtor) {
    throw new Error('This browser cannot decompress Sarvam zip output. Please use Chrome or Edge.');
  }

  const byteCopy = bytes.slice();
  const stream = new Blob([byteCopy.buffer]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readUInt16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function inferDocumentType(text: string) {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('aadhaar') || lowerText.includes('uidai') || lowerText.includes('unique identification')) {
    return 'Aadhaar';
  }

  if (lowerText.includes('permanent account number') || /\bpan\b/i.test(text)) {
    return 'PAN';
  }

  if (lowerText.includes('passport')) {
    return 'Passport';
  }

  if (lowerText.includes('election commission') || lowerText.includes('voter')) {
    return 'Voter ID';
  }

  return 'Indian identity';
}

function getFileUrl(
  urls: Record<string, { file_url?: string; upload_url?: string; url?: string; download_url?: string }> | undefined,
  fileName: string
) {
  const entry = urls?.[fileName] ?? Object.values(urls ?? {})[0];
  return entry?.file_url ?? entry?.upload_url ?? entry?.download_url ?? entry?.url ?? '';
}

async function uploadToSignedUrl(url: string, file: File) {
  if (USE_SERVER_PROXY) {
    const response = await fetch(storageUploadUrl(url), {
      method: 'POST',
      headers: {
        'Content-Type': file.type
      },
      body: file
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Unable to upload document through server proxy: ${response.status} ${stripHtml(detail)}`);
    }

    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': file.type
  };

  if (url.includes('blob.core.windows.net')) {
    headers['x-ms-blob-type'] = 'BlockBlob';
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: file
  });

  if (!response.ok) {
    throw new Error(`Unable to upload document to Sarvam storage: ${response.status}`);
  }
}

function collectText(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectText);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !/url|metadata|id|created|updated/i.test(key))
      .flatMap(([, nested]) => collectText(nested));
  }

  return [];
}

function compactDocumentSummary(document: ParsedDocument) {
  const entries = Object.entries(document.fields).filter(([, value]) => value);

  if (!entries.length) {
    return document.rawText.slice(0, 500);
  }

  return entries
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
}

function delay(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function sarvamUrl(path: string) {
  return `${USE_SERVER_PROXY ? SARVAM_PROXY_BASE_URL : SARVAM_BASE_URL}${path}`;
}

function storageUploadUrl(url: string) {
  return `/api/storage/upload?url=${encodeURIComponent(url)}`;
}

function storageDownloadUrl(url: string) {
  return USE_SERVER_PROXY ? `/api/storage/download?url=${encodeURIComponent(url)}` : url;
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
