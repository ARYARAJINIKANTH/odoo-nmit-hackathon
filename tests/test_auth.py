"""Authentication workflows: signup, login, invalid login, duplicate signup."""

def test_signup_success(client):
    res = client.post("/api/auth/signup", json={
        "employeeId": "E-9001", "name": "New Employee", "email": "new@test.local",
        "password": "Secret!123", "role": "employee"
    })
    assert res.status_code == 201
    assert res.get_json()["success"] is True


def test_signup_validates_fields(client):
    bad = [
        # invalid ID
        {"employeeId": "X", "name": "New Employee", "email": "new@test.local", "password": "Secret!123", "role": "employee"},
        # invalid name
        {"employeeId": "E-9001", "name": "Ab", "email": "new@test.local", "password": "Secret!123", "role": "employee"},
        # invalid email
        {"employeeId": "E-9001", "name": "New Employee", "email": "not-an-email", "password": "Secret!123", "role": "employee"},
        # invalid password
        {"employeeId": "E-9001", "name": "New Employee", "email": "new@test.local", "password": "123", "role": "employee"},
        # invalid role
        {"employeeId": "E-9001", "name": "New Employee", "email": "new@test.local", "password": "Secret!123", "role": "manager"},
        # missing hr key
        {"employeeId": "E-9001", "name": "New Employee", "email": "new@test.local", "password": "Secret!123", "role": "hr"},
    ]
    for payload in bad:
        res = client.post("/api/auth/signup", json=payload)
        assert res.status_code == 400, payload
        body = res.get_json()
        assert body["success"] is False and body["message"]


def test_signup_duplicate_email(client, employee_account):
    res = client.post("/api/auth/signup", json={
        "employeeId": "E-9002", "name": "Copy Cat", "email": "employee@test.local",
        "password": "Secret!123", "role": "employee"
    })
    assert res.status_code == 409
    assert res.get_json()["message"] == "An account with this email already exists."


def test_signup_duplicate_employee_id(client, employee_account):
    res = client.post("/api/auth/signup", json={
        "employeeId": "E-8001", "name": "Copy Cat", "email": "copy@test.local",
        "password": "Secret!123", "role": "employee"
    })
    assert res.status_code == 409
    assert res.get_json()["message"] == "This Employee ID is already registered."


def test_login_success_shape(client, employee_account):
    res = client.post("/api/auth/login", json={
        "email": "employee@test.local", "password": "password123", # uses TEST_PASSWORD from conftest
    })
    assert res.status_code == 200
    body = res.get_json()
    # exact keys the frontend stores in its session
    assert set(body) == {"token", "employeeId", "name", "email", "role", "photo"}
    assert body["employeeId"] == "E-8001"
    assert body["role"] == "employee"
    assert body["token"]


def test_login_invalid_password(client, employee_account):
    res = client.post("/api/auth/login", json={
        "email": "employee@test.local", "password": "wrong-password",
    })
    assert res.status_code == 401
    assert res.get_json()["message"] == "Invalid email or password."


def test_login_unknown_email(client):
    res = client.post("/api/auth/login", json={"email": "ghost@test.local", "password": "x12345"})
    assert res.status_code == 401


def test_password_is_hashed(app, employee_account):
    user = employee_account[1]
    assert user.password_hash != "password123"
    assert "password123" not in user.password_hash


def test_protected_route_requires_token(client):
    res = client.get("/api/hr/stats")
    assert res.status_code == 401
    assert res.get_json()["message"]


def test_invalid_token_rejected(client):
    res = client.get("/api/hr/stats", headers={"Authorization": "Bearer not.a.jwt"})
    assert res.status_code == 401
