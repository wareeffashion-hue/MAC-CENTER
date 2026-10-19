// حزمة Apple Wallet ‏(.pkpass) دون مكتبات: ملف ZIP غير مضغوط فيه manifest.json وتوقيع CMS منفصل له
import { createHash, createPrivateKey, sign as cryptoSign } from 'node:crypto';

// ——— ZIP (تخزين بلا ضغط) ———
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name), crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

// ——— DER ———
const len = (n) => (n < 128 ? Buffer.from([n]) : (() => { const b = []; while (n) { b.unshift(n & 0xff); n >>= 8; } return Buffer.from([0x80 | b.length, ...b]); })());
const tlv = (tag, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), len(body.length), body]); };
const seq = (...p) => tlv(0x30, ...p);
const set = (...p) => tlv(0x31, ...p);
const nul = Buffer.from([0x05, 0x00]);
const int = (n) => tlv(0x02, Buffer.from([n]));
const octet = (b) => tlv(0x04, b);
function oid(s) {
  const p = s.split('.').map(Number);
  const out = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) { const b = [v & 0x7f]; let x = v >> 7; while (x) { b.unshift(0x80 | (x & 0x7f)); x >>= 7; } out.push(...b); }
  return tlv(0x06, Buffer.from(out));
}
const utc = (d) => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));

// يقرأ عنصر DER ويعيد موضعه وطوله
function read(buf, pos) {
  const tag = buf[pos];
  let l = buf[pos + 1], hl = 2;
  if (l & 0x80) { const n = l & 0x7f; l = 0; for (let i = 0; i < n; i++) l = l * 256 + buf[pos + 2 + i]; hl = 2 + n; }
  return { tag, start: pos, body: pos + hl, end: pos + hl + l };
}
// المُصدِر والرقم التسلسلي للشهادة كما هما (IssuerAndSerialNumber)
function issuerAndSerial(certDer) {
  const cert = read(certDer, 0), tbs = read(certDer, cert.body);
  let p = tbs.body;
  let e = read(certDer, p);
  if (e.tag === 0xa0) { p = e.end; e = read(certDer, p); }
  const serial = certDer.subarray(e.start, e.end);
  const alg = read(certDer, e.end);
  const issuer = read(certDer, alg.end);
  return seq(certDer.subarray(issuer.start, issuer.end), serial);
}

export const pemToDer = (pem) => Buffer.from(String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');

// توقيع CMS منفصل (PKCS#7 SignedData) بخوارزمية SHA-256 كما تتطلبه Apple
export function signDetached(content, { cert, key, keyPassword, wwdr }) {
  const certDer = pemToDer(cert), wwdrDer = pemToDer(wwdr);
  const pk = createPrivateKey({ key, passphrase: keyPassword || undefined });
  const ec = pk.asymmetricKeyType === 'ec';
  const sha256 = seq(oid('2.16.840.1.101.3.4.2.1'), nul);
  const attrs = [
    seq(oid('1.2.840.113549.1.9.3'), set(oid('1.2.840.113549.1.7.1'))),
    seq(oid('1.2.840.113549.1.9.5'), set(utc(new Date()))),
    seq(oid('1.2.840.113549.1.9.4'), set(octet(createHash('sha256').update(content).digest()))),
  ].sort(Buffer.compare);
  const signedAttrs = set(...attrs);
  const signature = cryptoSign('sha256', signedAttrs, pk);
  const signerInfo = seq(
    int(1), issuerAndSerial(certDer), sha256,
    Buffer.concat([Buffer.from([0xa0]), signedAttrs.subarray(1)]),
    ec ? seq(oid('1.2.840.10045.4.3.2')) : seq(oid('1.2.840.113549.1.1.1'), nul),
    octet(signature),
  );
  const signedData = seq(int(1), set(sha256), seq(oid('1.2.840.113549.1.7.1')), tlv(0xa0, certDer, wwdrDer), set(signerInfo));
  return seq(oid('1.2.840.113549.1.7.2'), tlv(0xa0, signedData));
}

// files: { 'pass.json': Buffer, 'icon.png': Buffer, ... }
export function buildPkpass(files, creds) {
  const manifest = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(files).map(([n, d]) => [n, createHash('sha1').update(d).digest('hex')]))));
  return zip({ ...files, 'manifest.json': manifest, signature: signDetached(manifest, creds) });
}
