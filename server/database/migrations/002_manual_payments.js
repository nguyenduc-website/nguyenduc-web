'use strict';

module.exports = {
  id: '002_manual_payments',
  up(db) {
    db.exec(`
      CREATE TABLE manual_payment_requests (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        method TEXT NOT NULL CHECK(method IN ('QR','CARD')),
        amount INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
        card_code_enc TEXT,
        card_seri_enc TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','FAILED')),
        admin_note TEXT,
        decided_by INTEGER REFERENCES users(id),
        decided_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_manual_payment_user ON manual_payment_requests(user_id, created_at DESC);
      CREATE INDEX idx_manual_payment_status ON manual_payment_requests(status, created_at DESC);
    `);
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS manual_payment_requests;');
  },
};
