// بطاقة MAC+ في Apple Wallet: إصدار البطاقة، وخدمة التحديث التي يتصل بها الجهاز، وإشعار الجهاز بتغير الرصيد
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:http2';
import { config } from '../config.js';
import { sign, safeEqual } from '../lib/ids.js';
import { buildPkpass } from '../lib/pkpass.js';
import { sqlNow } from '../db.js';
import { balance, cardUrl, referralUrl, plusSettings } from './plus.js';

const C = config.appleWallet;
const imgDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'img', 'wallet');
const IMAGES = ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png', 'logo@3x.png', 'strip.png', 'strip@2x.png', 'strip@3x.png'];
let images = null;

export const walletEnabled = () => !!(C.passTypeId && C.teamId && C.cert && C.key && C.wwdr);
export const serialFor = (memberId) => `mac-plus-${memberId}`;
export const memberFromSerial = (serial) => { const m = /^mac-plus-(\d+)$/.exec(String(serial)); return m ? Number(m[1]) : null; };
export const authToken = (serial) => sign(`wallet:${serial}`);
export const checkAuth = (serial, header) => safeEqual(String(header || '').replace(/^ApplePass\s+/i, ''), authToken(serial));

function passJson(db, m) {
  const st = plusSettings(db);
  const serial = serialFor(m.id);
  const branches = db.prepare('SELECT name, phone, lat, lng FROM branches WHERE active = 1 ORDER BY sort, id').all();
  const tiers = st.tiers.map((t) => `${t.min} أقسام ${t.pct}%`).join(' · ');
  return {
    formatVersion: 1,
    passTypeIdentifier: C.passTypeId,
    teamIdentifier: C.teamId,
    serialNumber: serial,
    organizationName: 'ماك سنتر',
    description: 'بطاقة عضوية MAC+ من ماك سنتر',
    logoText: 'MAC+',
    foregroundColor: 'rgb(247, 243, 234)',
    backgroundColor: 'rgb(8, 72, 50)',
    labelColor: 'rgb(255, 186, 29)',
    webServiceURL: `${config.publicUrl}/wallet`,
    authenticationToken: authToken(serial),
    sharingProhibited: true,
    storeCard: {
      headerFields: [{ key: 'balance', label: 'الرصيد', value: balance(db, m.id), currencyCode: 'SAR', changeMessage: 'رصيدك في MAC+ الآن %@' }],
      secondaryFields: [
        { key: 'name', label: 'العضو', value: m.name || 'عضو ماك سنتر' },
        { key: 'code', label: 'رقم العضوية', value: m.ref_code },
      ],
      auxiliaryFields: [{ key: 'tiers', label: 'خطوط العربة', value: tiers }],
      backFields: [
        { key: 'how', label: 'كيف أستفيد؟', value: `أظهر الرمز للكاشير مع كل فاتورة. كلما اشتريت من أقسام أكثر في الفاتورة نفسها ارتفع خصمك: ${tiers}.` },
        { key: 'wallet', label: 'الرصيد', value: `يُستخدم في أي فرع، وصلاحية كل رصيد ${st.walletDays} يومًا من إضافته.` },
        { key: 'invite', label: 'ادعُ صديقًا', value: referralUrl(m.ref_code), attributedValue: `<a href="${referralUrl(m.ref_code)}">شارك رابط الدعوة</a>` },
        { key: 'card', label: 'بطاقتك وطلباتك', value: cardUrl(m.id), attributedValue: `<a href="${cardUrl(m.id)}">افتح البطاقة</a>` },
        ...branches.map((b, i) => ({ key: `b${i}`, label: b.name, value: b.phone, dataDetectorTypes: ['PKDataDetectorTypePhoneNumber'] })),
      ],
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: m.ref_code, messageEncoding: 'iso-8859-1', altText: m.ref_code }],
    locations: branches.filter((b) => b.lat && b.lng).slice(0, 10).map((b) => ({ latitude: b.lat, longitude: b.lng, relevantText: `أنت قريب من ${b.name}. أظهر بطاقة MAC+ عند الكاشير` })),
  };
}

export function buildPass(db, memberId) {
  const m = db.prepare("SELECT * FROM members WHERE id = ? AND status = 'active'").get(memberId);
  if (!m) return null;
  images ||= Object.fromEntries(IMAGES.map((n) => [n, readFileSync(join(imgDir, n))]));
  const files = { 'pass.json': Buffer.from(JSON.stringify(passJson(db, m))), ...images };
  return { buffer: buildPkpass(files, C), updatedAt: m.pass_updated_at || m.created_at };
}

// ——— خدمة التحديث (Apple PassKit Web Service) ———
export function registerDevice(db, deviceId, serial, pushToken) {
  const existed = db.prepare('SELECT 1 FROM wallet_devices WHERE device_id = ? AND serial = ?').get(deviceId, serial);
  db.prepare('INSERT INTO wallet_devices (device_id, serial, push_token) VALUES (?, ?, ?) ON CONFLICT(device_id, serial) DO UPDATE SET push_token = excluded.push_token').run(deviceId, serial, pushToken);
  return existed ? 200 : 201;
}
export function unregisterDevice(db, deviceId, serial) {
  db.prepare('DELETE FROM wallet_devices WHERE device_id = ? AND serial = ?').run(deviceId, serial);
}
export function updatedSerials(db, deviceId, since) {
  const rows = db.prepare('SELECT d.serial, m.pass_updated_at u FROM wallet_devices d LEFT JOIN members m ON d.serial = \'mac-plus-\' || m.id WHERE d.device_id = ?').all(deviceId);
  const fresh = rows.filter((r) => !since || (r.u && r.u > since));
  if (!fresh.length) return null;
  return { serialNumbers: fresh.map((r) => r.serial), lastUpdated: rows.reduce((a, r) => (r.u && r.u > a ? r.u : a), since || '') || sqlNow() };
}

// يُستدعى بعد كل تغير في رصيد العضو: يعلّم البطاقة ويوقظ أجهزته لتجلب النسخة الجديدة
export function passChanged(db, memberId) {
  db.prepare('UPDATE members SET pass_updated_at = ? WHERE id = ?').run(sqlNow(), memberId);
  if (!walletEnabled()) return;
  const tokens = db.prepare('SELECT device_id, push_token FROM wallet_devices WHERE serial = ?').all(serialFor(memberId));
  if (tokens.length) setImmediate(() => push(db, tokens).catch((e) => console.error('wallet push', e.message)));
}

let session = null;
function apns() {
  if (session && !session.closed && !session.destroyed) return session;
  session = connect('https://api.push.apple.com', { cert: C.cert, key: C.key, passphrase: C.keyPassword || undefined });
  session.on('error', () => { session = null; });
  session.setTimeout(60_000, () => { session?.close(); session = null; });
  return session;
}
async function push(db, tokens) {
  const s = apns();
  await Promise.all(tokens.map((t) => new Promise((resolve) => {
    const req = s.request({ ':method': 'POST', ':path': `/3/device/${t.push_token}`, 'apns-topic': C.passTypeId, 'apns-push-type': 'background', 'content-type': 'application/json' });
    req.on('response', (h) => {
      // الجهاز حذف البطاقة أو تغير رمزه
      if (h[':status'] === 410 || h[':status'] === 400) db.prepare('DELETE FROM wallet_devices WHERE device_id = ? AND push_token = ?').run(t.device_id, t.push_token);
    });
    req.on('error', resolve); req.on('close', resolve);
    req.end('{}');
  })));
}
