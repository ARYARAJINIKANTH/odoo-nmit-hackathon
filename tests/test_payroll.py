"""Payroll workflows: retrieve, HR update, employee authorization limits."""
from extensions import db
from models.employee import Employee

NEW_SALARY = {"basic": 40000, "hra": 16000, "transport": 2400, "special": 6000,
              "pf": 4800, "pt": 200, "insurance": 1250}


def test_employee_payroll_shape(client, employee_account, employee_headers):
    res = client.get("/api/payroll?employee_id=E-8001", headers=employee_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert set(body) == {"structure", "monthlyGross", "net", "payslips"}

    s = body["structure"]
    assert body["monthlyGross"] == s["basic"] + s["hra"] + s["transport"] + s["special"]
    assert body["net"] == body["monthlyGross"] - (s["pf"] + s["pt"] + s["insurance"])

    assert len(body["payslips"]) == 3  # last 3 months
    latest = body["payslips"][-1]
    assert latest["status"] == "processing"      # current month
    assert body["payslips"][0]["status"] == "paid"
    assert body["payslips"][0]["paidOn"].endswith("-28")
    assert {"id", "month", "basic", "allowances", "deductions", "net", "status", "paidOn"} <= set(latest)


def test_hr_payroll_update_changes_net(app, client, employee_account, hr_headers):
    res = client.patch("/api/payroll/E-8001", headers=hr_headers, json=NEW_SALARY)
    assert res.status_code == 200
    assert res.get_json()["basic"] == 40000

    payroll = client.get("/api/payroll?employee_id=E-8001", headers=hr_headers).get_json()
    assert payroll["structure"]["basic"] == 40000
    expected_net = NEW_SALARY["basic"] + NEW_SALARY["hra"] + NEW_SALARY["transport"] + NEW_SALARY["special"] \
        - NEW_SALARY["pf"] - NEW_SALARY["pt"] - NEW_SALARY["insurance"]
    assert payroll["net"] == expected_net
    # payslips are refreshed from the new structure too
    assert payroll["payslips"][-1]["net"] == expected_net


def test_hr_payroll_update_validation(client, employee_account, hr_headers):
    bad_payloads = [
        {**NEW_SALARY, "basic": "abc"},       # non-numeric
        {**NEW_SALARY, "basic": -5},          # negative
        {**NEW_SALARY, "hra": None},          # missing/None
        {k: v for k, v in NEW_SALARY.items() if k != "pf"},  # field missing
    ]
    for payload in bad_payloads:
        res = client.patch("/api/payroll/E-8001", headers=hr_headers, json=payload)
        assert res.status_code == 400, payload
        assert res.get_json()["message"]

    res = client.patch("/api/payroll/E-8001", headers=hr_headers,
                       json={**NEW_SALARY, "basic": 0})
    assert res.status_code == 400
    assert res.get_json()["message"] == "Basic salary must be greater than zero."


def test_employee_cannot_edit_salary(client, employee_account, employee_headers):
    res = client.patch("/api/payroll/E-8001", headers=employee_headers, json=NEW_SALARY)
    assert res.status_code == 403


def test_employee_cannot_see_all_payroll(client, employee_account, employee_headers):
    assert client.get("/api/payroll/all", headers=employee_headers).status_code == 403


def test_hr_all_payroll_rows(client, employee_account, hr_headers):
    res = client.get("/api/payroll/all", headers=hr_headers)
    assert res.status_code == 200
    rows = res.get_json()
    assert rows and {"employeeId", "name", "department", "position", "photo",
                     "salary", "gross", "deductions", "net", "status"} <= set(rows[0])


def test_hr_stats_and_activities(client, employee_account, hr_account, hr_headers, employee_headers):
    stats = client.get("/api/hr/stats", headers=hr_headers)
    assert stats.status_code == 200
    body = stats.get_json()
    assert {"totalEmployees", "counts", "pendingLeaves", "monthlyPayroll", "trend"} <= set(body)
    assert len(body["trend"]) == 7
    assert client.get("/api/hr/stats", headers=employee_headers).status_code == 403

    acts = client.get("/api/activities?limit=5", headers=employee_headers)
    assert acts.status_code == 200
    activities = acts.get_json()
    assert isinstance(activities, list) and len(activities) <= 5
    if activities:
        assert {"ts", "icon", "text"} <= set(activities[0])
