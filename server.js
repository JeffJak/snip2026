import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const port = Number(process.env.PORT || 3000);
const baseUrl = process.env.BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${port}`);
const publicDir = process.env.PUBLIC_DIR ? resolve(process.env.PUBLIC_DIR) : null;
const links = new Map();

function makeCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function resolvePublicFile(pathname) {
  if (!publicDir) return null;
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const normalized = requestPath.replace(/^\/+/, '');
  const filePath = resolve(publicDir, normalized);
  if (!filePath.startsWith(publicDir)) return null;
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }
  return null;
}

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method === 'POST' && url.pathname === '/api/links') {
      return (async () => {
        let bodyText = '';
        try {
          bodyText = await req.text();
        } catch {
          return buildJsonResponse({ error: 'Invalid JSON' }, 400);
        }

        let payload;
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return buildJsonResponse({ error: 'Invalid JSON' }, 400);
        }

        if (!payload || typeof payload.url !== 'string' || !isHttpUrl(payload.url)) {
          return buildJsonResponse({ error: 'Invalid URL' }, 400);
        }

        const code = makeCode();
        const createdAt = new Date().toISOString();
        const record = { code, url: payload.url, shortUrl: `${baseUrl}/${code}`, hits: 0, createdAt };
        links.set(code, record);
        return buildJsonResponse(record, 201);
      })();
    }

    if (req.method === 'GET' && url.pathname === '/api/links') {
      return buildJsonResponse(Array.from(links.values()));
    }

    if (req.method === 'GET') {
      const publicFile = resolvePublicFile(url.pathname);
      if (publicFile) {
        return new Response(Bun.file(publicFile), {
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }

      const code = url.pathname.replace(/^\/+/, '');
      if (code && links.has(code)) {
        const link = links.get(code);
        link.hits += 1;
        return Response.redirect(link.url, 302);
      }

      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  },
});

console.log(`Snip backend listening on http://localhost:${port}`);
