/* =========================================================
   AXIOM – leave.js  (leave.html)
   EMPLOYEE: apply + history | HR: approve / reject + comment.
   UI logic only — all data comes from the `api` object.
   ========================================================= */

let LEAVE_SESSION = null;
let HR_LEAVE_TAB = 'pending';

async function initLeavePage() {
  LEAVE_SESSION = requireAuth();
  if (!LEAVE_SESSION) return;
  initShell({ active: 'leave.html', title: LEAVE_SESSION.role === 'hr' ? 'Leave Approvals' : 'Leave', sub: 'Requests & balances' });

  if (LEAVE_SESSION.role === 'hr') {
    document.getElementById('leave-emp-root').style.display = 'none';
    document.getElementById('leave-hr-root').style.display = 'block';
    document.getElementById('leave-page-title').textContent = 'Leave Approvals';
    document.getElementById('leave-page-sub').textContent = 'Review and decide employee leave requests.';
    document.querySelectorAll('#leave-hr-tabs .tab-link').forEach(b => b.onclick = () => {
      HR_LEAVE_TAB = b.dataset.tab;
      document.querySelectorAll('#leave-hr-tabs .tab-link').forEach(x => x.classList.toggle('active', x === b));
      
      if (HR_LEAVE_TAB === 'calendar') {
        document.getElementById('leave-hr-list').style.display = 'none';
        document.getElementById('leave-hr-calendar').style.display = 'block';
        loadCalendar();
      } else {
        document.getElementById('leave-hr-list').style.display = 'block';
        document.getElementById('leave-hr-calendar').style.display = 'none';
        loadAllLeaveRequests();
      }
    });
    
    document.getElementById('leave-cal-prev').onclick = () => {
      CALENDAR_MONTH = new Date(CALENDAR_MONTH.getFullYear(), CALENDAR_MONTH.getMonth() - 1, 1);
      loadCalendar();
    };
    document.getElementById('leave-cal-next').onclick = () => {
      CALENDAR_MONTH = new Date(CALENDAR_MONTH.getFullYear(), CALENDAR_MONTH.getMonth() + 1, 1);
      loadCalendar();
    };

    loadAllLeaveRequests();
  } else {
    initEmployeeLeave();
  }
}

/* ================= EMPLOYEE ================= */
function initEmployeeLeave() {
  const today = toISODate(new Date());
  const from = document.getElementById('leave-from'), to = document.getElementById('leave-to');
  from.min = today; to.min = today;
  from.value = today;
  to.value = today;
  from.onchange = () => { to.min = from.value; if (to.value < from.value) to.value = from.value; updateDaysChip(); };
  to.onchange = updateDaysChip;
  document.getElementById('leave-type').onchange = () => { updateDaysChip(); loadBalances(); };
  document.getElementById('leave-form').onsubmit = e => { e.preventDefault(); applyLeave(); };
  updateDaysChip();
  loadBalances();
  loadLeaveRequests();
}

function workingDaysBetween(from, to) {
  if (!from || !to || to < from) return 0;
  let d = fromISODate(from), end = fromISODate(to), n = 0;
  while (d <= end) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); }
  return n;
}

function updateDaysChip() {
  const n = workingDaysBetween(document.getElementById('leave-from').value, document.getElementById('leave-to').value);
  document.getElementById('leave-days-chip').innerHTML = `${icon('calendar', 13)} <span class="chip-num">${n}</span> working day${n !== 1 ? 's' : ''}`;
}

let BALANCE_CACHE = null;
async function loadBalances() {
  const root = document.getElementById('leave-bal-root');
  try {
    BALANCE_CACHE = await api.getLeaveBalance(LEAVE_SESSION.employeeId); // --> GET /api/leaves/balance
    const card = (key, label, color) => `
      <div class="col-12 col-md-4">
        <div class="kv"><div class="kv-label">${label}</div>
          <div class="kv-value" style="font-size:1.25rem;color:${color}">${BALANCE_CACHE[key].available} <span style="font-size:.8rem;color:var(--df-muted)">/ ${BALANCE_CACHE[key].total} days left</span></div></div>
      </div>`;
    root.innerHTML = `<div class="row g-3">
      ${card('paid', 'Paid leave', 'var(--df-primary)')}
      ${card('sick', 'Sick leave', 'var(--df-red)')}
      ${card('unpaid', 'Unpaid leave', 'var(--df-muted)')}
    </div>
    <p class="form-hint mb-0 mt-3">${icon('info', 12)} Balance counts approved <b>and</b> pending requests. Sundays are automatically excluded.</p>`;
    const t = document.getElementById('leave-type').value;
    const hint = document.getElementById('leave-type-hint');
    if (BALANCE_CACHE[t]) hint.textContent = `${BALANCE_CACHE[t].available} day(s) available of ${BALANCE_CACHE[t].total}`;
  } catch (e) { root.innerHTML = `<div class="alert df-alert df-error mb-0">${esc(e.message)}</div>`; }
}

/**
 * applyLeave() — validates and submits a new leave request.
 * (mock now → POST /api/leaves later)
 */
async function applyLeave() {
  const errBox = document.getElementById('apply-error');
  const type = document.getElementById('leave-type').value;
  const from = document.getElementById('leave-from').value;
  const to = document.getElementById('leave-to').value;
  const remarks = document.getElementById('leave-remarks').value.trim();

  errBox.style.display = 'none';
  if (!from || !to) { errBox.style.display = 'block'; errBox.textContent = 'Please choose both start and end dates.'; return; }
  if (to < from) { errBox.style.display = 'block'; errBox.textContent = 'End date cannot be before the start date.'; return; }
  const days = workingDaysBetween(from, to);
  if (days < 1) { errBox.style.display = 'block'; errBox.textContent = 'The selected range contains no working days (Sundays are excluded).'; return; }

  const ok = await confirmAction({
    title: 'Submit leave request?',
    body: `<p class="mb-2 text-muted-2">You are applying for <b>${days} working day${days > 1 ? 's' : ''}</b>:</p>
           <div class="chip-row"><span class="chip">${typeBadge(type)}</span><span class="chip">${fmtDate(from)} → ${fmtDate(to)}</span></div>`,
    okText: 'Submit request',
  });
  if (!ok) return;

  const btn = document.getElementById('leave-submit');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Submitting…';
  try {
    await api.applyLeave({ employeeId: LEAVE_SESSION.employeeId, type, from, to, remarks }); // --> POST /api/leaves
    toast('Leave request submitted for HR approval.', 'success', 'Request sent');
    document.getElementById('leave-remarks').value = '';
    loadLeaveRequests();
    loadBalances();
  } catch (e) {
    errBox.style.display = 'block'; errBox.innerHTML = esc(e.message);
    toast(e.message, 'error');
  }
  btn.disabled = false; btn.innerHTML = 'Submit request';
}

/**
 * loadLeaveRequests() — employee's own history table.
 * (mock now → GET /api/leaves?employee_id=… later)
 */
async function loadLeaveRequests() {
  const wrap = document.getElementById('leave-hist-wrap');
  wrap.innerHTML = skeletons(3, 6);
  try {
    const leaves = await api.getLeaveRequests(LEAVE_SESSION.employeeId);
    if (!leaves.length) { wrap.innerHTML = emptyState('No leave requests yet', 'Applications you submit will be listed here with live status.'); return; }
    wrap.innerHTML = `<div class="table-responsive"><table class="table df-table">
      <thead><tr><th>Applied</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Remarks</th><th>Status</th><th>HR comment</th></tr></thead>
      <tbody>${leaves.map(l => `
        <tr>
          <td class="nowrap text-muted-2">${relTime(l.appliedAt)}</td>
          <td>${typeBadge(l.type)}</td>
          <td class="nowrap">${fmtDate(l.from)}</td>
          <td class="nowrap">${fmtDate(l.to)}</td>
          <td><b>${l.days}</b></td>
          <td class="text-muted-2" style="max-width:220px">${esc(l.remarks)}</td>
          <td>${statusBadge(l.status)}</td>
          <td class="text-muted-2" style="max-width:200px">${esc(l.hrComment || '—')}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  } catch (e) {
    wrap.innerHTML = `<div class="p-3"><div class="alert df-alert df-error mb-0">${esc(e.message)}</div></div>`;
  }
}

/* ================= HR ================= */
/**
 * loadAllLeaveRequests() — HR list (pending + all).
 * (mock now → GET /api/leaves/all?status=… later)
 */
async function loadAllLeaveRequests() {
  const list = document.getElementById('leave-hr-list');
  const chips = document.getElementById('leave-hr-chips');
  list.innerHTML = skeletons(2, 6);
  try {
    const all = await api.getAllLeaveRequests('all');
    const pending = all.filter(l => l.status === 'pending');
    chips.innerHTML = `
      <span class="chip" style="border-color:#fde68a">Pending <span class="chip-num">${pending.length}</span></span>
      <span class="chip" style="border-color:#bbf7d0">Approved <span class="chip-num">${all.filter(l => l.status === 'approved').length}</span></span>
      <span class="chip" style="border-color:#fecaca">Rejected <span class="chip-num">${all.filter(l => l.status === 'rejected').length}</span></span>`;
    const rows = HR_LEAVE_TAB === 'pending' ? pending : all;
    if (!rows.length) {
      list.innerHTML = emptyState(HR_LEAVE_TAB === 'pending' ? 'No pending requests 🎉' : 'No leave requests yet',
        HR_LEAVE_TAB === 'pending' ? 'All caught up — every request has been reviewed.' : undefined);
      return;
    }
    list.innerHTML = rows.map(l => `
      <div class="leave-req">
        <div class="lr-head">
          ${avatarHTML(l.employeeName)}
          <div class="flex-grow-1">
            <div class="cu-name" style="font-weight:700">${esc(l.employeeName)}
              <span class="text-muted-2" style="font-weight:500;font-size:.78rem">· ${esc(l.department)} · ${esc(l.position)}</span></div>
            <div class="cu-sub">${esc(l.id)} · applied ${esc(relTime(l.appliedAt))}</div>
          </div>
          ${typeBadge(l.type)}
          <span class="lr-days">${l.days} day${l.days > 1 ? 's' : ''}</span>
        </div>
        <div class="lr-meta">
          <span>${icon('calendar', 14)} <b>${fmtDate(l.from)}</b> → <b>${fmtDate(l.to)}</b></span>
          ${l.status !== 'pending' ? `<span>Decision: ${statusBadge(l.status)}</span>` : ''}
        </div>
        <div class="lr-remarks">“${esc(l.remarks)}”</div>
        ${l.hrComment ? `<div class="lr-remarks mt-2" style="background:var(--df-primary-soft)">Your comment: ${esc(l.hrComment)}</div>` : ''}
        ${l.status === 'pending' ? `
        <div class="lr-actions">
          <button class="btn btn-success-soft btn-sm" data-approve="${esc(l.id)}">${icon('check', 15)} Approve</button>
          <button class="btn btn-danger-soft btn-sm" data-reject="${esc(l.id)}">${icon('x', 15)} Reject</button>
          <button class="btn btn-ghost btn-sm" data-comment="${esc(l.id)}">${icon('mail', 15)} Ask / comment</button>
        </div>` : ''}
      </div>`).join('');
    list.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => decideLeave(b.dataset.approve, 'approved'));
    list.querySelectorAll('[data-reject]').forEach(b => b.onclick = () => decideLeave(b.dataset.reject, 'rejected'));
    list.querySelectorAll('[data-comment]').forEach(b => b.onclick = () => commentOnly(b.dataset.comment));
  } catch (e) {
    list.innerHTML = `<div class="p-3"><div class="alert df-alert df-error mb-0">${esc(e.message)}</div></div>`;
  }
}

/**
 * approveLeave() / rejectLeave() — HR decisions with confirmation + optional comment.
 * (mock now → PATCH /api/leaves/<id>/approved|rejected later)
 */
async function approveLeave(id, comment) { return decide(id, 'approved', comment); }
async function rejectLeave(id, comment) { return decide(id, 'rejected', comment); }

async function decideLeave(id, decision) {
  const wording = decision === 'approved'
    ? { title: 'Approve this leave?', ok: 'Approve', cls: 'btn-success-soft', msg: 'The employee\'s balance will be reduced and the calendar blocked.' }
    : { title: 'Reject this leave?', ok: 'Reject', cls: 'btn-danger-soft', msg: 'The employee will be notified with your comment.' };
  const res = await openModal({
    title: wording.title,
    body: `<p class="mb-0 text-muted-2">${wording.msg}</p>`,
    commentField: 'Comment to the employee (optional)',
    okText: wording.ok, okClass: wording.cls,
  });
  if (!res.confirmed) return;
  try {
    if (decision === 'approved') {
      await approveLeave(id, res.comment);
      if (typeof confetti !== 'undefined') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }
    else await rejectLeave(id, res.comment);
    toast(`Request ${id} ${decision}.`, 'success', 'Decision saved');
    loadAllLeaveRequests();
  } catch (e) { toast(e.message, 'error'); }
}

async function decide(id, decision, comment) {
  await api.decideLeave(id, decision, comment); // --> PATCH /api/leaves/<id>/<decision>
}

/* comment without deciding yet */
async function commentOnly(id) {
  const res = await openModal({
    title: 'Add a comment',
    body: '<p class="mb-0 text-muted-2">In the integrated version this sends a notification to the employee via the API.</p>',
    commentField: 'Your comment',
    okText: 'Send comment', okClass: 'btn-axiom',
  });
  if (!res.confirmed) return;
  toast('Comment queued — will be delivered by the notifications API.', 'info', 'Demo note');
}

let CALENDAR_MONTH = null;

async function loadCalendar() {
  if (!CALENDAR_MONTH) {
    const d = new Date();
    CALENDAR_MONTH = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  
  const grid = document.getElementById('leave-cal-grid');
  const title = document.getElementById('leave-cal-month-title');
  title.textContent = CALENDAR_MONTH.toLocaleString('default', { month: 'long', year: 'numeric' });
  
  try {
    const allLeaves = await api.getAllLeaveRequests('approved');
    
    // Create grid headers
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = days.map(d => `<div style="text-align:center; font-weight:700; font-size:0.8rem; color:var(--df-muted-2); padding-bottom:8px">${d}</div>`).join('');
    
    const year = CALENDAR_MONTH.getFullYear();
    const month = CALENDAR_MONTH.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Empty slots
    for (let i = 0; i < firstDay; i++) {
      html += `<div style="background:#f8fafc; border-radius:6px; min-height:80px; border:1px solid #f0f1f5"></div>`;
    }
    
    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      // pad month/day to match from/to format (YYYY-MM-DD)
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const currentDate = `${year}-${mStr}-${dStr}`;
      
      // Find leaves overlapping this date
      const activeLeaves = allLeaves.filter(l => l.from <= currentDate && l.to >= currentDate);
      
      let leavesHtml = activeLeaves.map(l => {
        const isStart = l.from === currentDate;
        const color = l.type === 'paid' ? 'var(--df-primary)' : (l.type === 'sick' ? 'var(--df-red)' : 'var(--df-muted-2)');
        const bg = l.type === 'paid' ? 'var(--df-primary-soft)' : (l.type === 'sick' ? '#fee2e2' : '#f1f5f9');
        return `<div style="background:${bg}; color:${color}; font-size:0.7rem; font-weight:600; padding:2px 6px; border-radius:4px; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${l.employeeName} - ${l.type}">
          ${isStart ? icon('corner-down-right', 10) : ''} ${esc(l.employeeName.split(' ')[0])}
        </div>`;
      }).join('');
      
      html += `<div style="background:#fff; border-radius:6px; min-height:80px; border:1px solid #e2e8f0; padding:6px; display:flex; flex-direction:column;">
        <span style="font-weight:600; font-size:0.85rem; margin-bottom:4px; color:#475569">${d}</span>
        <div style="flex-grow:1; display:flex; flex-direction:column; gap:2px;">${leavesHtml}</div>
      </div>`;
    }
    
    grid.innerHTML = html;
  } catch (e) {
    grid.innerHTML = `<div style="grid-column:1/-1" class="alert df-alert df-error mb-0">${esc(e.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', initLeavePage);
