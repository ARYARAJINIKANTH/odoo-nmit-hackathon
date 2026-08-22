"""Payroll endpoints.

GET   /api/payroll?employee_id=     (self/HR) read-only structure + 3 payslips
GET   /api/payroll/all              (HR)      salary table for everyone
PATCH /api/payroll/<employee_id>    (HR)      edit salary structure
"""
from flask import Blueprint, g, jsonify, request

from extensions import db
from models.activity import log_activity
from models.employee import Employee
from models.payroll import sync_employee_payslips
from utils.auth import hr_required, login_required, self_or_hr
from utils.responses import ApiError
from utils.validators import validate_salary_payload

payroll_bp = Blueprint("payroll", __name__, url_prefix="/api/payroll")


def _get_employee_or_404(employee_id: str) -> Employee:
    employee = db.session.get(Employee, employee_id)
    if employee is None:
        raise ApiError("Employee not found.", 404)
    return employee


@payroll_bp.get("")
@login_required
def my_payroll():
    employee_id = request.args.get("employee_id") or g.employee_id
    self_or_hr(employee_id)
    employee = _get_employee_or_404(employee_id)

    slips = sync_employee_payslips(employee)  # generate/refresh last 3 months
    return jsonify({
        "structure": employee.salary_dict(),
        "monthlyGross": employee.gross_salary(),
        "net": employee.net_salary(),
        "payslips": [s.to_dict() for s in slips],
    })


@payroll_bp.get("/all")
@hr_required
def all_payroll():
    rows = []
    for employee in Employee.query.order_by(Employee.name).all():
        rows.append({
            "employeeId": employee.id,
            "name": employee.name,
            "department": employee.department,
            "position": employee.position,
            "photo": employee.photo,
            "salary": employee.salary_dict(),
            "gross": employee.gross_salary(),
            "deductions": employee.total_deductions(),
            "net": employee.net_salary(),
            "status": "processing",  # current cycle
        })
    return jsonify(rows)


@payroll_bp.patch("/<employee_id>")
@hr_required
def update_salary(employee_id):
    employee = _get_employee_or_404(employee_id)
    data = request.get_json(silent=True) or {}

    salary, error = validate_salary_payload(data)
    if error:
        raise ApiError(error)

    employee.apply_salary(salary)
    sync_employee_payslips(employee)  # payslips reflect the new structure
    log_activity("wallet", f"Salary structure updated for <b>{employee.name}</b>.")
    db.session.commit()
    return jsonify(employee.salary_dict())
