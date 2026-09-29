// NGUYỄN ĐỨC • Web • Store — frontend
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let state = { user: null, csrf: null, balance: 0, hideBalance: true, ws: null };

// ─── API client ─────────────────────────────
async function api(path, { method = 'GET', body = null, headers = {} } = {}) {
  const opts = { method, credentials: 'same-origin', headers: { ...headers } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (state.csrf && !['GET','HEAD'].includes(method)) opts.headers['X-CSRF-Token'] = state.csrf;
  const res = await fetch('/api' + path, opts);
  let data = null;
  try { data = await res.json(); } catch { data = { success: false, error: { code: 'NETWORK', message: 'Lỗi kết nối' } }; }
  if (!res.ok || !data.success) {
    const err = new Error(data.error?.message || 'Lỗi');
    err.code = data.error?.code;
    err.status = res.status;
    throw err;
  }
  return data.data ?? data;
}

// ─── Toast ──────────────────────────────────
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Modal ──────────────────────────────────
function modal({ title, content, actions = [] }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = `<h3></h3><div class="modal-body"></div><div class="modal-actions"></div>`;
    box.querySelector('h3').textContent = title;
    box.querySelector('.modal-body').innerHTML = content;
    const actBox = box.querySelector('.modal-actions');
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (a.className || '');
      btn.textContent = a.label;
      btn.onclick = () => { close(); resolve(a.value); };
      actBox.appendChild(btn);
    });
    back.appendChild(box);
    back.addEventListener('click', (e) => { if (e.target === back) { close(); resolve(null); } });
    function close() { back.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') { close(); resolve(null); } }
    document.addEventListener('keydown', esc);
    root.appendChild(back);
  });
}

// ─── Money ──────────────────────────────────
const fmtMoney = (v) => new Intl.NumberFormat('vi-VN').format(v) + 'đ';
const fmtDate = (ts) => new Date(ts).toLocaleString('vi-VN');

// ─── AntiBot ────────────────────────────────
async function runAntibot() {
  const gate = $('#antibot-gate');
  gate.hidden = false;
  const bar = $('#ab-bar');
  const status = $('#ab-status');

  // check status trước
  try {
    const s = await fetch('/api/antibot/status').then(r => r.json());
    if (s.data?.verified) { gate.hidden = true; return; }
  } catch {}

  status.textContent = 'Đang lấy challenge…';
  const c = await fetch('/api/antibot/challenge', { method: 'POST' }).then(r => r.json());
  if (!c.success) { status.textContent = 'Lỗi khởi tạo'; return; }
  const { id, nonce, difficulty } = c.data;
  bar.style.width = '10%';

  // Proof-of-work nhẹ: tìm số n sao cho sha256(nonce + ':' + n) bắt đầu bằng N ký tự '0'
  const enc = new TextEncoder();
  const target = '0'.repeat(difficulty);
  let solution = 0;
  const start = Date.now();
  const MAX_ITER = 5_000_000;
  let hashHex = '';
  async function sha(text) {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  status.textContent = 'Đang tính toán challenge…';
  bar.style.width = '20%';

  while (solution < MAX_ITER) {
    hashHex = await sha(nonce + ':' + solution);
    if (hashHex.startsWith(target)) break;
    solution++;
    if (solution % 2000 === 0) {
      const pct = 20 + Math.min(60, (solution / 200000) * 60);
      bar.style.width = pct + '%';
      await new Promise(r => setTimeout(r, 0));
    }
  }

  if (!hashHex.startsWith(target)) {
    status.textContent = 'Không giải được challenge, thử lại…';
    return setTimeout(runAntibot, 1200);
  }

  bar.style.width = '85%';
  status.textContent = 'Đang xác minh với máy chủ…';

  const elapsedMs = Math.max(Date.now() - start, 2000);
  const v = await fetch('/api/antibot/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ id, solution, elapsedMs }),
  }).then(r => r.json());

  if (!v.success) {
    status.textContent = 'Xác minh thất bại, thử lại…';
    return setTimeout(runAntibot, 1200);
  }
  bar.style.width = '100%';
  status.textContent = 'Đã xác minh ✓';
  await new Promise(r => setTimeout(r, 400));
  gate.hidden = true;
}

// ─── Drawer ─────────────────────────────────
function setupDrawer() {
  const btn = $('#menu-btn'), drawer = $('#drawer');
  const open = () => { drawer.hidden = false; btn.setAttribute('aria-expanded', 'true'); };
  const close = () => { drawer.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => drawer.hidden ? open() : close());
  $$('[data-close]', drawer).forEach(el => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) close(); });
  $$('a[data-nav]', drawer).forEach(a => a.addEventListener('click', close));
}

// ─── Auth UI ────────────────────────────────
async function loadMe() {
  try {
    const r = await api('/auth/me');
    if (r?.user) {
      state.user = r.user;
      state.csrf = r.csrfToken;
    }
  } catch {}
  renderAuth();
}

function renderAuth() {
  const isAuth = !!state.user;
  $('#auth-forms').hidden = isAuth;
  $('#profile').hidden = !isAuth;
  $('#admin-links').hidden = !isAuth || state.user.role === 'USER';

  if (isAuth) {
    const u = state.user;
    $('#pf-name').textContent = u.displayName || u.username;
    $('#pf-role').textContent = `${u.role} • ${u.status}`;
    $('#pf-avatar').textContent = (u.displayName || u.username).charAt(0).toUpperCase();
    $('#pf-pkg').textContent = u.package;
    $('#pf-joined').textContent = new Date(u.createdAt).toLocaleDateString('vi-VN');
  }
  // welcome
  const w = sessionStorage.getItem('welcome_shown');
  if (isAuth && !w) {
    toast(`Chào mừng ${state.user.displayName || state.user.username} quay trở lại Nguyễn Đức Web 👋`);
    sessionStorage.setItem('welcome_shown', '1');
  } else if (!isAuth && !w) {
    sessionStorage.setItem('welcome_shown', '1');
  }
}

function setupAuth() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const r = await api('/auth/login', { method: 'POST', body: Object.fromEntries(fd) });
      state.user = r.user; state.csrf = r.csrfToken;
      renderAuth(); toast('Đăng nhập thành công');
      await afterLogin();
    } catch (err) { toast(err.message, 'err'); }
  });

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    if (!body.email) delete body.email;
    if (!body.displayName) delete body.displayName;
    try {
      await api('/auth/register', { method: 'POST', body });
      toast('Đăng ký thành công, đăng nhập ngay…');
      const r = await api('/auth/login', { method: 'POST', body: { username: body.username, password: body.password } });
      state.user = r.user; state.csrf = r.csrfToken;
      renderAuth(); await afterLogin();
    } catch (err) { toast(err.message, 'err'); }
  });

  $('#btn-logout').addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    state.user = null; state.csrf = null;
    location.reload();
  });

  $('#btn-edit-profile').addEventListener('click', async () => {
    const u = state.user;
    const r = await modal({
      title: 'Chỉnh sửa hồ sơ',
      content: `
        <label class="form" style="gap:10px">
          <span style="font-size:13px;color:var(--muted)">Display name</span>
          <input id="m-dn" value="${u.displayName || ''}" maxlength="64" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:11px;color:inherit" />
          <span style="font-size:13px;color:var(--muted);margin-top:6px">Avatar URL</span>
          <input id="m-av" value="${u.avatarUrl || ''}" maxlength="500" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:11px;color:inherit" />
        </label>
      `,
      actions: [
        { label: 'Huỷ', value: null },
        { label: 'Lưu', className: 'btn-primary', value: 'save' },
      ],
    });
    if (r !== 'save') return;
    const displayName = $('#m-dn')?.value.trim();
    const avatarUrl = $('#m-av')?.value.trim();
    try {
      await api('/users/me', { method: 'PATCH', body: { displayName, avatarUrl: avatarUrl || undefined } });
      toast('Cập nhật thành công');
      await loadMe();
    } catch (e) { toast(e.message, 'err'); }
  });

  $('#btn-security').addEventListener('click', async () => {
    const r = await modal({
      title: 'Bảo mật',
      content: `
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">
          Mật khẩu hiện tại
          <input id="m-op" type="password" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:11px;color:inherit" />
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);margin-top:10px">
          Mật khẩu mới
          <input id="m-np" type="password" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:11px;color:inherit" />
        </label>
      `,
      actions: [
        { label: 'Huỷ', value: null },
        { label: 'Đổi mật khẩu', className: 'btn-primary', value: 'save' },
      ],
    });
    if (r !== 'save') return;
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { oldPassword: $('#m-op').value, newPassword: $('#m-np').value },
      });
      toast('Đã đổi mật khẩu');
    } catch (e) { toast(e.message, 'err'); }
  });

  $('#btn-sessions').addEventListener('click', async () => {
    try {
      const sessions = await api('/auth/sessions');
      const html = sessions.map(s => `
        <div class="row-item">
          <div>
            <strong>${s.ip || 'IP không rõ'}</strong>
            <div class="muted" style="font-size:12px">${(s.user_agent || 'UA không rõ').slice(0, 60)}</div>
          </div>
          <small class="muted">${fmtDate(s.created_at)}</small>
        </div>
      `).join('') || '<p class="muted">Không có phiên nào</p>';
      await modal({
        title: 'Phiên đăng nhập',
        content: html + '<div style="margin-top:14px"><button id="m-logall" class="btn danger">Đăng xuất tất cả</button></div>',
        actions: [{ label: 'Đóng', value: null }],
      });
      const btn = $('#m-logall');
      if (btn) btn.addEventListener('click', async () => {
        try { await api('/auth/logout-all', { method: 'POST' }); location.reload(); } catch (e) { toast(e.message, 'err'); }
      });
    } catch (e) { toast(e.message, 'err'); }
  });
}

async function afterLogin() {
  await Promise.all([loadWallet(), loadAnnouncements(), loadNotifications(), loadMedia($('.seg.active')?.dataset.pkg || 'FREE')]);
  connectChat();
}

// ─── Wallet ─────────────────────────────────
async function loadWallet() {
  if (!state.user) return;
  try {
    const r = await api('/wallet');
    state.balance = r.balance;
    renderBalance();
    $('#pf-balance').textContent = fmtMoney(r.balance);
  } catch (e) {
    if (e.status === 403 && e.code === 'ANTIBOT_REQUIRED') {
      // silently refresh antibot
      runAntibot();
    }
  }
}

function renderBalance() {
  $('#balance-value').textContent = state.hideBalance ? '******' : fmtMoney(state.balance);
}

function setupWallet() {
  $('#balance-toggle').addEventListener('click', () => {
    state.hideBalance = !state.hideBalance;
    renderBalance();
  });

  $$('[data-action="deposit"]').forEach(b => b.addEventListener('click', openDeposit));
  $$('[data-action="withdraw"]').forEach(b => b.addEventListener('click', openWithdraw));
  $$('[data-action="history"]').forEach(b => b.addEventListener('click', showHistory));
  $$('[data-buy]').forEach(b => b.addEventListener('click', () => buyPackage(b.dataset.buy)));
}

async function openDeposit() {
  if (!state.user) return toast('Vui lòng đăng nhập', 'err');

  const r = await modal({
    title: '💳 Thanh toán thủ công',
    content: `
      <p class="muted">Chọn phương thức thanh toán:</p>
      <div style="display:grid;gap:10px;margin-top:14px">
        <div class="card" style="padding:14px">
          <strong>📱 QR Chuyển khoản</strong>
          <p class="muted" style="font-size:12px;margin-top:5px">Chuyển khoản và chờ Admin xác nhận.</p>
        </div>
        <div class="card" style="padding:14px">
          <strong>🎴 Thẻ cào</strong>
          <p class="muted" style="font-size:12px;margin-top:5px">Nhập mã thẻ + số seri để Admin kiểm tra.</p>
        </div>
      </div>
    `,
    actions: [
      { label: 'Đóng', value: null },
      { label: '📱 QR', className: 'btn-primary', value: 'QR' },
      { label: '🎴 Thẻ cào', className: 'btn-primary', value: 'CARD' },
    ],
  });
  if (r === 'QR') return openManualQR();
  if (r === 'CARD') return openManualCard();
}

async function openManualQR() {
  const r = await modal({
    title: '📱 Nạp bằng QR',
    content: `
      <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">
        Số tiền (VND)
        <input id="manual-qr-amount" type="number" min="1000" max="100000000" value="50000"
          style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:11px;color:inherit" />
      </label>
      <div style="margin-top:12px;text-align:center">
        <img src="https://sf-static.upanhlaylink.com/img/image_20260929c368dc173817bc917d1ade9cd7a66dc8.jpg"
          alt="QR thanh toán Nguyễn Đức" style="width:min(300px,100%);background:#fff;padding:10px;border-radius:14px" />
      </div>
      <p class="muted" style="margin-top:10px;font-size:12px">
        Quét mã, chuyển khoản đúng số tiền rồi bấm <b>Tôi Đã Chuyển Khoản</b>.
        Nếu Admin chưa nhận được tiền, Admin sẽ thông báo giao dịch chưa hoàn tất.
      </p>
    `,
    actions: [
      { label: 'Huỷ', value: null },
      { label: 'Tôi Đã Chuyển Khoản', className: 'btn-primary', value: 'send' },
    ],
  });
  if (r !== 'send') return;
  const amount = parseInt($('#manual-qr-amount')?.value, 10);
  if (!Number.isInteger(amount) || amount < 1000) return toast('Số tiền tối thiểu 1.000đ', 'err');
  try {
    const x = await api('/payments/manual', { method: 'POST', body: { method: 'QR', amount } });
    toast(`Đã gửi #${x.data?.id}. Admin sẽ kiểm tra khoản ${fmtMoney(amount)}.`, 'success');
    await loadWallet();
    await loadNotifications();
  } catch (e) { toast(e.message, 'err'); }
}

async function openManualCard() {
  const r = await modal({
    title: '🎴 Nạp thẻ cào',
    content: `
      <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">
        Mã Thẻ
        <input id="manual-card-code" maxlength="80" autocomplete="off" placeholder="Nhập mã thẻ..." />
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);margin-top:10px">
        Số Seri
        <input id="manual-card-seri" maxlength="80" autocomplete="off" placeholder="Nhập số seri..." />
      </label>
      <p class="muted" style="margin-top:10px;font-size:12px">Admin sẽ kiểm tra thẻ. Nếu hợp lệ, Admin nhập số tiền thực tế và duyệt để cộng vào ví.</p>
    `,
    actions: [
      { label: 'Huỷ', value: null },
      { label: 'Gửi thẻ', className: 'btn-primary', value: 'send' },
    ],
  });
  if (r !== 'send') return;
  const cardCode = $('#manual-card-code')?.value.trim();
  const cardSeri = $('#manual-card-seri')?.value.trim();
  if (!cardCode || !cardSeri) return toast('Vui lòng nhập đầy đủ Mã Thẻ và Số Seri', 'err');
  try {
    const x = await api('/payments/manual', { method: 'POST', body: { method: 'CARD', amount: 0, cardCode, cardSeri } });
    toast(`Đã gửi thẻ #${x.data?.id}. Chờ Admin kiểm tra.`, 'info');
    await loadNotifications();
  } catch (e) { toast(e.message, 'err'); }
}

async function openWithdraw() {
  if (!state.user) return toast('Vui lòng đăng nhập', 'err');
  const r = await modal({
    title: 'Rút tiền',
    content: `
      <p class="muted" style="font-size:13px">Số dư hiện tại: ${fmtMoney(state.balance)}</p>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);margin-top:10px">
        Số tiền rút
        <input id="wd-amt" type="number" min="50000" max="50000000" value="50000" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:11px;color:inherit" />
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);margin-top:10px">
        Ngân hàng
        <input id="wd-bank" maxlength="80" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:11px;color:inherit" />
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);margin-top:10px">
        Số tài khoản
        <input id="wd-acc" maxlength="32" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:11px;color:inherit" />
      </label>
      <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);margin-top:10px">
        Tên chủ tài khoản
        <input id="wd-name" maxlength="80" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:11px;color:inherit" />
      </label>
    `,
    actions: [
      { label: 'Huỷ', value: null },
      { label: 'Gửi yêu cầu', className: 'btn-primary', value: 'send' },
    ],
  });
  if (r !== 'send') return;
  try {
    await api('/wallet/withdrawals', {
      method: 'POST',
      body: {
        amount: parseInt($('#wd-amt').value, 10),
        bankName: $('#wd-bank').value.trim(),
        bankAccount: $('#wd-acc').value.trim(),
        bankAccountName: $('#wd-name').value.trim(),
      },
    });
    toast('Đã gửi yêu cầu rút tiền, chờ Admin duyệt');
    await loadWallet();
  } catch (e) { toast(e.message, 'err'); }
}

async function showHistory() {
  if (!state.user) return toast('Vui lòng đăng nhập', 'err');
  try {
    const [rows, manual] = await Promise.all([
      api('/wallet/transactions?limit=50'),
      api('/payments/manual'),
    ]);
    const statusText = { PENDING: 'ĐANG CHỜ', PAID: '✓ ĐÃ DUYỆT', FAILED: '✗ THẤT BẠI' };
    const manualHtml = manual.map(t => `
      <div class="row-item">
        <div>
          <strong>${t.method === 'QR' ? '📱 QR' : '🎴 Thẻ cào'} • ${t.id}</strong>
          <div class="muted" style="font-size:12px">${statusText[t.status] || t.status}${t.adminNote ? ' — ' + escapeHtml(t.adminNote) : ''}</div>
          <div class="muted" style="font-size:11px">${fmtDate(t.createdAt)}</div>
        </div>
        <strong>${t.amount ? fmtMoney(t.amount) : 'Chờ duyệt'}</strong>
      </div>
    `).join('');
    const txHtml = rows.map(t => `
      <div class="row-item">
        <div>
          <strong>${escapeHtml(t.type)}</strong>
          <div class="muted" style="font-size:12px">${escapeHtml(t.description || '')}</div>
          <div class="muted" style="font-size:11px">${fmtDate(t.created_at)}</div>
        </div>
        <strong style="color:${t.amount >= 0 ? 'var(--emerald)' : 'var(--red)'}">${t.amount >= 0 ? '+' : ''}${fmtMoney(t.amount)}</strong>
      </div>
    `).join('');
    const html = `<h4>Yêu cầu thanh toán</h4>${manualHtml || '<p class="muted">Chưa có yêu cầu.</p>'}<h4 style="margin-top:18px">Biến động số dư</h4>${txHtml || '<p class="muted">Chưa có giao dịch.</p>'}`;
    modal({ title: 'Lịch sử thanh toán', content: html, actions: [{ label: 'Đóng', value: null }] });
  } catch (e) { toast(e.message, 'err'); }
}

async function buyPackage(pkg) {
  if (!state.user) return toast('Vui lòng đăng nhập', 'err');
  toast(`Để nâng cấp gói ${pkg}, vui lòng nạp tiền và liên hệ Admin.`);
}

// ─── Media ──────────────────────────────────
async function loadMedia(pkg) {
  const list = $('#media-list');
  list.innerHTML = Array(3).fill('<div class="card skeleton" style="height:160px"></div>').join('');
  try {
    const items = await api('/media/list?package=' + encodeURIComponent(pkg));
    if (!items.length) {
      list.innerHTML = '<p class="muted">Chưa có media nào trong gói này.</p>';
      return;
    }
    list.innerHTML = items.map(m => `
      <article class="card">
        ${m.image_url ? `<img src="${m.image_url}" alt="${escapeHtml(m.name)}" style="border-radius:10px;margin-bottom:12px;aspect-ratio:16/10;object-fit:cover" />` : '<div class="skeleton" style="height:140px;margin-bottom:12px"></div>'}
        <h3>${escapeHtml(m.name)} <span class="muted" style="font-weight:400;font-size:12px">v${escapeHtml(m.version)}</span></h3>
        <p>${escapeHtml(m.description || '')}</p>
        <div style="display:flex;gap:8px;margin-top:12px;align-items:center;justify-content:space-between">
          <span class="muted" style="font-size:12px">${m.downloads} lượt tải</span>
          <button class="btn btn-primary" data-mid="${m.id}">Truy cập</button>
        </div>
      </article>
    `).join('');
    $$('button[data-mid]', list).forEach(b => b.addEventListener('click', () => accessMedia(parseInt(b.dataset.mid, 10))));
  } catch (e) {
    list.innerHTML = `<p class="muted">Lỗi: ${escapeHtml(e.message)}</p>`;
  }
}

async function accessMedia(id) {
  if (!state.user) return toast('Vui lòng đăng nhập', 'err');
  try {
    const r = await api(`/media/${id}/access`);
    if (r.url) {
      window.open(r.url, '_blank', 'noopener');
    } else {
      window.location.href = `/api/media/file/${id}`;
    }
  } catch (e) {
    if (e.code === 'UPGRADE_REQUIRED') {
      modal({
        title: 'Cần nâng cấp gói',
        content: `<p>Media này yêu cầu gói cao hơn. Vui lòng nâng cấp Basic hoặc Premium.</p>`,
        actions: [
          { label: 'Đóng', value: null },
          { label: 'Xem gói', className: 'btn-primary', value: 'go' },
        ],
      }).then((r) => { if (r === 'go') location.hash = '#pricing'; });
    } else {
      toast(e.message, 'err');
    }
  }
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

function setupMediaTabs() {
  $$('.seg').forEach(btn => btn.addEventListener('click', () => {
    $$('.seg').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadMedia(btn.dataset.pkg);
  }));

  // Admin create button
  const createBtn = $('#media-create-btn');
  if (createBtn) createBtn.addEventListener('click', openMediaCreate);

  // Show create button if staff
  if (state.user && (state.user.role === 'ADMIN' || state.user.role === 'MODERATOR')) {
    createBtn.hidden = false;
  }
}

async function openMediaCreate() {
  const r = await modal({
    title: 'Tạo Media',
    content: `
      <form id="mform" style="display:flex;flex-direction:column;gap:10px">
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">Tên file<input name="name" required maxlength="120" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:10px;color:inherit" /></label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">Phiên bản<input name="version" value="1.0" maxlength="20" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:10px;color:inherit" /></label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">URL ảnh<input name="imageUrl" type="url" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:10px;color:inherit" /></label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">Hoặc ảnh từ thiết bị<input name="image" type="file" accept="image/*" style="color:inherit" /></label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">URL file<input name="fileUrl" type="url" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:10px;color:inherit" /></label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">Hoặc file từ thiết bị<input name="file" type="file" style="color:inherit" /></label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">Gói
          <select name="package" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:10px;color:inherit">
            <option>FREE</option><option>BASIC</option><option>PREMIUM</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)">Mô tả<textarea name="description" rows="3" maxlength="2000" style="background:rgba(0,0,0,.4);border:1px solid var(--line);border-radius:10px;padding:10px;color:inherit"></textarea></label>
      </form>
    `,
    actions: [
      { label: 'Huỷ', value: null },
      { label: 'Tạo', className: 'btn-primary', value: 'create' },
    ],
  });
  if (r !== 'create') return;

  const form = $('#mform');
  const fd = new FormData(form);
  // Xoá field rỗng để tránh gửi chuỗi rỗng gây lỗi url
  for (const [k, v] of Array.from(fd.entries())) {
    if (v === '' || (v instanceof File && !v.size)) fd.delete(k);
  }
  try {
    const res = await fetch('/api/media/create', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': state.csrf },
      body: fd,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Lỗi');
    toast('Đã tạo Media');
    loadMedia($('.seg.active').dataset.pkg);
  } catch (e) { toast(e.message, 'err'); }
}

// ─── Ranking ────────────────────────────────
async function loadRanking() {
  try {
    const rows = await api('/ranking?limit=30');
    const html = rows.map((r, i) => `
      <div class="row-item">
        <div style="display:flex;gap:12px;align-items:center">
          <strong style="width:30px;text-align:center;color:${i < 3 ? 'var(--indigo)' : 'var(--muted)'}">${i + 1}</strong>
          <div>
            <strong>${escapeHtml(r.display_name || r.username)}</strong>
            <div class="muted" style="font-size:12px">@${escapeHtml(r.username)}</div>
          </div>
        </div>
        <div style="text-align:right">
          <strong>${r.points}</strong>
          <div class="muted" style="font-size:12px">${r.activity} hoạt động</div>
        </div>
      </div>
    `).join('') || '<p class="muted">Chưa có dữ liệu</p>';
    $('#ranking-list').innerHTML = html;
  } catch (e) {
    $('#ranking-list').innerHTML = '<p class="muted">Không thể tải xếp hạng.</p>';
  }
}

// ─── Notifications ──────────────────────────
async function loadNotifications() {
  if (!state.user) return;
  try {
    const r = await api('/notifications');
    const badge = $('#notif-badge');
    if (r.unread > 0) { badge.hidden = false; badge.textContent = r.unread > 99 ? '99+' : r.unread; }
    else badge.hidden = true;

    $('#notif-list').innerHTML = r.items.length
      ? r.items.map(n => `
        <div class="row-item" style="${n.read_at ? 'opacity:.6' : ''}">
          <div>
            <strong>${escapeHtml(n.title)}</strong>
            <div class="muted" style="font-size:12px">${escapeHtml(n.body || '')}</div>
            <div class="muted" style="font-size:11px">${fmtDate(n.created_at)}</div>
          </div>
          ${!n.read_at ? `<button class="btn" data-nid="${n.id}">Đánh dấu đã đọc</button>` : ''}
        </div>
      `).join('')
      : '<p class="muted">Không có thông báo</p>';
    $$('button[data-nid]').forEach(b => b.addEventListener('click', async () => {
      try { await api(`/notifications/${b.dataset.nid}/read`, { method: 'POST' }); loadNotifications(); } catch {}
    }));
  } catch {}
}

// ─── Announcements (Admin notice modal) ─────
async function loadAnnouncements() {
  try {
    const list = await api('/announcements/active');
    if (!Array.isArray(list) || !list.length) return;
    for (const a of list) {
      if (a.read_at) continue;
      const r = await modal({
        title: a.title || '🚨 THÔNG BÁO TỪ ADMIN NGUYỄN ĐỨC',
        content: `<div style="white-space:pre-wrap">${escapeHtml(a.body || '')}</div>`,
        actions: [{ label: '✓ Tôi đã hiểu', className: 'btn-primary', value: 'ok' }],
      });
      try { await api(`/announcements/${a.id}/ack`, { method: 'POST' }); } catch {}
      break; // show one at a time
    }
  } catch {}
}

// ─── Chat WebSocket ────────────────────────
function connectChat() {
  if (!state.user) return;
  try {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws/chat`);
    state.ws = ws;
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'history') { m.messages.forEach(renderMsg); }
      else if (m.type === 'message') { renderMsg(m.message); }
    });
    ws.addEventListener('close', () => { setTimeout(connectChat, 3000); });
  } catch {}
}

function renderMsg(m) {
  const log = $('#chat-log');
  const mine = m.userId === state.user?.id && !m.fromStaff;
  const el = document.createElement('div');
  el.className = 'chat-msg' + (mine ? ' me' : '');
  el.innerHTML = `${escapeHtml(m.body)}<span class="meta">${escapeHtml(m.fromName || '')} • ${new Date(m.createdAt).toLocaleTimeString('vi-VN')}</span>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function setupChat() {
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-input');
    const body = input.value.trim();
    if (!body || !state.ws || state.ws.readyState !== 1) return;
    state.ws.send(JSON.stringify({ type: 'send', body }));
    input.value = '';
  });
}

// ─── Notification bell ─────────────────────
function setupNotifBell() {
  $('#notif-btn').addEventListener('click', () => {
    location.hash = '#notifications';
    loadNotifications();
  });
}

// ─── Boot ──────────────────────────────────
async function boot() {
  $('#year').textContent = new Date().getFullYear();
  setupDrawer();
  setupAuth();
  setupWallet();
  setupMediaTabs();
  setupChat();
  setupNotifBell();

  // AntiBot trước
  await runAntibot();

  // Load user (đồng thời render auth)
  await loadMe();

  // Load public & user data
  loadMedia('FREE');
  loadRanking();

  if (state.user) {
    await afterLogin();
    if (state.user.role === 'ADMIN' || state.user.role === 'MODERATOR') {
      $('#media-create-btn').hidden = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', boot);