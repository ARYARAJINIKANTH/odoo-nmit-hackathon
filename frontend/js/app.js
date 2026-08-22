/* =========================================================
   DAYFLOW – app.js  (shared UI core, loaded on EVERY page)
   ---------------------------------------------------------
   Contains: session storage, auth guards, app shell (sidebar +
   topbar), toast + confirm-modal helpers, icons, formatters.
   NOTE: no data logic lives here — data comes only from api.js
   ========================================================= */

/* ---------- safe storage (works even in restricted preview iframes) ---------- */
const Storage = (() => {
  let mem = {};
  let ok = false;
  try { localStorage.setItem('__df_t', '1'); localStorage.removeItem('__df_t'); ok = true; } catch (e) { ok = false; }
  return {
    get(key) { try { return ok ? localStorage.getItem(key) : (mem[key] ?? null); } catch (e) { return mem[key] ?? null; } },
    set(key, val) { try { if (ok) { localStorage.setItem(key, val); return; } } catch (e) {} mem[key] = val; },
    remove(key) { try { if (ok) { localStorage.removeItem(key); return; } } catch (e) {} delete mem[key]; },
  };
})();

/* ---------- session ---------- */
const SESSION_KEY = 'dayflow_session';

function getSession() {
  try { return JSON.parse(Storage.get(SESSION_KEY) || 'null'); } catch (e) { return null; }
}
function setSession(session, remember) {
  Storage.set(SESSION_KEY, JSON.stringify(session)); // remember-me flag is respected when swapping to real tokens
  session.__remember = !!remember;
}
function clearSession() { Storage.remove(SESSION_KEY); }

function currentPage() { return location.pathname.split('/').pop() || 'index.html'; }

/* Guard: redirect to login if not signed in (or wrong area) */
function requireAuth() {
  const s = getSession();
  if (!s) {
    location.replace('login.html?next=' + encodeURIComponent(currentPage()));
    return null;
  }
  // HR users get their own dashboard; employees can't open HR-only pages
  const page = currentPage();
  if (s.role === 'hr' && page === 'employee-dashboard.html') { location.replace('hr-dashboard.html'); return null; }
  if (s.role === 'employee' && (page === 'hr-dashboard.html' || page.startsWith('hr-'))) { location.replace('employee-dashboard.html'); return null; }
  return s;
}

function logoutUser() {
  clearSession();
  location.replace('login.html?loggedout=1');
}

/* ---------- inline SVG icon set (no icon font needed) ---------- */
const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  calCheck: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 15.5 11.2 17.7 15 13.5"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  wallet: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  clockIn: '<circle cx="12" cy="12" r="10"/><polyline points="12 7 12 12 15.5 14"/>',
  clockOut: '<circle cx="12" cy="12" r="10"/><polyline points="16 7 13 12 16 17"/><line x1="9" y1="12" x2="13" y2="12"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  trending: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  brief: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  money: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
};

function icon(name, size) {
  const s = size || 18;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

/* ---------- escape html (all API strings pass through this before rendering) ---------- */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- formatters ---------- */
const fmtMoney = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function toISODate(d) { // local date -> yyyy-mm-dd (no UTC surprises)
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function fromISODate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function fmtDate(s) { if (!s) return '—'; const d = fromISODate(s); return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()].slice(0,3)} ${d.getFullYear()}`; }
function fmtDateLong(s) { const d = s ? fromISODate(s) : new Date(); return `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function fmtTime(t) { return t || '—'; }
function monthLabel(ym) { const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ${y}`; }
function relTime(ts) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} day(s) ago`;
}
function workedHours(inTime, outTime) {
  if (!inTime || !outTime) return null;
  const [h1, m1] = inTime.split(':').map(Number), [h2, m2] = outTime.split(':').map(Number);
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  return mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : null;
}

/* deterministic avatar (initials + hue from name) */
function avatarHTML(name, photo, cls) {
  if (photo) return `<span class="avatar ${cls || ''}"><img src="${photo}" alt=""></span>`;
  const initials = String(name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="avatar ${cls || ''}" style="background:hsl(${h},58%,48%)">${esc(initials)}</span>`;
}

function statusBadge(status) {
  const labels = { present: 'Present', absent: 'Absent', 'half-day': 'Half Day', leave: 'Leave', weekoff: 'Week Off', 'not-marked': 'Not Marked', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', paid: 'Paid', processing: 'Processing' };
  return `<span class="badge-status s-${esc(status)}"><span class="dot"></span>${labels[status] || esc(status)}</span>`;
}
function typeBadge(type) {
  const labels = { paid: 'Paid Leave', sick: 'Sick Leave', unpaid: 'Unpaid Leave' };
  return `<span class="badge-status t-${esc(type)}">${labels[type] || esc(type)}</span>`;
}

/* ---------- toasts ---------- */
function toast(message, type = 'success', title) {
  let stack = document.querySelector('.toast-stack');
  if (!stack) { stack = document.createElement('div'); stack.className = 'toast-stack'; document.body.appendChild(stack); }
  const titles = { success: 'Done', error: 'Something went wrong', info: 'Heads up' };
  const el = document.createElement('div');
  el.className = `df-toast ${type}`;
  el.innerHTML = `<div>${icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info', 16)}</div>
    <div><strong>${esc(title || titles[type])}</strong><span>${esc(message)}</span></div>
    <button class="t-close" aria-label="Close">${icon('x', 14)}</button>`;
  el.querySelector('.t-close').onclick = () => el.remove();
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---------- confirm / form modal (returns Promise) ---------- */
function openModal({ title, body, okText = 'Confirm', okClass = 'btn-dayflow', cancelText = 'Cancel', showCancel = true, commentField }) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'df-modal-backdrop';
    back.innerHTML = `
      <div class="df-modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h5>${title}</h5><button class="modal-x" aria-label="Close">${icon('x', 15)}</button></div>
        <div class="modal-body">${body || ''}
          ${commentField ? `<div class="mt-3"><label class="form-label">${commentField}</label><textarea class="form-control" id="df-modal-comment" rows="2" placeholder="Optional comment…"></textarea></div>` : ''}
        </div>
        <div class="modal-foot">
          ${showCancel ? '<button class="btn btn-ghost" data-act="cancel">' + cancelText + '</button>' : ''}
          <button class="btn ${okClass}" data-act="ok">${okText}</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    const done = (val, comment, values) => { back.remove(); resolve({ confirmed: val, comment, values: values || {} }); };
    back.querySelector('.modal-x').onclick = () => done(false);
    if (showCancel) back.querySelector('[data-act="cancel"]').onclick = () => done(false);
    back.querySelector('[data-act="ok"]').onclick = () => {
      // capture values of any [data-field] inputs before the modal is removed
      const values = {};
      back.querySelectorAll('[data-field]').forEach(el => values[el.dataset.field] = el.value.trim ? el.value.trim() : el.value);
      done(true, commentField ? back.querySelector('#df-modal-comment').value.trim() : undefined, values);
    };
    back.addEventListener('mousedown', e => { if (e.target === back) done(false); });
  });
}

/**
 * openFormModal() — modal with a form body and full control.
 * onOk(backdropEl) runs when OK is pressed:
 *   return false  -> keep modal open (validation failed)
 *   return true/undefined -> close it.
 */
function openFormModal({ title, body, okText = 'Save', okClass = 'btn-dayflow', cancelText = 'Cancel', onOk, large }) {
  const back = document.createElement('div');
  back.className = 'df-modal-backdrop';
  back.innerHTML = `
    <div class="df-modal ${large ? 'modal-lg' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h5>${title}</h5><button class="modal-x" aria-label="Close">${icon('x', 15)}</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-act="cancel">${cancelText}</button>
        <button class="btn ${okClass}" data-act="ok">${okText}</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.querySelector('.modal-x').onclick = close;
  back.querySelector('[data-act="cancel"]').onclick = close;
  back.querySelector('[data-act="ok"]').onclick = async () => {
    const keepOpen = await onOk(back);
    if (keepOpen !== true) close();
  };
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  return back;
}

const confirmAction = (opts) => openModal(opts).then(r => r.confirmed);

/* ---------- loading helpers ---------- */
function setLoading(el, on) { if (el) el.classList.toggle('loading-veil', on); }
function skeletons(rows = 3, cols = 4) {
  let cells = '';
  for (let c = 0; c < cols; c++) cells += '<div class="skeleton sk-line w-80"></div>';
  return `<div class="p-3">${Array.from({ length: rows }).map(() => `<div class="d-flex gap-3 mb-3">${cells}</div>`).join('')}</div>`;
}
const emptyState = (msg, sub = '') => `
  <div class="empty-state">${icon('inbox', 40)}
    <div class="es-title">${esc(msg)}</div>
    ${sub ? `<p>${esc(sub)}</p>` : ''}
  </div>`;

/* ---------- app shell (sidebar + topbar shared by all dashboard pages) ---------- */
function shellNav(role) {
  const emp = [
    { key: 'employee-dashboard.html', label: 'Dashboard', ic: 'home' },
    { key: 'profile.html', label: 'My Profile', ic: 'user' },
    { key: 'attendance.html', label: 'Attendance', ic: 'calCheck' },
    { key: 'leave.html', label: 'Leave', ic: 'plane' },
    { key: 'payroll.html', label: 'Payroll', ic: 'wallet' },
  ];
  const hr = [
    { key: 'hr-dashboard.html', label: 'Dashboard', ic: 'home' },
    { key: 'hr-employees.html', label: 'Employees', ic: 'users' },
    { key: 'attendance.html', label: 'Attendance', ic: 'calCheck' },
    { key: 'leave.html', label: 'Leave Approvals', ic: 'plane' },
    { key: 'payroll.html', label: 'Payroll', ic: 'wallet' },
    { key: 'profile.html', label: 'My Profile', ic: 'user' },
  ];
  return role === 'hr' ? hr : emp;
}

/**
 * Renders sidebar + topbar into the page's #df-shell element.
 * Call on every protected page:  const session = initShell({ active, title, sub });
 */
function initShell({ active, title, sub }) {
  const s = getSession();
  if (!s) { location.replace('login.html?next=' + encodeURIComponent(currentPage())); return null; }
  const roleLabel = s.role === 'hr' ? 'HR / Admin' : 'Employee';
  const shell = document.getElementById('df-shell');
  shell.classList.add('df-shell');
  if (s.role === 'hr') shell.classList.add('shell-hr');

  shell.innerHTML = `
    <aside class="df-sidebar" id="df-sidebar">
      <a class="side-brand" href="${s.role === 'hr' ? 'hr-dashboard.html' : 'employee-dashboard.html'}">
        <img src="assets/logo.svg" width="34" height="34" alt="Dayflow logo">
        <span class="brand-word">Day<span class="accent">flow</span></span>
      </a>
      <nav class="side-nav">
        <div class="side-group-label">${roleLabel} Menu</div>
        ${shellNav(s.role).map(n => `
          <a class="side-link ${n.key === active ? 'active' : ''}" href="${n.key}">${icon(n.ic)}${n.label}</a>`).join('')}
      </nav>
      <div class="side-foot">
        <div class="side-user">
          ${avatarHTML(s.name, s.photo)}
          <div style="min-width:0">
            <div class="su-name text-truncate">${esc(s.name)}</div>
            <div class="su-role">${roleLabel}</div>
          </div>
        </div>
      </div>
    </aside>
    <div class="sidebar-backdrop" id="df-backdrop"></div>
    <div class="df-main">
      <header class="df-topbar">
        <button class="hamburger" id="df-hamburger" aria-label="Menu">${icon('menu', 22)}</button>
        <div>
          <h2 class="topbar-title">${esc(title)}</h2>
          ${sub ? `<div class="topbar-sub">${esc(sub)}</div>` : ''}
        </div>
        <div class="topbar-right">
          <span class="topbar-date">${fmtDateLong()}</span>
          <div style="position:relative">
            <button class="icon-btn" id="df-bell" aria-label="Notifications">
              ${icon('bell', 18)}<span class="n-dot" id="df-bell-dot" style="display:none">0</span>
            </button>
            <div class="notif-panel" id="df-notif" style="display:none"></div>
          </div>
          <button class="btn btn-ghost btn-sm" id="df-logout">${icon('logout', 16)} <span class="d-none d-md-inline">Logout</span></button>
        </div>
      </header>
      <main class="df-content" id="df-content">${document.getElementById('df-content').innerHTML}</main>
    </div>`;

  // mobile sidebar toggle
  const sidebar = document.getElementById('df-sidebar'), backdrop = document.getElementById('df-backdrop');
  document.getElementById('df-hamburger').onclick = () => { sidebar.classList.toggle('open'); backdrop.classList.toggle('show', sidebar.classList.contains('open')); };
  backdrop.onclick = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); };

  document.getElementById('df-logout').onclick = async () => {
    if (await confirmAction({ title: 'Log out?', body: '<p class="mb-0 text-muted-2">You will need to sign in again to access your Dayflow workspace.</p>', okText: 'Log out', okClass: 'btn-danger-soft' })) logoutUser();
  };

  // notifications dropdown — real per-user notifications from the API (read/unread persists in DB)
  const bell = document.getElementById('df-bell'), panel = document.getElementById('df-notif');
  bell.onclick = async () => {
    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      panel.innerHTML = '<div class="np-head">Notifications</div><div class="p-3"><span class="skeleton sk-line w-80"></span><span class="skeleton sk-line w-60"></span></div>';
      try {
        const items = await api.getNotifications(8);
        const renderItems = (list) => {
          panel.innerHTML = `<div class="np-head">Notifications</div>
            <div style="max-height:300px;overflow:auto">${list.length ? list.map(n => `
              <div class="notif-item" style="${n.read ? 'opacity:.65' : ''}">
                <span class="a-icon ${n.read ? 'i-indigo' : 'i-amber'}" style="width:28px;height:28px;flex:0 0 28px">${icon(n.icon || 'bell', 13)}</span>
                <div>${n.text}<span class="ni-time">${esc(relTime(n.ts))}${n.read ? '' : ' · <b>new</b>'}</span></div>
              </div>`).join('') : emptyState('No notifications yet', 'Leave updates appear here.')}</div>
            ${list.length ? '<div class="p-2 text-center" style="border-top:1px solid var(--df-line)"><button class="btn btn-ghost btn-sm" id="df-mark-read">Mark all as read</button></div>' : ''}`;
          const markBtn = panel.querySelector('#df-mark-read');
          if (markBtn) markBtn.onclick = async () => {
            markBtn.disabled = true; markBtn.innerHTML = '<span class="spin"></span>';
            try {
              await api.markNotificationsRead();
              const dot = document.getElementById('df-bell-dot');
              if (dot) dot.style.display = 'none';
              renderItems((await api.getNotifications(8)).map(n => ({ ...n, read: true })));
              toast('All notifications marked as read.', 'success');
            } catch (e) { toast(e.message, 'error'); }
          };
        };
        renderItems(items);
      } catch (e) { panel.innerHTML = `<div class="np-head">Notifications</div>${emptyState('Could not load notifications', e.message)}`; }
    } else panel.style.display = 'none';
  };
  document.addEventListener('click', e => { if (!panel.contains(e.target) && e.target !== bell && !bell.contains(e.target)) panel.style.display = 'none'; });

  // unread dot for pending items (HR) / own pending leave (employee)
  if (typeof api !== 'undefined') {
    api.getUnreadCount().then(n => {
      const dot = document.getElementById('df-bell-dot');
      if (dot && n > 0) { dot.textContent = n > 9 ? '9+' : n; dot.style.display = 'grid'; }
    }).catch(() => {});
  }
  return s;
}

/* simple debouncer for search boxes */
function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
