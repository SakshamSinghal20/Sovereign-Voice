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

  return new File([blob], 'document.jpg', { type: 'image/jpeg' });
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
