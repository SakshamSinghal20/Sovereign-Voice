import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const sarvamKey = env.SARVAM_API_KEY || env.VITE_SARVAM_API_KEY || '';

  return {
    plugins: [react(), sarvamDevProxy(sarvamKey)],
    build: {
      target: 'es2020'
    }
  };
});

function sarvamDevProxy(apiKey: string): Plugin {
  return {
    name: 'sarvam-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/sarvam', async (request, response) => {
        if (!apiKey) {
          sendText(response, 500, 'Sarvam API key is not configured in .env.local.');
          return;
        }

        try {
          const targetUrl = new URL(request.url || '/', 'https://api.sarvam.ai');
          const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readRawBody(request);
          const upstream = await fetch(targetUrl, {
            method: request.method,
            headers: {
              'api-subscription-key': apiKey,
              'Content-Type': request.headers['content-type'] || 'application/json'
            },
            body
          });
          await pipeResponse(upstream, response);
        } catch (error) {
          sendText(response, 502, error instanceof Error ? error.message : 'Sarvam proxy request failed.');
        }
      });

      server.middlewares.use('/api/storage/upload', async (request, response) => {
        try {
          const target = getAllowedStorageUrl(request.url);
          if (!target) {
            sendText(response, 400, 'Missing or unsupported storage URL.');
            return;
          }

          const body = await readRawBody(request);
          const headers: Record<string, string> = {
            'Content-Type': request.headers['content-type'] || 'application/octet-stream'
          };

          if (target.hostname.includes('blob.core.windows.net')) {
            headers['x-ms-blob-type'] = 'BlockBlob';
          }

          const upstream = await fetch(target, {
            method: 'PUT',
            headers,
            body
          });
          await pipeResponse(upstream, response);
        } catch (error) {
          sendText(response, 502, error instanceof Error ? error.message : 'Storage upload proxy failed.');
        }
      });

      server.middlewares.use('/api/storage/download', async (request, response) => {
        try {
          const target = getAllowedStorageUrl(request.url);
          if (!target) {
            sendText(response, 400, 'Missing or unsupported storage URL.');
            return;
          }

          const upstream = await fetch(target);
          await pipeResponse(upstream, response);
        } catch (error) {
          sendText(response, 502, error instanceof Error ? error.message : 'Storage download proxy failed.');
        }
      });
    }
  };
}

function getAllowedStorageUrl(requestUrl = '') {
  const url = new URL(requestUrl, 'http://localhost');
  const target = url.searchParams.get('url');
  if (!target) {
    return null;
  }

  const storageUrl = new URL(target);
  const isAllowed =
    storageUrl.hostname.includes('blob.core.windows.net') || storageUrl.hostname.includes('storage.googleapis.com');

  return isAllowed ? storageUrl : null;
}

function readRawBody(request: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function pipeResponse(upstream: Response, response: NodeJS.WritableStream & { statusCode?: number; setHeader?: (name: string, value: string | string[]) => void }) {
  response.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
      response.setHeader?.(key, value);
    }
  });
  response.end(Buffer.from(await upstream.arrayBuffer()));
}

function sendText(response: NodeJS.WritableStream & { statusCode?: number; setHeader?: (name: string, value: string) => void }, status: number, message: string) {
  response.statusCode = status;
  response.setHeader?.('Content-Type', 'text/plain; charset=utf-8');
  response.end(message);
}
