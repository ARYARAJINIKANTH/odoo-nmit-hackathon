# Dayflow API Contract

The **frontend is the source of truth**. Every endpoint below was extracted from
`frontend/js/api.js` and verified against the Flask routes in `backend/routes/`.

## Conventions

| Topic | Contract |
|---|---|
| Base URL | `http://localhost:5000` (configurable in `frontend/js/api.js` → `API_CONFIG.baseUrl`) |
| Auth | `Authorization: Bearer <JWT>` on every endpoint except signup/login |
| Success body | **Bare JSON** in the exact shape the frontend consumes (not wrapped) |
| Error body | `{"success": false, "message": "Human-readable error"}` — frontend shows `message` |
| Dates | `YYYY-MM-DD` · Times `HH:MM` (local) · Months `YYYY-MM` · Timestamps epoch **milliseconds** |
| Money | Integer monthly INR |

Roles: `employee`, `hr`. Employees can only access **their own** `employee_id`;
HR can access anyone's. (Enforced by `utils/auth.self_or_hr`.)

---

## AUTH

### `POST /api/auth/signup` — public
Body: `{ "employeeId": "E-1025", "name": "New User", "email": "new@dayflow.com", "password": "secret123", "role": "employee" | "hr" }`
(⚠ note: signup uses **camelCase `employeeId`**; all other endpoints use `employee_id` — matches the frontend.)

**201** → `{ "success": true, "message": "Account created successfully.", "employeeId": "E-1025" }`

Errors: `400` invalid employee ID/name/email/password(<6)/role · `409` `"An account with this email already exists."` · `409` `"This Employee ID is already registered."`

### `POST /api/auth/login` — public
Body: `{ "email": "arjun@dayflow.com", "password": "password123" }`

**200** →
```json
{ "token": "<JWT>", "employeeId": "E-1002", "name": "Arjun Mehta", "email": "arjun@dayflow.com", "role": "employee", "photo": null }
```
Errors: `401` `"Invalid email or password."`

---

## EMPLOYEES

### `GET /api/employees?search=&department=all` — HR only
`search` matches name / employee ID / email / position (case-insensitive).
**200** → array of employee objects (no `documents`, includes `active`), sorted by name.

### `POST /api/employees` — HR only (add employee)
Body: `{ "employeeId", "name", "email", "password", "role" ("employee"|"hr"), "department"?, "position"?, "joinDate"?, "phone"?, "address"? }`
Creates the employee record **and** its login account (hashed password) in one transaction.
**201** → full profile object.
Errors: `400` invalid fields · `409` `"An account with this email already exists."` / `"This Employee ID is already registered."`

### `PATCH /api/employees/<id>/status` — HR only (deactivate / reactivate)
Body: `{ "active": false }` → deactivated users cannot log in (`403 "Your account has been deactivated. Please contact HR."`), records are kept.
Errors: `400` missing boolean · `400` `"You cannot deactivate your own account."`

### `GET /api/employees/<id>` and `GET /api/employees/<id>/profile` — self or HR
**200** →
```json
{
  "id": "E-1002", "name": "Arjun Mehta", "email": "arjun@dayflow.com", "role": "employee",
  "department": "Engineering", "position": "Software Engineer", "joinDate": "2023-02-01",
  "phone": "+91 99020 44556", "address": "44 MG Road, Bengaluru", "photo": null,
  "salary": { "basic": 38000, "hra": 15200, "transport": 2400, "special": 7000, "pf": 4560, "pt": 200, "insurance": 1250 },
  "documents": [{ "name": "Offer Letter.pdf", "size": "240 KB" }]
}
```
Errors: `404` `"Employee not found."` · `403` accessing another employee.

### `PATCH /api/employees/<id>/profile` — self or HR
Body (any subset): `{ "phone": "...", "address": "...", "photo": "data:image/jpeg;base64,..." }`
Only these three keys are honoured — a spoofed `salary` key is ignored.
**200** → full profile object.

### `PATCH /api/employees/<id>` — HR only
Body (any subset): `{ "name", "email", "phone", "department", "position", "joinDate", "address" }`
**200** → full profile object. Errors: `400` invalid values · `409` email already used.

---

## ATTENDANCE

Statuses: `present · absent · half-day · leave · weekoff · not-marked`. Sunday = weekly off. Working < 4h → `half-day` on check-out.

### `GET /api/attendance/today?employee_id=E-1002` — self or HR
**200** → `{ "employeeId", "date", "status", "checkIn", "checkOut" }` (synthesised `not-marked`/`weekoff` if no row yet)

### `POST /api/attendance/check-in` — self or HR
Body: `{ "employee_id": "E-1002" }` → **200** updated record.
Errors: `400` `"Today is a weekly off — no attendance needed."` · `400` `"You have already checked in today."`

### `POST /api/attendance/check-out` — self or HR
Body: `{ "employee_id": "E-1002" }` → **200** updated record.
Errors: `400` `"Please check in before checking out."` · `400` `"You have already checked out today."`

### `GET /api/attendance?employee_id=&from=&to=` — self or HR
`from`/`to` optional (frontend may send literal `undefined` — tolerated).
**200** → array of records sorted by date desc.

### `GET /api/attendance/all?date=&department=&status=` — HR only
**200** →
```json
{ "rows": [ { "employeeId", "date", "status", "checkIn", "checkOut",
              "employee": { "id", "name", "department", "position", "photo" } } ],
  "counts": { "present": 5, "absent": 0, "half-day": 0, "leave": 1, "not-marked": 0, "weekoff": 0 } }
```
`counts` covers **all** employees for the date (before department/status filtering).

### `GET /api/attendance/all/week?monday=YYYY-MM-DD` — HR only
Floors to the week's Monday. **200** →
`{ "monday", "days": [7 ISO dates], "rows": [ { "employee": {...}, "days": [ { "date", "status", "checkIn", "checkOut" } × 7 ] } ] }`

---

## LEAVES

Types: `paid · sick · unpaid` (Sundays excluded from day counts). Policy: paid 18 / sick 12 / unpaid 6 days; `used` counts **approved + pending**.

### `POST /api/leaves` — self only
Body: `{ "employee_id", "type", "from", "to", "remarks" }` → **201** leave object:
```json
{ "id": "L-2007", "employeeId", "type": "sick", "from", "to", "days": 2, "remarks", "status": "pending", "appliedAt": 1760000000000, "hrComment": null }
```
Errors (message parity with the UI mock): `400` `"End date cannot be before the start date."` · `400` `"Selected range has no working days (Sundays are excluded)."` · `400` `"This range overlaps an existing pending/approved leave request."` · `400` `"Insufficient sick leave balance — 3 day(s) available."`

### `GET /api/leaves?employee_id=` — self or HR
**200** → array of own leaves, newest first.

### `GET /api/leaves/all?status=pending|approved|rejected|all` — HR only
**200** → leaves enriched with `employeeName`, `department`, `position`.

### `GET /api/leaves/balance?employee_id=` — self or HR
**200** → `{ "paid": {"total":18,"used":2,"available":16}, "sick": {...}, "unpaid": {...} }`

### `PATCH` (or `PUT`) `/api/leaves/<id>/approved` · `/api/leaves/<id>/rejected` — HR only
Body: `{ "comment": "optional" }` → **200** updated leave.
Approval side-effects: attendance rows inside the range become `leave` (times cleared) **and** a notification is created for the employee (see below).
Errors: `404` `"Leave request not found."` · `400` `"This request has already been processed."`

---

## PAYROLL

### `GET /api/payroll?employee_id=` — self or HR (employee view is read-only by design)
**200** →
```json
{
  "structure": { "basic": 38000, "hra": 15200, "transport": 2400, "special": 7000, "pf": 4560, "pt": 200, "insurance": 1250 },
  "monthlyGross": 62600, "net": 56590,
  "payslips": [ { "id": "PS-E-1002-2026-06", "month": "2026-06", "basic", "hra", "transport", "special", "pf", "pt", "insurance",
                  "allowances": 24600, "deductions": 6010, "net": 56590, "status": "paid", "paidOn": "2026-06-28" }, … ]
}
```
Last 3 months: previous = `paid` (paid on the 28th), current = `processing`.

### `GET /api/payroll/all` — HR only
**200** → per-employee rows `{ "employeeId", "name", "department", "position", "photo", "salary", "gross", "deductions", "net", "status" }`

### `PATCH /api/payroll/<employee_id>` — HR only
Body: all 7 salary fields (numbers). **200** → new structure dict.
Errors: `400` `"All salary fields must be positive numbers."` · `400` `"Basic salary must be greater than zero."` · `404` employee not found.

---

## HR DASHBOARD

### `GET /api/hr/stats` — HR only
**200** →
```json
{ "totalEmployees": 6,
  "counts": { "present": 5, "absent": 0, "half-day": 0, "leave": 0, "not-marked": 1, "weekoff": 0 },
  "pendingLeaves": 2, "monthlyPayroll": 311170,
  "departments": [ { "name": "Engineering", "total": 3, "present": 3 }, … ],
  "trend": [ { "date": "2026-08-16", "label": "S", "pct": 100 }, … ×7 ] }
```
`trend` = last 7 days oldest→today, `pct` = share of present+half-day among non-weekoff employees. `departments` is computed live from the database.

---

## ACTIVITIES & NOTIFICATIONS

### `GET /api/activities?limit=8` — any authenticated user
**200** → `[ { "ts": 1760000000000, "icon": "plane", "text": "<b>Arjun Mehta</b> applied for Sick Leave (2 days)." } ]`
(`text` may contain trusted `<b>` markup rendered by the frontend.)

### `GET /api/notifications?limit=10` — any authenticated user
Per-user notifications stored in the `notifications` table (created when a leave is submitted → HR users, and when a decision is made → the employee; also a welcome message on signup / HR account creation).
**200** → `[ { "id": 1, "icon": "check", "text": "Your leave request <b>L-2007</b> … was <b>approved</b>.", "read": false, "ts": 1760000000000 } ]`

### `GET /api/notifications/unread/count` — any authenticated user
**200** → plain number of **unread notifications** (read/unread persists in the database).

### `POST /api/notifications/mark-read` — any authenticated user
Marks all of the current user's notifications as read.
**200** → `{ "success": true, "marked": 3 }`

### `GET /api/health` — public (ops)
`{ "status": "ok", "service": "dayflow-api" }`

---

## Error shape examples

```json
{ "success": false, "message": "Invalid email or password." }
{ "success": false, "message": "Authentication required. Please sign in." }
{ "success": false, "message": "HR/Admin access required." }
{ "success": false, "message": "You are not allowed to access another employee's data." }
```
