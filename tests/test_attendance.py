"""Attendance workflows: check-in, duplicate check-in, check-out, invalid check-out."""
from datetime import date, datetime, timedelta

from extensions import db
from models.attendance import Attendance


def test_today_defaults_to_not_marked(client, employee_account, employee_headers):
    res = client.get("/api/attendance/today?employee_id=E-8001", headers=employee_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["employeeId"] == "E-8001"
    assert body["date"] == date.today().isoformat()
    expected = "weekoff" if date.today().weekday() == 6 else "not-marked"
    assert body["status"] == expected
    assert body["checkIn"] is None and body["checkOut"] is None


def test_check_in(client, employee_account, employee_headers):
    res = client.post("/api/attendance/check-in", headers=employee_headers,
                      json={"employee_id": "E-8001"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "present"
    assert body["checkIn"] and len(body["checkIn"]) == 5  # HH:MM


def test_duplicate_check_in_blocked(client, employee_account, employee_headers):
    client.post("/api/attendance/check-in", headers=employee_headers, json={"employee_id": "E-8001"})
    res = client.post("/api/attendance/check-in", headers=employee_headers, json={"employee_id": "E-8001"})
    assert res.status_code == 400
    assert res.get_json()["message"] == "You have already checked in today."


def test_check_out_without_check_in(client, employee_account, employee_headers):
    res = client.post("/api/attendance/check-out", headers=employee_headers,
                      json={"employee_id": "E-8001"})
    assert res.status_code == 400
    assert res.get_json()["message"] == "Please check in before checking out."


def test_check_out(client, employee_account, employee_headers):
    client.post("/api/attendance/check-in", headers=employee_headers, json={"employee_id": "E-8001"})
    res = client.post("/api/attendance/check-out", headers=employee_headers, json={"employee_id": "E-8001"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["checkOut"]
    assert body["status"] in ("present", "half-day")


def test_short_day_becomes_half_day(app, client, employee_account, employee_headers):
    """Under 4 worked hours -> half-day (frontend mock rule)."""
    client.post("/api/attendance/check-in", headers=employee_headers, json={"employee_id": "E-8001"})
    with app.app_context():
        row = db.session.query(Attendance).filter_by(employee_id="E-8001", date=date.today()).one()
        row.check_in = (datetime.now() - timedelta(hours=2)).strftime("%H:%M")  # 2h ago
        db.session.commit()

    res = client.post("/api/attendance/check-out", headers=employee_headers, json={"employee_id": "E-8001"})
    assert res.get_json()["status"] == "half-day"


def test_duplicate_check_out_blocked(client, employee_account, employee_headers):
    client.post("/api/attendance/check-in", headers=employee_headers, json={"employee_id": "E-8001"})
    client.post("/api/attendance/check-out", headers=employee_headers, json={"employee_id": "E-8001"})
    res = client.post("/api/attendance/check-out", headers=employee_headers, json={"employee_id": "E-8001"})
    assert res.status_code == 400
    assert res.get_json()["message"] == "You have already checked out today."


def test_range_query_tolerates_undefined_params(client, employee_account, employee_headers):
    """Frontend can send from=undefined&to=undefined — must not break."""
    res = client.get("/api/attendance?employee_id=E-8001&from=undefined&to=undefined",
                     headers=employee_headers)
    assert res.status_code == 200
    assert isinstance(res.get_json(), list)


def test_employee_cannot_read_others_attendance(client, employee_account, hr_account, employee_headers):
    res = client.get("/api/attendance?employee_id=E-8000", headers=employee_headers)
    assert res.status_code == 403


def test_hr_daily_view_counts(client, employee_account, hr_account, hr_headers):
    res = client.get("/api/attendance/all?date=" + date.today().isoformat(), headers=hr_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert set(body) == {"rows", "counts"}
    assert set(body["counts"]) == {"present", "absent", "half-day", "leave", "not-marked", "weekoff"}
    assert body["rows"][0]["employee"]["id"]  # employee embedded


def test_hr_weekly_view(client, employee_account, hr_headers):
    res = client.get("/api/attendance/all/week?monday=" + date.today().isoformat(),
                     headers=hr_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert len(body["days"]) == 7
    monday = date.fromisoformat(body["monday"])
    assert monday.weekday() == 0  # always floored to Monday
    assert body["rows"] and len(body["rows"][0]["days"]) == 7


def test_attendance_all_is_hr_only(client, employee_account, employee_headers):
    assert client.get("/api/attendance/all", headers=employee_headers).status_code == 403
    assert client.get("/api/attendance/all/week", headers=employee_headers).status_code == 403
