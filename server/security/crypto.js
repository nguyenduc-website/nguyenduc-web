'use strict';
const crypto = require('crypto');
const config = require('../config');

function keyFromHex(hex, len = 32) {
  const buf = Buffer.from(hex, 'hex');
  if (buf.length >= len) return buf.subarray(0, len);
  return crypto.createHash('sha256').update(hex).digest().subarray(0, len);
}

const ENC_KEY = keyFromHex(config.encryptionKey, 32);

function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('hex'); }

function sha256(input) { return crypto.createHash('sha256').update(String(input)).digest('hex'); }

function hmac(input, secret = config.sessionSecret) {
  return crypto.createHmac('sha256', secret).update(String(input)).digest('hex');
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(b64) {
  try {
    const buf = Buffer.from(b64, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return null; }
}

function hashIp(ip) { return hmac(ip || '', config.antibotSecret).slice(0, 32); }
function hashUa(ua) { return hmac(ua || '', config.antibotSecret).slice(0, 32); }

module.exports = {
  randomToken, sha256, hmac, timingSafeEqualStr,
  encrypt, decrypt, hashIp, hashUa,
};