"""HR dashboard endpoint — GET /api/hr/stats (HR only).

Response shape consumed by frontend/js/hr.js:
{ totalEmployees, counts: {present, absent, half-day, leave, not-marked, weekoff},
  pendingLeaves, monthlyPayroll, trend: [{date, label, pct} x 7] }
"""
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify

from extensions import db
from models.attendance import Attendance
from models.employee import Employee
from models.leave import Leave
from utils.auth import hr_required

hr_bp = Blueprint("hr", __name__, url_prefix="/api/hr")


def _day_rows(day: date):
    """(employee, status) for everyone on `day`, synthesising missing rows."""
    existing = {a.employee_id: a.status for a in Attendance.query.filter_by(date=day).all()}
    for employee in Employee.query.all():
        yield employee, existing.get(employee.id, Attendance.default_status_for(day))


@hr_bp.get("/stats")
@hr_required
def stats():
    today = date.today()

    counts = {"present": 0, "absent": 0, "half-day": 0, "leave": 0, "not-marked": 0, "weekoff": 0}
    monthly_payroll = 0
    for employee, status in _day_rows(today):
        counts[status] = counts.get(status, 0) + 1
        monthly_payroll += employee.net_salary()

    # last 7 days attendance trend (oldest -> today), like the frontend mock
    trend = []
    day_labels = "MTWTFSS"  # Mon..Sun single letters
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        rows = [status for _, status in _day_rows(day)]
        working = [s for s in rows if s != "weekoff"]
        presentish = sum(1 for s in working if s in ("present", "half-day"))
        pct = round(presentish / len(working) * 100) if working else 0
        trend.append({"date": day.isoformat(), "label": day_labels[day.weekday()], "pct": pct})

    return jsonify({
        "totalEmployees": Employee.query.count(),
        "counts": counts,
        "pendingLeaves": Leave.query.filter_by(status="pending").count(),
        "monthlyPayroll": monthly_payroll,
        "trend": trend,
    })
