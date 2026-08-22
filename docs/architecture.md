# Dayflow — Architecture

## The big picture

```
┌────────────────────────────┐        fetch() + Bearer JWT        ┌──────────────────────────┐
│  FRONTEND (existing)       │  ────────────────────────────────▶ │  BACKEND (Flask)         │
│  HTML5 / CSS3 / JS         │                                    │  Blueprints per area     │
│  Bootstrap (vendored)      │ ◀────────────────────────────────  │  JWT auth + role checks  │
│                            │        JSON (exact shapes)         │  Validation layer        │
│  js/api.js = single        │                                    │  SQLAlchemy ORM          │
│  data access layer         │                                    │  SQLite (dev)            │
│  • useMock switch          │                                    └──────────────────────────┘
│  • automatic mock fallback │                                                │
└────────────────────────────┘                                                ▼
                                                                    ┌──────────────────────────┐
                                                                    │  database/               │
                                                                    │  schema.sql + seed.sql   │
                                                                    └──────────────────────────┘
```

## Frontend design (why the swap was painless)

Every page script (`auth.js`, `employee.js`, `hr.js`, `attendance.js`, `leave.js`, `payroll.js`)
calls **only** the `api` object in `frontend/js/api.js`. No page ever touches `fetch` or data directly.
`api.js` contains:

1. `API_CONFIG` — the mode switch (`useMock`, `baseUrl`, `allowMockFallback`)
2. `request()` — the fetch helper (JSON headers + `Authorization: Bearer`)
3. A clearly-marked **MOCK DATA SECTION** used only for offline demos
4. The `api` object — one method per backend endpoint

Connecting the backend therefore changed **zero page code**.

## Backend layering

```
backend/
├── app.py               Flask app factory, error handlers, auto DB init
├── config.py            env-driven config (dev/test), CORS, JWT, leave policy
├── extensions.py        shared SQLAlchemy + CORS instances
├── models/              6 related tables + JSON serializers (to_dict)
├── routes/              7 blueprints — one per API area, thin controllers
├── utils/auth.py        JWT create/decode, @login_required, @hr_required, self_or_hr
├── utils/validators.py  email/password/employee-id/date/salary validation
├── utils/responses.py   ApiError + consistent {"success": false, "message"} errors
└── seed.py              realistic demo data (mirrors the frontend's mock seed)
```

**Request flow:** route → auth decorator (JWT + role) → validators → SQLAlchemy models →
serializer (`to_dict`) → JSON. Errors raised anywhere become `{"success": false, "message": …}`
via the `ApiError` exception + global error handlers.

## Database (SQLite, dev)

```
employees 1─────1 users            (login credentials live only here — no duplication)
employees 1─────n attendance       (unique: employee_id + date; index on date)
employees 1─────n leaves           (CHECK constraints on type/status; index on status)
employees 1─────n payrolls         (unique: employee_id + month)
                      activities  (global feed, epoch-ms timestamps)
```

- Salary **structure** columns live on `employees`; `payrolls` stores generated payslips
  (last 3 months, refreshed from the current structure — identical to what the UI showed in mock mode).
- Sundays are weekly offs; working < 4 hours = half-day (both rules shared by frontend & backend).
- Full DDL: `database/schema.sql`.

## Authentication & authorization

1. `POST /api/auth/signup` — Werkzeug-hashed password, employee + user rows, checks duplicate email/ID.
2. `POST /api/auth/login` — verifies hash, returns a 24h HS256 JWT + the exact session object
   the frontend stores (`token, employeeId, name, email, role, photo`).
3. Every other route is wrapped in `@login_required` (or `@hr_required`).
4. `self_or_hr(employee_id)` guarantees employees can only read/write **their own** records —
   enforced on attendance, leaves, payroll and profile endpoints.

Roles: exactly the two the frontend uses — `employee` and `hr`.

## CORS

`Flask-CORS` covers `/api/*`. Origins come from `CORS_ORIGINS` (default `*`), fine for
token-based local development; set explicit origins in `.env` for production.

## Testing

`tests/` (pytest + Flask test client, in-memory SQLite) covers: signup/login/duplicates,
profile access control, check-in/out state machine (incl. duplicate + half-day),
leave validation/balance/approval/rejection, payroll retrieval & HR-only editing — 54 tests.
Run: `pytest tests/ -v` from the repo root.

## Git history

Commits are logically separated (frontend import → backend scaffold → models/seed →
routes → tests → docs → frontend connection switch) with meaningful messages, so
individual contributions are easy to review.
