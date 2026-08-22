"""Pytest fixtures — app with in-memory SQLite + auth helpers."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest  # noqa: E402

from app import create_app  # noqa: E402
from extensions import db as _db  # noqa: E402
from models.attendance import Attendance  # noqa: E402
from models.employee import Employee  # noqa: E402
from models.user import User  # noqa: E402

TEST_PASSWORD = "password123"


def create_test_account(employee_id, name, email, role="employee"):
    """Create an Employee + User directly (no HTTP, no attendance history)."""
    from datetime import date

    employee = Employee(id=employee_id, name=name, department="Engineering",
                        position="Engineer", join_date=date(2025, 1, 1))
    _db.session.add(employee)
    _db.session.flush()
    user = User(email=email, role=role, employee_id=employee_id)
    user.set_password(TEST_PASSWORD)
    _db.session.add(user)
    _db.session.commit()
    return employee, user


def login_headers(client, email):
    res = client.post("/api/auth/login", json={"email": email, "password": TEST_PASSWORD})
    assert res.status_code == 200, f"login failed for {email}"
    return {"Authorization": f"Bearer {res.get_json()['token']}"}


@pytest.fixture()
def app():
    app = create_app("testing")
    with app.app_context():
        _db.create_all()
        yield app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def employee_account(app):
    return create_test_account("E-8001", "Test Employee", "employee@test.local", "employee")


@pytest.fixture()
def hr_account(app):
    return create_test_account("E-8000", "Test HR", "hr@test.local", "hr")


@pytest.fixture()
def employee_headers(client, employee_account):
    return login_headers(client, "employee@test.local")


@pytest.fixture()
def hr_headers(client, hr_account):
    return login_headers(client, "hr@test.local")
