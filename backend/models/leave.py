"""Leave request.

type:   paid | sick | unpaid
status: pending | approved | rejected
`days` counts working days in the range (Sundays excluded), like the frontend.
`appliedAt` serialises to epoch milliseconds (frontend relTime() expects it).
"""
from datetime import datetime, timezone

from extensions import db


class Leave(db.Model):
    __tablename__ = "leaves"
    __table_args__ = (
        db.CheckConstraint("type IN ('paid','sick','unpaid')", name="ck_leave_type"),
        db.CheckConstraint("status IN ('pending','approved','rejected')", name="ck_leave_status"),
        db.CheckConstraint("to_date >= from_date", name="ck_leave_range"),
        db.Index("ix_leave_status", "status"),
    )

    id = db.Column(db.String(10), primary_key=True)          # e.g. 'L-2007'
    employee_id = db.Column(
        db.String(15), db.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type = db.Column(db.String(10), nullable=False)
    from_date = db.Column(db.Date, nullable=False)
    to_date = db.Column(db.Date, nullable=False)
    days = db.Column(db.Integer, nullable=False)
    remarks = db.Column(db.Text, nullable=False, default="—")
    status = db.Column(db.String(10), nullable=False, default="pending")
    hr_comment = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    decided_at = db.Column(db.DateTime, nullable=True)

    employee = db.relationship("Employee", back_populates="leaves")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "employeeId": self.employee_id,
            "type": self.type,
            "from": self.from_date.isoformat(),
            "to": self.to_date.isoformat(),
            "days": self.days,
            "remarks": self.remarks,
            "status": self.status,
            "appliedAt": int(self.created_at.replace(tzinfo=timezone.utc).timestamp() * 1000) if self.created_at else None,
            "hrComment": self.hr_comment,
        }
