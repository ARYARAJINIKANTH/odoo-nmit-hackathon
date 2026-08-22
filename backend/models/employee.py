"""Employee — the single source of employee information.

Email lives on the related User (auth) row; serialisers expose it here so the
frontend keeps receiving the exact shape it expects (employeeId, name, email,
phone, address, photo, department, position, joinDate, salary structure…).
"""
from datetime import datetime, timezone

from extensions import db

DEFAULT_SALARY = {"basic": 30000, "hra": 12000, "transport": 2400, "special": 5000, "pf": 3600, "pt": 200, "insurance": 1250}


class Employee(db.Model):
    __tablename__ = "employees"

    id = db.Column(db.String(15), primary_key=True)          # e.g. 'E-1001'
    name = db.Column(db.String(80), nullable=False)
    department = db.Column(db.String(60), nullable=False, default="General", index=True)
    position = db.Column(db.String(80), nullable=False, default="Team Member")
    join_date = db.Column(db.Date, nullable=False)
    phone = db.Column(db.String(30), nullable=False, default="—")
    address = db.Column(db.String(200), nullable=False, default="—")
    photo = db.Column(db.Text, nullable=True)                # data-URL (or URL) uploaded by employee
    documents = db.Column(db.JSON, nullable=True, default=list)  # [{name, size}]
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # current salary structure (monthly, INR)
    basic = db.Column(db.Integer, nullable=False, default=0)
    hra = db.Column(db.Integer, nullable=False, default=0)
    transport = db.Column(db.Integer, nullable=False, default=0)
    special = db.Column(db.Integer, nullable=False, default=0)
    pf = db.Column(db.Integer, nullable=False, default=0)
    pt = db.Column(db.Integer, nullable=False, default=0)
    insurance = db.Column(db.Integer, nullable=False, default=0)

    user = db.relationship("User", back_populates="employee", uselist=False)
    attendances = db.relationship("Attendance", back_populates="employee", cascade="all, delete-orphan")
    leaves = db.relationship("Leave", back_populates="employee", cascade="all, delete-orphan")
    payslips = db.relationship("Payroll", back_populates="employee", cascade="all, delete-orphan")

    # ---- helpers ----
    def salary_dict(self) -> dict:
        return {f: int(getattr(self, f)) for f in
                ("basic", "hra", "transport", "special", "pf", "pt", "insurance")}

    def apply_salary(self, salary: dict) -> None:
        for field, value in salary.items():
            setattr(self, field, int(value))

    def gross_salary(self) -> int:
        return self.basic + self.hra + self.transport + self.special

    def total_deductions(self) -> int:
        return self.pf + self.pt + self.insurance

    def net_salary(self) -> int:
        return self.gross_salary() - self.total_deductions()

    def to_dict(self, include_documents: bool = False) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "email": self.user.email if self.user else None,
            "role": self.user.role if self.user else "employee",
            "department": self.department,
            "position": self.position,
            "joinDate": self.join_date.isoformat() if self.join_date else None,
            "phone": self.phone,
            "address": self.address,
            "photo": self.photo,
            "active": self.user.active if self.user else True,
            "salary": self.salary_dict(),
        }
        if include_documents:
            data["documents"] = self.documents or []
        return data
