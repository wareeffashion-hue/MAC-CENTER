import { autoCampaigns, materialize, dispatch } from './modules/offers.js';
import { escalateLate } from './modules/tickets.js';
import { syncReviews, purgeStaleReviewContent } from './modules/reviews.js';
import { driver } from './modules/whatsapp.js';
import { setIntegrationStatus } from './modules/notify.js';
import { config } from './config.js';

// مهام مجدولة بسيطة؛ كل مهمة محمية من التداخل مع نفسها
export function startJobs(db) {
  const running = new Set();
  const every = (name, ms, fn) => {
    const run = async () => {
      if (running.has(name)) return;
      running.add(name);
      try { await fn(); } catch (err) { console.error(`[job:${name}]`, err); } finally { running.delete(name); }
    };
    setTimeout(run, 2000).unref();
    return setInterval(run, ms).unref();
  };

  every('campaigns', 15_000, async () => {
    autoCampaigns(db);
    materialize(db);
    await dispatch(db);
    if (config.whatsapp.driver === 'mock') {
      // محاكاة إشعارات التسليم في وضع التجربة
      db.prepare("UPDATE messages SET status = 'delivered', updated_at = datetime('now') WHERE status = 'sent' AND updated_at < datetime('now','-20 seconds')").run();
    }
  });
  every('escalation', 60_000, () => escalateLate(db));
  every('expire-intents', 5 * 60_000, () => {
    db.prepare("UPDATE subscription_intents SET status = 'expired' WHERE status = 'awaiting' AND expires_at < datetime('now')").run();
    db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  });
  every('reviews', 15 * 60_000, () => syncReviews(db));
  every('purge', 6 * 3600_000, () => purgeStaleReviewContent(db));
  every('health', 10 * 60_000, async () => {
    const h = await driver().health();
    setIntegrationStatus(db, 'WhatsApp Business', h.ok, h.message);
  });
}
