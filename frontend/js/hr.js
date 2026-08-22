/* =========================================================
   AXIOM – hr.js  (hr-dashboard.html + hr-employees.html)
   UI logic only — all data comes from the `api` object.
   ========================================================= */

const HR_PAGE = { dashboard: !!document.getElementById('hd-total'), employees: !!document.getElementById('emp-table-wrap') };

/* ================= HR DASHBOARD ================= */
async function initHrDashboard() {
  const session = requireAuth();
  if (!session) return;
  initShell({ active: 'hr-dashboard.html', title: 'HR Dashboard', sub: 'Organisation overview' });

  document.getElementById('hd-icon-emp').innerHTML = icon('users', 22);
  document.getElementById('hd-icon-present').innerHTML = icon('check', 22);
  document.getElementById('hd-icon-absent').innerHTML = icon('x', 22);
  document.getElementById('hd-icon-pending').innerHTML = icon('clock', 22);

  try {
    const stats = await api.getHrStats(); // --> GET /api/hr/stats
    document.getElementById('hd-total').textContent = stats.totalEmployees;
    document.getElementById('hd-present').textContent = stats.counts.present;
    document.getElementById('hd-half').textContent = `${stats.counts['half-day']} on half-day`;
    document.getElementById('hd-absent').textContent = stats.counts.absent;
    document.getElementById('hd-onleave').textContent = `${stats.counts.leave} on approved leave`;
    document.getElementById('hd-pending').textContent = stats.pendingLeaves;
    const pill = document.getElementById('hd-pending-pill');
    if (stats.pendingLeaves > 0) { pill.style.display = 'inline-block'; pill.textContent = stats.pendingLeaves; }

    /* donut */
    const c = stats.counts;
    const total = Object.values(c).reduce((a, b) => a + b, 0) || 1;
    const segs = [
      ['Present', c.present, '#16a34a'], ['Half-day', c['half-day'], '#d97706'],
      ['Leave', c.leave, '#7c3aed'], ['Absent', c.absent, '#dc2626'], ['Not marked', c['not-marked'], '#9ca3af'],
    ].filter(s => s[1] > 0);
    let acc = 0;
    const stops = segs.map(([, v, col]) => { const from = acc / total * 360; acc += v; const to = acc / total * 360; return `${col} ${from}deg ${to}deg`; }).join(', ');
    document.getElementById('hd-donut').innerHTML = `
      <div class="donut-wrap">
        <div class="donut" style="background:conic-gradient(${stops})" data-center="${Math.round((c.present + c['half-day']) / total * 100)}% in"><div></div></div>
        <div class="donut-legend">
          <div class="dl-row" style="font-weight:800;color:var(--df-ink)">${Math.round((c.present + c['half-day']) / total * 100)}% of the team is in today</div>
          ${segs.map(([label, v, col]) => `<div class="dl-row"><span class="dl-swatch" style="background:${col}"></span>${label} — <b>${v}</b></div>`).join('')}
        </div>
      </div>`;

    /* trend bars */
    document.getElementById('hd-trend').innerHTML = `
      <div class="bars">${stats.trend.map(t => `
        <div class="bar-col" title="${fmtDate(t.date)}">
          <span class="bar-val">${t.pct}%</span>
          <div class="bar-visual" style="height:${Math.max(4, t.pct)}%"></div>
          <span class="bar-label">${t.label}</span>
        </div>`).join('')}
      </div>`;

    /* payroll overview */
    document.getElementById('hd-payroll').innerHTML = `
      <div class="row g-2 align-items-center">
        <div class="col-12 col-sm-4">
          <div class="stat-label">Total net payout</div>
          <div style="font-size:1.5rem;font-weight:800;color:var(--df-teal)">${fmtMoney(stats.monthlyPayroll)}</div>
        </div>
        <div class="col-12 col-sm-8 text-md-end">
          <span class="badge-status s-processing">Processing — ${monthLabel(toISODate(new Date()).slice(0, 7))}</span>
          <p class="form-hint mb-0 mt-1">Salaries are credited on the 28th. Review structures in <a href="payroll.html">Payroll</a>.</p>
        </div>
      </div>`;

    /* department breakdown (computed by the backend from real data) */
    const deptRoot = document.getElementById('hd-depts');
    if (deptRoot && Array.isArray(stats.departments)) {
      deptRoot.innerHTML = stats.departments.length ? `
        <div class="row g-2">
          ${stats.departments.map(d => `
            <div class="col-12 col-sm-6">
              <div class="d-flex justify-content-between align-items-center kv" style="padding:10px 14px">
                <div>
                  <div class="kv-value" style="font-size:.9rem">${esc(d.name)}</div>
                  <div class="stat-sub">${d.total} employee${d.total !== 1 ? 's' : ''}</div>
                </div>
                <div class="text-end">
                  <div style="font-weight:800;color:var(--df-green)">${d.present}</div>
                  <div class="stat-sub">in today</div>
                </div>
              </div>
            </div>`).join('')}
        </div>` : emptyState('No departments yet');
    }

    /* morale breakdown */
    const moraleRoot = document.getElementById('hd-morale');
    if (moraleRoot && stats.moodCounts) {
      const moods = stats.moodCounts;
      const totalMoods = Object.values(moods).reduce((a, b) => a + b, 0) || 1;
      moraleRoot.innerHTML = Object.keys(moods).length ? `
        <div class="d-flex justify-content-around align-items-center text-center">
          ${Object.entries(moods).map(([mood, count]) => `
            <div>
              <div style="font-size:2rem;margin-bottom:4px">${mood}</div>
              <div style="font-weight:700;color:var(--df-ink)">${count}</div>
              <div class="text-muted-2 small-2">${Math.round(count/totalMoods*100)}%</div>
            </div>
          `).join('')}
        </div>
      ` : emptyState('No vibe checks yet today');
    }
  } catch (e) {
    toast(e.message, 'error', 'Could not load dashboard');
    document.getElementById('hd-total').textContent = '--';
    document.getElementById('hd-present').textContent = '--';
    document.getElementById('hd-absent').textContent = '--';
    document.getElementById('hd-onleave').textContent = '--';
    document.getElementById('hd-donut').innerHTML = emptyState('Dashboard load error');
  }

  loadHrActivity();
}

async function loadHrActivity() {
  const el = document.getElementById('hd-activity');
  try {
    const acts = await api.getActivities(8); // --> GET /api/activities
    const palette = ['i-teal', 'i-green', 'i-amber', 'i-indigo'];
    el.innerHTML = acts.length ? acts.map((a, i) => `
      <div class="activity-item">
        <span class="a-icon ${palette[i % 4]}">${icon(a.icon || 'info', 15)}</span>
        <div class="a-text">${a.text}<span class="a-time">${esc(relTime(a.ts))}</span></div>
      </div>`).join('') : emptyState('No recent activity');
  } catch (e) { el.innerHTML = `<div class="p-3"><div class="alert df-alert df-error mb-0">${esc(e.message)}</div></div>`; }
}

/* ================= HR EMPLOYEE MANAGEMENT ================= */
const DEPARTMENTS = ['Engineering', 'People Ops', 'Sales', 'Finance', 'General'];

async function initHrEmployees() {
  const session = requireAuth();
  if (!session) return;
  initShell({ active: 'hr-employees.html', title: 'Employees', sub: 'Directory & records' });

  const deptSel = document.getElementById('emp-dept-filter');
  DEPARTMENTS.forEach(d => { const o = document.createElement('option'); o.value = d; o.textContent = d; deptSel.appendChild(o); });

  document.getElementById('emp-search').addEventListener('input', debounce(() => loadEmployees(), 250));
  deptSel.addEventListener('change', () => loadEmployees());
  const addBtn = document.getElementById('emp-add-btn');
  if (addBtn) addBtn.onclick = () => addEmployeeModal();

  loadEmployees();
}

/**
 * loadEmployees() — reads the filters and renders the table.
 * (mock now → GET /api/employees?search=&department= later)
 */
async function loadEmployees() {
  const wrap = document.getElementById('emp-table-wrap');
  const search = document.getElementById('emp-search').value.trim();
  const dept = document.getElementById('emp-dept-filter').value;
  setLoading(wrap.closest('.df-card'), true);
  try {
    const rows = await api.getEmployees({ search, department: dept });
    document.getElementById('emp-count').textContent = `${rows.length} employee${rows.length !== 1 ? 's' : ''}`;
    if (!rows.length) {
      wrap.innerHTML = emptyState('No employees found', search ? `Nothing matches "${search}". Try a different search.` : 'Adjust the department filter.');
      setLoading(wrap.closest('.df-card'), false);
      return;
    }
    wrap.innerHTML = `
      <div class="table-responsive">
        <table class="table df-table">
          <thead><tr><th>Employee</th><th>Email</th><th>Department</th><th>Position</th><th>Joined</th><th class="text-end">Actions</th></tr></thead>
          <tbody>
            ${rows.map(e => `
              <tr>
                <td><div class="cell-user">${avatarHTML(e.name, e.photo)}<div><div class="cu-name">${esc(e.name)} ${e.role === 'hr' ? '<span class="badge-role hr">HR</span>' : ''} ${e.active === false ? '<span class="badge-role" style="background:#fee2e2;color:#b91c1c">INACTIVE</span>' : ''}</div><div class="cu-sub">${esc(e.id)}</div></div></div></td>
                <td class="text-muted-2">${esc(e.email)}</td>
                <td>${esc(e.department)}</td>
                <td>${esc(e.position)}</td>
                <td class="nowrap">${fmtDate(e.joinDate)}</td>
                <td class="text-end nowrap">
                  <button class="btn btn-ghost btn-sm" data-view="${esc(e.id)}" title="View details">${icon('eye', 15)}</button>
                  <button class="btn btn-soft btn-sm" data-edit="${esc(e.id)}" title="Edit">${icon('edit', 15)}</button>
                  <button class="btn ${e.active === false ? 'btn-success-soft' : 'btn-danger-soft'} btn-sm" data-status="${esc(e.id)}" data-active="${e.active !== false}" title="${e.active === false ? 'Reactivate' : 'Deactivate'} account">
                    ${e.active === false ? icon('check', 15) : icon('lock', 15)}
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    wrap.querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewEmployee(b.dataset.view));
    wrap.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editEmployee(b.dataset.edit));
    wrap.querySelectorAll('[data-status]').forEach(b => b.onclick = () => toggleEmployeeActive(b.dataset.status, b.dataset.active === 'true', rows.find(r => r.employeeId === b.dataset.status || r.id === b.dataset.status)));
  } catch (e) {
    wrap.innerHTML = `<div class="p-3"><div class="alert df-alert df-error mb-0">${esc(e.message)}</div></div>`;
  }
  setLoading(wrap.closest('.df-card'), false);
}

/* view full details */
async function viewEmployee(id) {
  try {
    const e = await api.getEmployeeProfile(id); // --> GET /api/employees/<id>/profile
    const s = e.salary;
    openModal({
      title: `Employee details`,
      body: `
        <div class="d-flex align-items-center gap-3 mb-3">
          ${avatarHTML(e.name, e.photo, 'avatar-lg')}
          <div>
            <h4 class="mb-1">${esc(e.name)} ${e.role === 'hr' ? '<span class="badge-role hr">HR</span>' : '<span class="badge-role emp">EMPLOYEE</span>'}</h4>
            <div class="text-muted-2 small-2">${esc(e.position)} · ${esc(e.department)}</div>
          </div>
        </div>
        <div class="kv-grid">
          <div class="kv ro"><div class="kv-label">Employee ID</div><div class="kv-value">${esc(e.id)}</div></div>
          <div class="kv ro"><div class="kv-label">Email</div><div class="kv-value">${esc(e.email)}</div></div>
          <div class="kv ro"><div class="kv-label">Phone</div><div class="kv-value">${esc(e.phone)}</div></div>
          <div class="kv ro"><div class="kv-label">Joined</div><div class="kv-value">${fmtDate(e.joinDate)}</div></div>
          <div class="kv ro" style="grid-column:1/-1"><div class="kv-label">Address</div><div class="kv-value">${esc(e.address)}</div></div>
          <div class="kv"><div class="kv-label">Basic salary</div><div class="kv-value">${fmtMoney(s.basic)}</div></div>
          <div class="kv"><div class="kv-label">Net salary / month</div><div class="kv-value" style="color:var(--df-teal)">${fmtMoney(s.basic + s.hra + s.transport + s.special - s.pf - s.pt - s.insurance)}</div></div>
        </div>
        <p class="form-hint mb-0 mt-3">${e.documents ? e.documents.length : 0} document(s) on file.</p>`,
      okText: 'Close', showCancel: false,
    });
  } catch (e) { toast(e.message, 'error'); }
}

/* edit employee info */
async function editEmployee(id) {
  try {
    const e = await api.getEmployeeProfile(id);
    const field = (label, name, value, type = 'text') => `
      <div class="col-md-6"><label class="form-label">${label}</label>
        <input type="${type}" class="form-control" data-field="${name}" value="${esc(value)}"></div>`;
    openFormModal({
      title: `Edit employee — ${esc(e.name)}`,
      large: true,
      body: `<div class="row g-3">
        ${field('Full name', 'name', e.name)}
        ${field('Email', 'email', e.email, 'email')}
        ${field('Phone', 'phone', e.phone)}
        <div class="col-md-6"><label class="form-label">Department</label>
          <select class="form-select" data-field="department">${DEPARTMENTS.map(d => `<option ${e.department === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        ${field('Job position', 'position', e.position)}
        ${field('Joining date', 'joinDate', e.joinDate, 'date')}
        <div class="col-12"><label class="form-label">Address</label>
          <textarea class="form-control" rows="2" data-field="address">${esc(e.address)}</textarea></div>
      </div>
      <p class="form-hint mb-0 mt-2">Salary is edited separately from the <b>Payroll</b> page.</p>`,
      okText: 'Save changes',
      onOk: async (back) => {
        const v = {};
        back.querySelectorAll('[data-field]').forEach(el => v[el.dataset.field] = el.value.trim());
        if (v.name.length < 3) { toast('Name must be at least 3 characters.', 'error'); return true; }
        if (!/^\S+@\S+\.\S+$/.test(v.email)) { toast('Please enter a valid email.', 'error'); return true; }
        const btn = back.querySelector('[data-act="ok"]');
        btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Saving…';
        try {
          await api.updateEmployee(id, v); // --> PATCH /api/employees/<id>
          toast(`${v.name}'s record was updated.`, 'success', 'Saved');
          loadEmployees();
        } catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Save changes'; return true; }
      },
    });
  } catch (e) { toast(e.message, 'error'); }
}

/* HR adds a new employee (creates the record + login account via the API) */
function addEmployeeModal() {
  const field = (label, name, attrs = '', type = 'text') => `
    <div class="col-md-6"><label class="form-label">${label}</label>
      <input type="${type}" class="form-control" data-field="${name}" ${attrs}></div>`;
  openFormModal({
    title: 'Add employee',
    large: true,
    body: `<div class="row g-3">
      ${field('Employee ID *', 'employeeId', 'placeholder="E-1025" required')}
      ${field('Full name *', 'name', 'placeholder="Full name" minlength="3" required')}
      ${field('Email *', 'email', 'type="email" placeholder="name@company.com" required', 'email')}
      ${field('Initial password *', 'password', 'minlength="6" placeholder="Share with the employee" required')}
      <div class="col-md-6"><label class="form-label">Role *</label>
        <select class="form-select" data-field="role"><option value="employee">Employee</option><option value="hr">HR / Admin</option></select></div>
      <div class="col-md-6"><label class="form-label">Department</label>
        <select class="form-select" data-field="department">${DEPARTMENTS.map(d => `<option>${d}</option>`).join('')}</select></div>
      ${field('Job position', 'position', 'placeholder="Team Member"')}
      ${field('Joining date', 'joinDate', '', 'date')}
      ${field('Phone', 'phone', 'placeholder="Optional"')}
    </div>
    <p class="form-hint mb-0 mt-2">${icon('info', 12)} The employee can sign in immediately with this email + password and change their details from Profile.</p>`,
    okText: 'Create employee',
    onOk: async (back) => {
      const v = {};
      back.querySelectorAll('[data-field]').forEach(el => v[el.dataset.field] = el.value.trim());
      if (!/^[A-Za-z0-9-]{3,15}$/.test(v.employeeId)) { toast('Employee ID must be 3–15 letters/digits/hyphens.', 'error'); return true; }
      if (v.name.length < 3) { toast('Name must be at least 3 characters.', 'error'); return true; }
      if (!/^\S+@\S+\.\S+$/.test(v.email)) { toast('Please enter a valid email address.', 'error'); return true; }
      if (v.password.length < 6) { toast('Initial password must be at least 6 characters.', 'error'); return true; }
      const btn = back.querySelector('[data-act="ok"]');
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Creating…';
      try {
        await api.addEmployee({ // --> POST /api/employees (DB insert)
          employeeId: v.employeeId, name: v.name, email: v.email, password: v.password,
          role: v.role, department: v.department, position: v.position || 'Team Member',
          joinDate: v.joinDate || undefined, phone: v.phone || undefined,
        });
        toast(`${v.name} was added and can now sign in.`, 'success', 'Employee created');
        loadEmployees();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Create employee';
        return true; // keep modal open so HR can fix the fields
      }
    },
  });
}

/* HR deactivates / reactivates an account (blocks login at the backend) */
async function toggleEmployeeActive(employeeId, currentlyActive, row) {
  const name = row ? (row.name || row.employeeName) : employeeId;
  if (currentlyActive) {
    const ok = await confirmAction({
      title: `Deactivate ${name}'s account?`,
      body: '<p class="mb-0 text-muted-2">They will no longer be able to log in. Their records are kept and the account can be reactivated anytime.</p>',
      okText: 'Deactivate', okClass: 'btn-danger-soft',
    });
    if (!ok) return;
  }
  try {
    await api.setEmployeeActive(employeeId, !currentlyActive); // --> PATCH /api/employees/<id>/status
    toast(`${name}'s account was ${currentlyActive ? 'deactivated' : 'reactivated'}.`, 'success');
    loadEmployees();
  } catch (e) { toast(e.message, 'error'); }
}

/* boot */
document.addEventListener('DOMContentLoaded', () => {
  if (HR_PAGE.dashboard) initHrDashboard();
  if (HR_PAGE.employees) initHrEmployees();
});
