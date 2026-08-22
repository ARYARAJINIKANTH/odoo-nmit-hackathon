/* =========================================================
   DAYFLOW – attendance.js  (attendance.html)
   Renders EMPLOYEE view or HR view based on the session role.
   UI logic only — all data comes from the `api` object.
   ========================================================= */

let ATT_SESSION = null;
let ATT_TAB = 'today';

async function initAttendancePage() {
  ATT_SESSION = requireAuth();
  if (!ATT_SESSION) return;
  initShell({ active: 'attendance.html', title: 'Attendance', sub: 'Daily presence & history' });

  if (ATT_SESSION.role === 'hr') {
    document.getElementById('att-page-sub').textContent = 'Attendance of all employees.';
    document.getElementById('att-today-card').style.display = 'none';
    document.getElementById('att-hr-root').style.display = 'block';
    initHrAttendance();
  } else {
    loadTodayHero(ATT_SESSION.employeeId);
    // tabs
    const tabs = document.getElementById('att-tabs');
    tabs.style.display = 'inline-flex';
    tabs.querySelectorAll('.tab-link').forEach(b => b.onclick = () => {
      ATT_TAB = b.dataset.tab;
      tabs.querySelectorAll('.tab-link').forEach(x => x.classList.toggle('active', x === b));
      showTab();
    });
    tabs.querySelector('[data-tab="today"]').classList.add('active');
    document.getElementById('att-month').value = toISODate(new Date()).slice(0, 7);
    document.getElementById('att-month').onchange = () => loadHistory(ATT_SESSION.employeeId);
    showTab();
  }
}

function showTab() {
  document.getElementById('att-today-card').style.display = ATT_TAB === 'today' ? 'block' : 'none';
  document.getElementById('att-week-card').style.display = ATT_TAB === 'week' ? 'block' : 'none';
  document.getElementById('att-history-card').style.display = ATT_TAB === 'history' ? 'block' : 'none';
  if (ATT_TAB === 'week') loadWeek(ATT_SESSION.employeeId);
  if (ATT_TAB === 'history') loadHistory(ATT_SESSION.employeeId);
}

/* ============ EMPLOYEE VIEW ============ */

/* today + check-in / check-out buttons (dashboard has its own copy of this UI) */
async function loadTodayHero(employeeId) {
  const body = document.getElementById('att-today-body');
  try {
    const rec = await api.getTodayAttendance(employeeId); // --> GET /api/attendance/today
    if (rec.status === 'weekoff') {
      body.innerHTML = `<div class="w-100">${statusBadge('weekoff')}
        <h3 class="mt-3 mb-1">Today is a weekly off</h3>
        <p class="text-muted-2 mb-0">No attendance is recorded on Sundays. See you Monday!</p></div>`;
      return;
    }
    body.innerHTML = `
      <div class="th-main">
        <div class="d-flex align-items-center gap-2 mb-2" id="att-hero-status">${statusBadge(rec.status)}</div>
        <h3 class="mb-0">${fmtDateLong(rec.date)}</h3>
        <div class="th-times">
          <div class="th-time"><div class="tt-label">Checked in</div><div class="tt-value" id="att-in">${fmtTime(rec.checkIn)}</div></div>
          <div class="th-time"><div class="tt-label">Checked out</div><div class="tt-value" id="att-out">${fmtTime(rec.checkOut)}</div></div>
          <div class="th-time"><div class="tt-label">Worked</div><div class="tt-value" id="att-worked">${workedHours(rec.checkIn, rec.checkOut) || '—'}</div></div>
        </div>
      </div>
      <div class="th-actions">
        <button class="btn btn-dayflow btn-checkin" id="att-btn-in" ${rec.checkIn ? 'disabled' : ''}>${icon('clockIn', 18)} Check in</button>
        <button class="btn btn-outline-dayflow btn-checkin" id="att-btn-out" ${!rec.checkIn || rec.checkOut ? 'disabled' : ''}>${icon('clockOut', 18)} Check out</button>
      </div>`;
    document.getElementById('att-btn-in').onclick = () => doCheckIn(employeeId);
    document.getElementById('att-btn-out').onclick = () => doCheckOut(employeeId);
  } catch (e) {
    body.innerHTML = `<div class="alert df-alert df-error mb-0 w-100">${esc(e.message)}</div>`;
  }
}

async function doCheckIn(employeeId) {
  const btn = document.getElementById('att-btn-in');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Checking in…';
  try {
    const rec = await api.checkIn(employeeId); // --> POST /api/attendance/check-in
    toast(`Checked in at ${rec.checkIn}.`, 'success', 'Checked in');
    loadTodayHero(employeeId);
  } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.innerHTML = `${icon('clockIn', 18)} Check in`; }
}

async function doCheckOut(employeeId) {
  if (!await confirmAction({ title: 'Check out for today?', body: '<p class="mb-0 text-muted-2">Your check-out time will be recorded. Under 4 worked hours counts as a half day.</p>', okText: 'Check out' })) return;
  const btn = document.getElementById('att-btn-out');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Checking out…';
  try {
    const rec = await api.checkOut(employeeId); // --> POST /api/attendance/check-out
    toast(`Checked out at ${rec.checkOut}.`, 'success', 'Checked out');
    loadTodayHero(employeeId);
  } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.innerHTML = `${icon('clockOut', 18)} Check out`; }
}

/* current week (Mon–Sun) */
function weekStart(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

async function loadWeek(employeeId) {
  const body = document.getElementById('att-week-body');
  const chips = document.getElementById('att-week-chips');
  body.innerHTML = skeletons(3, 5);
  try {
    const mon = toISODate(weekStart(new Date()));
    const rows = await api.getAttendance(employeeId, mon, toISODate(new Date())); // --> GET /api/attendance
    const byDate = Object.fromEntries(rows.map(r => [r.date, r]));
    const counts = { present: 0, absent: 0, 'half-day': 0, leave: 0 };
    let html = `<table class="table df-table"><thead><tr><th>Day</th><th>Date</th><th>Check in</th><th>Check out</th><th>Worked</th><th>Status</th></tr></thead><tbody>`;
    for (let i = 0; i < 7; i++) {
      const d = new Date(fromISODate(mon)); d.setDate(d.getDate() + i);
      const iso = toISODate(d);
      const r = byDate[iso];
      const isSunday = d.getDay() === 0;
      const status = r ? r.status : (isSunday ? 'weekoff' : 'not-marked');
      if (counts[status] !== undefined) counts[status]++;
      html += `<tr>
        <td><b>${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]}</b>${iso === toISODate(new Date()) ? ' <span class="edit-tag can">TODAY</span>' : ''}</td>
        <td class="text-muted-2">${fmtDate(iso)}</td>
        <td>${fmtTime(r ? r.checkIn : null)}</td>
        <td>${fmtTime(r ? r.checkOut : null)}</td>
        <td>${(r && workedHours(r.checkIn, r.checkOut)) || '—'}</td>
        <td>${statusBadge(status)}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    body.innerHTML = `<div class="table-responsive">${html}</div>`;
    chips.innerHTML = `<span class="chip"><span class="dot" style="width:8px;height:8px;border-radius:50%;background:var(--df-green)"></span> Present <span class="chip-num">${counts.present}</span></span>
      <span class="chip">Absent <span class="chip-num">${counts.absent}</span></span>
      <span class="chip">Half-day <span class="chip-num">${counts['half-day']}</span></span>
      <span class="chip">Leave <span class="chip-num">${counts.leave}</span></span>`;
  } catch (e) {
    body.innerHTML = `<div class="p-3"><div class="alert df-alert df-error mb-0">${esc(e.message)}</div></div>`;
  }
}

/* monthly history */
async function loadHistory(employeeId) {
  const body = document.getElementById('att-history-body');
  const summary = document.getElementById('att-hist-summary');
  const month = document.getElementById('att-month').value || toISODate(new Date()).slice(0, 7);
  body.innerHTML = skeletons(4, 5);
  try {
    const [y, m] = month.split('-').map(Number);
    const from = toISODate(new Date(y, m - 1, 1));
    const to = toISODate(new Date(Math.min(new Date(y, m, 0), new Date())));
    const rows = (await api.getAttendance(employeeId, from, to)).filter(r => r.status !== 'weekoff');
    const counts = { present: 0, absent: 0, 'half-day': 0, leave: 0 };
    rows.forEach(r => counts[r.status] !== undefined && counts[r.status]++);
    summary.innerHTML = `<div class="chip-row py-2">
      <span class="chip" style="border-color:#bbf7d0">Present <span class="chip-num">${counts.present}</span></span>
      <span class="chip" style="border-color:#fecaca">Absent <span class="chip-num">${counts.absent}</span></span>
      <span class="chip" style="border-color:#fde68a">Half-day <span class="chip-num">${counts['half-day']}</span></span>
      <span class="chip" style="border-color:#ddd6fe">Leave <span class="chip-num">${counts.leave}</span></span>
    </div>`;
    if (!rows.length) { body.innerHTML = emptyState('No records this month', 'Attendance will appear here once recorded.'); return; }
    body.innerHTML = `<div class="table-responsive"><table class="table df-table">
      <thead><tr><th>Date</th><th>Day</th><th>Check in</th><th>Check out</th><th>Worked</th><th>Status</th></tr></thead>
      <tbody>${rows.map(r => { const d = fromISODate(r.date); return `
        <tr>
          <td><b>${fmtDate(r.date)}</b></td>
          <td class="text-muted-2">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}</td>
          <td>${fmtTime(r.checkIn)}</td>
          <td>${fmtTime(r.checkOut)}</td>
          <td>${workedHours(r.checkIn, r.checkOut) || '—'}</td>
          <td>${statusBadge(r.status)}</td>
        </tr>`; }).join('')}
      </tbody></table></div>`;
  } catch (e) {
    body.innerHTML = `<div class="p-3"><div class="alert df-alert df-error mb-0">${esc(e.message)}</div></div>`;
  }
}

/* ============ HR VIEW ============ */
let HR_ATT_VIEW = 'daily';
let HR_WEEK_MONDAY = null;

function initHrAttendance() {
  HR_WEEK_MONDAY = toISODate(weekStart(new Date()));
  document.getElementById('hr-att-date').value = toISODate(new Date());
  ['Engineering', 'People Ops', 'Sales', 'Finance', 'General'].forEach(d => {
    const o = document.createElement('option'); o.value = d; o.textContent = d;
    document.getElementById('hr-att-dept').appendChild(o);
  });
  document.querySelectorAll('#att-hr-root .tab-link').forEach(b => b.onclick = () => {
    HR_ATT_VIEW = b.dataset.view;
    document.querySelectorAll('#att-hr-root .tab-link').forEach(x => x.classList.toggle('active', x === b));
    document.getElementById('hr-daily-filters').style.display = HR_ATT_VIEW === 'daily' ? 'flex' : 'none';
    document.getElementById('hr-week-nav').style.display = HR_ATT_VIEW === 'weekly' ? 'flex' : 'none';
    renderHrAttendance();
  });
  ['hr-att-date', 'hr-att-dept', 'hr-att-status'].forEach(id => document.getElementById(id).onchange = () => { if (HR_ATT_VIEW === 'daily') renderHrAttendance(); });
  document.getElementById('hr-week-prev').onclick = () => { HR_WEEK_MONDAY = toISODate(addDaysISO(HR_WEEK_MONDAY, -7)); renderHrAttendance(); };
  document.getElementById('hr-week-next').onclick = () => { HR_WEEK_MONDAY = toISODate(addDaysISO(HR_WEEK_MONDAY, 7)); renderHrAttendance(); };
  renderHrAttendance();
}

function addDaysISO(iso, n) { const d = fromISODate(iso); d.setDate(d.getDate() + n); return toISODate(d); }

/**
 * loadAttendance() — HR: everyone's attendance for the chosen date / week.
 * (mock now → GET /api/attendance/all?date=… later)
 */
async function renderHrAttendance() {
  const body = document.getElementById('hr-att-body');
  const chipsEl = document.getElementById('hr-att-chips');
  body.innerHTML = skeletons(4, 6);
  try {
    if (HR_ATT_VIEW === 'daily') {
      const date = document.getElementById('hr-att-date').value || toISODate(new Date());
      const dept = document.getElementById('hr-att-dept').value;
      const status = document.getElementById('hr-att-status').value;
      const { rows, counts } = await api.getAllAttendance(date, { department: dept, status }); // --> GET /api/attendance/all
      chipsEl.innerHTML = `
        <span class="chip" style="border-color:#bbf7d0">Present <span class="chip-num">${counts.present}</span></span>
        <span class="chip" style="border-color:#fecaca">Absent <span class="chip-num">${counts.absent}</span></span>
        <span class="chip" style="border-color:#fde68a">Half-day <span class="chip-num">${counts['half-day']}</span></span>
        <span class="chip" style="border-color:#ddd6fe">On leave <span class="chip-num">${counts.leave}</span></span>
        <span class="chip">Not marked <span class="chip-num">${counts['not-marked']}</span></span>`;
      if (!rows.length) { body.innerHTML = emptyState('No records', 'No employees match these filters for ' + fmtDate(date) + '.'); return; }
      body.innerHTML = `<div class="table-responsive"><table class="table df-table">
        <thead><tr><th>Employee</th><th>Department</th><th>Check in</th><th>Check out</th><th>Worked</th><th>Status</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td><div class="cell-user">${avatarHTML(r.employee.name, r.employee.photo)}<div><div class="cu-name">${esc(r.employee.name)}</div><div class="cu-sub">${esc(r.employee.id)}</div></div></div></td>
            <td class="text-muted-2">${esc(r.employee.department)}</td>
            <td>${fmtTime(r.checkIn)}</td>
            <td>${fmtTime(r.checkOut)}</td>
            <td>${workedHours(r.checkIn, r.checkOut) || '—'}</td>
            <td>${statusBadge(r.status)}</td>
          </tr>`).join('')}
        </tbody></table></div>`;
    } else {
      const { days, rows } = await api.getWeekAttendance(HR_WEEK_MONDAY); // --> GET /api/attendance/all/week
      document.getElementById('hr-week-label').textContent = `${fmtDate(days[0])} – ${fmtDate(days[6])}`;
      body.innerHTML = `<div class="table-responsive"><table class="table df-table">
        <thead><tr><th style="min-width:190px">Employee</th>${days.map(d => `<th style="text-align:center">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][fromISODate(d).getDay() - 1 < 0 ? 6 : fromISODate(d).getDay() - 1]}<div class="text-muted-2" style="font-size:.64rem;font-weight:600">${d.slice(8)}/${d.slice(5, 7)}</div></th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td><div class="cell-user">${avatarHTML(r.employee.name, r.employee.photo)}<div><div class="cu-name">${esc(r.employee.name)}</div><div class="cu-sub">${esc(r.employee.department)}</div></div></div></td>
            ${r.days.map(dd => `<td style="text-align:center"><span class="mini-cell mc-${dd.status}" title="${dd.status}">${dd.status === 'present' ? 'P' : dd.status === 'absent' ? 'A' : dd.status === 'half-day' ? 'H' : dd.status === 'leave' ? 'L' : dd.status === 'weekoff' ? 'W' : '–'}</span></td>`).join('')}
          </tr>`).join('')}
        </tbody></table></div>
        <div class="p-3 d-flex gap-3 flex-wrap small-2 text-muted-2">
          <span><span class="mini-cell mc-present">P</span> Present</span>
          <span><span class="mini-cell mc-absent">A</span> Absent</span>
          <span><span class="mini-cell mc-half-day">H</span> Half-day</span>
          <span><span class="mini-cell mc-leave">L</span> Leave</span>
          <span><span class="mini-cell mc-weekoff">W</span> Week off</span>
        </div>`;
      chipsEl.innerHTML = `<span class="chip">Week of ${fmtDate(days[0])}</span>`;
    }
  } catch (e) {
    body.innerHTML = `<div class="p-3"><div class="alert df-alert df-error mb-0">${esc(e.message)}</div></div>`;
  }
}

document.addEventListener('DOMContentLoaded', initAttendancePage);
