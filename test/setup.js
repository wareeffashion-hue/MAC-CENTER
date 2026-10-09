// يجهز بيئة معزولة قبل تحميل الإعدادات
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'mc-test-'));
process.env.WHATSAPP_DRIVER = 'mock';
process.env.GOOGLE_DRIVER = 'mock';
process.env.PUBLIC_URL = 'https://test.maccenter.sa';
process.env.APP_SECRET = 'test-secret';

const { openDb } = await import('../src/db.js');
const { seedCatalog } = await import('../src/modules/catalog.js');

export function freshDb() {
  const db = openDb(':memory:');
  seedCatalog(db);
  return db;
}

export function addUser(db, { role = 'admin', branchIds = [], name = 'موظف', email } = {}) {
  const r = db.prepare('INSERT INTO users (name, email, role, branch_ids, password) VALUES (?, ?, ?, ?, ?)')
    .run(name, email || `${role}-${Math.random().toString(36).slice(2)}@t.sa`, role, JSON.stringify(branchIds), 'x');
  return db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
}
