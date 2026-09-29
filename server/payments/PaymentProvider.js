'use strict';

class PaymentProvider {
  get name() { throw new Error('name must be implemented'); }
  get enabled() { return false; }
  async createPayment(_order) { throw new Error('createPayment not implemented'); }
  verifyWebhook(_req) { throw new Error('verifyWebhook not implemented'); }
}

module.exports = PaymentProvider;