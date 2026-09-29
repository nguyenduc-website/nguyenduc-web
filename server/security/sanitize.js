'use strict';

const HTML_ESCAPE = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;' };

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"'/]/g, (c) => HTML_ESCAPE[c]);
}

function stripHtml(s) {
  return String(s ?? '').replace(/<[^>]*>/g, '');
}

function normalizeString(s, max = 1000) {
  if (typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

function preventProtoPollution(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  delete obj.__proto__;
  delete obj.constructor;
  delete obj.prototype;
  return obj;
}

module.exports = { escapeHtml, stripHtml, normalizeString, preventProtoPollution };