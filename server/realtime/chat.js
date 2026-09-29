'use strict';
const { WebSocketServer } = require('ws');
const db = require('../database');
const config = require('../config');
const { findSession } = require('../services/auth.service');

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(p => {
    const [k, ...v] = p.trim().split('=');
    out[k] = decodeURIComponent(v.join('='));
  });
  return out;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function attachChat(httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  const staffRooms = new Set();

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, config.baseUrl);
      if (url.pathname !== '/ws/chat') return socket.destroy();
      const cookies = parseCookies(req.headers.cookie);
      const sid = cookies['ngduc_sid'];
      const s = findSession(sid);
      if (!s) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
      const user = db.prepare('SELECT id, role, display_name, username FROM users WHERE id = ?').get(s.user_id);
      if (!user) { socket.destroy(); return; }
      req._user = user;
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } catch { socket.destroy(); }
  });

  wss.on('connection', (ws, req) => {
    const user = req._user;
    const isStaff = user.role === 'ADMIN' || user.role === 'MODERATOR';
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.send(JSON.stringify({ type: 'hello', user: { id: user.id, displayName: user.display_name, role: user.role } }));

    // Gửi 30 tin nhắn gần nhất
    const room = isStaff ? null : user.id;
    if (!isStaff) {
      const rows = db.prepare(`SELECT id, user_id, body, from_staff, created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 30`).all(user.id);
      ws.send(JSON.stringify({ type: 'history', messages: rows.reverse() }));
    }

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type !== 'send' || typeof msg.body !== 'string') return;
      const clean = msg.body.trim().slice(0, 2000);
      if (!clean) return;
      const targetUserId = isStaff && Number.isInteger(msg.userId) ? msg.userId : user.id;
      if (!Number.isInteger(targetUserId)) return;
      const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
      if (!target) return;
      const now = Date.now();
      const info = db.prepare(`INSERT INTO chat_messages (user_id, channel, body, from_staff, created_at) VALUES (?, 'support', ?, ?, ?)`)
        .run(targetUserId, clean, isStaff ? 1 : 0, now);
      const payload = {
        type: 'message',
        message: {
          id: info.lastInsertRowid,
          userId: targetUserId,
          body: clean,
          fromStaff: isStaff,
          fromName: user.display_name || user.username,
          createdAt: now,
        },
      };
      // broadcast tới chính user & tất cả staff
      wss.clients.forEach((c) => {
        if (c === ws) return;
        const cu = c._user;
        if (!cu) return;
        const cStaff = cu.role === 'ADMIN' || cu.role === 'MODERATOR';
        if (cStaff || cu.id === targetUserId) {
          if (c.readyState === 1) c.send(JSON.stringify(payload));
        }
      });
      if (ws.readyState === 1) ws.send(JSON.stringify(payload));
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  return wss;
}

module.exports = { attachChat };