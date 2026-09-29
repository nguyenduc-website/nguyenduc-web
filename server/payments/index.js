'use strict';
const ManualBankProvider = require('./ManualBankProvider');
const QRProvider = require('./QRProvider');
const ZaloPayProvider = require('./ZaloPayProvider');

const registry = {
  MANUAL_BANK: new ManualBankProvider(),
  QR: new QRProvider(),
  ZALOPAY: new ZaloPayProvider(),
};

function getProvider(name) {
  const p = registry[name];
  if (!p) {
    throw Object.assign(new Error('Provider not found'), { status: 404, code: 'PROVIDER_NOT_FOUND' });
  }
  return p;
}

function listAvailable() {
  return Object.values(registry).map(p => ({ name: p.name, enabled: p.enabled }));
}

module.exports = { getProvider, listAvailable, registry };