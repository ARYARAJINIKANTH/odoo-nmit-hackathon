"""Import all models so db.create_all() sees every table."""
from extensions import db
from models.activity import Activity, log_activity
from models.attendance import Attendance
from models.employee import DEFAULT_SALARY, Employee
from models.leave import Leave
from models.payroll import Payroll, sync_employee_payslips
from models.user import User

__all__ = [
    "db", "Activity", "log_activity", "Attendance", "Employee", "DEFAULT_SALARY",
    "Leave", "Payroll", "sync_employee_payslips", "User",
]
