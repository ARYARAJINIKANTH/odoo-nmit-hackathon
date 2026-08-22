"""Input validators shared across routes.

Every message is human-readable — the frontend shows it directly.
"""
import re
from datetime import date

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
EMPLOYEE_ID_RE = re.compile(r"^[A-Za-z0-9-]{3,15}$")

LEAVE_TYPES = ("paid", "sick", "unpaid")
LEAVE_STATUSES = ("pending", "approved", "rejected")
ATTENDANCE_STATUSES = ("present", "absent", "half-day", "leave", "weekoff", "not-marked")
SALARY_FIELDS = ("basic", "hra", "transport", "special", "pf", "pt", "insurance")
HR_EDITABLE_EMPLOYEE_FIELDS = ("name", "email", "phone", "department", "position", "joinDate", "address")


def valid_email(value) -> bool:
    return isinstance(value, str) and bool(EMAIL_RE.match(value.strip()))


def valid_password(value) -> bool:
    return isinstance(value, str) and len(value) >= 6


def valid_employee_id(value) -> bool:
    return isinstance(value, str) and bool(EMPLOYEE_ID_RE.match(value.strip()))


def valid_phone(value) -> bool:
    return isinstance(value, str) and 7 <= len(value.strip()) <= 20


def parse_date(value):
    """'YYYY-MM-DD' -> datetime.date, tolerant of junk like 'undefined'."""
    if not isinstance(value, str) or value in ("", "undefined", "null"):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def parse_limit(value, default=8, maximum=50) -> int:
    try:
        return max(1, min(int(value), maximum))
    except (TypeError, ValueError):
        return default


def clean_str(value, default: str = "") -> str:
    return value.strip() if isinstance(value, str) else default


def validate_salary_payload(data: dict):
    """Returns (salary dict of ints, None) or (None, error message)."""
    if not isinstance(data, dict):
        return None, "All salary fields must be positive numbers."
    salary = {}
    for field in SALARY_FIELDS:
        raw = data.get(field)
        try:
            val = float(raw)
        except (TypeError, ValueError):
            return None, "All salary fields must be positive numbers."
        if val < 0:
            return None, "All salary fields must be positive numbers."
        salary[field] = int(round(val))
    if salary["basic"] <= 0:
        return None, "Basic salary must be greater than zero."
    return salary, None
