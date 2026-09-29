'use strict';
const PaymentProvider = require('./PaymentProvider');

const FIXED_QR_URL = 'https://sf-static.upanhlaylink.com/img/image_20260929c368dc173817bc917d1ade9cd7a66dc8.jpg';

class QRProvider extends PaymentProvider {
  get name() { return 'QR'; }
  get enabled() { return true; }

  async createPayment(order) {
    return {
      provider: this.name,
      status: 'PENDING',
      qrUrl: FIXED_QR_URL,
      amount: order.amount,
      instruction: 'Quét mã QR, chuyển đúng số tiền hiển thị. Sau khi chuyển khoản hãy bấm "Tôi Đã Chuyển Khoản". Admin sẽ kiểm tra giao dịch thủ công.',
    };
  }

  verifyWebhook(_req) { return { ok: false, reason: 'QR_NO_WEBHOOK' }; }
}

module.exports = QRProvider;
