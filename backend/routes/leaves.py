"""Leave endpoints.

POST   /api/leaves                         {employee_id, type, from, to, remarks}
GET    /api/leaves?employee_id=            (self/HR)
GET    /api/leaves/all?status=             (HR)
GET    /api/leaves/balance?employee_id=    (self/HR)
PATCH  /api/leaves/<id>/approved {comment} (HR)
PATCH  /api/leaves/<id>/rejected {comment} (HR)
"""
from datetime import date, datetime, timedelta

from flask import Blueprint, current_app, g, jsonify, request

from extensions import db
from models.activity import log_activity
from models.attendance import Attendance
from models.employee import Employee
from models.leave import Leave
from models.notification import notify, notify_all_hr
from utils.auth import hr_required, login_required, self_or_hr
from utils.email import send_leave_alert, generate_ics
from utils.responses import ApiError
from utils.validators import LEAVE_TYPES, parse_date

leaves_bp = Blueprint("leaves", __name__, url_prefix="/api/leaves")


def working_days_between(from_date: date, to_date: date) -> int:
    days, cursor = 0, from_date
    while cursor <= to_date:
        if cursor.weekday() != 6:  # Sundays excluded
            days += 1
        cursor += timedelta(days=1)
    return days


def leave_balance(employee_id: str) -> dict:
    """{type: {total, used, available}} — used counts approved AND pending (mock parity)."""
    policy = current_app.config["LEAVE_POLICY"]
    balance = {}
    for leave_type in LEAVE_TYPES:
        rows = Leave.query.filter(
            Leave.employee_id == employee_id,
            Leave.type == leave_type,
            Leave.status.in_(("approved", "pending")),
        ).all()
        used = sum(r.days for r in rows)
        total = policy[leave_type]
        balance[leave_type] = {"total": total, "used": used, "available": max(0, total - used)}
    return balance


def _next_leave_id() -> str:
    max_num = 2000
    for leave in Leave.query.with_entities(Leave.id):
        try:
            max_num = max(max_num, int(leave.id.split("-")[1]))
        except (IndexError, ValueError):
            continue
    return f"L-{max_num + 1}"


def _get_leave_or_404(leave_id: str) -> Leave:
    leave = db.session.get(Leave, leave_id)
    if leave is None:
        raise ApiError("Leave request not found.", 404)
    return leave


@leaves_bp.post("")
@login_required
def apply_leave():
    data = request.get_json(silent=True) or {}
    employee_id = data.get("employee_id") or g.employee_id
    self_or_hr(employee_id)

    employee = db.session.get(Employee, employee_id)
    if employee is None:
        raise ApiError("Employee not found.", 404)

    leave_type = data.get("type")
    if leave_type not in LEAVE_TYPES:
        raise ApiError("Invalid leave type.")

    from_date = parse_date(data.get("from"))
    to_date = parse_date(data.get("to"))
    if from_date is None or to_date is None:
        raise ApiError("Please choose valid start and end dates.")
    if to_date < from_date:
        raise ApiError("End date cannot be before the start date.")

    days = working_days_between(from_date, to_date)
    if days < 1:
        raise ApiError("Selected range has no working days (Sundays are excluded).")

    overlap = Leave.query.filter(
        Leave.employee_id == employee_id,
        Leave.status.in_(("pending", "approved")),
        Leave.from_date <= to_date,
        Leave.to_date >= from_date,
    ).first()
    if overlap:
        raise ApiError("This range overlaps an existing pending/approved leave request.")

    balance = leave_balance(employee_id)
    if leave_type != "unpaid" and days > balance[leave_type]["available"]:
        available = balance[leave_type]["available"]
        raise ApiError(f"Insufficient {leave_type} leave balance — {available} day(s) available.")

    leave = Leave(
        id=_next_leave_id(), employee_id=employee_id, type=leave_type,
        from_date=from_date, to_date=to_date, days=days,
        remarks=(data.get("remarks") or "—").strip() or "—",
        status="pending",
    )
    db.session.add(leave)
    log_activity("plane", f"<b>{employee.name}</b> applied for {leave_type} "
                          f"leave ({days} day{'s' if days > 1 else ''}).")
    notify_all_hr("plane", f"<b>{employee.name}</b> applied for {leave_type} leave "
                           f"({days} day{'s' if days > 1 else ''}) — needs review.")
                           
    send_leave_alert(
        "hr@axiom.demo",
        f"New Leave Request from {employee.name}",
        f"{employee.name} has applied for {days} days of {leave_type} leave from {from_date} to {to_date}.\nRemarks: {leave.remarks}\n\nPlease review this request in the Axiom Dashboard."
    )
    db.session.commit()
    return jsonify(leave.to_dict()), 201


@leaves_bp.get("")
@login_required
def my_leaves():
    employee_id = request.args.get("employee_id") or g.employee_id
    self_or_hr(employee_id)
    leaves = (Leave.query.filter_by(employee_id=employee_id)
              .order_by(Leave.created_at.desc()).all())
    return jsonify([l.to_dict() for l in leaves])


@leaves_bp.get("/all")
@hr_required
def all_leaves():
    from models.employee import Employee as Emp

    status = request.args.get("status", "all")
    query = Leave.query
    if status and status != "all":
        if status not in ("pending", "approved", "rejected"):
            raise ApiError("Invalid status filter.")
        query = query.filter(Leave.status == status)
    leaves = query.order_by(Leave.created_at.desc()).all()

    result = []
    for leave in leaves:
        employee = db.session.get(Emp, leave.employee_id)
        item = leave.to_dict()
        item.update({
            "employeeName": employee.name if employee else leave.employee_id,
            "department": employee.department if employee else "—",
            "position": employee.position if employee else "—",
        })
        result.append(item)
    return jsonify(result)


@leaves_bp.get("/balance")
@login_required
def balance():
    employee_id = request.args.get("employee_id") or g.employee_id
    self_or_hr(employee_id)
    if db.session.get(Employee, employee_id) is None:
        raise ApiError("Employee not found.", 404)
    return jsonify(leave_balance(employee_id))


def _decide(leave_id: str, decision: str):
    leave = _get_leave_or_404(leave_id)
    if leave.status != "pending":
        raise ApiError("This request has already been processed.", 400)

    comment = (request.get_json(silent=True) or {}).get("comment")
    comment = comment.strip() if isinstance(comment, str) and comment.strip() else None

    leave.status = decision
    leave.hr_comment = comment
    leave.decided_at = datetime.now()

    if decision == "approved":
        # block the calendar: mark attendance rows in the range as Leave
        rows = Attendance.query.filter(
            Attendance.employee_id == leave.employee_id,
            Attendance.date >= leave.from_date,
            Attendance.date <= leave.to_date,
            Attendance.status != "weekoff",
        ).all()
        for row in rows:
            row.status = "leave"
            row.check_in = None
            row.check_out = None

    log_activity("check" if decision == "approved" else "x",
                 f"Leave request <b>{leave.id}</b> was <b>{decision}</b>.")
    employee = db.session.get(Employee, leave.employee_id)
    summary = (f"Your leave request <b>{leave.id}</b> ({leave.days} day"
               f"{'s' if leave.days > 1 else ''}) was <b>{decision}</b>.")
    if comment:
        summary += f" HR comment: {comment}"
    notify(employee.user if employee else None,
           "check" if decision == "approved" else "x", summary)
           
    if employee and employee.user:
        attachment_name = None
        attachment_data = None
        if decision == "approved":
            attachment_name = f"leave_{leave.id}.ics"
            attachment_data = generate_ics(
                leave.id, 
                leave.from_date, 
                leave.to_date, 
                employee.name, 
                leave.type
            )
            
        send_leave_alert(
            employee.user.email,
            f"Leave Request {decision.capitalize()}",
            f"Hello {employee.name},\n\nYour leave request for {leave.days} days (from {leave.from_date} to {leave.to_date}) has been {decision}.\nHR Comment: {comment or 'None'}\n\nCheck your dashboard for details.",
            attachment_name=attachment_name,
            attachment_data=attachment_data
        )
        
    db.session.commit()
    return jsonify(leave.to_dict())


# PATCH and PUT both accepted (frontend uses PATCH; API docs use PUT)
@leaves_bp.route("/<leave_id>/approved", methods=["PATCH", "PUT"])
@hr_required
def approve(leave_id):
    return _decide(leave_id, "approved")


@leaves_bp.route("/<leave_id>/rejected", methods=["PATCH", "PUT"])
@hr_required
def reject(leave_id):
    return _decide(leave_id, "rejected")
