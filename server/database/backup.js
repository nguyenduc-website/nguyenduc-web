'use strict';
const fs = require('fs');
const path = require('path');
const db = require('./index');
const config = require('../config');

const dir = path.resolve(process.cwd(), 'backups');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(dir, `ngduc-${stamp}.db`);

db.backup(out)
  .then(() => {
    console.log(`✓ Backup written to ${out}`);
    db.pragma('wal_checkpoint(TRUNCATE)');
    process.exit(0);
  })
  .catch((e) => { console.error(e); process.exit(1); });