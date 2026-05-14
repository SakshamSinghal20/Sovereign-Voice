import { ACCEPTED_IMAGE_TYPES, DEMO_PARSED_DOCUMENT, FIELD_LABELS, LANGUAGES, MAX_API_IMAGE_BYTES } from './constants';
import { extractJsonObject, imageFileToPdfFile } from './utils';
import type { ApiAnswer, LanguageCode, ParsedDocument } from '../types';

const SARVAM_BASE_URL = 'https://api.sarvam.ai';
const SARVAM_PROXY_BASE_URL = '/api/sarvam';
const SARVAM_CHAT_MODEL = 'sarvam-30b';
const DOCUMENT_JOB_STATES_DONE = ['Completed', 'PartiallyCompleted'];
const DOCUMENT_JOB_STATES_FAILED = ['Failed'];
const USE_SERVER_PROXY = import.meta.env.PROD || import.meta.env.DEV;

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
          'You extract structured fields from OCR text of Indian identity documents. Return only valid JSON with keys: Full Name, Full Name Hindi, Document Number, Date of Birth, Address, Gender, Document Type, Issued Date, Other Details. For Aadhaar, the Full Name is the identity block name near DOB/gender. Never use S/O, D/O, C/O, father name, or address names as Full Name.'
      },
      {
        role: 'user',
        content: `OCR text:\n${prepareTextForModel(extractedText).slice(0, 12000)}`
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
  const parsedFields = parsed ? flattenFields(parsed) : {};
  const inferredFields = inferFieldsFromText(extractedText);
  const fields = {
    ...parsedFields,
    ...inferredFields
  };

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
    rawText: prepareTextForModel(extractedText || raw),
    fields,
    localizedFields: {
      en: buildFallbackLocalizedFields({ fields, rawText: extractedText || raw }, 'en')
    },
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
          'You answer questions about a parsed Indian identity document. Answer only in the requested language and native script. Do not use English labels or English sentences unless the requested language is English. Translate or transliterate names, document type, gender, and address when possible. For name questions, use Full Name from the identity block, never S/O, D/O, C/O, father name, or address names. Be concise and avoid exposing more sensitive information than the user asked for.'
      },
      {
        role: 'user',
        content: `Requested language: ${selectedLanguage.nativeName} (${selectedLanguage.sarvamCode})\nDocument context: ${JSON.stringify(getSafeDocumentContext(document))}\n\nQuestion: ${question}`
      }
    ]);
    const localizedAnswer = await ensureAnswerLanguage(answer, language);

    return {
      answer: localizedAnswer || localAnswer(question, document, language).answer,
      confidence: document.confidence
    };
  } catch (error) {
    console.warn('Sarvam chat failed, using local fallback answer.', error);
    return localAnswer(question, document, language);
  }
}

export async function localizeDocumentFields(document: ParsedDocument, language: LanguageCode): Promise<ParsedDocument> {
  if (document.localizedFields?.[language]) {
    return document;
  }

  if (language === 'en' || !hasSarvamApiKey()) {
    return {
      ...document,
      localizedFields: {
        ...document.localizedFields,
        [language]: buildFallbackLocalizedFields(document, language)
      }
    };
  }

  const selectedLanguage = getLanguage(language);

  try {
    const content = await callSarvamChat([
      {
        role: 'system',
        content:
          'Translate and transliterate parsed Indian identity document fields for display. Return only valid JSON. Use the requested language and native script for every key and every value. Keep document numbers and dates as digits. Do not use English words unless the requested language is English.'
      },
      {
        role: 'user',
        content: `Requested language: ${selectedLanguage.nativeName} (${selectedLanguage.sarvamCode})\nFields: ${JSON.stringify(buildCanonicalDisplayFields(document))}`
      }
    ]);
    const parsed = extractJsonObject(content);
    const localized = parsed ? flattenFields(parsed) : buildFallbackLocalizedFields(document, language);

    return {
      ...document,
      localizedFields: {
        ...document.localizedFields,
        [language]: localized
      }
    };
  } catch (error) {
    console.warn('Sarvam field localization failed, using local display fallback.', error);
    return {
      ...document,
      localizedFields: {
        ...document.localizedFields,
        [language]: buildFallbackLocalizedFields(document, language)
      }
    };
  }
}

export function getDocumentDisplayFields(document: ParsedDocument, language: LanguageCode) {
  return document.localizedFields?.[language] ?? buildFallbackLocalizedFields(document, language);
}

async function ensureAnswerLanguage(answer: string, language: LanguageCode) {
  if (!answer.trim() || language === 'en' || hasNativeScript(answer, language)) {
    return answer;
  }

  const selectedLanguage = getLanguage(language);
  const rewritten = await callSarvamChat([
    {
      role: 'system',
      content:
        'Rewrite the answer fully in the requested Indian language and native script. Do not add English words or English labels. Keep numbers as digits.'
    },
    {
      role: 'user',
      content: `Requested language: ${selectedLanguage.nativeName} (${selectedLanguage.sarvamCode})\nAnswer:\n${answer}`
    }
  ]);

  return rewritten || answer;
}

function hasNativeScript(value: string, language: LanguageCode) {
  if (language === 'en') {
    return true;
  }

  const scriptRanges: Record<Exclude<LanguageCode, 'en'>, RegExp> = {
    hi: /[\u0900-\u097F]/,
    ta: /[\u0B80-\u0BFF]/,
    te: /[\u0C00-\u0C7F]/,
    bn: /[\u0980-\u09FF]/
  };

  return scriptRanges[language].test(value);
}

function getSafeDocumentContext(document: ParsedDocument) {
  return {
    ...buildCanonicalDisplayFields(document),
    rawText: document.rawText.slice(0, 3000)
  };
}

function buildCanonicalDisplayFields(document: Pick<ParsedDocument, 'fields' | 'rawText'> & Partial<ParsedDocument>) {
  const values = {
    fullName: getCanonicalFieldValue(document, 'fullName'),
    documentNumber: getCanonicalFieldValue(document, 'documentNumber'),
    dateOfBirth: getCanonicalFieldValue(document, 'dateOfBirth'),
    gender: getCanonicalFieldValue(document, 'gender'),
    address: getCanonicalFieldValue(document, 'address'),
    documentType: getCanonicalFieldValue(document, 'documentType'),
    issuedDate: getCanonicalFieldValue(document, 'issuedDate')
  };

  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value)
      .map(([key, value]) => [FIELD_LABELS.en[key as keyof typeof FIELD_LABELS.en], value])
  ) as Record<string, string>;
}

function buildFallbackLocalizedFields(
  document: Pick<ParsedDocument, 'fields' | 'rawText'> & Partial<ParsedDocument>,
  language: LanguageCode
) {
  const labels = FIELD_LABELS[language];
  const entries: Array<[keyof typeof FIELD_LABELS.en, string | undefined]> = [
    ['fullName', getLocalizedFieldValue(document, 'fullName', language)],
    ['documentNumber', getLocalizedFieldValue(document, 'documentNumber', language)],
    ['dateOfBirth', getLocalizedFieldValue(document, 'dateOfBirth', language)],
    ['gender', getLocalizedFieldValue(document, 'gender', language)],
    ['address', getLocalizedFieldValue(document, 'address', language)],
    ['documentType', getLocalizedFieldValue(document, 'documentType', language)],
    ['issuedDate', getLocalizedFieldValue(document, 'issuedDate', language)]
  ];

  return Object.fromEntries(
    entries
      .filter(([, value]) => value)
      .map(([key, value]) => [labels[key], value])
  ) as Record<string, string>;
}

function getLocalizedFieldValue(
  document: Pick<ParsedDocument, 'fields' | 'rawText'> & Partial<ParsedDocument>,
  key: keyof typeof FIELD_LABELS.en,
  language: LanguageCode
) {
  const canonical = getCanonicalFieldValue(document, key);

  if (key === 'fullName' && language === 'hi') {
    return document.fields['Full Name Hindi'] ?? canonical;
  }

  if (key === 'address' && language === 'hi') {
    return document.fields['Address Hindi'] ?? canonical;
  }

  return translateStaticValue(canonical, language);
}

function getCanonicalFieldValue(
  document: Pick<ParsedDocument, 'fields' | 'rawText'> & Partial<ParsedDocument>,
  key: keyof typeof FIELD_LABELS.en
) {
  const fields = document.fields ?? {};
  const fieldMap: Record<keyof typeof FIELD_LABELS.en, Array<string | undefined>> = {
    fullName: [document.fullName, fields['Full Name'], fields.Name, fields.fullName, fields.full_name],
    documentNumber: [document.documentNumber, fields['Document Number'], fields['Aadhaar Number'], fields['PAN Number']],
    dateOfBirth: [document.dateOfBirth, fields['Date of Birth'], fields.DOB, fields['Birth Date']],
    gender: [document.gender, fields.Gender, fields.Sex],
    address: [document.address, fields.Address, fields['Residential Address']],
    documentType: [document.documentType, fields['Document Type'], fields.Type],
    issuedDate: [document.issuedDate, fields['Issued Date'], fields['Date of Issue']]
  };

  return fieldMap[key].find((value) => value && value !== 'Not visible' && value !== 'null')?.trim();
}

function translateStaticValue(value: string | undefined, language: LanguageCode) {
  if (!value || language === 'en') {
    return value;
  }

  const normalized = value.toLowerCase();
  const dictionary: Record<string, Record<Exclude<LanguageCode, 'en'>, string>> = {
    aadhaar: { hi: 'आधार', ta: 'ஆதார்', te: 'ఆధార్', bn: 'আধার' },
    male: { hi: 'पुरुष', ta: 'ஆண்', te: 'పురుషుడు', bn: 'পুরুষ' },
    female: { hi: 'महिला', ta: 'பெண்', te: 'మహిళ', bn: 'মহিলা' },
    'indian identity': { hi: 'भारतीय पहचान दस्तावेज़', ta: 'இந்திய அடையாள ஆவணம்', te: 'భారతీయ గుర్తింపు పత్రం', bn: 'ভারতীয় পরিচয় নথি' }
  };

  return dictionary[normalized]?.[language] ?? value;
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
    name: getLocalizedFieldValue(document, 'fullName', language),
    number: getLocalizedFieldValue(document, 'documentNumber', language),
    dob: getLocalizedFieldValue(document, 'dateOfBirth', language),
    address: getLocalizedFieldValue(document, 'address', language),
    gender: getLocalizedFieldValue(document, 'gender', language),
    type: getLocalizedFieldValue(document, 'documentType', language) ?? translateStaticValue('Indian identity', language)
  };
  const summary = compactDocumentSummary(document, language);

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
  const prepared = prepareTextForModel(text);
  const lines = prepared
    .split(/\r?\n/)
    .map((line) => cleanOcrLine(line))
    .filter(Boolean);
  const normalized = lines.join('\n');
  const identityBlock = extractAadhaarIdentityBlock(lines);
  const dobMatch = normalized.match(/(?:DOB|Date of Birth|जन्म तिथि)[^\d]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const genderMatch = normalized.match(/\b(MALE|FEMALE|पुरुष|महिला)\b/i);
  const aadhaarNumber = findAadhaarNumber(lines);
  const issuedMatch = normalized.match(/(?:Aadhaar no\. issued|issued)[^\d]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const address = extractAddressFromLines(lines);

  if (identityBlock.englishName) fields['Full Name'] = identityBlock.englishName;
  if (identityBlock.nativeName) fields['Full Name Hindi'] = identityBlock.nativeName;
  if (dobMatch?.[1]) fields['Date of Birth'] = dobMatch[1].trim();
  if (genderMatch?.[1]) fields.Gender = normalizeGender(genderMatch[1]);
  if (aadhaarNumber) fields['Document Number'] = aadhaarNumber;
  if (issuedMatch?.[1]) fields['Issued Date'] = issuedMatch[1].trim();
  if (address) fields.Address = address;
  fields['Document Type'] = inferDocumentType(text);

  return fields;
}

function extractAadhaarIdentityBlock(lines: string[]) {
  const dobIndex = lines.findIndex((line) => /DOB|Date of Birth|जन्म तिथि/i.test(line));
  const searchWindow =
    dobIndex >= 0 ? lines.slice(Math.max(0, dobIndex - 5), Math.min(lines.length, dobIndex + 3)) : lines.slice(0, 12);
  const englishName = [...searchWindow].reverse().find(isLikelyEnglishPersonName);
  const nativeName = [...searchWindow].reverse().find(isLikelyHindiPersonName);

  return {
    englishName: englishName ? normalizePersonName(englishName) : '',
    nativeName: nativeName ? compactFieldValue(nativeName, 80) : ''
  };
}

function isLikelyEnglishPersonName(line: string) {
  const cleaned = normalizePersonName(line);
  if (!/^[A-Z][A-Z .'-]{2,}$/.test(cleaned)) {
    return false;
  }

  if (cleaned.split(/\s+/).length < 2) {
    return false;
  }

  return !/(GOVERNMENT|INDIA|AADHAAR|UIDAI|UNIQUE|IDENTIFICATION|AUTHORITY|ADDRESS|MALE|FEMALE|DOB|DATE|ISSUED|VID|S\/O|D\/O|C\/O)/i.test(
    cleaned
  );
}

function isLikelyHindiPersonName(line: string) {
  return /[\u0900-\u097F]/.test(line) && !/(भारत|सरकार|जन्म|तिथि|पुरुष|महिला|पता|आधार|पहचान|प्राधिकरण)/.test(line);
}

function normalizePersonName(value: string) {
  return value
    .replace(/[^A-Za-z .'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeGender(value: string) {
  if (/female|महिला/i.test(value)) {
    return 'Female';
  }

  if (/male|पुरुष/i.test(value)) {
    return 'Male';
  }

  return compactFieldValue(value, 40);
}

function findAadhaarNumber(lines: string[]) {
  const candidates = lines
    .filter((line) => !/\bVID\b/i.test(line))
    .flatMap((line) => line.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/g) ?? [])
    .map(formatAadhaarNumber);

  return candidates.find(Boolean) ?? '';
}

function formatAadhaarNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 12 ? `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}` : value.trim();
}

function extractAddressFromLines(lines: string[]) {
  const startIndex = lines.findIndex((line) => /^Address:?$/i.test(line) || /^Address:/i.test(line));
  if (startIndex === -1) {
    return '';
  }

  const collected: string[] = [];
  const firstLine = lines[startIndex].replace(/^Address:\s*/i, '').trim();
  if (firstLine) {
    collected.push(firstLine);
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      /^(VID|Details|Aadhaar|AADHAAR|1947|help@|www\.uidai|The image|This image)/i.test(line) ||
      /\b\d{4}\s?\d{4}\s?\d{4}\b/.test(line)
    ) {
      break;
    }

    collected.push(line);
  }

  return compactFieldValue(collected.join('\n'), 260);
}

function cleanOcrLine(line: string) {
  return line
    .replace(/^["',{}\[\]]+|["',{}\[\]]+$/g, '')
    .replace(/^text:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactFieldValue(value: string, maxLength: number) {
  return value
    .split(/\r?\n/)
    .map((line) => cleanOcrLine(line))
    .filter(Boolean)
    .join(', ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .slice(0, maxLength)
    .trim();
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

  if (!entries.length) {
    throw new Error('Sarvam returned a zip, but no readable text output was found inside it.');
  }

  const metadataText = entries
    .filter((entry) => entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => textFromJsonEntry(entry.text))
    .filter(Boolean)
    .join('\n');
  const markdownText = entries
    .filter((entry) => /\.(md|txt|html)$/i.test(entry.name))
    .map((entry) => cleanExtractedText(entry.text))
    .filter(Boolean)
    .join('\n');

  const combined = [metadataText, markdownText].filter(Boolean).join('\n\n').trim();
  if (!combined) {
    throw new Error('Sarvam returned a zip, but the OCR text was empty.');
  }

  return combined;
}

function textFromJsonEntry(text: string) {
  try {
    return collectText(JSON.parse(text)).join('\n').trim();
  } catch {
    return cleanExtractedText(text);
  }
}

function cleanExtractedText(text: string) {
  return text
    .replace(/!\[[^\]]*]\(data:image\/[^)]*\)/gi, ' ')
    .replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=\s]+/gi, ' ')
    .replace(/"text"\s*:\s*"/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function prepareTextForModel(text: string) {
  return cleanExtractedText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^image$/i.test(line))
    .join('\n')
    .trim();
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
    const trimmed = value.trim();
    if (
      !trimmed ||
      /^data:image\//i.test(trimmed) ||
      /^\*?The image\b/i.test(trimmed) ||
      /^This image\b/i.test(trimmed) ||
      /^It consists of\b/i.test(trimmed)
    ) {
      return [];
    }

    return [trimmed];
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [];
  }

  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'number')) {
      return [];
    }

    return value.flatMap(collectText);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !/url|metadata|id|created|updated|bbox|bound|coordinate|confidence|score|page|width|height|angle/i.test(key))
      .flatMap(([, nested]) => collectText(nested));
  }

  return [];
}

function compactDocumentSummary(document: ParsedDocument, language: LanguageCode = 'en') {
  const entries = Object.entries(getDocumentDisplayFields(document, language)).filter(([, value]) => value);

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
