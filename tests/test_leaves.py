"""Leave workflows: apply, invalid dates, balance, HR approval, HR rejection."""
from datetime import date, timedelta

from extensions import db
from models.attendance import Attendance
from models.leave import Leave

TODAY = date.today()


def future_range(days_ahead=14, length=3):
    start = TODAY + timedelta(days=days_ahead)
    return start.isoformat(), (start + timedelta(days=length - 1)).isoformat(), start


def apply(client, headers, **overrides):
    payload = {"employee_id": "E-8001", "type": "paid", "from": None, "to": None, "remarks": "test"}
    payload.update(overrides)
    return client.post("/api/leaves", headers=headers, json=payload)


def working_days(from_d, to_d):
    days, cursor = 0, from_d
    while cursor <= to_d:
        if cursor.weekday() != 6:
            days += 1
        cursor += timedelta(days=1)
    return days


def test_apply_leave(client, employee_account, employee_headers):
    start, end, start_d = future_range()
    expected_days = working_days(start_d, start_d + timedelta(days=2))
    res = apply(client, employee_headers, frm=None, **{"from": start, "to": end})
    assert res.status_code == 201
    body = res.get_json()
    assert body["status"] == "pending"
    assert body["days"] == expected_days  # Sundays excluded
    assert body["from"] == start and body["to"] == end
    assert body["appliedAt"] > 1_600_000_000_000  # epoch millis


def test_invalid_date_range_rejected(client, employee_account, employee_headers):
    res = apply(client, employee_headers, **{"from": "2030-05-10", "to": "2030-05-01"})
    assert res.status_code == 400
    assert res.get_json()["message"] == "End date cannot be before the start date."


def test_all_sunday_range_rejected(client, employee_account, employee_headers):
    # find the next Sunday, apply for that single day
    d = TODAY
    while d.weekday() != 6:
        d += timedelta(days=1)
    res = apply(client, employee_headers, **{"from": d.isoformat(), "to": d.isoformat()})
    assert res.status_code == 400
    assert "no working days" in res.get_json()["message"]


def test_insufficient_balance_rejected(client, employee_account, employee_headers):
    start = TODAY + timedelta(days=30)
    end = TODAY + timedelta(days=80)  # ~40+ working days > 18 paid
    res = apply(client, employee_headers, **{"from": start.isoformat(), "to": end.isoformat()})
    assert res.status_code == 400
    assert res.get_json()["message"].startswith("Insufficient paid leave balance")


def test_overlapping_leave_rejected(client, employee_account, employee_headers):
    start, end, _ = future_range(20, 4)
    assert apply(client, employee_headers, **{"from": start, "to": end}).status_code == 201
    res = apply(client, employee_headers, **{"from": start, "to": end})
    assert res.status_code == 400
    assert "overlaps" in res.get_json()["message"]


def test_balance_counts_pending_and_approved(client, employee_account, employee_headers):
    start, end, start_d = future_range(40, 4)
    expected_days = working_days(start_d, start_d + timedelta(days=3))
    assert apply(client, employee_headers, **{"from": start, "to": end}).status_code == 201
    res = client.get("/api/leaves/balance?employee_id=E-8001", headers=employee_headers)
    body = res.get_json()
    assert set(body) == {"paid", "sick", "unpaid"}
    assert body["paid"]["used"] == expected_days
    assert body["paid"]["available"] == body["paid"]["total"] - expected_days
    assert set(body["paid"]) == {"total", "used", "available"}


def test_my_leave_history(client, employee_account, employee_headers):
    start, end, _ = future_range(50, 2)
    apply(client, employee_headers, **{"from": start, "to": end})
    res = client.get("/api/leaves?employee_id=E-8001", headers=employee_headers)
    assert res.status_code == 200
    leaves = res.get_json()
    assert leaves and leaves[0]["status"] == "pending"


def test_hr_approve_leave_blocks_calendar(app, client, employee_account, hr_headers, employee_headers):
    today_iso = TODAY.isoformat()
    client.post("/api/attendance/check-in", headers=employee_headers, json={"employee_id": "E-8001"})
    res = apply(client, employee_headers, type="sick", **{"from": today_iso, "to": today_iso})
    leave_id = res.get_json()["id"]

    res = client.patch(f"/api/leaves/{leave_id}/approved", headers=hr_headers,
                       json={"comment": "Get well soon"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "approved"
    assert body["hrComment"] == "Get well soon"

    with app.app_context():
        row = db.session.query(Attendance).filter_by(employee_id="E-8001", date=TODAY).one()
        assert row.status == "leave"
        assert row.check_in is None and row.check_out is None


def test_hr_reject_leave(client, employee_account, hr_headers, employee_headers):
    start, end, _ = future_range(60, 2)
    leave_id = apply(client, employee_headers, **{"from": start, "to": end}).get_json()["id"]

    res = client.patch(f"/api/leaves/{leave_id}/rejected", headers=hr_headers, json={"comment": "Busy week"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "rejected"
    assert body["hrComment"] == "Busy week"


def test_double_decision_blocked(client, employee_account, hr_headers, employee_headers):
    start, end, _ = future_range(70, 2)
    leave_id = apply(client, employee_headers, **{"from": start, "to": end}).get_json()["id"]
    client.patch(f"/api/leaves/{leave_id}/approved", headers=hr_headers, json={})
    res = client.patch(f"/api/leaves/{leave_id}/rejected", headers=hr_headers, json={})
    assert res.status_code == 400
    assert res.get_json()["message"] == "This request has already been processed."


def test_decision_is_hr_only(client, employee_account, employee_headers):
    start, end, _ = future_range(80, 2)
    leave_id = apply(client, employee_headers, **{"from": start, "to": end}).get_json()["id"]
    res = client.patch(f"/api/leaves/{leave_id}/approved", headers=employee_headers, json={})
    assert res.status_code == 403


def test_all_leaves_hr_view_enriched(client, employee_account, hr_headers, employee_headers):
    start, end, _ = future_range(90, 1)
    apply(client, employee_headers, **{"from": start, "to": end})
    res = client.get("/api/leaves/all?status=pending", headers=hr_headers)
    assert res.status_code == 200
    rows = res.get_json()
    assert rows and {"employeeName", "department", "position"} <= set(rows[0])
    assert client.get("/api/leaves/all", headers=employee_headers).status_code == 403


def test_notifications_created_and_persisted(app, client, employee_account, hr_account, hr_headers, employee_headers):
    """Leave submitted → HR notification; decision → employee notification; read state persists."""
    start, end, _ = future_range(95, 1)
    apply(client, employee_headers, **{"from": start, "to": end})

    # HR gets an unread notification about the new request
    assert client.get("/api/notifications/unread/count", headers=hr_headers).get_json() == 1
    hr_items = client.get("/api/notifications", headers=hr_headers).get_json()
    assert hr_items[0]["read"] is False and "applied for" in hr_items[0]["text"]
    assert {"id", "icon", "text", "read", "ts"} <= set(hr_items[0])

    # HR marks it read — persisted in the database
    marked = client.post("/api/notifications/mark-read", headers=hr_headers)
    assert marked.status_code == 200 and marked.get_json()["marked"] == 1
    assert client.get("/api/notifications/unread/count", headers=hr_headers).get_json() == 0
    assert client.get("/api/notifications", headers=hr_headers).get_json()[0]["read"] is True

    # decision notifies the employee (not HR's own count)
    leave_id = client.get("/api/leaves/all?status=pending", headers=hr_headers).get_json()[0]["id"]
    client.patch(f"/api/leaves/{leave_id}/approved", headers=hr_headers, json={"comment": "ok"})
    assert client.get("/api/notifications/unread/count", headers=employee_headers).get_json() == 1
    emp_items = client.get("/api/notifications", headers=employee_headers).get_json()
    assert "was <b>approved</b>" in emp_items[0]["text"] and "HR comment: ok" in emp_items[0]["text"]


def test_leave_decision_accepts_put(client, employee_account, hr_headers, employee_headers):
    start, end, _ = future_range(85, 2)
    leave_id = apply(client, employee_headers, **{"from": start, "to": end}).get_json()["id"]
    res = client.put(f"/api/leaves/{leave_id}/rejected", headers=hr_headers, json={})
    assert res.status_code == 200 and res.get_json()["status"] == "rejected"
