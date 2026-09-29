'use strict';

module.exports = {
  id: '001_init',
  up(db) {
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('USER','MODERATOR','ADMIN')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','locked','banned','deleted')),
        must_change_password INTEGER NOT NULL DEFAULT 0,
        package TEXT NOT NULL DEFAULT 'FREE' CHECK(package IN ('FREE','BASIC','PREMIUM')),
        package_expires_at INTEGER,
        last_login_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_users_role ON users(role);

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id, revoked);

      CREATE TABLE antibot_challenges (
        id TEXT PRIMARY KEY,
        nonce TEXT NOT NULL,
        difficulty INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        solved_at INTEGER
      );
      CREATE INDEX idx_ab_expires ON antibot_challenges(expires_at);

      CREATE TABLE antibot_verifications (
        id TEXT PRIMARY KEY,
        ip_hash TEXT,
        ua_hash TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_abv_expires ON antibot_verifications(expires_at);

      CREATE TABLE announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'ADMIN' CHECK(kind IN ('ADMIN','MODERATOR','SYSTEM','PAYMENT','SECURITY')),
        active INTEGER NOT NULL DEFAULT 1,
        require_ack INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE announcement_reads (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        read_at INTEGER NOT NULL,
        PRIMARY KEY(user_id, announcement_id)
      );

      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'SYSTEM',
        title TEXT NOT NULL,
        body TEXT,
        link TEXT,
        read_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_notif_user ON notifications(user_id, read_at);

      CREATE TABLE media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0',
        image_path TEXT,
        image_url TEXT,
        file_path TEXT,
        file_url TEXT,
        package TEXT NOT NULL DEFAULT 'FREE' CHECK(package IN ('FREE','BASIC','PREMIUM')),
        description TEXT,
        price INTEGER NOT NULL DEFAULT 0,
        downloads INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX idx_media_package ON media(package, active);

      CREATE TABLE media_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        granted_at INTEGER NOT NULL,
        expires_at INTEGER,
        UNIQUE(user_id, media_id)
      );

      CREATE TABLE wallets (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE wallet_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT NOT NULL CHECK(type IN ('DEPOSIT','WITHDRAW','PURCHASE','REFUND','ADJUSTMENT','BONUS')),
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        ref_type TEXT,
        ref_id TEXT,
        description TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_wtx_user ON wallet_transactions(user_id, created_at DESC);

      CREATE TABLE deposits (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        amount INTEGER NOT NULL CHECK(amount > 0),
        provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','FAILED','CANCELLED','EXPIRED','REFUNDED')),
        external_ref TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_dep_user ON deposits(user_id, created_at DESC);

      CREATE TABLE withdrawals (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        amount INTEGER NOT NULL CHECK(amount > 0),
        fee INTEGER NOT NULL DEFAULT 0,
        bank_name TEXT NOT NULL,
        bank_account_enc TEXT NOT NULL,
        bank_account_name_enc TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','PROCESSING','COMPLETED','REJECTED')),
        admin_note TEXT,
        decided_by INTEGER REFERENCES users(id),
        decided_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_wd_user ON withdrawals(user_id, created_at DESC);
      CREATE INDEX idx_wd_status ON withdrawals(status);

      CREATE TABLE payment_orders (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        provider TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'VND',
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','FAILED','CANCELLED','EXPIRED','REFUNDED')),
        request_payload TEXT,
        response_payload TEXT,
        paid_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE payment_webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        order_id TEXT,
        signature TEXT,
        payload TEXT NOT NULL,
        valid INTEGER NOT NULL DEFAULT 0,
        processed INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(provider, order_id, signature)
      );

      CREATE TABLE subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        package TEXT NOT NULL,
        price INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        expires_at INTEGER,
        active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        channel TEXT NOT NULL DEFAULT 'support',
        body TEXT NOT NULL,
        from_staff INTEGER NOT NULL DEFAULT 0,
        read_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_chat_user ON chat_messages(user_id, created_at DESC);

      CREATE TABLE support_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        email TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
        email_sent INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        target_type TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        comment TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, target_type, target_id)
      );

      CREATE TABLE rankings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        points INTEGER NOT NULL DEFAULT 0,
        activity INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_rank_points ON rankings(points DESC);

      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER,
        action TEXT NOT NULL,
        target TEXT,
        target_id TEXT,
        metadata TEXT,
        ip TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at DESC);

      CREATE TABLE security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT,
        user_id INTEGER,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_sec_kind ON security_events(kind, created_at DESC);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE analytics_counters (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `);
  },
  down(db) {
    // drop in reverse order
    const tables = [
      'analytics_counters','settings','security_events','audit_logs','rankings','ratings',
      'support_tickets','chat_messages','subscriptions','payment_webhooks','payment_orders',
      'withdrawals','deposits','wallet_transactions','wallets','media_access','media',
      'notifications','announcement_reads','announcements','antibot_verifications',
      'antibot_challenges','sessions','users',
    ];
    for (const t of tables) db.exec(`DROP TABLE IF EXISTS ${t};`);
  },
};