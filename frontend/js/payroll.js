/* =========================================================
   DAYFLOW – payroll.js  (payroll.html)
   EMPLOYEE: read-only structure + payslips | HR: manage all.
   UI logic only — all data comes from the `api` object.
   ========================================================= */

let PAY_SESSION = null;

async function initPayrollPage() {
  PAY_SESSION = requireAuth();
  if (!PAY_SESSION) return;
  initShell({ active: 'payroll.html', title: 'Payroll', sub: 'Salary & payslips' });

  if (PAY_SESSION.role === 'hr') {
    document.getElementById('pay-emp-root').style.display = 'none';
    document.getElementById('pay-hr-root').style.display = 'block';
    document.getElementById('pay-page-title').textContent = 'Payroll Management';
    document.getElementById('pay-page-sub').textContent = 'Salary structures for all employees.';
    loadAllPayroll();
  } else {
    loadPayroll();
  }
}

/* ================= EMPLOYEE (READ-ONLY) ================= */
/**
 * loadPayroll() — employee's own structure + payslip list.
 * (mock now → GET /api/payroll?employee_id=… later)
 */
async function loadPayroll() {
  ['ps-ic-basic', 'ps-ic-allow', 'ps-ic-ded', 'ps-ic-net'].forEach(id => {
    const map = { 'ps-ic-basic': 'money', 'ps-ic-allow': 'trending', 'ps-ic-ded': 'wallet', 'ps-ic-net': 'check' };
    document.getElementById(id).innerHTML = icon(map[id], 22);
  });
  try {
    const p = await api.getPayroll(PAY_SESSION.employeeId);
    const s = p.structure;
    PAY_SLIP_CACHE_STRUCT = s;
    document.getElementById('ps-basic').textContent = fmtMoney(s.basic);
    document.getElementById('ps-allow').textContent = '+ ' + fmtMoney(s.hra + s.transport + s.special);
    document.getElementById('ps-ded').textContent = '− ' + fmtMoney(s.pf + s.pt + s.insurance);
    document.getElementById('ps-net').textContent = fmtMoney(p.net);

    const row = (label, val, color) => `<div class="d-flex justify-content-between py-2" style="border-bottom:1px solid #f0f1f5"><span class="text-muted-2">${label}</span><b style="color:${color || 'inherit'}">${fmtMoney(val)}</b></div>`;
    document.getElementById('pay-earn-body').innerHTML = `
      ${row('Basic salary', s.basic)}
      ${row('HRA', s.hra)}
      ${row('Transport allowance', s.transport)}
      ${row('Special allowance', s.special)}
      ${row('Gross earnings', p.monthlyGross, 'var(--df-green)')}`;
    document.getElementById('pay-ded-body').innerHTML = `
      ${row('Provident fund (PF)', s.pf)}
      ${row('Professional tax', s.pt)}
      ${row('Health insurance', s.insurance)}
      ${row('Total deductions', s.pf + s.pt + s.insurance, 'var(--df-red)')}
      ${row('Net payout', p.net, 'var(--df-primary)')}`;

    const wrap = document.getElementById('pay-slips-wrap');
    wrap.innerHTML = `<div class="table-responsive"><table class="table df-table">
      <thead><tr><th>Month</th><th>Basic</th><th>Allowances</th><th>Deductions</th><th>Net pay</th><th>Status</th><th>Paid on</th><th></th></tr></thead>
      <tbody>${p.payslips.map(ps => `
        <tr>
          <td><b>${monthLabel(ps.month)}</b></td>
          <td>${fmtMoney(ps.basic)}</td>
          <td style="color:var(--df-green)">+ ${fmtMoney(ps.allowances)}</td>
          <td style="color:var(--df-red)">− ${fmtMoney(ps.deductions)}</td>
          <td><b>${fmtMoney(ps.net)}</b></td>
          <td>${statusBadge(ps.status)}</td>
          <td class="text-muted-2">${ps.paidOn ? fmtDate(ps.paidOn) : '—'}</td>
          <td><button class="btn btn-soft btn-sm" data-slip="${esc(ps.id)}">${icon('eye', 14)} View</button></td>
        </tr>`).join('')}
      </tbody></table></div>`;
    wrap.querySelectorAll('[data-slip]').forEach(b => b.onclick = () => viewPayslip(p.payslips.find(x => x.id === b.dataset.slip)));
  } catch (e) {
    document.getElementById('pay-struct-row').innerHTML = `<div class="col-12"><div class="alert df-alert df-error mb-0">${esc(e.message)}</div></div>`;
  }
}

function viewPayslip(ps) {
  const s = PAY_SLIP_CACHE_STRUCT;
  openModal({
    title: `Payslip — ${monthLabel(ps.month)}`,
    body: `
      <div class="payslip">
        <div class="ps-head">
          <img src="assets/logo.svg" width="34" height="34" alt="">
          <h4 class="mt-2 mb-0">Dayflow Technologies Pvt. Ltd.</h4>
          <div class="text-muted-2 small-2">Payslip for ${monthLabel(ps.month)} · ${esc(PAY_SESSION.name)} (${esc(PAY_SESSION.employeeId)})</div>
        </div>
        <div class="row g-4">
          <div class="col-6"><b>Earnings</b>
            <table>
              <tr><td>Basic</td><td class="text-end">${fmtMoney(s.basic)}</td></tr>
              <tr><td>HRA</td><td class="text-end">${fmtMoney(s.hra)}</td></tr>
              <tr><td>Transport</td><td class="text-end">${fmtMoney(s.transport)}</td></tr>
              <tr><td>Special</td><td class="text-end">${fmtMoney(s.special)}</td></tr>
              <tr><td class="fw-7"><b>Gross</b></td><td class="text-end fw-7">${fmtMoney(ps.allowances + s.basic)}</td></tr>
            </table>
          </div>
          <div class="col-6"><b>Deductions</b>
            <table>
              <tr><td>PF</td><td class="text-end">${fmtMoney(s.pf)}</td></tr>
              <tr><td>Professional tax</td><td class="text-end">${fmtMoney(s.pt)}</td></tr>
              <tr><td>Insurance</td><td class="text-end">${fmtMoney(s.insurance)}</td></tr>
              <tr><td class="fw-7"><b>Total</b></td><td class="text-end fw-7">${fmtMoney(ps.deductions)}</td></tr>
            </table>
          </div>
        </div>
        <div class="d-flex justify-content-between ps-net"><span>NET PAY</span><span>${fmtMoney(ps.net)}</span></div>
        <p class="form-hint mt-3 mb-0">${icon('info', 12)} This is a system-generated preview. PDF export will be provided by the API.</p>
      </div>`,
    okText: 'Close', showCancel: false, large: true,
  });
}
let PAY_SLIP_CACHE_STRUCT = null; // set in loadPayroll

/* ================= HR VIEW ================= */
/**
 * loadAllPayroll() — HR: salary table for every employee.
 * (mock now → GET /api/payroll/all later)
 */
async function loadAllPayroll() {
  ['hr-ic-gross', 'hr-ic-ded', 'hr-ic-net'].forEach(id => {
    const map = { 'hr-ic-gross': 'money', 'hr-ic-ded': 'wallet', 'hr-ic-net': 'check' };
    document.getElementById(id).innerHTML = icon(map[id], 22);
  });
  const wrap = document.getElementById('hr-pay-wrap');
  wrap.innerHTML = skeletons(4, 7);
  try {
    const rows = await api.getAllPayroll(); // --> GET /api/payroll/all
    document.getElementById('hr-gross').textContent = fmtMoney(rows.reduce((s, r) => s + r.gross, 0));
    document.getElementById('hr-ded').textContent = fmtMoney(rows.reduce((s, r) => s + r.deductions, 0));
    document.getElementById('hr-net').textContent = fmtMoney(rows.reduce((s, r) => s + r.net, 0));
    document.getElementById('hr-pay-month').textContent = monthLabel(toISODate(new Date()).slice(0, 7));

    wrap.innerHTML = `<div class="table-responsive"><table class="table df-table">
      <thead><tr><th>Employee</th><th>Basic</th><th>HRA</th><th>Transport</th><th>Special</th><th>PF</th><th>PT</th><th>Insurance</th><th>Net / month</th><th></th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td><div class="cell-user">${avatarHTML(r.name, r.photo)}<div><div class="cu-name">${esc(r.name)}</div><div class="cu-sub">${esc(r.department)} · ${esc(r.position)}</div></div></div></td>
          <td>${fmtMoney(r.salary.basic)}</td>
          <td class="text-muted-2">${fmtMoney(r.salary.hra)}</td>
          <td class="text-muted-2">${fmtMoney(r.salary.transport)}</td>
          <td class="text-muted-2">${fmtMoney(r.salary.special)}</td>
          <td class="text-muted-2">${fmtMoney(r.salary.pf)}</td>
          <td class="text-muted-2">${fmtMoney(r.salary.pt)}</td>
          <td class="text-muted-2">${fmtMoney(r.salary.insurance)}</td>
          <td><b style="color:var(--df-teal)">${fmtMoney(r.net)}</b></td>
          <td><button class="btn btn-soft btn-sm" data-salary="${esc(r.employeeId)}">${icon('edit', 14)} Edit</button></td>
        </tr>`).join('')}
      </tbody></table></div>`;
    wrap.querySelectorAll('[data-salary]').forEach(b => b.onclick = () => editSalary(b.dataset.salary, rows.find(r => r.employeeId === b.dataset.salary)));
  } catch (e) {
    wrap.innerHTML = `<div class="p-3"><div class="alert df-alert df-error mb-0">${esc(e.message)}</div></div>`;
  }
}

/* HR edits a salary structure with live net preview + confirmation */
async function editSalary(employeeId, row) {
  const s = row.salary;
  const numField = (label, name, value) => `
    <div class="col-md-4"><label class="form-label small-2">${label}</label>
      <input type="number" min="0" step="500" class="form-control" data-field="${name}" data-num value="${value}"></div>`;
  openFormModal({
    title: `Edit salary — ${esc(row.name)}`,
    large: true,
    body: `<div class="row g-3">
        <div class="col-12"><span class="edit-tag lock" style="background:var(--df-amber-soft);color:#b45309">CHANGES AFFECT THE CURRENT PAYROLL CYCLE</span></div>
        <div class="col-12"><b class="small-2">Earnings</b></div>
        ${numField('Basic salary', 'basic', s.basic)}
        ${numField('HRA', 'hra', s.hra)}
        ${numField('Transport allowance', 'transport', s.transport)}
        ${numField('Special allowance', 'special', s.special)}
        <div class="col-12"><b class="small-2">Deductions</b></div>
        ${numField('Provident fund (PF)', 'pf', s.pf)}
        ${numField('Professional tax', 'pt', s.pt)}
        ${numField('Insurance', 'insurance', s.insurance)}
      </div>
      <div class="mt-3 p-3" style="background:var(--df-primary-soft);border-radius:10px">
        <div class="d-flex justify-content-between"><b>New net salary / month</b><b id="salary-net-preview" style="font-size:1.15rem;color:var(--df-primary)">${fmtMoney(row.net)}</b></div>
      </div>`,
    okText: 'Save salary structure',
    onOk: async (back) => {
      const vals = {};
      back.querySelectorAll('[data-field]').forEach(el => vals[el.dataset.field] = el.value);
      const nums = {}; let bad = false;
      for (const [k, v] of Object.entries(vals)) { const n = Number(v); if (!Number.isFinite(n) || n < 0) bad = true; nums[k] = n; }
      if (bad) { toast('All fields must be positive numbers.', 'error'); return true; }
      if (nums.basic <= 0) { toast('Basic salary must be greater than zero.', 'error'); return true; }
      const newNet = nums.basic + nums.hra + nums.transport + nums.special - nums.pf - nums.pt - nums.insurance;
      const okGo = await confirmAction({
        title: 'Save this salary structure?',
        body: `<p class="mb-2 text-muted-2">New net salary for <b>${esc(row.name)}</b>:</p><h4 style="color:var(--df-primary)">${fmtMoney(newNet)}</h4><p class="mb-0 text-muted-2 small-2">Previous net: ${fmtMoney(row.net)}</p>`,
        okText: 'Yes, save', okClass: 'btn-dayflow',
      });
      if (!okGo) return true;
      try {
        await api.updateSalary(employeeId, nums); // --> PATCH /api/payroll/<id>
        toast(`${row.name}'s salary structure was updated.`, 'success', 'Saved');
        loadAllPayroll();
      } catch (e) { toast(e.message, 'error'); }
    },
  }).querySelector('.df-modal').addEventListener('input', ev => {
    if (ev.target.matches('[data-num]')) {
      const g = k => Number(back2(ev.target).querySelector(`[data-field="${k}"]`).value) || 0;
      const net = g('basic') + g('hra') + g('transport') + g('special') - g('pf') - g('pt') - g('insurance');
      document.getElementById('salary-net-preview').textContent = fmtMoney(net);
    }
  });
}
function back2(el) { return el.closest('.df-modal'); }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('hr-run-payroll')?.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Run payroll for this month?',
      body: '<p class="mb-0 text-muted-2">In the integrated version this calls <b>POST /api/payroll/run</b>, generates payslips and starts the payment batch.</p>',
      okText: 'Understood (demo)', okClass: 'btn-teal',
    });
    if (ok) toast('Payroll run will be executed by the backend API.', 'info', 'Demo note');
  });
  initPayrollPage();
});
