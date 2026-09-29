'use strict';
const db = require('./index');
const r = db.pragma('integrity_check');
console.log('Integrity check:', r);
const fk = db.pragma('foreign_key_check');
console.log('FK check:', fk.length ? fk : 'OK');
process.exit(0);