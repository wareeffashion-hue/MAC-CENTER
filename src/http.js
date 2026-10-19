import { createReadStream, statSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const fail = (status, message, fields) => { throw new HttpError(status, message, fields); };

// موجه بسيط يدعم المعاملات :name
export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
    return this;
  }
  get(p, ...h) { return this.add('GET', p, ...h); }
  post(p, ...h) { return this.add('POST', p, ...h); }
  put(p, ...h) { return this.add('PUT', p, ...h); }
  patch(p, ...h) { return this.add('PATCH', p, ...h); }
  delete(p, ...h) { return this.add('DELETE', p, ...h); }
  match(method, path) {
    let allowed = false;
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) { allowed = true; continue; }
      const params = {};
      // المسار مفكوك الترميز مسبقًا في server.js
      r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
      return { handlers: r.handlers, params };
    }
    return allowed ? { notAllowed: true } : null;
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { const v = part.slice(i + 1).trim(); try { out[part.slice(0, i).trim()] = decodeURIComponent(v); } catch { out[part.slice(0, i).trim()] = v; } }
  }
  return out;
}

export function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`, 'HttpOnly', `SameSite=${opts.sameSite || 'Lax'}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.secure) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join('; ')]);
}

export function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'حجم الطلب أكبر من المسموح')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// يحلل JSON أو نموذج عادي أو multipart، ويعيد { fields, files }
export async function parseRequest(req, { limit } = {}) {
  const type = String(req.headers['content-type'] || '');
  const raw = await readBody(req, limit);
  req.rawBody = raw;
  if (type.includes('application/json')) {
    try { return { fields: raw.length ? JSON.parse(raw.toString('utf8')) : {}, files: [] }; }
    catch { throw new HttpError(400, 'صيغة البيانات غير صحيحة'); }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return { fields: formFields(new URLSearchParams(raw.toString('utf8'))), files: [] };
  }
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
  if (type.includes('multipart/form-data') && m) return parseMultipart(raw, m[1] || m[2]);
  return { fields: {}, files: [] };
}

function formFields(params) {
  const fields = {};
  for (const [k, v] of params) {
    if (k.endsWith('[]')) (fields[k.slice(0, -2)] ||= []).push(v);
    else fields[k] = v;
  }
  return fields;
}

function parseMultipart(buf, boundary) {
  const delim = Buffer.from(`--${boundary}`);
  const fields = {}, files = [];
  let pos = buf.indexOf(delim);
  while (pos !== -1) {
    const start = pos + delim.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    const next = buf.indexOf(delim, start);
    if (next === -1) break;
    const part = buf.slice(start + 2, next - 2); // تجاوز \r\n في البداية والنهاية
    const headEnd = part.indexOf('\r\n\r\n');
    if (headEnd !== -1) {
      const head = part.slice(0, headEnd).toString('utf8');
      const body = part.slice(headEnd + 4);
      const name = /name="([^"]*)"/i.exec(head)?.[1];
      const filename = /filename="([^"]*)"/i.exec(head)?.[1];
      const ctype = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1];
      if (name != null) {
        if (filename != null) {
          if (body.length) files.push({ field: name.replace(/\[\]$/, ''), filename, type: ctype, data: body });
        } else if (name.endsWith('[]')) (fields[name.slice(0, -2)] ||= []).push(body.toString('utf8'));
        else fields[name] = body.toString('utf8');
      }
    }
    pos = next;
  }
  return { fields, files };
}

// يتحقق من نوع الصورة من محتواها لا من اسمها
export function sniffImage(data) {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (data.length > 8 && data.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (data.length > 12 && data.slice(0, 4).toString() === 'RIFF' && data.slice(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export function sendJson(res, status, body) {
  const { body: data, enc } = encode(res, Buffer.from(JSON.stringify(body)));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding', ...(enc ? { 'Content-Encoding': enc } : {}) });
  res.end(data);
}

// ضغط النصوص حسب ما يدعمه المتصفح
function encode(res, body) {
  const accept = String(res.req?.headers['accept-encoding'] || '');
  if (body.length < 1024) return { body };
  if (/\bbr\b/.test(accept)) return { body: brotliCompressSync(body, { params: { [zc.BROTLI_PARAM_QUALITY]: 5 } }), enc: 'br' };
  if (/\bgzip\b/.test(accept)) return { body: gzipSync(body, { level: 6 }), enc: 'gzip' };
  return { body };
}

export function sendHtml(res, status, html, { cache = 'no-cache' } = {}) {
  const { body, enc } = encode(res, Buffer.from(html));
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache, Vary: 'Accept-Encoding', ...(enc ? { 'Content-Encoding': enc } : {}) });
  res.end(body);
}

export function redirect(res, location, status = 303) {
  res.writeHead(status, { Location: location });
  res.end();
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const etags = new Map();
const compressed = new Map();
const TEXT = new Set(['.css', '.js', '.svg', '.json', '.webmanifest', '.txt', '.html']);

export function serveStatic(req, res, root, path, { immutable = false, noCache = false } = {}) {
  const file = normalize(join(root, path));
  if (!file.startsWith(root + sep) && file !== root) return false;
  let st;
  try { st = statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const key = `${file}:${st.mtimeMs}:${st.size}`;
  let etag = etags.get(key);
  if (!etag) { etag = `"${createHash('sha1').update(key).digest('base64url').slice(0, 16)}"`; etags.set(key, etag); }
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); res.end(); return true; }
  const ext = extname(file).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : noCache ? 'no-cache' : 'public, max-age=300, must-revalidate',
    ETag: etag,
    Vary: 'Accept-Encoding',
  };
  if (TEXT.has(ext) && st.size > 1024) {
    // النسخة المضغوطة تحفظ في الذاكرة حسب نسخة الملف
    const accept = String(req.headers['accept-encoding'] || '');
    const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
    if (enc) {
      const ck = `${key}:${enc}`;
      let buf = compressed.get(ck);
      if (!buf) {
        const raw = readFileSync(file);
        buf = enc === 'br' ? brotliCompressSync(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }) : gzipSync(raw, { level: 9 });
        compressed.set(ck, buf);
      }
      res.writeHead(200, { ...headers, 'Content-Encoding': enc, 'Content-Length': buf.length });
      res.end(req.method === 'HEAD' ? undefined : buf);
      return true;
    }
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') { res.end(); return true; }
  createReadStream(file).pipe(res);
  return true;
}

// تقييد بسيط للمعدل في الذاكرة لكل عنوان ومفتاح
const buckets = new Map();
export function rateLimit(key, { max, windowMs }) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { count: 1, reset: now + windowMs }); return true; }
  b.count += 1;
  return b.count <= max;
}
// هل بلغ المفتاح الحد دون احتساب محاولة جديدة
export function isLimited(key, max) {
  const b = buckets.get(key);
  return !!b && b.reset >= Date.now() && b.count >= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

export function clientIp(req) {
  // البروكسي يضيف عنوان الزائر الحقيقي في آخر القائمة، وأولها يكتبه الزائر نفسه فلا يُوثق به
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',').at(-1).trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    'frame-src https://www.google.com https://maps.google.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://wa.me https://api.whatsapp.com https://checkout.moyasar.com https://api.moyasar.com",
  ].join('; '));
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
