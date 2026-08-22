/* =========================================================
   DAYFLOW – api.js  (THE ONLY file that touches data)
   ---------------------------------------------------------
   Every page script calls functions on this `api` object.
   NORMAL MODE = REAL API → Flask REST → SQLite database.

   DATA MODE SWITCH (single place, no page edits):
     • API_CONFIG.useMock  → false by default (USE_MOCK_DATA=false)
     • Explicit opt-in for offline development ONLY:
         - add ?mock to any page URL, or
         - localStorage.dayflow_use_mock = '1'
       (and ?api / '0' force real-API mode)

   There is NO silent fallback: if the backend is unreachable the
   UI shows "Unable to connect to server. Please try again." —
   it never fabricates employee/attendance/leave/payroll data.
   ========================================================= */

const API_CONFIG = {
  baseUrl: 'http://localhost:5000',      // Flask server (paths below already include /api/…)
  useMock: false,                        // USE_MOCK_DATA — default false (real backend)
};

function resolveUseMock() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('mock')) return true;
    if (params.has('api')) return false;
    const stored = Storage.get('dayflow_use_mock');
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch (e) { /* ignore */ }
  return API_CONFIG.useMock;
}
const USE_MOCK_DATA = resolveUseMock();

/* ---------- session token (sent as Bearer on every request) ---------- */
function getSessionToken() { try { return (JSON.parse(Storage.get('dayflow_session') || 'null') || {}).token; } catch (e) { return null; } }

/* status-code → user-facing message (used when the server sends no message) */
function apiErrorText(status) {
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'Requested record was not found.';
  if (status === 409) return 'The request conflicts with existing data.';
  if (status >= 500) return 'Something went wrong on the server.';
  return `Request failed (${status}).`;
}

/**
 * Real request helper.
 * - success → the parsed JSON body as-is (the frontend consumes fields directly)
 * - API error → throws Error(server message if present, else mapped status text)
 * - network error → throws Error('Unable to connect to server. Please try again.')
 *   (NEVER falls back to mock data)
 */
async function request(method, path, body) {
  let res;
  try {
    res = await fetch(API_CONFIG.baseUrl + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(getSessionToken() ? { Authorization: 'Bearer ' + getSessionToken() } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    throw new Error('Unable to connect to server. Please try again.');
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    // expired/invalid session (except bad credentials on login itself)
    if (res.status === 401 && !path.includes('/api/auth/')) {
      clearSession();
      location.replace('login.html?expired=1');
    }
    throw new Error(data.message || apiErrorText(res.status));
  }
  return data;
}

/* =========================================================================
   MOCK DATA SECTION — OFFLINE DEV TOOL, never used in normal operation.
   Only active when explicitly enabled (?mock URL param or
   localStorage.dayflow_use_mock = '1'). The real backend is the default.
   ========================================================================= */
const MOCK_DB_KEY = 'dayflow_mock_db_v1';
const MOCK_DELAY = 380; // simulate network latency so loading states are visible

const clone = o => JSON.parse(JSON.stringify(o));
const wait = ms => new Promise(r => setTimeout(r, ms || MOCK_DELAY));

/* seeded RNG so the generated history is stable across reloads */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function seedFrom(str) { let h = 1779033703; for (const c of str) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; } return h >>> 0; }

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function randTime(rng, h1, h2, m1 = 0, m2 = 59) {
  const h = h1 + Math.floor(rng() * (h2 - h1 + 1));
  const m = m1 + Math.floor(rng() * (m2 - m1 + 1));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function leaveDaysBetween(from, to) { // inclusive, Sundays excluded
  let d = fromISODate(from), end = fromISODate(to), n = 0;
  while (d <= end) { if (d.getDay() !== 0) n++; d = addDays(d, 1); }
  return n;
}

function seedDB() {
  const employees = [
    { id: 'E-1001', name: 'Priya Sharma',  email: 'priya@dayflow.com',  role: 'hr',       department: 'People Ops',  position: 'HR Manager',         joinDate: '2021-06-14', phone: '+91 98400 11223', address: '12 Anna Nagar, Chennai', salary: { basic: 45000, hra: 18000, transport: 3200, special: 9500, pf: 5400, pt: 200, insurance: 1500 } },
    { id: 'E-1002', name: 'Arjun Mehta',   email: 'arjun@dayflow.com',  role: 'employee', department: 'Engineering', position: 'Software Engineer',   joinDate: '2023-02-01', phone: '+91 99020 44556', address: '44 MG Road, Bengaluru', salary: { basic: 38000, hra: 15200, transport: 2400, special: 7000, pf: 4560, pt: 200, insurance: 1250 } },
    { id: 'E-1003', name: 'Sneha Iyer',    email: 'sneha@dayflow.com',  role: 'employee', department: 'Engineering', position: 'QA Engineer',         joinDate: '2023-08-21', phone: '+91 98410 77889', address: '8 T Nagar, Chennai',     salary: { basic: 32000, hra: 12800, transport: 2400, special: 5200, pf: 3840, pt: 200, insurance: 1250 } },
    { id: 'E-1004', name: 'Rahul Verma',   email: 'rahul@dayflow.com',  role: 'employee', department: 'Sales',       position: 'Sales Executive',     joinDate: '2022-11-07', phone: '+91 90030 12345', address: '21 Jubilee Hills, Hyderabad', salary: { basic: 28000, hra: 11200, transport: 2400, special: 4500, pf: 3360, pt: 200, insurance: 1250 } },
    { id: 'E-1005', name: 'Divya Nair',    email: 'divya@dayflow.com',  role: 'employee', department: 'Finance',     position: 'Accountant',          joinDate: '2022-04-19', phone: '+91 97440 33445', address: '5 Kaloor, Kochi',        salary: { basic: 30000, hra: 12000, transport: 2400, special: 5000, pf: 3600, pt: 200, insurance: 1250 } },
    { id: 'E-1006', name: 'Karthik Raj',   email: 'karthik@dayflow.com',role: 'employee', department: 'Engineering', position: 'Frontend Developer',  joinDate: '2024-01-08', phone: '+91 96550 66778', address: '17 K K Nagar, Chennai',  salary: { basic: 36000, hra: 14400, transport: 2400, special: 6200, pf: 4320, pt: 200, insurance: 1250 } },
  ].map(e => ({ ...e, photo: null, documents: [
    { name: 'Offer Letter.pdf', size: '240 KB' },
    { name: 'ID Proof.pdf', size: '1.1 MB' },
    { name: 'Relieving Letter (Previous).pdf', size: '310 KB' },
  ]}));

  const users = employees.map(e => ({ email: e.email, password: 'password123', employeeId: e.id, role: e.role }));

  /* attendance: last 35 days per employee (Sundays = week off, Sat = working) */
  const attendance = [];
  const today = new Date();
  for (const emp of employees) {
    const rng = mulberry32(seedFrom(emp.id + 'att'));
    for (let off = 35; off >= 0; off--) {
      const d = addDays(today, -off), iso = toISODate(d);
      if (d.getDay() === 0) { attendance.push({ employeeId: emp.id, date: iso, status: 'weekoff', checkIn: null, checkOut: null }); continue; }
      if (off === 0) {
        // today: leave the demo employee (Arjun) & brand-new signups un-marked so check-in can be demoed live
        attendance.push({ employeeId: emp.id, date: iso, status: emp.id === 'E-1002' ? 'not-marked' : 'present', checkIn: emp.id === 'E-1002' ? null : randTime(rng, 8, 9, 40, 59), checkOut: null });
        continue;
      }
      const r = rng();
      let rec;
      if (r < 0.80)      rec = { status: 'present',   checkIn: randTime(rng, 8, 9, 45, 59), checkOut: randTime(rng, 17, 18, 40, 59) };
      else if (r < 0.87) rec = { status: 'half-day',  checkIn: randTime(rng, 8, 9, 45, 59), checkOut: randTime(rng, 13, 14, 0, 30) };
      else if (r < 0.94) rec = { status: 'absent',    checkIn: null, checkOut: null };
      else               rec = { status: 'leave',     checkIn: null, checkOut: null };
      attendance.push({ employeeId: emp.id, date: iso, ...rec });
    }
  }

  const iso = d => toISODate(d);
  const leaves = [
    { id: 'L-2001', employeeId: 'E-1002', type: 'sick',   from: iso(addDays(today, 2)), to: iso(addDays(today, 3)), remarks: 'Fever, doctor advised rest.', status: 'pending',  appliedAt: Date.now() - 5 * 36e5, hrComment: null },
    { id: 'L-2002', employeeId: 'E-1005', type: 'paid',   from: iso(addDays(today, 7)), to: iso(addDays(today, 9)), remarks: 'Family function at hometown.', status: 'pending',  appliedAt: Date.now() - 26 * 36e5, hrComment: null },
    { id: 'L-2003', employeeId: 'E-1003', type: 'paid',   from: iso(addDays(today, -6)), to: iso(addDays(today, -6)), remarks: 'Personal work.', status: 'approved', appliedAt: Date.now() - 8 * 864e5, hrComment: 'Approved. Enjoy!' },
    { id: 'L-2004', employeeId: 'E-1004', type: 'unpaid', from: iso(addDays(today, -12)), to: iso(addDays(today, -11)), remarks: 'Personal trip.', status: 'rejected', appliedAt: Date.now() - 14 * 864e5, hrComment: 'Busy quarter — please re-plan.' },
    { id: 'L-2005', employeeId: 'E-1006', type: 'sick',   from: iso(addDays(today, 5)), to: iso(addDays(today, 5)), remarks: 'Doctor consultation.', status: 'approved', appliedAt: Date.now() - 2 * 864e5, hrComment: 'Get well soon.' },
    { id: 'L-2006', employeeId: 'E-1002', type: 'paid',   from: iso(addDays(today, -20)), to: iso(addDays(today, -19)), remarks: 'Family event.', status: 'approved', appliedAt: Date.now() - 24 * 864e5, hrComment: null },
  ].map(l => ({ ...l, days: leaveDaysBetween(l.from, l.to) }));

  const activities = [
    { ts: Date.now() - 2 * 36e5,  icon: 'plane',  text: '<b>Arjun Mehta</b> applied for Sick Leave (2 days).' },
    { ts: Date.now() - 6 * 36e5,  icon: 'wallet', text: 'July payroll was processed for all employees.' },
    { ts: Date.now() - 26 * 36e5, icon: 'plane',  text: '<b>Divya Nair</b> applied for Paid Leave (3 days).' },
    { ts: Date.now() - 2 * 864e5, icon: 'check',  text: '<b>Priya Sharma</b> approved Sick Leave for <b>Karthik Raj</b>.' },
    { ts: Date.now() - 3 * 864e5, icon: 'calCheck', text: '<b>Sneha Iyer</b> completed 12 consecutive working days.' },
    { ts: Date.now() - 5 * 864e5, icon: 'user',   text: 'New employee <b>Karthik Raj</b> onboarded to Engineering.' },
  ];

  return { employees, users, attendance, leaves, activities, nextLeaveId: 2007, leavePolicy: { paid: 18, sick: 12, unpaid: 6 } };
}

let DB = null;
function loadDB() {
  if (DB) return DB;
  try { DB = JSON.parse(Storage.get(MOCK_DB_KEY) || 'null'); } catch (e) { DB = null; }
  if (!DB || !DB.employees) { DB = seedDB(); saveDB(); }
  return DB;
}
function saveDB() { Storage.set(MOCK_DB_KEY, JSON.stringify(DB)); }
function resetMockDB() { Storage.remove(MOCK_DB_KEY); DB = null; loadDB(); }

function dbEmployee(id) { return loadDB().employees.find(e => e.id === id); }
function logActivity(iconName, html) {
  loadDB().activities.unshift({ ts: Date.now(), icon: iconName, text: html });
  loadDB().activities = loadDB().activities.slice(0, 40);
  saveDB();
}
function payStructNet(s) { return s.basic + s.hra + s.transport + s.special - s.pf - s.pt - s.insurance; }

const mockToken = () => 'mock-jwt-' + Math.random().toString(36).slice(2);

/* ---------- mock implementations (one per API endpoint) ---------- */
const mock = {

  async login(email, password) {
    await wait();
    const u = loadDB().users.find(x => x.email.toLowerCase() === String(email).toLowerCase().trim());
    if (!u || u.password !== password) throw new Error('Invalid email or password.');
    const emp = dbEmployee(u.employeeId);
    return { token: mockToken(), employeeId: u.employeeId, name: emp.name, email: emp.email, role: u.role, photo: emp.photo };
  },

  async signup({ employeeId, name, email, password, role }) {
    await wait();
    const db = loadDB();
    if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('An account with this email already exists.');
    if (db.employees.some(e => e.id.toLowerCase() === employeeId.toLowerCase())) throw new Error('This Employee ID is already registered.');
    db.employees.push({
      id: employeeId, name, email, role, department: 'General', position: 'Team Member',
      joinDate: toISODate(new Date()), phone: '—', address: '—', photo: null,
      salary: { basic: 30000, hra: 12000, transport: 2400, special: 5000, pf: 3600, pt: 200, insurance: 1250 },
      documents: [],
    });
    db.users.push({ email, password, employeeId, role });
    const rng = mulberry32(seedFrom(employeeId));
    for (let off = 35; off >= 1; off--) {
      const d = addDays(new Date(), -off);
      if (d.getDay() === 0) { db.attendance.push({ employeeId, date: toISODate(d), status: 'weekoff', checkIn: null, checkOut: null }); continue; }
      const r = rng();
      const rec = r < 0.8 ? { status: 'present', checkIn: randTime(rng, 8, 9, 45, 59), checkOut: randTime(rng, 17, 18, 40, 59) }
                 : r < 0.9 ? { status: 'absent', checkIn: null, checkOut: null }
                           : { status: 'leave', checkIn: null, checkOut: null };
      db.attendance.push({ employeeId, date: toISODate(d), ...rec });
    }
    db.attendance.push({ employeeId, date: toISODate(new Date()), status: 'not-marked', checkIn: null, checkOut: null });
    logActivity('user', `New employee <b>${name}</b> registered as ${role === 'hr' ? 'HR/Admin' : 'Employee'}.`);
    saveDB();
    return { ok: true };
  },

  async getEmployeeProfile(employeeId) {
    await wait(240);
    const e = dbEmployee(employeeId); if (!e) throw new Error('Employee not found');
    return clone(e);
  },

  async updateEmployeeProfile(employeeId, { phone, address, photo }) {
    await wait();
    const e = dbEmployee(employeeId); if (!e) throw new Error('Employee not found');
    if (phone !== undefined) e.phone = phone;
    if (address !== undefined) e.address = address;
    if (photo !== undefined) e.photo = photo;
    logActivity('edit', `<b>${e.name}</b> updated contact details.`);
    saveDB();
    return clone(e);
  },

  async getTodayAttendance(employeeId) {
    await wait(240);
    const date = toISODate(new Date());
    let rec = loadDB().attendance.find(a => a.employeeId === employeeId && a.date === date);
    if (!rec) {
      rec = { employeeId, date, status: new Date().getDay() === 0 ? 'weekoff' : 'not-marked', checkIn: null, checkOut: null };
      loadDB().attendance.push(rec); saveDB();
    }
    return clone(rec);
  },

  async checkIn(employeeId) {
    await wait();
    await mock.getTodayAttendance(employeeId); // ensure the record exists
    const date = toISODate(new Date());
    const r = loadDB().attendance.find(a => a.employeeId === employeeId && a.date === date);
    if (r.status === 'weekoff') throw new Error('Today is a weekly off — no attendance needed.');
    if (r.checkIn) throw new Error('You have already checked in today.');
    const now = new Date();
    r.checkIn = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    r.status = 'present';
    logActivity('clockIn', `<b>${dbEmployee(employeeId).name}</b> checked in at ${r.checkIn}.`);
    saveDB();
    return clone(r);
  },

  async checkOut(employeeId) {
    await wait();
    const date = toISODate(new Date());
    const r = loadDB().attendance.find(a => a.employeeId === employeeId && a.date === date);
    if (!r || !r.checkIn) throw new Error('Please check in before checking out.');
    if (r.checkOut) throw new Error('You have already checked out today.');
    const now = new Date();
    r.checkOut = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const [h1, m1] = r.checkIn.split(':').map(Number), [h2, m2] = r.checkOut.split(':').map(Number);
    if ((h2 * 60 + m2) - (h1 * 60 + m1) < 240) r.status = 'half-day'; // <4h worked = half day
    logActivity('clockOut', `<b>${dbEmployee(employeeId).name}</b> checked out at ${r.checkOut}.`);
    saveDB();
    return clone(r);
  },

  async getAttendance(employeeId, from, to) {
    await wait(300);
    const rows = loadDB().attendance.filter(a => a.employeeId === employeeId && (!from || a.date >= from) && (!to || a.date <= to)).sort((a, b) => b.date.localeCompare(a.date));
    return clone(rows);
  },

  async getAllAttendance(date, { department, status } = {}) {
    await wait(350);
    let rows = loadDB().attendance.filter(a => a.date === date).map(a => ({ ...a, employee: dbEmployee(a.employeeId) }));
    if (department && department !== 'all') rows = rows.filter(r => r.employee.department === department);
    if (status && status !== 'all') rows = rows.filter(r => r.status === status);
    const counts = { present: 0, absent: 0, 'half-day': 0, leave: 0, 'not-marked': 0, weekoff: 0 };
    loadDB().attendance.filter(a => a.date === date).forEach(a => counts[a.status] = (counts[a.status] || 0) + 1);
    return clone({ rows: rows.sort((a, b) => a.employee.name.localeCompare(b.employee.name)), counts });
  },

  async getWeekAttendance(mondayISO) {
    await wait(350);
    const base = fromISODate(mondayISO);
    const days = Array.from({ length: 7 }, (_, i) => toISODate(addDays(base, i)));
    const rows = loadDB().employees.map(emp => ({
      employee: emp,
      days: days.map(d => clone(loadDB().attendance.find(a => a.employeeId === emp.id && a.date === d) || { date: d, status: 'not-marked' })),
    }));
    return clone({ monday: mondayISO, days, rows });
  },

  async applyLeave({ employeeId, type, from, to, remarks }) {
    await wait(500);
    if (to < from) throw new Error('End date cannot be before the start date.');
    const days = leaveDaysBetween(from, to);
    if (days < 1) throw new Error('Selected range has no working days (Sundays are excluded).');
    const db = loadDB();
    const overlap = db.leaves.find(l => l.employeeId === employeeId && (l.status === 'pending' || l.status === 'approved') && from <= l.to && to >= l.from);
    if (overlap) throw new Error('This range overlaps an existing pending/approved leave request.');
    const bal = await mock.getLeaveBalance(employeeId);
    if (type !== 'unpaid' && days > bal[type].available) throw new Error(`Insufficient ${type} leave balance — ${bal[type].available} day(s) available.`);
    const leave = { id: 'L-' + db.nextLeaveId++, employeeId, type, from, to, days, remarks: remarks || '—', status: 'pending', appliedAt: Date.now(), hrComment: null };
    db.leaves.push(leave);
    logActivity('plane', `<b>${dbEmployee(employeeId).name}</b> applied for ${type} leave (${days} day${days > 1 ? 's' : ''}).`);
    saveDB();
    return clone(leave);
  },

  async getLeaveRequests(employeeId) {
    await wait(280);
    return clone(loadDB().leaves.filter(l => l.employeeId === employeeId).sort((a, b) => b.appliedAt - a.appliedAt));
  },

  async getAllLeaveRequests(status) {
    await wait(300);
    let rows = clone(loadDB().leaves);
    if (status && status !== 'all') rows = rows.filter(l => l.status === status);
    rows.sort((a, b) => b.appliedAt - a.appliedAt);
    return rows.map(l => { const e = dbEmployee(l.employeeId); return { ...l, employeeName: e ? e.name : l.employeeId, department: e ? e.department : '—', position: e ? e.position : '—' }; });
  },

  async decideLeave(leaveId, decision, comment) {
    await wait(450);
    const l = loadDB().leaves.find(x => x.id === leaveId);
    if (!l) throw new Error('Leave request not found.');
    if (l.status !== 'pending') throw new Error('This request has already been processed.');
    l.status = decision;
    l.hrComment = comment || null;
    if (decision === 'approved') {
      loadDB().attendance.forEach(a => { if (a.employeeId === l.employeeId && a.date >= l.from && a.date <= l.to && a.status !== 'weekoff') { a.status = 'leave'; a.checkIn = a.checkOut = null; } });
    }
    logActivity(decision === 'approved' ? 'check' : 'x', `Leave request <b>${l.id}</b> was <b>${decision}</b>.`);
    saveDB();
    return clone(l);
  },

  async getLeaveBalance(employeeId) {
    await wait(200);
    const policy = loadDB().leavePolicy;
    const out = {};
    for (const t of ['paid', 'sick', 'unpaid']) {
      const used = loadDB().leaves.filter(l => l.employeeId === employeeId && l.type === t && (l.status === 'approved' || l.status === 'pending')).reduce((s, l) => s + l.days, 0);
      out[t] = { total: policy[t], used, available: Math.max(0, policy[t] - used) };
    }
    return out;
  },

  async getPayroll(employeeId) {
    await wait(320);
    const e = dbEmployee(employeeId); if (!e) throw new Error('Employee not found');
    const now = new Date();
    const months = [2, 1, 0].map(back => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
    const payslips = months.map((m, i) => ({
      id: `PS-${employeeId}-${m}`, month: m, ...clone(e.salary),
      allowances: e.salary.hra + e.salary.transport + e.salary.special,
      deductions: e.salary.pf + e.salary.pt + e.salary.insurance,
      net: payStructNet(e.salary),
      status: i === months.length - 1 ? 'processing' : 'paid',
      paidOn: i === months.length - 1 ? null : `${m}-28`,
    }));
    return clone({ structure: e.salary, monthlyGross: e.salary.basic + e.salary.hra + e.salary.transport + e.salary.special, net: payStructNet(e.salary), payslips });
  },

  async getAllPayroll() {
    await wait(380);
    const rows = loadDB().employees.map(e => {
      const gross = e.salary.basic + e.salary.hra + e.salary.transport + e.salary.special;
      const ded = e.salary.pf + e.salary.pt + e.salary.insurance;
      return { employeeId: e.id, name: e.name, department: e.department, position: e.position, photo: e.photo, salary: clone(e.salary), gross, deductions: ded, net: gross - ded, status: 'processing' };
    });
    return clone(rows);
  },

  async updateSalary(employeeId, salary) {
    await wait(500);
    const e = dbEmployee(employeeId); if (!e) throw new Error('Employee not found');
    const nums = {}; for (const k of ['basic', 'hra', 'transport', 'special', 'pf', 'pt', 'insurance']) { const v = Number(salary[k]); if (!Number.isFinite(v) || v < 0) throw new Error('All salary fields must be positive numbers.'); nums[k] = Math.round(v); }
    if (nums.basic <= 0) throw new Error('Basic salary must be greater than zero.');
    e.salary = nums;
    logActivity('wallet', `Salary structure updated for <b>${e.name}</b>.`);
    saveDB();
    return clone(e.salary);
  },

  async getHrStats() {
    await wait(350);
    const db = loadDB();
    const today = toISODate(new Date());
    const todays = db.attendance.filter(a => a.date === today);
    const counts = { present: 0, absent: 0, 'half-day': 0, leave: 0, 'not-marked': 0, weekoff: 0 };
    todays.forEach(a => counts[a.status] = (counts[a.status] || 0) + 1);
    const monthlyPayroll = db.employees.reduce((s, e) => s + payStructNet(e.salary), 0);
    const trend = [];
    for (let off = 6; off >= 0; off--) {
      const d = addDays(new Date(), -off), iso = toISODate(d);
      const rows = db.attendance.filter(a => a.date === iso && a.status !== 'weekoff');
      const presentish = rows.filter(a => a.status === 'present' || a.status === 'half-day').length;
      trend.push({ date: iso, label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()], pct: rows.length ? Math.round(presentish / rows.length * 100) : 0 });
    }
    return clone({
      totalEmployees: db.employees.length,
      counts, pendingLeaves: db.leaves.filter(l => l.status === 'pending').length,
      monthlyPayroll,
      trend,
    });
  },

  async getEmployees({ search, department } = {}) {
    await wait(300);
    let rows = clone(loadDB().employees);
    if (department && department !== 'all') rows = rows.filter(e => e.department === department);
    if (search) { const q = search.toLowerCase(); rows = rows.filter(e => [e.name, e.id, e.email, e.position].some(f => f.toLowerCase().includes(q))); }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows.map(({ documents, ...rest }) => rest);
  },

  async updateEmployee(employeeId, patch) {
    await wait(450);
    const e = dbEmployee(employeeId); if (!e) throw new Error('Employee not found');
    const allowed = ['name', 'email', 'phone', 'department', 'position', 'joinDate', 'address'];
    for (const k of allowed) if (patch[k] !== undefined) e[k] = patch[k];
    logActivity('edit', `HR updated profile of <b>${e.name}</b>.`);
    saveDB();
    return clone(e);
  },

  async addEmployee({ employeeId, name, email, password, role, department, position }) {
    await wait(500);
    const db = loadDB();
    if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('An account with this email already exists.');
    if (db.employees.some(e => e.id === employeeId)) throw new Error('This Employee ID is already registered.');
    db.employees.push({
      id: employeeId, name, email, role: role || 'employee', department: department || 'General',
      position: position || 'Team Member', joinDate: toISODate(new Date()), phone: '—', address: '—', photo: null,
      salary: { basic: 30000, hra: 12000, transport: 2400, special: 5000, pf: 3600, pt: 200, insurance: 1250 },
      documents: [],
    });
    db.users.push({ email, password, employeeId, role: role || 'employee' });
    logActivity('user', `HR added new employee <b>${name}</b>.`);
    saveDB();
    return clone(dbEmployee(employeeId));
  },

  async setEmployeeActive(employeeId, active) {
    await wait(400);
    const e = dbEmployee(employeeId); if (!e) throw new Error('Employee not found');
    e.active = active;
    logActivity('user', `Account of <b>${e.name}</b> was ${active ? 'reactivated' : 'deactivated'} by HR.`);
    saveDB();
    return clone(e);
  },

  async getActivities(limit = 8) {
    await wait(200);
    return clone(loadDB().activities.slice(0, limit));
  },

  async getNotifications(limit = 10) {
    await wait(200);
    return clone(loadDB().activities.slice(0, limit)).map(a => ({ ...a, read: true }));
  },

  async getUnreadCount() {
    const s = JSON.parse(Storage.get('dayflow_session') || 'null');
    if (!s) return 0;
    if (s.role === 'hr') return loadDB().leaves.filter(l => l.status === 'pending').length;
    return loadDB().leaves.filter(l => l.employeeId === s.employeeId && l.status === 'pending').length;
  },
};

/* =========================================================================
   API SURFACE — page scripts use ONLY these functions.
   USE_MOCK_DATA branch = offline dev tool · request(...) = real Flask backend.
   ========================================================================= */
const api = {

  /* ---------------- AUTH ---------------- */
  async login(email, password) {
    if (USE_MOCK_DATA) return mock.login(email, password);
    return request('POST', '/api/auth/login', { email, password });
  },

  async signup({ employeeId, name, email, password, role }) {
    if (USE_MOCK_DATA) return mock.signup({ employeeId, name, email, password, role });
    return request('POST', '/api/auth/signup', { employeeId, name, email, password, role });
  },

  /* ---------------- PROFILE ---------------- */
  async getEmployeeProfile(employeeId) {
    if (USE_MOCK_DATA) return mock.getEmployeeProfile(employeeId);
    return request('GET', `/api/employees/${employeeId}/profile`);
  },

  async updateEmployeeProfile(employeeId, { phone, address, photo }) { // employee may edit ONLY these
    if (USE_MOCK_DATA) return mock.updateEmployeeProfile(employeeId, { phone, address, photo });
    return request('PATCH', `/api/employees/${employeeId}/profile`, { phone, address, photo });
  },

  /* ---------------- ATTENDANCE ---------------- */
  async getTodayAttendance(employeeId) {
    if (USE_MOCK_DATA) return mock.getTodayAttendance(employeeId);
    return request('GET', `/api/attendance/today?employee_id=${employeeId}`);
  },

  async checkIn(employeeId) {
    if (USE_MOCK_DATA) return mock.checkIn(employeeId);
    return request('POST', '/api/attendance/check-in', { employee_id: employeeId });
  },

  async checkOut(employeeId) {
    if (USE_MOCK_DATA) return mock.checkOut(employeeId);
    return request('POST', '/api/attendance/check-out', { employee_id: employeeId });
  },

  async getAttendance(employeeId, from, to) {
    if (USE_MOCK_DATA) return mock.getAttendance(employeeId, from, to);
    return request('GET', `/api/attendance?employee_id=${employeeId}&from=${from}&to=${to}`);
  },

  async getAllAttendance(date, { department, status } = {}) {
    if (USE_MOCK_DATA) return mock.getAllAttendance(date, { department, status });
    return request('GET', `/api/attendance/all?date=${date}&department=${department || 'all'}&status=${status || 'all'}`);
  },

  async getWeekAttendance(mondayISO) {
    if (USE_MOCK_DATA) return mock.getWeekAttendance(mondayISO);
    return request('GET', `/api/attendance/all/week?monday=${mondayISO}`);
  },

  /* ---------------- LEAVE ---------------- */
  async applyLeave({ employeeId, type, from, to, remarks }) {
    if (USE_MOCK_DATA) return mock.applyLeave({ employeeId, type, from, to, remarks });
    return request('POST', '/api/leaves', { employee_id: employeeId, type, from, to, remarks });
  },

  async getLeaveRequests(employeeId) {
    if (USE_MOCK_DATA) return mock.getLeaveRequests(employeeId);
    return request('GET', `/api/leaves?employee_id=${employeeId}`);
  },

  async getAllLeaveRequests(status) {
    if (USE_MOCK_DATA) return mock.getAllLeaveRequests(status);
    return request('GET', `/api/leaves/all?status=${status || 'all'}`);
  },

  async decideLeave(leaveId, decision, comment) { // decision: 'approved' | 'rejected'
    if (USE_MOCK_DATA) return mock.decideLeave(leaveId, decision, comment);
    return request('PATCH', `/api/leaves/${leaveId}/${decision}`, { comment });
  },

  async getLeaveBalance(employeeId) {
    if (USE_MOCK_DATA) return mock.getLeaveBalance(employeeId);
    return request('GET', `/api/leaves/balance?employee_id=${employeeId}`);
  },

  /* ---------------- PAYROLL ---------------- */
  async getPayroll(employeeId) {
    if (USE_MOCK_DATA) return mock.getPayroll(employeeId);
    return request('GET', `/api/payroll?employee_id=${employeeId}`);
  },

  async getAllPayroll() {
    if (USE_MOCK_DATA) return mock.getAllPayroll();
    return request('GET', '/api/payroll/all');
  },

  async updateSalary(employeeId, salary) {
    if (USE_MOCK_DATA) return mock.updateSalary(employeeId, salary);
    return request('PATCH', `/api/payroll/${employeeId}`, salary);
  },

  /* ---------------- HR DASHBOARD / EMPLOYEES ---------------- */
  async getHrStats() {
    if (USE_MOCK_DATA) return mock.getHrStats();
    return request('GET', '/api/hr/stats');
  },

  async getEmployees({ search, department } = {}) {
    if (USE_MOCK_DATA) return mock.getEmployees({ search, department });
    return request('GET', `/api/employees?search=${encodeURIComponent(search || '')}&department=${department || 'all'}`);
  },

  async updateEmployee(employeeId, patch) {
    if (USE_MOCK_DATA) return mock.updateEmployee(employeeId, patch);
    return request('PATCH', `/api/employees/${employeeId}`, patch);
  },

  async addEmployee(payload) { // HR creates an employee + login account
    if (USE_MOCK_DATA) return mock.addEmployee(payload);
    return request('POST', '/api/employees', payload);
  },

  async setEmployeeActive(employeeId, active) { // HR deactivate / reactivate
    if (USE_MOCK_DATA) return mock.setEmployeeActive(employeeId, active);
    return request('PATCH', `/api/employees/${employeeId}/status`, { active });
  },

  /* ---------------- ACTIVITIES / NOTIFICATIONS ---------------- */
  async getActivities(limit = 8) {
    if (USE_MOCK_DATA) return mock.getActivities(limit);
    return request('GET', `/api/activities?limit=${limit}`);
  },

  async getNotifications(limit = 10) { // own notifications, read/unread from DB
    if (USE_MOCK_DATA) return mock.getNotifications(limit);
    return request('GET', `/api/notifications?limit=${limit}`);
  },

  async markNotificationsRead() {
    if (USE_MOCK_DATA) return { success: true, marked: 0 };
    return request('POST', '/api/notifications/mark-read');
  },

  async getUnreadCount() {
    if (USE_MOCK_DATA) return mock.getUnreadCount();
    return request('GET', '/api/notifications/unread/count');
  },
};
