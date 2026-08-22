/* =========================================================
   DAYFLOW – employee.js  (employee-dashboard.html + profile.html)
   UI logic only — all data comes from the `api` object.
   ========================================================= */

const EMP_PAGE = { dashboard: !!document.getElementById('greet-title'), profile: !!document.getElementById('profile-root') };

/* ================= EMPLOYEE DASHBOARD ================= */
async function initEmployeeDashboard() {
  const session = requireAuth();
  if (!session) return;
  initShell({ active: 'employee-dashboard.html', title: 'Dashboard', sub: 'Your workday at a glance' });

  const h = new Date().getHours();
  document.getElementById('greet-title').textContent = `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${session.name.split(' ')[0]} 👋`;
  document.getElementById('greet-sub').textContent = fmtDateLong();

  document.getElementById('pending-icon').innerHTML = icon('clock', 22);
  loadTodayCard(session.employeeId);
  loadLeaveBalCard(session.employeeId);
  loadPendingCount(session.employeeId);
  loadRecentLeaves(session.employeeId);
  loadPayrollSummary(session.employeeId);
  loadActivityFeed();
}

/* --- today's attendance + check-in / check-out buttons --- */
async function loadTodayCard(employeeId) {
  const body = document.getElementById('att-card-body');
  try {
    const rec = await api.getTodayAttendance(employeeId); // --> GET /api/attendance/today
    document.getElementById('att-status-wrap').innerHTML = statusBadge(rec.status);
    if (rec.status === 'weekoff') {
      body.innerHTML = `<p class="text-muted-2 mb-0">Today is a weekly off — enjoy your Sunday! 🌤️</p>`;
      return;
    }
    body.innerHTML = `
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div class="d-flex gap-4">
          <div><div class="th-time"><div class="tt-label">Checked in</div><div class="tt-value">${fmtTime(rec.checkIn)}</div></div></div>
          <div><div class="th-time"><div class="tt-label">Checked out</div><div class="tt-value">${fmtTime(rec.checkOut)}</div></div></div>
          <div><div class="th-time"><div class="tt-label">Worked</div><div class="tt-value">${workedHours(rec.checkIn, rec.checkOut) || '—'}</div></div></div>
        </div>
        <div class="d-flex gap-2" id="att-actions">
          <button class="btn btn-dayflow btn-checkin" id="btn-checkin" ${rec.checkIn ? 'disabled' : ''}>${icon('clockIn', 17)} Check in</button>
          <button class="btn btn-outline-dayflow btn-checkin" id="btn-checkout" ${!rec.checkIn || rec.checkOut ? 'disabled' : ''}>${icon('clockOut', 17)} Check out</button>
        </div>
      </div>`;
    document.getElementById('btn-checkin').onclick = () => checkIn(employeeId);
    document.getElementById('btn-checkout').onclick = () => checkOut(employeeId);
  } catch (e) {
    body.innerHTML = `<div class="alert df-alert df-error mb-0">${esc(e.message)}</div>`;
  }
}

/* checkIn() — UI action; api.checkIn() does the work (mock now → POST /api/attendance/check-in) */
async function checkIn(employeeId) {
  const btn = document.getElementById('btn-checkin');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Checking in…';
  try {
    const rec = await api.checkIn(employeeId);
    toast(`Checked in at ${rec.checkIn}. Have a great day!`, 'success', 'Checked in');
    loadTodayCard(employeeId);
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false; btn.innerHTML = `${icon('clockIn', 17)} Check in`;
  }
}

/* checkOut() — asks for confirmation since it ends the workday */
async function checkOut(employeeId) {
  const ok = await confirmAction({
    title: 'Check out for today?',
    body: '<p class="mb-0 text-muted-2">This will record your check-out time and end today\'s attendance. Under 4 worked hours is marked as a half day.</p>',
    okText: 'Check out', okClass: 'btn-dayflow',
  });
  if (!ok) return;
  const btn = document.getElementById('btn-checkout');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Checking out…';
  try {
    const rec = await api.checkOut(employeeId);
    toast(`Checked out at ${rec.checkOut}. See you tomorrow!`, 'success', 'Checked out');
    loadTodayCard(employeeId);
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false; btn.innerHTML = `${icon('clockOut', 17)} Check out`;
  }
}

/* --- leave balance + pending count cards --- */
async function loadLeaveBalCard(employeeId) {
  const body = document.getElementById('leave-bal-body');
  try {
    const bal = await api.getLeaveBalance(employeeId); // --> GET /api/leaves/balance
    body.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="small-2 fw-7">Paid</span><span class="small-2">${bal.paid.available}/${bal.paid.total} left</span>
      </div>
      <div class="progress mb-2" style="height:7px"><div class="progress-bar" style="background:var(--df-primary);width:${bal.paid.available / bal.paid.total * 100}%"></div></div>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="small-2 fw-7">Sick</span><span class="small-2">${bal.sick.available}/${bal.sick.total} left</span>
      </div>
      <div class="progress mb-2" style="height:7px"><div class="progress-bar" style="background:var(--df-red);width:${bal.sick.available / bal.sick.total * 100}%"></div></div>
      <div class="d-flex justify-content-between align-items-center">
        <span class="small-2 fw-7">Unpaid</span><span class="small-2">${bal.unpaid.available}/${bal.unpaid.total} left</span>
      </div>
      <div class="progress mt-2" style="height:7px"><div class="progress-bar bg-secondary" style="width:${bal.unpaid.available / bal.unpaid.total * 100}%"></div></div>`;
  } catch (e) { body.innerHTML = `<div class="alert df-alert df-error mb-0">${esc(e.message)}</div>`; }
}

async function loadPendingCount(employeeId) {
  try {
    const leaves = await api.getLeaveRequests(employeeId);
    document.getElementById('pending-count').textContent = leaves.filter(l => l.status === 'pending').length;
  } catch (e) { document.getElementById('pending-count').textContent = '—'; }
}

/* --- recent leave requests table --- */
async function loadRecentLeaves(employeeId) {
  const wrap = document.getElementById('recent-leaves-wrap');
  try {
    const leaves = await api.getLeaveRequests(employeeId); // --> GET /api/leaves?employee_id
    if (!leaves.length) { wrap.innerHTML = emptyState('No leave requests yet', 'Your applications will appear here.'); return; }
    wrap.innerHTML = `
      <div class="table-responsive">
        <table class="table df-table">
          <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th></tr></thead>
          <tbody>${leaves.slice(0, 5).map(l => `
            <tr>
              <td>${typeBadge(l.type)}</td>
              <td class="nowrap">${fmtDate(l.from)}</td>
              <td class="nowrap">${fmtDate(l.to)}</td>
              <td><b>${l.days}</b></td>
              <td>${statusBadge(l.status)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) { wrap.innerHTML = `<div class="p-3"><div class="alert df-alert df-error mb-0">${esc(e.message)}</div></div>`; }
}

/* --- payroll summary card --- */
async function loadPayrollSummary(employeeId) {
  const body = document.getElementById('payroll-summary-body');
  try {
    const p = await api.getPayroll(employeeId); // --> GET /api/payroll?employee_id
    const latest = p.payslips[p.payslips.length - 1];
    document.getElementById('ps-month-chip').textContent = monthLabel(latest.month);
    const s = p.structure;
    body.innerHTML = `
      <div class="row g-3">
        <div class="col-6 col-md-3"><div class="kv"><div class="kv-label">Basic</div><div class="kv-value">${fmtMoney(s.basic)}</div></div></div>
        <div class="col-6 col-md-3"><div class="kv"><div class="kv-label">Allowances</div><div class="kv-value" style="color:var(--df-green)">+ ${fmtMoney(s.hra + s.transport + s.special)}</div></div></div>
        <div class="col-6 col-md-3"><div class="kv"><div class="kv-label">Deductions</div><div class="kv-value" style="color:var(--df-red)">− ${fmtMoney(s.pf + s.pt + s.insurance)}</div></div></div>
        <div class="col-6 col-md-3"><div class="kv editable" style="border-color:#c7d2fe"><div class="kv-label">Net salary / month</div><div class="kv-value" style="color:var(--df-primary);font-size:1.15rem">${fmtMoney(p.net)}</div></div></div>
      </div>
      <p class="form-hint mb-0 mt-2">Payroll is read-only for employees. Contact HR for corrections.</p>`;
  } catch (e) { body.innerHTML = `<div class="alert df-alert df-error mb-0">${esc(e.message)}</div>`; }
}

/* --- activity feed --- */
async function loadActivityFeed() {
  const el = document.getElementById('activity-list');
  try {
    const acts = await api.getActivities(6); // --> GET /api/activities
    if (!acts.length) { el.innerHTML = emptyState('No recent activity'); return; }
    const palette = ['i-indigo', 'i-green', 'i-amber', 'i-teal'];
    el.innerHTML = acts.map((a, i) => `
      <div class="activity-item">
        <span class="a-icon ${palette[i % 4]}">${icon(a.icon || 'info', 15)}</span>
        <div class="a-text">${a.text}<span class="a-time">${esc(relTime(a.ts))}</span></div>
      </div>`).join('');
  } catch (e) { el.innerHTML = `<div class="p-3"><div class="alert df-alert df-error mb-0">${esc(e.message)}</div></div>`; }
}

/* ================= PROFILE PAGE ================= */
let PROFILE_CACHE = null;

async function initProfilePage() {
  const session = requireAuth();
  if (!session) return;
  initShell({ active: 'profile.html', title: 'My Profile', sub: 'Personal & employment details' });
  const roleChip = document.getElementById('profile-role-chip');
  roleChip.innerHTML = session.role === 'hr'
    ? '<span class="badge-role hr">HR / ADMIN</span>'
    : '<span class="badge-role emp">EMPLOYEE</span>';
  await loadEmployeeProfile(session.employeeId);
}

/**
 * loadEmployeeProfile() — fetches profile and renders the page.
 * (mock now → GET /api/employees/<id>/profile later)
 */
async function loadEmployeeProfile(employeeId) {
  const root = document.getElementById('profile-root');
  try {
    const e = await api.getEmployeeProfile(employeeId);
    PROFILE_CACHE = e;
    const isHR = getSession().role === 'hr';
    const roField = (label, value, ic) => `
      <div class="kv ro"><div class="kv-label">${icon(ic, 13)} ${label} <span class="edit-tag lock">LOCKED</span></div><div class="kv-value">${esc(value || '—')}</div></div>`;

    root.innerHTML = `
      <!-- identity header -->
      <div class="df-card mb-3"><div class="card-body-p">
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <div style="position:relative" class="profile-avatar-wrap">
            ${avatarHTML(e.name, e.photo, 'avatar-lg')}
            <button class="icon-btn" id="photo-btn" title="Change profile picture" style="position:absolute;bottom:-4px;right:-4px;border-radius:50%;width:32px;height:32px">${icon('camera', 15)}</button>
          </div>
          <div class="flex-grow-1">
            <h3 class="mb-1" style="font-size:1.3rem">${esc(e.name)}</h3>
            <div class="text-muted-2 mb-2">${esc(e.position)} · ${esc(e.department)}</div>
            <div class="chip-row">
              <span class="chip">${icon('hash', 13)} ${esc(e.id)}</span>
              <span class="chip">${icon('mail', 13)} ${esc(e.email)}</span>
            </div>
          </div>
        </div>
        <p class="form-hint mb-0 mt-2">${icon('info', 12)} Only <b>phone</b>, <b>address</b> and <b>profile picture</b> can be edited by you. Other fields are managed by HR.</p>
      </div></div>

      <!-- employment details (read-only) -->
      <div class="df-card mb-3">
        <div class="card-head"><h3 class="card-title">Employment details</h3><span class="edit-tag lock">READ-ONLY</span></div>
        <div class="card-body-p">
          <div class="kv-grid">
            ${roField('Employee ID', e.id, 'hash')}
            ${roField('Full name', e.name, 'user')}
            ${roField('Email', e.email, 'mail')}
            ${roField('Department', e.department, 'users')}
            ${roField('Job position', e.position, 'brief')}
            ${roField('Joining date', fmtDate(e.joinDate), 'calendar')}
            ${roField('Role', isHR ? 'HR / Admin' : 'Employee', 'lock')}
          </div>
        </div>
      </div>

      <!-- contact details (editable) -->
      <div class="df-card mb-3">
        <div class="card-head">
          <h3 class="card-title">Contact details</h3>
          <button class="btn btn-soft btn-sm" id="edit-contact-btn">${icon('edit', 14)} Edit</button>
        </div>
        <div class="card-body-p" id="contact-body"></div>
      </div>

      <!-- salary structure (read-only) -->
      <div class="df-card mb-3">
        <div class="card-head"><h3 class="card-title">Salary structure</h3><span class="edit-tag lock">READ-ONLY</span></div>
        <div class="card-body-p" id="salary-body"></div>
      </div>

      <!-- documents -->
      <div class="df-card">
        <div class="card-head"><h3 class="card-title">Documents</h3><span class="edit-tag lock">MANAGED BY HR</span></div>
        <div class="card-body-p" id="docs-body"></div>
      </div>`;

    renderContactReadOnly(e);
    renderSalary(e);
    renderDocs(e);
    document.getElementById('photo-btn').onclick = () => document.getElementById('photo-input').click();
    document.getElementById('edit-contact-btn').onclick = () => enterContactEditMode(e);
  } catch (e2) {
    root.innerHTML = `<div class="alert df-alert df-error">${esc(e2.message)}</div>`;
  }
}

function renderContactReadOnly(e) {
  document.getElementById('contact-body').innerHTML = `
    <div class="kv-grid">
      <div class="kv editable"><div class="kv-label">${icon('phone', 13)} Phone <span class="edit-tag can">EDITABLE</span></div><div class="kv-value">${esc(e.phone || '—')}</div></div>
      <div class="kv editable"><div class="kv-label">${icon('pin', 13)} Address <span class="edit-tag can">EDITABLE</span></div><div class="kv-value">${esc(e.address || '—')}</div></div>
    </div>`;
}

function enterContactEditMode(e) {
  const body = document.getElementById('contact-body');
  body.innerHTML = `
    <form id="contact-form" novalidate>
      <div class="row g-3">
        <div class="col-md-5">
          <label class="form-label" for="phone-input">Phone</label>
          <input class="form-control" id="phone-input" value="${esc(e.phone)}" required minlength="7" maxlength="20">
          <div class="invalid-feedback">Enter a valid phone number (7–20 characters).</div>
        </div>
        <div class="col-md-7">
          <label class="form-label" for="address-input">Address</label>
          <textarea class="form-control" id="address-input" rows="2" required minlength="5" maxlength="160">${esc(e.address)}</textarea>
          <div class="invalid-feedback">Address must be 5–160 characters.</div>
        </div>
      </div>
      <div class="d-flex gap-2 mt-3">
        <button type="submit" class="btn btn-dayflow btn-sm" id="save-contact-btn">${icon('check', 14)} Save changes</button>
        <button type="button" class="btn btn-ghost btn-sm" id="cancel-contact-btn">Cancel</button>
      </div>
    </form>`;
  document.getElementById('cancel-contact-btn').onclick = () => renderContactReadOnly(e);
  document.getElementById('contact-form').onsubmit = async ev => {
    ev.preventDefault();
    const form = ev.target;
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;
    const btn = document.getElementById('save-contact-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Saving…';
    try {
      await api.updateEmployeeProfile(e.id, { // --> PATCH /api/employees/<id>/profile
        phone: document.getElementById('phone-input').value.trim(),
        address: document.getElementById('address-input').value.trim(),
      });
      toast('Contact details updated.', 'success', 'Saved');
      await loadEmployeeProfile(e.id);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; btn.innerHTML = `${icon('check', 14)} Save changes`;
    }
  };
}

function renderSalary(e) {
  const s = e.salary;
  document.getElementById('salary-body').innerHTML = `
    <div class="row g-3">
      <div class="col-md-6">
        <div class="kv"><div class="kv-label">Basic salary</div><div class="kv-value">${fmtMoney(s.basic)}</div></div>
        <div class="kv mt-2"><div class="kv-label">HRA</div><div class="kv-value">${fmtMoney(s.hra)}</div></div>
        <div class="kv mt-2"><div class="kv-label">Transport allowance</div><div class="kv-value">${fmtMoney(s.transport)}</div></div>
        <div class="kv mt-2"><div class="kv-label">Special allowance</div><div class="kv-value">${fmtMoney(s.special)}</div></div>
      </div>
      <div class="col-md-6">
        <div class="kv"><div class="kv-label">PF (provident fund)</div><div class="kv-value" style="color:var(--df-red)">− ${fmtMoney(s.pf)}</div></div>
        <div class="kv mt-2"><div class="kv-label">Professional tax</div><div class="kv-value" style="color:var(--df-red)">− ${fmtMoney(s.pt)}</div></div>
        <div class="kv mt-2"><div class="kv-label">Insurance</div><div class="kv-value" style="color:var(--df-red)">− ${fmtMoney(s.insurance)}</div></div>
        <div class="kv mt-2 editable" style="border-color:#a7f3d0"><div class="kv-label">Net salary / month</div><div class="kv-value" style="color:var(--df-green);font-size:1.15rem">${fmtMoney(s.basic + s.hra + s.transport + s.special - s.pf - s.pt - s.insurance)}</div></div>
      </div>
    </div>`;
}

function renderDocs(e) {
  const el = document.getElementById('docs-body');
  if (!e.documents || !e.documents.length) {
    el.innerHTML = emptyState('No documents on file', 'HR-uploaded documents will appear here.');
    return;
  }
  el.innerHTML = e.documents.map(d => `
    <div class="d-flex align-items-center justify-content-between py-2" style="border-bottom:1px solid #f0f1f5">
      <div class="d-flex align-items-center gap-2">${icon('file', 18)}<div><b class="small-2">${esc(d.name)}</b><div class="text-muted-2" style="font-size:.74rem">${esc(d.size)}</div></div></div>
      <button class="btn btn-ghost btn-sm" onclick="toast('Document downloads will be served by the API.', 'info')">${icon('download', 14)} Download</button>
    </div>`).join('');
}

/* photo upload: resize in-browser, save via api (later: multipart POST to /api/employees/<id>/photo) */
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('photo-input');
  if (input) input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { toast('Please choose a PNG, JPG or WebP image.', 'error'); return; }
    try {
      const dataUrl = await resizeImage(file, 256);
      await api.updateEmployeeProfile(PROFILE_CACHE.id, { photo: dataUrl });
      const s = getSession(); setSession({ ...s, photo: dataUrl });
      toast('Profile picture updated.', 'success', 'Looking good');
      await loadEmployeeProfile(PROFILE_CACHE.id);
    } catch (e) { toast(e.message || 'Could not update picture.', 'error'); }
    input.value = '';
  };
});

function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* boot */
document.addEventListener('DOMContentLoaded', () => {
  if (EMP_PAGE.dashboard) initEmployeeDashboard();
  if (EMP_PAGE.profile) initProfilePage();
});
