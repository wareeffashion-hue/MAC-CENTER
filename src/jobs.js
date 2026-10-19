import { autoCampaigns, materialize, dispatch } from './modules/offers.js';
import { escalateLate } from './modules/tickets.js';
import { expireCredits, expireRequests } from './modules/plus.js';
import { syncReviews, purgeStaleReviewContent } from './modules/reviews.js';
import { driver } from './modules/whatsapp.js';
import { setIntegrationStatus, maybeSendDailySummary } from './modules/notify.js';
import { config } from './config.js';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// مهام مجدولة بسيطة؛ كل مهمة محمية من التداخل مع نفسها
export function startJobs(db) {
  const running = new Map();
  const timers = [];
  let stopping = false;
  const every = (name, ms, fn) => {
    const run = async () => {
      if (stopping || running.has(name)) return;
      const p = (async () => { try { await fn(); } catch (err) { console.error(`[job:${name}]`, err); } })();
      running.set(name, p);
      await p;
      running.delete(name);
    };
    timers.push(setTimeout(run, 2000).unref(), setInterval(run, ms).unref());
  };

  every('campaigns', 15_000, async () => {
    // رسالة بقيت "قيد الإرسال" بعد انقطاع الخادم لا نعرف هل وصلت؛ تُعلَّم فاشلة للمراجعة بدل إعادة إرسالها عمياء
    db.prepare("UPDATE messages SET status = 'failed', reason = 'انقطع الخادم أثناء الإرسال؛ النتيجة غير معروفة', updated_at = datetime('now') WHERE status = 'sending' AND updated_at < datetime('now','-5 minutes')").run();
    autoCampaigns(db);
    materialize(db);
    await dispatch(db);
    if (config.whatsapp.driver === 'mock') {
      // محاكاة إشعارات التسليم في وضع التجربة
      db.prepare("UPDATE messages SET status = 'delivered', updated_at = datetime('now') WHERE status = 'sent' AND updated_at < datetime('now','-20 seconds')").run();
    }
  });
  every('escalation', 60_000, () => escalateLate(db));
  every('wa-summary', 60_000, () => maybeSendDailySummary(db));
  every('expire-intents', 5 * 60_000, () => {
    db.prepare("UPDATE subscription_intents SET status = 'expired' WHERE status = 'awaiting' AND expires_at < datetime('now')").run();
    db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  });
  // MAC+: انتهاء الحجوزات بعد مهلتها، وانتهاء الرصيد الترويجي بعد صلاحيته
  every('plus-expiry', 5 * 60_000, () => {
    expireRequests(db);
    expireCredits(db);
    db.prepare("UPDATE plus_intents SET status = 'expired' WHERE status = 'awaiting' AND expires_at < datetime('now')").run();
  });
  every('reviews', 15 * 60_000, () => syncReviews(db));
  every('purge', 6 * 3600_000, () => {
    purgeStaleReviewContent(db);
    db.prepare("DELETE FROM events WHERE at < datetime('now','-400 days')").run();
    db.prepare("UPDATE webhook_events SET payload = '{}' WHERE processed_at IS NOT NULL AND received_at < datetime('now','-90 days') AND payload != '{}'").run();
  });
  // نسخة احتياطية يومية متسقة من قاعدة البيانات، تُحفظ آخر 14 نسخة
  every('backup', 3600_000, () => {
    const dir = join(config.dataDir, 'backups');
    mkdirSync(dir, { recursive: true });
    const name = `mac-center-${new Date().toISOString().slice(0, 10)}.db`;
    const files = readdirSync(dir).filter((f) => /^mac-center-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    if (!files.includes(name)) {
      db.exec(`VACUUM INTO '${join(dir, name).replace(/'/g, "''")}'`);
      files.push(name);
    }
    for (const f of files.slice(0, -14)) rmSync(join(dir, f), { force: true });
  });
  every('health', 10 * 60_000, async () => {
    const h = await driver().health();
    setIntegrationStatus(db, 'WhatsApp Business', h.ok, h.message);
  });

  return {
    // يوقف الجدولة وينتظر المهام الجارية حتى 10 ثوان قبل إغلاق القاعدة
    async stop() {
      stopping = true;
      timers.forEach((t) => clearInterval(t));
      await Promise.race([Promise.all(running.values()), new Promise((r) => setTimeout(r, 10_000))]);
    },
  };
}
