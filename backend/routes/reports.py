"""PDF Reports generation endpoints."""
from io import BytesIO
from datetime import datetime, date
from flask import Blueprint, send_file, render_template, request, g
from xhtml2pdf import pisa
from sqlalchemy import extract

from extensions import db
from models.employee import Employee
from models.payroll import Payroll
from models.attendance import Attendance
from utils.auth import login_required, self_or_hr
from utils.responses import ApiError

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")


def create_pdf(html_content):
    """Convert HTML string to a PDF BytesIO object."""
    pdf_buffer = BytesIO()
    # pisa.CreatePDF expects a string or file-like object and outputs to dest
    pisa_status = pisa.CreatePDF(html_content, dest=pdf_buffer)
    if pisa_status.err:
        raise ApiError("Failed to generate PDF.", 500)
    pdf_buffer.seek(0)
    return pdf_buffer


@reports_bp.get("/payslip/<employee_id>/<month>")
@login_required
def download_payslip(employee_id, month):
    """Generate and return a PDF payslip for a specific month (YYYY-MM)."""
    self_or_hr(employee_id)
    
    employee = db.session.get(Employee, employee_id)
    if not employee:
        raise ApiError("Employee not found.", 404)
        
    payslip = Payroll.query.filter_by(employee_id=employee_id, month=month).first()
    if not payslip:
        raise ApiError("Payslip not found for this month.", 404)

    # Render HTML template with data
    html = render_template(
        "payslip.html",
        employee=employee,
        slip=payslip.to_dict()
    )
    
    pdf = create_pdf(html)
    return send_file(
        pdf,
        as_attachment=True,
        download_name=f"payslip_{employee_id}_{month}.pdf",
        mimetype="application/pdf"
    )


@reports_bp.get("/attendance/<employee_id>")
@login_required
def download_attendance(employee_id):
    """Generate and return a PDF attendance report for a given month (query param: month=YYYY-MM)."""
    self_or_hr(employee_id)
    month_str = request.args.get("month")
    
    if not month_str:
        # Default to current month
        month_str = date.today().strftime("%Y-%m")
        
    try:
        dt = datetime.strptime(month_str, "%Y-%m")
        year = dt.year
        month = dt.month
    except ValueError:
        raise ApiError("Invalid month format. Use YYYY-MM.", 400)

    employee = db.session.get(Employee, employee_id)
    if not employee:
        raise ApiError("Employee not found.", 404)
        
    records = Attendance.query.filter(
        Attendance.employee_id == employee_id,
        extract('year', Attendance.date) == year,
        extract('month', Attendance.date) == month
    ).order_by(Attendance.date.asc()).all()

    summary = {
        "present": sum(1 for r in records if r.status == "present"),
        "absent": sum(1 for r in records if r.status == "absent"),
        "leave": sum(1 for r in records if r.status == "leave"),
        "half_day": sum(1 for r in records if r.status == "half-day"),
    }
    
    html = render_template(
        "attendance.html",
        employee=employee,
        month=month_str,
        records=[r.to_dict() for r in records],
        summary=summary
    )
    
    pdf = create_pdf(html)
    return send_file(
        pdf,
        as_attachment=True,
        download_name=f"attendance_{employee_id}_{month_str}.pdf",
        mimetype="application/pdf"
    )
