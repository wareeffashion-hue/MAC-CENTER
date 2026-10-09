import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { qrSvg } from '../lib/qr.js';

// ربط رقم واتساب بمسح QR من التطبيق كما في واتساب ويب.
// يرسل تنبيهات الفريق دائمًا، ويصبح ناقل كل رسائل الموقع حين WHATSAPP_DRIVER=qr، ويستقبل رسائل العملاء ليكمل الاشتراك.
const AUTH_DIR = join(config.dataDir, 'wa-qr-auth');

const st = { status: 'off', qr: null, me: null, error: null, since: null, sent: 0 };
let sock = null, starting = false, retry = null, onInbound = null;
export function setInboundHandler(fn) { onInbound = fn; }
const queue = [];
let pumping = false;

const set = (patch) => Object.assign(st, patch, { since: new Date().toISOString() });

export function status() {
  return { status: st.status, me: st.me, error: st.error, since: st.since, sent: st.sent, qr: st.status === 'qr' && st.qr ? qrSvg(st.qr, { margin: 2 }) : null };
}

export async function start() {
  if (starting || st.status === 'open') return status();
  starting = true;
  clearTimeout(retry);
  try {
    const B = await import('@whiskeysockets/baileys');
    const makeWASocket = B.default || B.makeWASocket;
    const pino = (await import('pino')).default;
    mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await B.useMultiFileAuthState(AUTH_DIR);
    let version;
    try { ({ version } = await B.fetchLatestBaileysVersion()); } catch { /* يستخدم الإصدار المضمن */ }
    set({ status: 'connecting', error: null, qr: null });
    sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: B.Browsers.macOS('Mac Center'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    sock.ev.on('creds.update', saveCreds);
    // الرسائل الواردة من العملاء: نص فقط، ولا نعالج رسائلنا ولا المجموعات
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify' || !onInbound) return;
      for (const m of messages) {
        const jid = m.key?.remoteJid || '';
        if (m.key?.fromMe || !jid.endsWith('@s.whatsapp.net')) continue;
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        if (!text) continue;
        Promise.resolve(onInbound({ waId: jid.split('@')[0], text, name: m.pushName || null, eventKey: `qr:${m.key.id}` })).catch(() => {});
      }
    });
    sock.ev.on('connection.update', (u) => {
      if (u.qr) set({ status: 'qr', qr: u.qr });
      if (u.connection === 'open') {
        set({ status: 'open', qr: null, error: null, me: String(sock.user?.id || '').split(':')[0].split('@')[0] });
        pump();
      }
      if (u.connection === 'close') {
        const code = u.lastDisconnect?.error?.output?.statusCode;
        sock = null;
        if (code === B.DisconnectReason.loggedOut) {
          rmSync(AUTH_DIR, { recursive: true, force: true });
          set({ status: 'off', me: null, qr: null, error: 'فُصل الرقم من الجوال' });
        } else {
          set({ status: 'connecting', qr: null, error: u.lastDisconnect?.error?.message || null });
          retry = setTimeout(() => start().catch(() => {}), 4000);
        }
      }
    });
  } catch (e) {
    set({ status: 'error', error: e.message });
  } finally {
    starting = false;
  }
  return status();
}

export async function logout() {
  clearTimeout(retry);
  try { await sock?.logout(); } catch { /* */ }
  try { sock?.end?.(); } catch { /* */ }
  sock = null;
  rmSync(AUTH_DIR, { recursive: true, force: true });
  set({ status: 'off', me: null, qr: null, error: null });
  return status();
}

// يعيد الاتصال تلقائيًا عند تشغيل الخادم إن كان الرقم مربوطًا من قبل
export function resume() {
  if (existsSync(join(AUTH_DIR, 'creds.json'))) start().catch(() => {});
}

// إرسال بفاصل زمني بين الرسائل حتى لا يبدو الرقم آليًا. يعيد وعدًا بمعرف الرسالة، أو false إن لم يكن الرقم مربوطًا
export function send(to, text) {
  const phone = String(to || '').replace(/\D/g, '');
  if (!phone || st.status !== 'open') return false;
  const p = new Promise((resolve, reject) => queue.push({ phone, text, resolve, reject }));
  p.catch(() => {});
  pump();
  return p;
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length && st.status === 'open' && sock) {
      const { phone, text, resolve, reject } = queue.shift();
      try {
        const r = await sock.sendMessage(`${phone}@s.whatsapp.net`, { text });
        st.sent++;
        resolve({ id: r?.key?.id });
      } catch (e) { st.error = e.message; reject(e); }
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
    }
  } finally { pumping = false; }
}

export const isOpen = () => st.status === 'open';
export const linkedNumber = () => (st.status === 'open' ? st.me : null);
