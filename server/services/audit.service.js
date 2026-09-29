'use strict';
const db = require('../database');

const insertAudit = db.prepare(`
  INSERT INTO audit_logs (actor_id, action, target, target_id, metadata, ip, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertSec = db.prepare(`
  INSERT INTO security_events (kind, ip, user_agent, user_id, metadata, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function audit(req, action, target = null, targetId = null, metadata = null) {
  try {
    insertAudit.run(
      req?.user?.id || null,
      action,
      target,
      targetId != null ? String(targetId) : null,
      metadata ? JSON.stringify(metadata) : null,
      req?.ip || null,
      Date.now()
    );
  } catch (e) { console.error('audit error', e.message); }
}

function security(kind, req, metadata = null, userId = null) {
  try {
    insertSec.run(
      kind,
      req?.ip || null,
      req?.headers?.['user-agent'] || null,
      userId ?? req?.user?.id ?? null,
      metadata ? JSON.stringify(metadata) : null,
      Date.now()
    );
  } catch (e) { console.error('security log error', e.message); }
}

module.exports = { audit, security };