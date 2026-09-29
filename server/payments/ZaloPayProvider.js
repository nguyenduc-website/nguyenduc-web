'use strict';
const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');
const config = require('../config');

class ZaloPayProvider extends PaymentProvider {
  get name() { return 'ZALOPAY'; }
  get enabled() { return config.zalopay.enabled; }

  async createPayment(order) {
    if (!this.enabled) {
      throw Object.assign(new Error('ZaloPay not configured'), { status: 503, code: 'PROVIDER_DISABLED' });
    }
    const { appId, key1, endpoint, callbackUrl, redirectUrl } = config.zalopay;
    const now = Date.now();
    const appTransId = `${new Date().toISOString().slice(2,10).replace(/-/g,'')}_${order.id}`;
    const embedData = JSON.stringify({ redirecturl: redirectUrl || `${config.baseUrl}/wallet` });
    const items = JSON.stringify([]);
    const appUser = `user_${order.userId}`;

    const data = `${appId}|${appTransId}|${appUser}|${order.amount}|${now}|${embedData}|${items}`;
    const mac = crypto.createHmac('sha256', key1).update(data).digest('hex');

    const body = {
      app_id: parseInt(appId, 10),
      app_trans_id: appTransId,
      app_user: appUser,
      app_time: now,
      amount: order.amount,
      embed_data: embedData,
      item: items,
      description: `Nap tien ${order.id}`,
      bank_code: '',
      callback_url: callbackUrl,
      mac,
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.return_code !== 1) {
      throw Object.assign(new Error(`ZaloPay error: ${json.return_message || 'unknown'}`), { status: 502, code: 'PAYMENT_FAILED' });
    }
    return {
      provider: this.name,
      status: 'PENDING',
      appTransId,
      paymentUrl: json.order_url,
      qrCode: json.qr_code,
      raw: json,
    };
  }

  verifyWebhook(req) {
    if (!this.enabled) return { ok: false, reason: 'DISABLED' };
    const body = req.body;
    if (!body || !body.data || !body.mac) return { ok: false, reason: 'MISSING_FIELDS' };
    const mac = crypto.createHmac('sha256', config.zalopay.key2).update(body.data).digest('hex');
    if (mac !== body.mac) return { ok: false, reason: 'BAD_SIGNATURE' };
    try {
      return { ok: true, data: JSON.parse(body.data) };
    } catch { return { ok: false, reason: 'BAD_JSON' }; }
  }
}

module.exports = ZaloPayProvider;