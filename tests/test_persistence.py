"""Data-persistence tests: everything must survive a full backend "restart".

A restart is simulated by building a completely fresh Flask app + engine on the
SAME SQLite file — exactly what happens when `python app.py` is stopped and
started again.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app import create_app  # noqa: E402
from config import DevelopmentConfig  # noqa: E402
from extensions import db as _db  # noqa: E402


def _login(client, email, password="password123"):
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"login failed after restart for {email}"
    return {"Authorization": f"Bearer {res.get_json()['token']}"}


def _shutdown(app):
    """Release the SQLite file the way a real process shutdown would."""
    with app.app_context():
        _db.session.remove()
        _db.engine.dispose()


def test_all_data_survives_backend_restart(tmp_path, monkeypatch):
    db_file = tmp_path / "restart.db"
    monkeypatch.setattr(DevelopmentConfig, "SQLALCHEMY_DATABASE_URI", f"sqlite:///{db_file}")
    monkeypatch.setattr(DevelopmentConfig, "AUTO_INIT_DB", True)
    monkeypatch.setattr(DevelopmentConfig, "AUTO_SEED", False)

    # ---- run 1: create data ----
    app1 = create_app("development")
    with app1.test_client() as c1:
        created = c1.post("/api/auth/signup", json={
            "employeeId": "E-7001", "name": "Persist Employee", "email": "persist@test.local",
            "password": "secret123", "role": "employee",
        })
        assert created.status_code == 201
        headers = _login(c1, "persist@test.local", "secret123")
        assert c1.post("/api/attendance/check-in", headers=headers, json={}).status_code == 200
        leave = c1.post("/api/leaves", headers=headers, json={
            "employee_id": "E-7001", "type": "paid",
            "from": "2031-01-06", "to": "2031-01-07", "remarks": "persist me",
        })
        assert leave.status_code == 201

        # HR decides it before the "restart"
        hr_created = c1.post("/api/auth/signup", json={
            "employeeId": "E-7000", "name": "Persist HR", "email": "hr-persist@test.local",
            "password": "secret123", "role": "hr",
        })
        assert hr_created.status_code == 201
        hr = _login(c1, "hr-persist@test.local", "secret123")
        assert c1.patch(f"/api/leaves/{leave.get_json()['id']}/approved", headers=hr,
                        json={"comment": "pre-restart"}).status_code == 200
    _shutdown(app1)  # release the file like a real shutdown

    # ---- run 2: fresh process on the same database file ----
    assert db_file.exists()
    app2 = create_app("development")
    with app2.test_client() as c2:
        # signup persisted: same credentials log in
        headers = _login(c2, "persist@test.local", "secret123")

        profile = c2.get("/api/employees/E-7001/profile", headers=headers).get_json()
        assert profile["name"] == "Persist Employee"

        attendance = c2.get("/api/attendance?employee_id=E-7001", headers=headers).get_json()
        assert any(a["checkIn"] for a in attendance), "check-in must survive restart"

        leaves = c2.get("/api/leaves?employee_id=E-7001", headers=headers).get_json()
        assert leaves[0]["status"] == "approved" and leaves[0]["hrComment"] == "pre-restart"

        payroll = c2.get("/api/payroll?employee_id=E-7001", headers=headers).get_json()
        assert len(payroll["payslips"]) == 3

        # welcome (signup) + leave-decision notifications, both still unread after restart
        assert c2.get("/api/notifications/unread/count", headers=headers).get_json() == 2


def test_case_and_space_normalised_consistently(tmp_path, monkeypatch):
    """Signup with Mixed.Case + spaces, then login with different casing/spacing."""
    db_file = tmp_path / "case.db"
    monkeypatch.setattr(DevelopmentConfig, "SQLALCHEMY_DATABASE_URI", f"sqlite:///{db_file}")
    monkeypatch.setattr(DevelopmentConfig, "AUTO_INIT_DB", True)
    monkeypatch.setattr(DevelopmentConfig, "AUTO_SEED", False)

    app1 = create_app("development")
    with app1.test_client() as c1:
        res = c1.post("/api/auth/signup", json={
            "employeeId": "E-7002", "name": "Case Test", "email": "  Mixed.Case@TEST.local  ",
            "password": "secret123", "role": "employee",
        })
        assert res.status_code == 201
        # duplicate detection must be case-insensitive
        dup = c1.post("/api/auth/signup", json={
            "employeeId": "E-7003", "name": "Case Dup", "email": "mixed.case@test.LOCAL",
            "password": "secret123", "role": "employee",
        })
        assert dup.status_code == 409
    _shutdown(app1)

    app2 = create_app("development")
    with app2.test_client() as c2:
        login = c2.post("/api/auth/login", json={
            "email": "  mixed.case@test.Local ", "password": "secret123",
        })
        assert login.status_code == 200
        assert login.get_json()["email"] == "mixed.case@test.local"
        # wrong password still rejected (verification never bypassed)
        bad = c2.post("/api/auth/login", json={"email": "mixed.case@test.local", "password": "secret12"})
        assert bad.status_code == 401
