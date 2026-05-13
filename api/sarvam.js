const SARVAM_BASE_URL = 'https://api.sarvam.ai';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(request, response) {
  const apiKey = process.env.SARVAM_API_KEY || process.env.VITE_SARVAM_API_KEY;

  if (!apiKey) {
    response.status(500).json({ error: 'Sarvam API key is not configured on the server.' });
    return;
  }

  const path = getSafePath(request.query.path);
  if (!path) {
    response.status(400).json({ error: 'Missing Sarvam API path.' });
    return;
  }

  const targetUrl = `${SARVAM_BASE_URL}/${path}${buildQueryString(request.query)}`;
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readRawBody(request);

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': request.headers['content-type'] || 'application/json'
    },
    body
  });

  const contentType = upstream.headers.get('content-type') || 'application/json';
  response.status(upstream.status);
  response.setHeader('Content-Type', contentType);
  response.send(Buffer.from(await upstream.arrayBuffer()));
}

function getSafePath(rawPath) {
  const path = Array.isArray(rawPath) ? rawPath[0] : rawPath;

  if (typeof path !== 'string') {
    return '';
  }

  return path.replace(/^\/+/, '').replace(/\.\./g, '');
}

function buildQueryString(query) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (key === 'path') {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (typeof value !== 'undefined') {
      params.append(key, value);
    }
  });

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}
