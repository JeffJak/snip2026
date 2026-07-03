import { join, resolve, normalize } from "node:path";
import { existsSync, statSync } from "node:fs";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const BASE_URL = (
  process.env.BASE_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${PORT}`)
).replace(/\/$/, "");
const PUBLIC_DIR = process.env.PUBLIC_DIR
  ? resolve(process.env.PUBLIC_DIR)
  : null;

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
/** @type {Map<string, {code:string,url:string,shortUrl:string,hits:number,createdAt:string}>} */
const links = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => BASE62[b % 62]).join("");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/**
 * Attempt to serve a static file from PUBLIC_DIR.
 * "/" maps to index.html. Resolves to null if nothing found or path escapes PUBLIC_DIR.
 */
function serveStatic(pathname) {
  if (!PUBLIC_DIR) return null;

  // Prevent path traversal: normalize first, then resolve inside PUBLIC_DIR
  const relative = normalize(pathname === "/" ? "/index.html" : pathname);
  const filePath = resolve(join(PUBLIC_DIR, relative));

  // Ensure the resolved path is strictly inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR + "/") && filePath !== PUBLIC_DIR) {
    return null;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) return null;

  return new Response(Bun.file(filePath), { headers: { ...CORS } });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
Bun.serve({
  port: PORT,

  async fetch(req) {
    const { pathname } = new URL(req.url);
    const method = req.method;

    // ------------------------------------------------------------------
    // OPTIONS preflight
    // ------------------------------------------------------------------
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ------------------------------------------------------------------
    // POST /api/links  — create short link
    // ------------------------------------------------------------------
    if (method === "POST" && pathname === "/api/links") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }

      const rawUrl = body?.url;
      if (typeof rawUrl !== "string") {
        return json({ error: "url must be a string" }, 400);
      }

      let parsed;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return json({ error: "Invalid URL" }, 400);
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return json({ error: "URL must use http or https" }, 400);
      }

      // Generate a collision-free 6-char base62 code
      let code;
      do {
        code = generateCode();
      } while (links.has(code));

      const entry = {
        code,
        url: rawUrl,
        shortUrl: `${BASE_URL}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, entry);
      return json(entry, 201);
    }

    // ------------------------------------------------------------------
    // GET /api/links  — list all links
    // ------------------------------------------------------------------
    if (method === "GET" && pathname === "/api/links") {
      return json([...links.values()]);
    }

    // ------------------------------------------------------------------
    // GET /*  — static file (wins over short code) then redirect
    // ------------------------------------------------------------------
    if (method === "GET") {
      const staticRes = serveStatic(pathname);
      if (staticRes) return staticRes;

      const code = pathname.slice(1); // strip leading "/"
      const entry = links.get(code);
      if (entry) {
        entry.hits++;
        return new Response(null, {
          status: 302,
          headers: { Location: entry.url, ...CORS },
        });
      }

      return json({ error: "Not found" }, 404);
    }

    return json({ error: "Method not allowed" }, 405);
  },
});

console.log(`Snip listening on :${PORT}  BASE_URL=${BASE_URL}`);
if (PUBLIC_DIR) console.log(`Static files → ${PUBLIC_DIR}`);