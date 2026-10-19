import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

const SCHEMA = [
  // ١: البنية الأساسية
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE branches (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT 'ماك سنتر',
    short_name TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    maps_url TEXT NOT NULL DEFAULT '',
    google_review_url TEXT NOT NULL DEFAULT '',
    google_location_id TEXT,
    lat REAL, lng REAL,
    hours TEXT,                 -- JSON: { sun: [["09:00","13:00"],["16:00","01:00"]], ... } أو NULL إن لم يعتمد
    exceptions TEXT NOT NULL DEFAULT '[]',
    services TEXT NOT NULL DEFAULT '[]',
    image TEXT,
    rating REAL, rating_count INTEGER, rating_updated_at TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sections (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    art TEXT NOT NULL DEFAULT 'fashion',
    image TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE branch_sections (
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    PRIMARY KEY (branch_id, section_id)
  );

  CREATE TABLE faqs (
    id INTEGER PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','branch_manager','agent','marketing','reviewer')),
    branch_ids TEXT NOT NULL DEFAULT '[]',
    wa_phone TEXT,
    totp_secret TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pending_2fa INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id TEXT,
    detail TEXT,
    at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX audit_at ON audit_log(at);

  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    link TEXT,
    read_at TEXT,
    at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX notifications_user ON notifications(user_id, read_at);

  -- رموز QR: الرابط المطبوع ثابت والوجهة قابلة للتغيير
  CREATE TABLE qr_codes (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    location TEXT NOT NULL DEFAULT '',
    purpose TEXT NOT NULL CHECK (purpose IN ('subscribe','feedback','custom')),
    target TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    scans INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- جهات اتصال واتساب والاشتراك
  CREATE TABLE contacts (
    id INTEGER PRIMARY KEY,
    wa_id TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_inbound_at TEXT
  );

  CREATE TABLE subscriptions (
    contact_id INTEGER PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('active','stopped')),
    branch_ids TEXT NOT NULL DEFAULT '[]',
    section_ids TEXT NOT NULL DEFAULT '[]',
    consent_text TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    consent_at TEXT NOT NULL,
    source_qr TEXT,
    stopped_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE subscription_intents (
    id INTEGER PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    status_key TEXT NOT NULL UNIQUE,
    branch_ids TEXT NOT NULL,
    section_ids TEXT NOT NULL,
    name TEXT,
    qr_code TEXT,
    status TEXT NOT NULL CHECK (status IN ('started','awaiting','confirmed','expired')),
    contact_id INTEGER REFERENCES contacts(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE subscription_events (
    id INTEGER PRIMARY KEY,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    source TEXT,
    detail TEXT,
    at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- العروض والحملات
  CREATE TABLE offers (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    image TEXT,
    branch_ids TEXT NOT NULL DEFAULT '[]',
    section_ids TEXT NOT NULL DEFAULT '[]',
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    terms TEXT NOT NULL DEFAULT '',
    discount TEXT,
    status TEXT NOT NULL CHECK (status IN ('draft','review','approved','cancelled')),
    send_enabled INTEGER NOT NULL DEFAULT 0,
    template_name TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE campaigns (
    id INTEGER PRIMARY KEY,
    offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    template_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','scheduled','sending','paused','done','cancelled')),
    scheduled_at TEXT,
    budget REAL,
    audience_count INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL NOT NULL DEFAULT 0,
    test_sent_at TEXT,
    auto INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  );

  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'marketing',
    status TEXT NOT NULL CHECK (status IN ('queued','sending','sent','delivered','read','failed','excluded')),
    reason TEXT,
    provider_id TEXT UNIQUE,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    cost REAL NOT NULL DEFAULT 0,
    sent_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (campaign_id, contact_id)
  );
  CREATE INDEX messages_status ON messages(status, next_attempt_at);
  CREATE INDEX messages_contact ON messages(contact_id, sent_at);

  -- التذاكر
  CREATE TABLE tickets (
    id INTEGER PRIMARY KEY,
    ref TEXT NOT NULL UNIQUE,
    track_key TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('complaint','suggestion','experience','contact')),
    source TEXT NOT NULL DEFAULT 'web',
    branch_id INTEGER REFERENCES branches(id),
    section_id INTEGER REFERENCES sections(id),
    topic TEXT,
    rating INTEGER,
    body TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    wants_contact INTEGER NOT NULL DEFAULT 0,
    contact_consent_at TEXT,
    qr_code TEXT,
    review_id INTEGER,
    status TEXT NOT NULL CHECK (status IN ('new','assigned','in_progress','waiting_customer','resolved','closed')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    assignee_id INTEGER REFERENCES users(id),
    acknowledged_at TEXT,
    first_response_at TEXT,
    resolved_at TEXT,
    due_at TEXT,
    escalation_level INTEGER NOT NULL DEFAULT 0,
    close_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX tickets_status ON tickets(status, branch_id);

  CREATE TABLE ticket_events (
    id INTEGER PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    body TEXT,
    internal INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER REFERENCES users(id),
    at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE routing_rules (
    id INTEGER PRIMARY KEY,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
    topic TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    backup_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
  );

  -- تقييمات Google
  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    google_id TEXT NOT NULL UNIQUE,
    author TEXT,
    rating INTEGER NOT NULL,
    text TEXT,
    review_time TEXT NOT NULL,
    review_updated_at TEXT,
    classification TEXT,
    state TEXT NOT NULL CHECK (state IN ('new','auto_replied','needs_review','draft_ready','replied','escalated','ignored')),
    draft TEXT,
    reply TEXT,
    reply_source TEXT,
    replied_at TEXT,
    ticket_id INTEGER,
    featured INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- الأحداث التحليلية بلا بيانات شخصية
  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    branch_id INTEGER,
    qr_code TEXT,
    ref TEXT,
    at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX events_name_at ON events(name, at);

  -- أحداث الربط الخارجية تحفظ قبل معالجتها لمنع التكرار
  CREATE TABLE webhook_events (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    processed_at TEXT,
    error TEXT,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (provider, external_id)
  );

  CREATE TABLE integration_status (
    name TEXT PRIMARY KEY,
    ok INTEGER NOT NULL,
    message TEXT,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
  // فهارس للاستعلامات المتكررة في القوائم والتقارير
  `
  CREATE INDEX IF NOT EXISTS ticket_events_ticket ON ticket_events(ticket_id, at);
  CREATE INDEX IF NOT EXISTS attachments_ticket ON attachments(ticket_id);
  CREATE INDEX IF NOT EXISTS tickets_qr ON tickets(qr_code);
  CREATE INDEX IF NOT EXISTS tickets_created ON tickets(created_at);
  CREATE INDEX IF NOT EXISTS intents_qr ON subscription_intents(qr_code, status);
  CREATE INDEX IF NOT EXISTS reviews_branch_state ON reviews(branch_id, state);
  CREATE INDEX IF NOT EXISTS sub_events_contact ON subscription_events(contact_id, at);
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS events_qr ON events(qr_code, name);
  `,
  // MAC+: العضوية والفواتير والمحفظة والطلبات والإطلالات والضمانات
  `
  CREATE TABLE members (
    id INTEGER PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    name TEXT,
    home_branch_id INTEGER REFERENCES branches(id),
    ref_code TEXT NOT NULL UNIQUE,
    referred_by INTEGER REFERENCES members(id),
    referral_rewarded INTEGER NOT NULL DEFAULT 0,
    consent_marketing INTEGER NOT NULL DEFAULT 0,
    control INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'cashier',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE plus_intents (
    id INTEGER PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    status_key TEXT NOT NULL UNIQUE,
    name TEXT,
    branch_id INTEGER,
    ref_code TEXT,
    consent INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('awaiting','confirmed','expired')),
    member_id INTEGER REFERENCES members(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE TABLE invoices (
    id INTEGER PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id),
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    ref TEXT NOT NULL,
    amount REAL NOT NULL,
    section_ids TEXT NOT NULL DEFAULT '[]',
    dept_count INTEGER NOT NULL DEFAULT 0,
    tier_pct REAL NOT NULL DEFAULT 0,
    reward REAL NOT NULL DEFAULT 0,
    reward_mode TEXT NOT NULL DEFAULT 'discount' CHECK (reward_mode IN ('discount','wallet')),
    wallet_used REAL NOT NULL DEFAULT 0,
    gift_code TEXT UNIQUE,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (branch_id, ref)
  );
  CREATE INDEX invoices_member ON invoices(member_id, created_at);
  CREATE INDEX invoices_created ON invoices(created_at, branch_id);
  CREATE TABLE wallet_entries (
    id INTEGER PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id),
    kind TEXT NOT NULL CHECK (kind IN ('tier','referral','welcome','price','adjust','redeem','expire')),
    amount REAL NOT NULL,
    remaining REAL NOT NULL DEFAULT 0,
    min_invoice REAL NOT NULL DEFAULT 0,
    invoice_id INTEGER REFERENCES invoices(id),
    expires_at TEXT,
    note TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX wallet_member ON wallet_entries(member_id, expires_at);
  CREATE TABLE requests (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('reserve','collect','find')),
    ref TEXT NOT NULL UNIQUE,
    member_id INTEGER REFERENCES members(id),
    phone TEXT NOT NULL,
    name TEXT,
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    section_id INTEGER REFERENCES sections(id),
    look_id INTEGER,
    details TEXT NOT NULL,
    size TEXT,
    status TEXT NOT NULL CHECK (status IN ('new','confirmed','ready','found','done','cancelled','expired')),
    hold_until TEXT,
    pickup_code TEXT,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'web',
    handled_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX requests_status ON requests(status, branch_id);
  CREATE INDEX requests_phone ON requests(phone, status);
  CREATE TABLE looks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    occasion TEXT NOT NULL,
    audience TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    items TEXT NOT NULL DEFAULT '[]',
    image TEXT,
    branch_ids TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE claims (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('price','size','gift')),
    member_id INTEGER REFERENCES members(id),
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    item TEXT NOT NULL,
    paid REAL,
    new_price REAL,
    credit REAL NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE branch_days (
    branch_id INTEGER NOT NULL REFERENCES branches(id),
    day TEXT NOT NULL,
    invoices INTEGER NOT NULL,
    sales REAL,
    PRIMARY KEY (branch_id, day)
  );
  `,
];

export function openDb(file = join(config.dataDir, 'mac-center.db')) {
  if (file !== ':memory:') mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get();
  let version = row ? row.version : 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  while (version < SCHEMA.length) {
    db.exec('BEGIN');
    try {
      db.exec(SCHEMA[version]);
      version += 1;
      db.prepare('UPDATE schema_version SET version = ?').run(version);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const json = {
  parse(value, fallback = null) {
    if (value == null || value === '') return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  },
  str(value) { return JSON.stringify(value ?? null); },
};

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? json.parse(row.value, fallback) : fallback;
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}
export { sqlNow } from './lib/time.js';
