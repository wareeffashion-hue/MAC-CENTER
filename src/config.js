import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const env = process.env;
const production = env.NODE_ENV === 'production';

if (production && !env.APP_SECRET) {
  throw new Error('APP_SECRET مطلوب في بيئة الإنتاج');
}

export const config = {
  production,
  port: Number(env.PORT || 3000),
  publicUrl: (env.PUBLIC_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  dataDir: resolve(env.DATA_DIR || './data'),
  secret: env.APP_SECRET || randomBytes(32).toString('hex'),
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
  uploads: { maxImageBytes: 10 * 1024 * 1024, maxTicketImages: 3 },
};
