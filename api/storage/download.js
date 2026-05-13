export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.status(405).send('Method not allowed');
    return;
  }

  const targetUrl = getSafeStorageUrl(request.query.url);
  if (!targetUrl) {
    response.status(400).send('Invalid storage URL');
    return;
  }

  const upstream = await fetch(targetUrl.toString());
  const contentType = upstream.headers.get('content-type') || 'text/plain';
  response.status(upstream.status);
  response.setHeader('Content-Type', contentType);
  response.send(Buffer.from(await upstream.arrayBuffer()));
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
