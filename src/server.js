import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { resume as resumeWaQr, setInboundHandler } from './modules/waqr.js';
import { handleInbound } from './modules/whatsapp.js';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { openDb } from './db.js';
import { Router, HttpError, sendHtml, sendJson, serveStatic, securityHeaders, esc } from './http.js';
import { seedCatalog } from './modules/catalog.js';
import { ensureAdmin } from './modules/users.js';
import { publicRoutes } from './routes/public.js';
import { apiRoutes } from './routes/api.js';
import { plusRoutes } from './routes/plus.js';
import { startJobs } from './jobs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const uploadsDir = join(config.dataDir, 'uploads');

export function createApp(db) {
  const router = new Router();
  publicRoutes(router, db);
  apiRoutes(router, db);
  plusRoutes(router, db);

  return async function handle(req, res) {
    securityHeaders(res);
    let url, path = '';
    try {
      url = new URL(req.url, 'http://x');
      // رابط بترميز تالف مثل /%E0 كان يرمي استثناءً خارج try فيُسقط الخادم كله
      try { path = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'رابط غير صالح'); }
      if ((req.method === 'GET' || req.method === 'HEAD') && path.startsWith('/uploads/')) {
        if (serveStatic(req, res, uploadsDir, path.slice('/uploads/'.length), { immutable: true })) return;
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && /\.[a-z0-9]+$/i.test(path) && !path.startsWith('/api/')) {
        const admin = path.startsWith('/admin/');
        if (serveStatic(req, res, publicDir, path.slice(1), { immutable: !admin && (url.searchParams.has('v') || path.startsWith('/fonts/')), noCache: admin })) return;
      }
      // مسارات تغير الحالة من المتصفح يجب أن تأتي من نفس الموقع
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !path.startsWith('/api/webhooks/')) {
        const origin = req.headers.origin;
        let host = null;
        try { host = origin ? new URL(origin).host : null; } catch { /* Origin: null أو قيمة تالفة */ }
        if (origin && host !== req.headers.host && origin !== config.publicUrl) throw new HttpError(403, 'مصدر الطلب غير مسموح');
      }
      const m = router.match(req.method, path);
      if (!m) {
        if (path.startsWith('/api/')) throw new HttpError(404, 'غير موجود');
        return router.notFound(req, res);
      }
      if (m.notAllowed) throw new HttpError(405, 'الطريقة غير مسموحة');
      req.params = m.params;
      req.query = Object.fromEntries(url.searchParams);
      req.path = path;
      for (const h of m.handlers) {
        await h(req, res);
        if (res.writableEnded || res.headersSent) break;
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (res.headersSent) { res.end(); return; }
      if (path.startsWith('/api/') || String(req.headers.accept || '').includes('application/json')) {
        sendJson(res, status, { error: status === 500 ? 'حدث خطأ غير متوقع' : err.message, fields: err.fields });
      } else {
        sendHtml(res, status, `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>خطأ</title><body style="font-family:system-ui;padding:40px"><h1>${esc(status === 500 ? 'حدث خطأ غير متوقع' : err.message)}</h1><a href="/">الرئيسية</a></body></html>`);
      }
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = openDb();
  seedCatalog(db);
  const made = ensureAdmin(db, config.admin.email, config.admin.password, process.env.ADMIN_RESET === '1');
  if (made === 'reset') console.log(`أعيد تعيين كلمة مرور المدير ${config.admin.email}. احذف ADMIN_RESET بعد الدخول`);
  else if (made) console.log(`أنشئ حساب المدير ${config.admin.email}`);
  if (!db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
    console.warn('لا يوجد حساب مدير. شغّل: npm run create-admin -- البريد كلمة_المرور');
  }
  // شبكة أمان أخيرة: خطأ غير ملتقط في مهمة أو طلب يُسجل ولا يوقف الموقع
  process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
  const server = createServer(createApp(db));
  server.listen(config.port, () => console.log(`ماك سنتر يعمل على ${config.publicUrl} (المنفذ ${config.port})`));
  const jobs = startJobs(db);
  setInboundHandler((m) => handleInbound(db, m));
  resumeWaQr();
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    const closed = new Promise((r) => server.close(r));
    server.closeIdleConnections?.();
    await Promise.race([Promise.all([closed, jobs.stop()]), new Promise((r) => setTimeout(r, 12_000))]);
    try { db.close(); } catch { /* */ }
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
