export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).send('Method not allowed');
    return;
  }

  const targetUrl = getSafeStorageUrl(request.query.url);
  if (!targetUrl) {
    response.status(400).send('Invalid storage URL');
    return;
  }

  const body = await readRawBody(request);
  const headers = {
    'Content-Type': request.headers['content-type'] || 'application/pdf'
  };

  if (targetUrl.hostname.includes('blob.core.windows.net')) {
    headers['x-ms-blob-type'] = 'BlockBlob';
  }

  const upstream = await fetch(targetUrl.toString(), {
    method: 'PUT',
    headers,
    body
  });

  response.status(upstream.status).send(await upstream.text());
}

function getSafeStorageUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    const isAllowed =
      url.protocol === 'https:' &&
      (url.hostname.includes('blob.core.windows.net') || url.hostname.includes('storage.googleapis.com'));

    return isAllowed ? url : null;
  } catch {
    return null;
  }
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}
