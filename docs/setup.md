# Dayflow — Setup Guide

## 1. Prerequisites

- Python 3.10+ (`python --version`)
- A browser (any modern one)
- ~5 minutes

## 2. Backend (Flask API + SQLite)

```bash
cd backend

# create + activate a virtual environment
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate

# install dependencies
pip install -r requirements.txt

# (optional) configure environment
cp .env.example .env              # defaults work out of the box for local dev

# run — tables are created and demo data seeded automatically on first start
python app.py
```

API is now live at **http://localhost:5000** (check: http://localhost:5000/api/health).

Useful extras:

```bash
python seed.py --reset    # wipe + reseed the demo database
pytest ../tests -v        # run the API test suite (54 tests)
```

## 3. Frontend (static HTML/CSS/JS)

From the repo root (or `frontend/`):

```bash
cd frontend
python -m http.server 8000
# open http://localhost:8000
```

VS Code **Live Server** works too. No npm/node build step is required.

## 4. Demo credentials

| Role | Email | Password |
|---|---|---|
| HR / Admin | `priya@dayflow.com` | `password123` |
| Employee | `arjun@dayflow.com` | `password123` |

All seeded employees (`sneha@`, `rahul@`, `divya@`, `karthik@`) use the same password.
New accounts created on the signup page work immediately.

## 5. Frontend ⇄ backend connection (real data by default)

`frontend/js/api.js` has a single configuration switch at the top:

```js
const API_CONFIG = {
  baseUrl: 'http://localhost:5000',   // Flask server
  useMock: false,                     // USE_MOCK_DATA — default false (real backend)
};
```

- **Default (`useMock: false`)** — every page loads **real data from the Flask API + SQLite**.
- **No silent fallback.** If the backend is unreachable the UI shows
  `"Unable to connect to server. Please try again."` — it never fabricates data.
  Other mapped errors: 401 → "Session expired. Please log in again." (auto-redirect),
  403 → "You do not have permission to perform this action.", 404 → "Requested record
  was not found.", 5xx → "Something went wrong on the server." Conflicts (409) and
  validation errors show the server's actual reason.
- **Offline dev mock exists but must be explicitly enabled** (for UI work without the
  backend): add `?mock` to any page URL, or set `localStorage.dayflow_use_mock = '1'`.
  `?api` / `'0'` force real-API mode.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| "Unable to connect to server. Please try again." | Start the backend (`python app.py`) and retry — the UI never shows fake data |
| Login says invalid credentials | Re-seed: `python seed.py --reset` |
| "Your account has been deactivated" | An HR user must reactivate the account (Employees → reactivate) |
| 401 on every request | Token expired (24h default) — sign in again |
| CORS errors in console (rare) | Ensure `CORS_ORIGINS` in `backend/.env` allows your frontend origin |
| Tests fail with import errors | Run `pytest` from the repo root, after `pip install -r backend/requirements.txt` |

## 7. Resetting everything

```bash
rm backend/dayflow.db && cd backend && python app.py   # recreates + reseeds
```
