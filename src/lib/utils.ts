import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function createId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function dataUrlToFile(dataUrl: string, fileName: string) {
  const [meta, content] = dataUrl.split(',');
  const mimeMatch = meta.match(/data:(.*);base64/);
  const mimeType = mimeMatch?.[1] ?? 'image/svg+xml';
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], fileName, { type: mimeType });
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

export async function compressImage(file: File, maxBytes: number): Promise<string> {
  const dataUrl = await fileToDataUrl(file);

  if (file.size <= maxBytes) {
    return dataUrl;
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Unable to load image for compression.'));
    element.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image compression is not supported in this browser.');
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let compressed = canvas.toDataURL('image/jpeg', quality);

  while (compressed.length * 0.75 > maxBytes && quality > 0.35) {
    quality -= 0.08;
    compressed = canvas.toDataURL('image/jpeg', quality);
  }

  return compressed;
}

export async function imageFileToJpegFile(file: File, maxBytes: number): Promise<File> {
  const { blob } = await imageFileToJpegBlob(file, maxBytes);
  return new File([blob], 'document.jpg', { type: 'image/jpeg' });
}

export async function imageFileToPdfFile(file: File, maxBytes: number): Promise<File> {
  const { blob, width, height } = await imageFileToJpegBlob(file, maxBytes);
  const imageBytes = new Uint8Array(await blob.arrayBuffer());
  const maxPageWidth = 612;
  const pageWidth = Math.min(maxPageWidth, width);
  const pageHeight = Math.round((height / width) * pageWidth);
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    {
      prefix: `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
      bytes: imageBytes,
      suffix: '\nendstream\nendobj\n'
    },
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`
  ];

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n')];
  const offsets: number[] = [0];
  let byteOffset = chunks[0].length;

  objects.forEach((object) => {
    offsets.push(byteOffset);
    const objectChunks =
      typeof object === 'string'
        ? [encoder.encode(object)]
        : [encoder.encode(object.prefix), object.bytes, encoder.encode(object.suffix)];

    objectChunks.forEach((chunk) => {
      chunks.push(chunk);
      byteOffset += chunk.length;
    });
  });

  const xrefOffset = byteOffset;
  const xrefRows = offsets
    .map((offset, index) => (index === 0 ? '0000000000 65535 f ' : `${String(offset).padStart(10, '0')} 00000 n `))
    .join('\n');
  const trailer = `xref\n0 ${offsets.length}\n${xrefRows}\ntrailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(trailer));

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const pdfBytes = new Uint8Array(totalLength);
  let cursor = 0;

  chunks.forEach((chunk) => {
    pdfBytes.set(chunk, cursor);
    cursor += chunk.length;
  });

  return new File([pdfBytes.buffer], 'document.pdf', { type: 'application/pdf' });
}

async function imageFileToJpegBlob(file: File, maxBytes: number) {
  const dataUrl = await fileToDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Unable to load image for upload.'));
    element.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image conversion is not supported in this browser.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.86;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > maxBytes && quality > 0.35) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }

  return {
    blob,
    width: canvas.width,
    height: canvas.height
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Unable to prepare image for upload.'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}

export function extractJsonObject(text: string) {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
