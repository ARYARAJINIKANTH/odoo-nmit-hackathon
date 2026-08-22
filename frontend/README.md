# Dayflow — Human Resource Management System (HRMS)

**Frontend-only build** for the *Odoo × NMIT Bangalore Hackathon 2026*.
Problem statement: **DAYFLOW – Human Resource Management System (HRMS)**.

Dayflow is a clean, modern HRMS web frontend with two experiences:

| Role | What they get |
|---|---|
| **Employee** | Dashboard, check-in / check-out, leave requests + balance, read-only payroll & payslips, editable profile (phone / address / photo only) |
| **HR / Admin** | Command-center dashboard, employee directory management, organisation-wide attendance (daily + weekly), leave approvals with comments, payroll editing for everyone |

> ✅ **The backend now exists.** This folder is the UI only. The Flask REST API lives in
> `../backend/`, and this frontend now defaults to **real API mode** (`useMock: false` in
> `js/api.js`). If the backend is unreachable it falls back to built-in demo data
> automatically. See the root `README.md`, `docs/setup.md` and `docs/api-contract.md`.

---

## 1. Project structure

```
dayflow/
├── frontend/
│   ├── index.html                 Landing page (branding, login/signup CTAs)
│   ├── login.html                 Sign in (error area, remember me, demo creds)
│   ├── signup.html                Sign up (validated: emp ID, name, email, password, role)
│   ├── employee-dashboard.html    Employee home (attendance, leaves, payroll, activity)
│   ├── hr-dashboard.html          HR home (stats, donut, trend, payroll, activity)
│   ├── hr-employees.html          HR employee management (search, filter, view, edit)
│   ├── profile.html               My profile (read-only vs editable clearly separated)
│   ├── attendance.html            Employee: today/week/history · HR: daily/weekly for all
│   ├── leave.html                 Employee: apply + history · HR: approve/reject + comment
│   ├── payroll.html               Employee: read-only payslips · HR: edit salary structures
│   ├── css/
│   │   └── style.css              Dayflow design system (on top of Bootstrap)
│   ├── js/
│   │   ├── app.js                 Shared core: session, auth guards, sidebar/topbar shell,
│   │   │                          toasts, modals, icons, formatters (NO data logic)
│   │   ├── api.js                 ★ THE ONLY file that touches data. Mock DB + one `api`
│   │   │                          object whose methods map 1:1 to future REST endpoints
│   │   ├── auth.js                loginUser(), signupUser(), validation  (login/signup)
│   │   ├── employee.js            Dashboard + profile rendering, checkIn()/checkOut()
│   │   ├── hr.js                  HR dashboard + employee management
│   │   ├── attendance.js          Employee & HR attendance views
│   │   ├── leave.js               applyLeave(), loadLeaveRequests(), approveLeave(),
│   │   │                          rejectLeave() (+ HR pending queue)
│   │   └── payroll.js             loadPayroll() (read-only) + HR salary editing
│   └── assets/
│       ├── logo.svg               Dayflow logo
│       └── vendor/bootstrap.min.css  Bootstrap 5.3.3, downloaded locally → works offline
└── README.md
```

Two shared files (`app.js`, `api.js`) were added to the requested structure on purpose:
they keep session/shell/UI helpers and the mock-data layer **out of the page scripts**, which
is exactly what makes the backend swap painless later.

## 2. How the pages connect

```
index.html ──► login.html ──► employee-dashboard.html ──► profile / attendance / leave / payroll
     │              │
     └──► signup.html└──► hr-dashboard.html ──► hr-employees / attendance / leave / payroll
```

- `login.html` / `signup.html` create a **session** (stored via the safe `Storage` wrapper).
- Every protected page calls `requireAuth()` → redirects to `login.html?next=…` if no session,
  and keeps employees out of HR pages (and vice-versa for dashboards).
- `initShell()` renders the sidebar + topbar from the session role — **Employee gets the
  indigo/light sidebar, HR gets the dark/teal one** — so the two interfaces are visually distinct.
- `attendance.html`, `leave.html` and `payroll.html` are **shared**: each renders an employee
  view or an HR view depending on `session.role`.
- Logout (with confirmation) is available on every page's topbar.

## 3. Demo accounts

| Role | Email | Password |
|---|---|---|
| Employee | `arjun@dayflow.com` | `password123` |
| HR / Admin | `priya@dayflow.com` | `password123` |

All seeded employees (`sneha@`, `rahul@`, `divya@`, `karthik@`) use the same password.
Accounts created on the **signup page work immediately**. "Reset demo data" on the login
page restores the original seed.

## 4. Run the frontend locally

The project is static — any web server works. From the `frontend/` folder:

```bash
# Python (preinstalled on most systems)
python -m http.server 8000
# then open http://localhost:8000
```

or with Node:

```bash
npx serve frontend
```

VS Code users can instead use the **Live Server** extension → *Open with Live Server*
on `index.html`. Opening files directly via `file://` mostly works but some browsers
restrict storage — prefer the server.

## 5. Connecting the Flask backend later (the important part)

All page scripts talk **only** to the `api` object in `js/api.js`. Nothing else reads data.

**Step 1** — in `js/api.js`:

```js
const API_CONFIG = {
  useMock: false,                    // ← flip this
  baseUrl: 'http://localhost:5000',  // ← your Flask address
};
```

**Step 2** — inside each `api` method, swap the mock line for the prepared `request(...)` line.
Every method already looks like this:

```js
async login(email, password) {
  if (API_CONFIG.useMock) { /* …mock implementation… */ }
  return request('POST', '/api/auth/login', { email, password });   // ← real call, ready
}
```

The `request()` helper (same file) already handles JSON headers and the
`Authorization: Bearer <token>` header from the saved session. **No page code changes.**

### Expected endpoint contract

| Frontend call | Method & endpoint |
|---|---|
| `api.login` | `POST /api/auth/login` → `{token, employeeId, name, email, role}` |
| `api.signup` | `POST /api/auth/signup` |
| `api.getEmployeeProfile` | `GET /api/employees/<id>/profile` |
| `api.updateEmployeeProfile` | `PATCH /api/employees/<id>/profile` (phone/address/photo only) |
| `api.getTodayAttendance` | `GET /api/attendance/today?employee_id=` |
| `api.checkIn` / `api.checkOut` | `POST /api/attendance/check-in` / `check-out` |
| `api.getAttendance` | `GET /api/attendance?employee_id=&from=&to=` |
| `api.getAllAttendance` | `GET /api/attendance/all?date=&department=&status=` |
| `api.getWeekAttendance` | `GET /api/attendance/all/week?monday=` |
| `api.applyLeave` | `POST /api/leaves` |
| `api.getLeaveRequests` | `GET /api/leaves?employee_id=` |
| `api.getAllLeaveRequests` | `GET /api/leaves/all?status=` |
| `api.decideLeave` | `PATCH /api/leaves/<id>/approved` \| `/rejected` |
| `api.getLeaveBalance` | `GET /api/leaves/balance?employee_id=` |
| `api.getPayroll` | `GET /api/payroll?employee_id=` |
| `api.getAllPayroll` | `GET /api/payroll/all` |
| `api.updateSalary` | `PATCH /api/payroll/<employee_id>` |
| `api.getHrStats` | `GET /api/hr/stats` |
| `api.getEmployees` | `GET /api/employees?search=&department=` |
| `api.updateEmployee` | `PATCH /api/employees/<id>` |
| `api.getActivities` | `GET /api/activities?limit=` |

Return errors as `{ "message": "…" }` with a non-2xx status — the frontend surfaces them
in toasts / error areas automatically.

## 6. What is intentionally mocked (and where)

Everything inside the clearly-marked **MOCK DATA SECTION** of `js/api.js`
(~lines 40–260): a seed dataset (6 employees, 35 days of attendance, leave requests,
salary structures, activity feed) held in `localStorage`, plus simulated network latency so
loading skeletons are visible. **No page script, no HTML and no CSS contain data** — delete
that one section and the mock branches when the API arrives.

## 7. Status / roadmap

- [x] Frontend: all 10 pages, both roles, responsive, loading/empty/error states, confirmations
- [ ] Flask REST API (`/api/…`) — next phase
- [ ] Database (employees, attendance, leaves, payroll) — next phase
- [ ] JWT auth + password hashing — next phase
- [ ] PDF payslip export & email notifications — later
