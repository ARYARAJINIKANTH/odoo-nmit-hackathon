"""Employee workflows: retrieve, update profile, unauthorized access."""


def test_get_own_profile(client, employee_account, employee_headers):
    res = client.get("/api/employees/E-8001/profile", headers=employee_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["id"] == "E-8001"
    assert body["email"] == "employee@test.local"
    assert set(body["salary"]) == {"basic", "hra", "transport", "special", "pf", "pt", "insurance"}
    assert isinstance(body["documents"], list)


def test_employee_cannot_read_others_profile(client, employee_account, hr_account, employee_headers):
    res = client.get("/api/employees/E-8000/profile", headers=employee_headers)
    assert res.status_code == 403
    assert res.get_json()["success"] is False


def test_hr_can_read_any_profile(client, employee_account, hr_headers):
    res = client.get("/api/employees/E-8001/profile", headers=hr_headers)
    assert res.status_code == 200
    assert res.get_json()["name"] == "Test Employee"


def test_update_own_profile_phone_address(client, employee_account, employee_headers):
    res = client.patch("/api/employees/E-8001/profile", headers=employee_headers,
                       json={"phone": "+91 90000 00000", "address": "42 Test Street, Chennai"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["phone"] == "+91 90000 00000"
    assert body["address"] == "42 Test Street, Chennai"


def test_profile_update_cannot_change_salary(client, employee_account, employee_headers):
    """Whitelist check: spoofed salary keys must be ignored."""
    res = client.patch("/api/employees/E-8001/profile", headers=employee_headers,
                       json={"phone": "+91 90000 00001", "salary": {"basic": 999999}})
    assert res.status_code == 200
    assert res.get_json()["salary"]["basic"] == 0  # unchanged (default)


def test_profile_update_validation(client, employee_account, employee_headers):
    res = client.patch("/api/employees/E-8001/profile", headers=employee_headers,
                       json={"phone": "12"})
    assert res.status_code == 400


def test_employee_cannot_update_others_profile(client, employee_account, hr_account, employee_headers):
    res = client.patch("/api/employees/E-8000/profile", headers=employee_headers,
                       json={"phone": "+91 90000 11111"})
    assert res.status_code == 403


def test_employee_list_is_hr_only(client, employee_account, employee_headers, hr_headers):
    assert client.get("/api/employees", headers=employee_headers).status_code == 403
    res = client.get("/api/employees", headers=hr_headers)
    assert res.status_code == 200
    assert isinstance(res.get_json(), list)


def test_employee_search_and_department_filter(client, app, hr_headers):
    from conftest import create_test_account

    create_test_account("E-8002", "Alpha Sales", "alpha@test.local")
    res = client.get("/api/employees?search=alpha", headers=hr_headers)
    body = res.get_json()
    assert len(body) == 1 and body[0]["name"] == "Alpha Sales"

    res = client.get("/api/employees?department=Engineering", headers=hr_headers)
    assert all(e["department"] == "Engineering" for e in res.get_json())


def test_hr_edit_employee(client, employee_account, hr_headers):
    res = client.patch("/api/employees/E-8001", headers=hr_headers,
                       json={"department": "Finance", "position": "Accountant", "joinDate": "2025-03-01"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["department"] == "Finance"
    assert body["position"] == "Accountant"
    assert body["joinDate"] == "2025-03-01"


def test_hr_edit_duplicate_email_rejected(client, employee_account, hr_account, hr_headers):
    res = client.patch("/api/employees/E-8001", headers=hr_headers,
                       json={"email": "hr@test.local"})
    assert res.status_code == 409


def test_unknown_employee_404(client, hr_headers):
    assert client.get("/api/employees/E-9999", headers=hr_headers).status_code == 404


def test_hr_add_employee_creates_login_account(client, hr_headers):
    res = client.post("/api/employees", headers=hr_headers, json={
        "employeeId": "E-8100", "name": "Added By HR", "email": "added@test.local",
        "password": "start123", "role": "employee", "department": "Sales", "position": "Associate",
    })
    assert res.status_code == 201
    body = res.get_json()
    assert body["id"] == "E-8100" and body["department"] == "Sales"

    # immediately visible in the directory and able to log in
    listing = client.get("/api/employees?search=added", headers=hr_headers).get_json()
    assert any(e["id"] == "E-8100" for e in listing)
    login = client.post("/api/auth/login", json={"email": "added@test.local", "password": "start123"})
    assert login.status_code == 200


def test_hr_add_employee_validation(client, employee_account, hr_headers):
    bad = [
        {"employeeId": "X!", "name": "Bad Id", "email": "b@test.local", "password": "start123"},
        {"employeeId": "E-8101", "name": "Bad Email", "email": "nope", "password": "start123"},
        {"employeeId": "E-8101", "name": "Bad Password", "email": "c@test.local", "password": "123"},
        {"employeeId": "E-8101", "name": "Bad Role", "email": "d@test.local", "password": "start123", "role": "boss"},
        {"employeeId": "E-8001", "name": "Dup Id", "email": "e@test.local", "password": "start123"},
        {"employeeId": "E-8101", "name": "Dup Email", "email": "employee@test.local", "password": "start123"},
    ]
    for payload in bad:
        res = client.post("/api/employees", headers=hr_headers, json=payload)
        assert res.status_code in (400, 409), payload


def test_deactivate_blocks_login_and_reactivate_restores(client, employee_account, hr_headers):
    res = client.patch("/api/employees/E-8001/status", headers=hr_headers, json={"active": False})
    assert res.status_code == 200 and res.get_json()["active"] is False

    login = client.post("/api/auth/login", json={"email": "employee@test.local", "password": "password123"})
    assert login.status_code == 403
    assert "deactivated" in login.get_json()["message"]

    listing = client.get("/api/employees?search=test employee", headers=hr_headers).get_json()
    assert listing[0]["active"] is False  # visible to HR with inactive flag

    client.patch("/api/employees/E-8001/status", headers=hr_headers, json={"active": True})
    login = client.post("/api/auth/login", json={"email": "employee@test.local", "password": "password123"})
    assert login.status_code == 200


def test_hr_cannot_deactivate_own_account(client, hr_account, hr_headers):
    res = client.patch("/api/employees/E-8000/status", headers=hr_headers, json={"active": False})
    assert res.status_code == 400
    assert "own account" in res.get_json()["message"]


def test_employee_cannot_add_or_deactivate(client, employee_account, employee_headers):
    assert client.post("/api/employees", headers=employee_headers, json={}).status_code == 403
    res = client.patch("/api/employees/E-8001/status", headers=employee_headers, json={"active": False})
    assert res.status_code == 403
