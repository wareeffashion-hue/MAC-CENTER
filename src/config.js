import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const env = process.env;
const production = env.NODE_ENV === 'production';
const dataDir = resolve(env.DATA_DIR || './data');

// المفتاح السري: من APP_SECRET، وإن غاب في الإنتاج يولد مرة ويحفظ في القرص الدائم حتى تبقى الجلسات صالحة بعد إعادة التشغيل
function loadSecret() {
  if (env.APP_SECRET) return env.APP_SECRET;
  if (!production) return randomBytes(32).toString('hex');
  const file = join(dataDir, '.app-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(dataDir, { recursive: true });
  const secret = randomBytes(32).toString('hex');
  writeFileSync(file, secret, { mode: 0o600 });
  console.warn('APP_SECRET غير محدد: ولد مفتاح وحفظ في ' + file);
  return secret;
}

// يقبل PEM كما هو أو مرمزًا بـ base64 (أسهل للصق في متغير واحد)
function pem(v) {
  if (!v) return null;
  const t = String(v).trim();
  return t.includes('-----BEGIN') ? t.replace(/\\n/g, '\n') : Buffer.from(t, 'base64').toString('utf8');
}

// الرابط العام: PUBLIC_URL، أو نطاق Railway تلقائيًا
const publicUrl = env.PUBLIC_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${env.PORT || 3000}`);

export const config = {
  production,
  port: Number(env.PORT || 3000),
  publicUrl: publicUrl.replace(/\/$/, ''),
  dataDir,
  secret: loadSecret(),
  timezone: 'Asia/Riyadh',
  // توقيت الرياض ثابت على UTC+3 بلا توقيت صيفي
  tzOffsetMinutes: 180,
  admin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  whatsapp: {
    driver: env.WHATSAPP_DRIVER || 'mock',
    phone: env.WHATSAPP_PHONE_NUMBER || '966509191040',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    token: env.WHATSAPP_ACCESS_TOKEN,
    appSecret: env.WHATSAPP_APP_SECRET,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN,
    graphVersion: env.WHATSAPP_GRAPH_VERSION || 'v21.0',
  },
  google: {
    driver: env.GOOGLE_DRIVER || 'mock',
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    refreshToken: env.GOOGLE_REFRESH_TOKEN,
    accountId: env.GOOGLE_ACCOUNT_ID,
  },
  // بطاقة Apple Wallet: الشهادات بصيغة PEM أو base64 لها، توضع في متغيرات Railway مباشرة
  appleWallet: {
    passTypeId: env.APPLE_PASS_TYPE_ID,
    teamId: env.APPLE_TEAM_ID,
    cert: pem(env.APPLE_PASS_CERT),
    key: pem(env.APPLE_PASS_KEY),
    keyPassword: env.APPLE_PASS_KEY_PASSWORD,
    wwdr: pem(env.APPLE_WWDR_CERT),
  },
  // النظام المحاسبي يرسل الفواتير إلى /api/webhooks/erp بهذا المفتاح
  erp: { secret: env.ERP_WEBHOOK_SECRET },
  // بوابة الدفع: mock للتجربة، أو moyasar بمفتاحها السري
  payments: {
    driver: env.PAYMENT_DRIVER || (env.MOYASAR_SECRET_KEY ? 'moyasar' : 'mock'),
    moyasarSecret: env.MOYASAR_SECRET_KEY,
  },
  uploads: { maxImageBytes: 10 * 1024 * 1024, maxTicketImages: 3 },
};
