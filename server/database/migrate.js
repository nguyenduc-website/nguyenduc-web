'use strict';
const db = require('./index');

db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);`);

const migrations = [
  require('./migrations/001_init'),
  require('./migrations/002_manual_payments'),
];

for (const migration of migrations) {
  const row = db.prepare('SELECT id FROM _migrations WHERE id = ?').get(migration.id);
  if (row) {
    console.log(`✓ Migration ${migration.id} already applied`);
    continue;
  }
  console.log(`Applying ${migration.id}...`);
  const tx = db.transaction(() => {
    migration.up(db);
    db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(migration.id, Date.now());
  });
  tx();
  console.log(`✓ Applied ${migration.id}`);
}

// seed defaults
const now = Date.now();
const seedSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
seedSetting.run('site.name', 'NGUYỄN ĐỨC • Web • Store', now);
seedSetting.run('site.maintenance', '0', now);
seedSetting.run('wallet.min_withdraw', '50000', now);
seedSetting.run('wallet.max_withdraw', '50000000', now);
seedSetting.run('wallet.withdraw_fee', '0', now);
seedSetting.run('wallet.daily_withdraw_limit', '100000000', now);

console.log('✓ Migration complete');
