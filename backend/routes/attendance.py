"""Attendance endpoints.

GET   /api/attendance/today?employee_id=      (self/HR)
POST  /api/attendance/check-in  {employee_id} (self/HR)
POST  /api/attendance/check-out {employee_id} (self/HR)
GET   /api/attendance?employee_id=&from=&to=  (self/HR)
GET   /api/attendance/all?date=&department=&status=   (HR)
GET   /api/attendance/all/week?monday=        (HR)
"""
from datetime import date, datetime, timedelta

from flask import Blueprint, current_app, g, jsonify, request

from extensions import db
from models.activity import log_activity
from models.attendance import Attendance
from models.employee import Employee
from utils.auth import hr_required, login_required, self_or_hr
from utils.responses import ApiError
from utils.validators import parse_date

attendance_bp = Blueprint("attendance", __name__, url_prefix="/api/attendance")


def _record_or_default(employee_id: str, day: date):
    """Existing row or an in-memory default (Sundays are weekly offs)."""
    record = Attendance.query.filter_by(employee_id=employee_id, date=day).first()
    if record is not None:
        return record, record.to_dict()
    default = {
        "employeeId": employee_id,
        "date": day.isoformat(),
        "status": Attendance.default_status_for(day),
        "checkIn": None,
        "checkOut": None,
        "mood": None,
    }
    return None, default


@attendance_bp.get("/today")
@login_required
def today():
    employee_id = request.args.get("employee_id") or g.employee_id
    self_or_hr(employee_id)
    if db.session.get(Employee, employee_id) is None:
        raise ApiError("Employee not found.", 404)
    _, data = _record_or_default(employee_id, date.today())
    return jsonify(data)


def _now_hhmm() -> str:
    return datetime.now().strftime("%H:%M")


@attendance_bp.post("/check-in")
@login_required
def check_in():
    data = request.get_json(silent=True) or {}
    employee_id = data.get("employee_id") or g.employee_id
    self_or_hr(employee_id)
    employee = db.session.get(Employee, employee_id)
    if employee is None:
        raise ApiError("Employee not found.", 404)

    record, _ = _record_or_default(employee_id, date.today())
    if record is None:
        record = Attendance(employee_id=employee_id, date=date.today())
        db.session.add(record)

    if record.status == "weekoff":
        raise ApiError("Today is a weekly off — no attendance needed.")
    if record.check_in:
        raise ApiError("You have already checked in today.")

    record.check_in = _now_hhmm()
    record.status = "present"
    record.mood = data.get("mood")
    
    mood_emoji = f" (Mood: {record.mood})" if record.mood else ""
    log_activity("clockIn", f"<b>{employee.name}</b> checked in at {record.check_in}{mood_emoji}.")
    db.session.commit()
    return jsonify(record.to_dict())


@attendance_bp.post("/check-out")
@login_required
def check_out():
    data = request.get_json(silent=True) or {}
    employee_id = data.get("employee_id") or g.employee_id
    self_or_hr(employee_id)
    employee = db.session.get(Employee, employee_id)
    if employee is None:
        raise ApiError("Employee not found.", 404)

    record = Attendance.query.filter_by(employee_id=employee_id, date=date.today()).first()
    if record is None or not record.check_in:
        raise ApiError("Please check in before checking out.")
    if record.check_out:
        raise ApiError("You have already checked out today.")

    record.check_out = _now_hhmm()
    start = datetime.strptime(record.check_in, "%H:%M")
    end = datetime.strptime(record.check_out, "%H:%M")
    worked_minutes = int((end - start).total_seconds() // 60)
    if worked_minutes < current_app.config["HALF_DAY_THRESHOLD_MINUTES"]:
        record.status = "half-day"  # under 4 worked hours

    log_activity("clockOut", f"<b>{employee.name}</b> checked out at {record.check_out}.")
    db.session.commit()
    return jsonify(record.to_dict())


@attendance_bp.get("")
@login_required
def list_attendance():
    employee_id = request.args.get("employee_id") or g.employee_id
    self_or_hr(employee_id)

    from_date = parse_date(request.args.get("from"))
    to_date = parse_date(request.args.get("to"))

    query = Attendance.query.filter_by(employee_id=employee_id)
    if from_date:
        query = query.filter(Attendance.date >= from_date)
    if to_date:
        query = query.filter(Attendance.date <= to_date)
    records = query.order_by(Attendance.date.desc()).all()
    return jsonify([r.to_dict() for r in records])


def _employee_brief(employee: Employee) -> dict:
    return {
        "id": employee.id, "name": employee.name, "department": employee.department,
        "position": employee.position, "photo": employee.photo,
    }


@attendance_bp.get("/all")
@hr_required
def all_attendance():
    day = parse_date(request.args.get("date")) or date.today()
    department = request.args.get("department", "all")
    status = request.args.get("status", "all")

    employees = Employee.query.order_by(Employee.name).all()

    # counts are computed BEFORE department/status filtering (frontend mock parity)
    counts = {"present": 0, "absent": 0, "half-day": 0, "leave": 0, "not-marked": 0, "weekoff": 0}
    rows = []
    for employee in employees:
        _, data = _record_or_default(employee.id, day)
        counts[data["status"]] = counts.get(data["status"], 0) + 1
        if department and department != "all" and employee.department != department:
            continue
        if status and status != "all" and data["status"] != status:
            continue
        rows.append({**data, "employee": _employee_brief(employee)})

    return jsonify({"rows": rows, "counts": counts})


@attendance_bp.get("/all/week")
@hr_required
def week_attendance():
    monday = parse_date(request.args.get("monday"))
    if monday is None:
        monday = date.today() - timedelta(days=date.today().weekday())
    else:
        monday -= timedelta(days=monday.weekday())  # floor to the week's Monday

    days = [monday + timedelta(days=i) for i in range(7)]
    employees = Employee.query.order_by(Employee.name).all()

    rows = []
    for employee in employees:
        day_cells = []
        for day in days:
            _, data = _record_or_default(employee.id, day)
            day_cells.append({
                "date": data["date"], "status": data["status"],
                "checkIn": data["checkIn"], "checkOut": data["checkOut"],
            })
        rows.append({"employee": _employee_brief(employee), "days": day_cells})

    return jsonify({
        "monday": monday.isoformat(),
        "days": [d.isoformat() for d in days],
        "rows": rows,
    })
