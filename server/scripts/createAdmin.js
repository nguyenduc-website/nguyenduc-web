'use strict';
require('dotenv').config();
const readline = require('readline');
const db = require('../database');
const auth = require('../services/auth.service');

async function main() {
  const username = process.env.ADMIN_USERNAME || await ask('Admin username: ');
  const email = process.env.ADMIN_EMAIL || await ask('Admin email: ');
  const password = process.env.ADMIN_PASSWORD || await askPassword('Admin password (min 12 chars): ');

  if (!username || !email || !password || password.length < 12) {
    console.error('❌ Missing username/email or password too short (min 12).');
    process.exit(1);
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    console.error('❌ Admin user already exists.');
    process.exit(1);
  }

  const hash = await auth.hashPassword(password);
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO users (username, email, password_hash, display_name, role, status, package, must_change_password, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'ADMIN', 'active', 'PREMIUM', 0, ?, ?)
  `).run(username, email, hash, username, now, now);
  const uid = info.lastInsertRowid;
  db.prepare('INSERT OR IGNORE INTO wallets (user_id, balance, updated_at) VALUES (?, 0, ?)').run(uid, now);
  db.prepare('INSERT OR IGNORE INTO rankings (user_id, points, activity, updated_at) VALUES (?, 0, 0, ?)').run(uid, now);
  console.log(`✓ Admin created: ${username} (id=${uid})`);
  process.exit(0);
}

function ask(q) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, a => { rl.close(); res(a.trim()); });
  });
}
function askPassword(q) {
  return new Promise(res => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const stdin = process.stdin;
    process.stdout.write(q);
    const onData = (char) => {
      const s = char.toString();
      if (s === '\n' || s === '\r' || s === '\u0004') {
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        res(buffer.trim());
      } else if (s === '\u0003') {
        process.exit(1);
      } else if (s === '\u007f' || s === '\b') {
        buffer = buffer.slice(0, -1);
      } else {
        buffer += s;
      }
    };
    let buffer = '';
    stdin.on('data', onData);
    if (stdin.isTTY) stdin.setRawMode(true);
  });
}

main().catch(e => { console.error(e); process.exit(1); });