import { randomBytes, createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { config } from '../config.js';

// أحرف بلا التباس (لا 0/O ولا 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function code(length = 6) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function token(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sign(value) {
  return createHmac('sha256', config.secret).update(value).digest('base64url');
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// رابط موقّع قصير الصلاحية: payload.expires.signature
export function signedUrlToken(payload, ttlSeconds) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${payload}.${exp}`;
  return `${body}.${sign(body)}`;
}

export function verifyUrlToken(tok) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 3) return null;
  const [payload, exp, sig] = parts;
  if (!safeEqual(sig, sign(`${payload}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return payload;
}

export function slugify(text) {
  return String(text || '').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || code(6).toLowerCase();
}
