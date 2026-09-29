'use strict';
const PaymentProvider = require('./PaymentProvider');
const config = require('../config');

class ManualBankProvider extends PaymentProvider {
  get name() { return 'MANUAL_BANK'; }
  get enabled() { return config.bank.enabled; }

  async createPayment(order) {
    if (!this.enabled) {
      throw Object.assign(new Error('Manual bank provider disabled'), { status: 503, code: 'PROVIDER_DISABLED' });
    }
    const memo = `NDW-${order.id}`;
    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(config.bank.name)}-${encodeURIComponent(config.bank.account)}-${config.bank.qrTemplate}.png?amount=${order.amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(config.bank.accountName)}`;
    return {
      provider: this.name,
      status: 'PENDING',
      memo,
      qrUrl,
      bankName: config.bank.name,
      accountNumber: config.bank.account,
      accountName: config.bank.accountName,
      amount: order.amount,
      instruction: 'Chuyển khoản đúng số tiền và nội dung. Hệ thống sẽ tự động xác nhận hoặc chờ Admin duyệt.',
    };
  }

  verifyWebhook(_req) {
    // Manual bank: verification do Admin thực hiện, không tin webhook tự động
    return { ok: false, reason: 'MANUAL_CONFIRMATION_ONLY' };
  }
}

module.exports = ManualBankProvider;