"""Employee endpoints.

GET    /api/employees                     (HR)    ?search=&department=
POST   /api/employees                     (HR)    add employee (+ login account)
GET    /api/employees/<id>                (self/HR)
GET    /api/employees/<id>/profile        (self/HR)
PATCH  /api/employees/<id>/profile        (self/HR)  {phone, address, photo} ONLY
PATCH  /api/employees/<id>                (HR)       name/email/phone/department/position/joinDate/address
PATCH  /api/employees/<id>/status         (HR)       {active: bool} deactivate / reactivate
"""
from datetime import date

from flask import Blueprint, g, jsonify, request
from sqlalchemy import func, or_

from extensions import db
from models.activity import log_activity
from models.attendance import Attendance
from models.employee import DEFAULT_SALARY, Employee
from models.notification import notify
from models.user import User
from seed import DEMO_DOCUMENTS, generate_attendance_history
from utils.auth import hr_required, login_required, self_or_hr
from utils.responses import ApiError
from utils.validators import (
    HR_EDITABLE_EMPLOYEE_FIELDS, clean_str, parse_date, valid_email, valid_employee_id,
    valid_password, valid_phone,
)

employees_bp = Blueprint("employees", __name__, url_prefix="/api/employees")


def _get_employee_or_404(employee_id: str) -> Employee:
    employee = db.session.get(Employee, employee_id)
    if employee is None:
        raise ApiError("Employee not found.", 404)
    return employee


@employees_bp.get("")
@hr_required
def list_employees():
    search = clean_str(request.args.get("search"))
    department = clean_str(request.args.get("department"), "all")

    query = Employee.query.join(User)
    if department and department != "all":
        query = query.filter(Employee.department == department)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(
            Employee.name.ilike(like),
            Employee.id.ilike(like),
            Employee.position.ilike(like),
            User.email.ilike(like),
        ))
    employees = query.order_by(Employee.name).all()
    return jsonify([e.to_dict() for e in employees])


@employees_bp.post("")
@hr_required
def add_employee():
    """HR creates an employee record together with its login account."""
    data = request.get_json(silent=True) or {}
    employee_id = clean_str(data.get("employeeId"))
    name = clean_str(data.get("name"))
    email = clean_str(data.get("email")).lower()
    password = data.get("password") or ""
    role = data.get("role", "employee")

    if not valid_employee_id(employee_id):
        raise ApiError("Employee ID must be 3–15 letters, digits or hyphens (e.g. E-1025).")
    if not name or len(name) < 3:
        raise ApiError("Name must be at least 3 characters.")
    if not valid_email(email):
        raise ApiError("Please enter a valid email address.")
    if not valid_password(password):
        raise ApiError("Set an initial password of at least 6 characters.")
    if role not in ("employee", "hr"):
        raise ApiError("Role must be employee or hr.")
    if db.session.get(Employee, employee_id):
        raise ApiError("This Employee ID is already registered.", 409)
    if User.query.filter(func.lower(User.email) == email).first():
        raise ApiError("An account with this email already exists.", 409)

    employee = Employee(
        id=employee_id, name=name,
        department=clean_str(data.get("department"), "General") or "General",
        position=clean_str(data.get("position"), "Team Member") or "Team Member",
        join_date=parse_date(data.get("joinDate")) or date.today(),
        phone=clean_str(data.get("phone"), "—") or "—",
        address=clean_str(data.get("address"), "—") or "—",
        photo=None, documents=list(DEMO_DOCUMENTS),
        **{**DEFAULT_SALARY, **{k: v for k, v in
           (data.get("salary") or {}).items() if k in DEFAULT_SALARY}},
    )
    db.session.add(employee)
    db.session.flush()

    user = User(email=email, role=role, employee_id=employee_id)
    user.set_password(password)
    db.session.add(user)

    generate_attendance_history(employee_id)
    db.session.add(Attendance(employee_id=employee_id, date=date.today(), status="not-marked"))

    log_activity("user", f"HR added new employee <b>{name}</b> to {employee.department}.")
    db.session.flush()
    notify(user, "user", "Welcome to Axiom! Your account was created by HR.")
    db.session.commit()

    return jsonify(employee.to_dict(include_documents=True)), 201


@employees_bp.patch("/<employee_id>/status")
@hr_required
def set_employee_status(employee_id):
    """Deactivate / reactivate an account (deactivated users cannot log in)."""
    employee = _get_employee_or_404(employee_id)
    data = request.get_json(silent=True) or {}
    active = data.get("active")
    if not isinstance(active, bool):
        raise ApiError("Provide active: true or false.")
    if not active and employee_id == g.employee_id:
        raise ApiError("You cannot deactivate your own account.", 400)

    employee.user.active = active
    state = "reactivated" if active else "deactivated"
    log_activity("user", f"Account of <b>{employee.name}</b> was {state} by HR.")
    db.session.commit()
    return jsonify(employee.to_dict(include_documents=True))


@employees_bp.get("/<employee_id>")
@login_required
def get_employee(employee_id):
    self_or_hr(employee_id)
    return jsonify(_get_employee_or_404(employee_id).to_dict(include_documents=True))


@employees_bp.get("/<employee_id>/profile")
@login_required
def get_profile(employee_id):
    self_or_hr(employee_id)
    return jsonify(_get_employee_or_404(employee_id).to_dict(include_documents=True))


@employees_bp.patch("/<employee_id>/profile")
@login_required
def update_profile(employee_id):
    """Employees may edit ONLY phone / address / photo (whitelist enforced)."""
    self_or_hr(employee_id)
    employee = _get_employee_or_404(employee_id)
    data = request.get_json(silent=True) or {}

    if "phone" in data:
        if not valid_phone(data.get("phone")):
            raise ApiError("Enter a valid phone number (7–20 characters).")
        employee.phone = clean_str(data["phone"])
    if "address" in data:
        address = clean_str(data.get("address"))
        if not 5 <= len(address) <= 160:
            raise ApiError("Address must be 5–160 characters.")
        employee.address = address
    if "photo" in data:
        photo = data.get("photo")
        if photo is not None:
            if not isinstance(photo, str) or not photo.startswith("data:image/"):
                raise ApiError("Profile picture must be an uploaded image.")
            if len(photo) > 3_000_000:
                raise ApiError("Profile picture is too large (max ~2 MB).")
        employee.photo = photo

    log_activity("edit", f"<b>{employee.name}</b> updated contact details.")
    db.session.commit()
    return jsonify(employee.to_dict(include_documents=True))


@employees_bp.patch("/<employee_id>")
@hr_required
def update_employee(employee_id):
    """HR edits employee information (whitelisted fields only)."""
    employee = _get_employee_or_404(employee_id)
    data = request.get_json(silent=True) or {}
    unknown = set(data) - set(HR_EDITABLE_EMPLOYEE_FIELDS)
    if unknown:
        raise ApiError(f"Fields cannot be edited here: {', '.join(sorted(unknown))}.")

    if "name" in data:
        name = clean_str(data.get("name"))
        if len(name) < 3:
            raise ApiError("Name must be at least 3 characters.")
        employee.name = name
    if "email" in data:
        email = clean_str(data.get("email")).lower()
        if not valid_email(email):
            raise ApiError("Please enter a valid email.")
        clash = User.query.filter(func.lower(User.email) == email, User.employee_id != employee_id).first()
        if clash:
            raise ApiError("Another account already uses this email.", 409)
        employee.user.email = email
    if "phone" in data:
        if not valid_phone(data.get("phone")):
            raise ApiError("Enter a valid phone number (7–20 characters).")
        employee.phone = clean_str(data["phone"])
    if "department" in data:
        employee.department = clean_str(data.get("department"), "General") or "General"
    if "position" in data:
        employee.position = clean_str(data.get("position"), "Team Member") or "Team Member"
    if "joinDate" in data:
        join = parse_date(data.get("joinDate"))
        if join is None:
            raise ApiError("Joining date must be a valid date (YYYY-MM-DD).")
        employee.join_date = join
    if "address" in data:
        employee.address = clean_str(data.get("address"), "—") or "—"

    log_activity("edit", f"HR updated profile of <b>{employee.name}</b>.")
    db.session.commit()
    return jsonify(employee.to_dict(include_documents=True))
