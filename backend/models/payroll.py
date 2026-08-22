"""Payroll — persisted payslips per employee per month ('YYYY-MM').

The current salary structure lives on Employee; this table stores generated
payslip records (current month = 'processing', previous = 'paid'), matching
what the frontend's payroll page renders.
"""
from extensions import db


def month_offset(base, back: int):
    """(year, month) tuple for `back` months before base (as date)."""
    total = base.year * 12 + (base.month - 1) - back
    return total // 12, total % 12 + 1


class Payroll(db.Model):
    __tablename__ = "payrolls"
    __table_args__ = (db.UniqueConstraint("employee_id", "month", name="uq_payroll_employee_month"),)

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.String(15), db.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    month = db.Column(db.String(7), nullable=False)           # 'YYYY-MM'
    basic = db.Column(db.Integer, nullable=False, default=0)
    hra = db.Column(db.Integer, nullable=False, default=0)
    transport = db.Column(db.Integer, nullable=False, default=0)
    special = db.Column(db.Integer, nullable=False, default=0)
    pf = db.Column(db.Integer, nullable=False, default=0)
    pt = db.Column(db.Integer, nullable=False, default=0)
    insurance = db.Column(db.Integer, nullable=False, default=0)
    allowances = db.Column(db.Integer, nullable=False, default=0)
    deductions = db.Column(db.Integer, nullable=False, default=0)
    net = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(12), nullable=False, default="processing")  # paid | processing
    paid_on = db.Column(db.Date, nullable=True)

    employee = db.relationship("Employee", back_populates="payslips")

    def recompute(self, employee) -> None:
        """Fill this payslip from the employee's CURRENT structure (mock parity)."""
        s = employee.salary_dict()
        for field, value in s.items():
            setattr(self, field, value)
        self.allowances = s["hra"] + s["transport"] + s["special"]
        self.deductions = s["pf"] + s["pt"] + s["insurance"]
        self.net = (s["basic"] + self.allowances) - self.deductions
        from datetime import date
        year, month = int(self.month[:4]), int(self.month[5:7])
        is_current = (year, month) == (date.today().year, date.today().month)
        self.status = "processing" if is_current else "paid"
        self.paid_on = None if is_current else date(year, month, 28)

    def to_dict(self) -> dict:
        return {
            "id": f"PS-{self.employee_id}-{self.month}",
            "month": self.month,
            "basic": self.basic, "hra": self.hra, "transport": self.transport,
            "special": self.special, "pf": self.pf, "pt": self.pt, "insurance": self.insurance,
            "allowances": self.allowances,
            "deductions": self.deductions,
            "net": self.net,
            "status": self.status,
            "paidOn": self.paid_on.isoformat() if self.paid_on else None,
        }


def sync_employee_payslips(employee) -> list:
    """Create/refresh payslips for the last 3 months (incl. current) and return them."""
    from datetime import date

    today = date.today()
    months = []
    for back in (2, 1, 0):
        y, m = month_offset(today, back)
        months.append(f"{y:04d}-{m:02d}")

    slips = []
    for month in months:
        slip = Payroll.query.filter_by(employee_id=employee.id, month=month).first()
        if slip is None:
            slip = Payroll(employee_id=employee.id, month=month)
            db.session.add(slip)
        slip.recompute(employee)
        slips.append(slip)
    db.session.commit()

    slips.sort(key=lambda s: s.month)
    return slips
