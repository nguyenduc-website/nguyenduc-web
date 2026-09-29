'use strict';
const db = require('../database');
const config = require('../config');
const nodemailer = require('nodemailer');

let transporter = null;
if (config.smtp.enabled) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

async function createTicket({ userId, email, subject, body }) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO support_tickets (user_id, email, subject, body, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'OPEN', ?, ?)
  `).run(userId || null, email, subject, body, now, now);
  const ticketId = info.lastInsertRowid;

  let emailSent = 0;
  if (transporter && config.smtp.supportEmail) {
    try {
      await transporter.sendMail({
        from: `"NGUYỄN ĐỨC • Web • Store" <${config.smtp.user}>`,
        to: config.smtp.supportEmail,
        replyTo: email,
        subject: `[Support #${ticketId}] ${subject}`,
        text:
`Tin nhắn từ NGUYỄN ĐỨC • Web • Store

Từ: ${email}
Tiêu đề: ${subject}

Nội dung:
${body}

—— Gửi từ NGUYỄN ĐỨC • Web • Store ——`,
      });
      emailSent = 1;
      db.prepare('UPDATE support_tickets SET email_sent = 1 WHERE id = ?').run(ticketId);
    } catch (e) {
      console.error('SMTP send failed:', e.message);
    }
  }

  return { id: ticketId, emailSent: !!emailSent, emailConfigured: config.smtp.enabled };
}

function listByUser(userId) {
  return db.prepare(`SELECT id, subject, body, status, created_at FROM support_tickets WHERE user_id = ? ORDER BY id DESC`)
    .all(userId);
}

function listAll(status = null) {
  if (status) {
    return db.prepare(`SELECT id, user_id, email, subject, body, status, created_at FROM support_tickets WHERE status = ? ORDER BY id DESC LIMIT 200`).all(status);
  }
  return db.prepare(`SELECT id, user_id, email, subject, body, status, created_at FROM support_tickets ORDER BY id DESC LIMIT 200`).all();
}

function updateStatus(id, status) {
  db.prepare(`UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?`).run(status, Date.now(), id);
}

module.exports = { createTicket, listByUser, listAll, updateStatus };