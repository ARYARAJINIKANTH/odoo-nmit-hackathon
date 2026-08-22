"""Auth endpoints — POST /api/auth/signup, POST /api/auth/login.

Request/response field names match frontend/js/api.js exactly:
signup sends { employeeId, name, email, password, role }
login returns { token, employeeId, name, email, role, photo }
"""
from datetime import date

from flask import Blueprint, jsonify, request

from extensions import db
from models.activity import log_activity
from models.attendance import Attendance
from models.employee import DEFAULT_SALARY, Employee
from models.user import User
from seed import DEMO_DOCUMENTS, generate_attendance_history
from utils.auth import create_token
from utils.responses import ApiError
from utils.validators import clean_str, valid_email, valid_employee_id, valid_password

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/signup")
def signup():
    data = request.get_json(silent=True) or {}
    employee_id = clean_str(data.get("employeeId"))
    name = clean_str(data.get("name"))
    email = clean_str(data.get("email")).lower()
    password = data.get("password") or ""
    role = data.get("role")

    # ---- validation ----
    if not valid_employee_id(employee_id):
        raise ApiError("Employee ID must be 3–15 letters, digits or hyphens (e.g. E-1025).")
    if not name or len(name) < 3 or len(name) > 60:
        raise ApiError("Please enter your full name (3–60 characters).")
    if not valid_email(email):
        raise ApiError("Please enter a valid email address.")
    if not valid_password(password):
        raise ApiError("Password must be at least 6 characters.")
    if role not in ("employee", "hr"):
        raise ApiError("Please select a valid role.")

    # ---- duplicate checks (same messages as the frontend mock) ----
    if User.query.filter(User.email == email).first():
        raise ApiError("An account with this email already exists.", 409)
    if db.session.get(Employee, employee_id):
        raise ApiError("This Employee ID is already registered.", 409)

    employee = Employee(
        id=employee_id, name=name, department="General", position="Team Member",
        join_date=date.today(), phone="—", address="—", photo=None,
        documents=list(DEMO_DOCUMENTS), **DEFAULT_SALARY,
    )
    db.session.add(employee)
    db.session.flush()

    user = User(email=email, role=role, employee_id=employee_id)
    user.set_password(password)
    db.session.add(user)

    # give the new account an attendance history so every page looks alive
    generate_attendance_history(employee_id)
    db.session.add(Attendance(employee_id=employee_id, date=date.today(), status="not-marked"))

    log_activity("user", f"New employee <b>{name}</b> registered as "
                         f"{'HR/Admin' if role == 'hr' else 'Employee'}.")
    db.session.commit()

    return jsonify({"success": True, "message": "Account created successfully.",
                    "employeeId": employee_id}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = clean_str(data.get("email")).lower()
    password = data.get("password") or ""

    user = User.query.filter(User.email == email).first()
    if user is None or not user.check_password(password):
        raise ApiError("Invalid email or password.", 401)

    employee = user.employee
    return jsonify({
        "token": create_token(user),
        "employeeId": employee.id,
        "name": employee.name,
        "email": user.email,
        "role": user.role,
        "photo": employee.photo,
    })
