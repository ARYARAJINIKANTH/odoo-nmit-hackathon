"""Attendance — one row per employee per day.

status: present | absent | half-day | leave | weekoff | not-marked
check_in / check_out stored as 'HH:MM' local-time strings (frontend format).
"""
from datetime import date as date_type

from extensions import db


class Attendance(db.Model):
    __tablename__ = "attendance"
    __table_args__ = (
        db.UniqueConstraint("employee_id", "date", name="uq_attendance_employee_date"),
        db.Index("ix_attendance_date", "date"),
    )

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.String(15), db.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(12), nullable=False, default="not-marked")
    check_in = db.Column(db.String(5), nullable=True)
    check_out = db.Column(db.String(5), nullable=True)
    mood = db.Column(db.String(20), nullable=True)

    employee = db.relationship("Employee", back_populates="attendances")

    @staticmethod
    def default_status_for(day: date_type) -> str:
        return "weekoff" if day.weekday() == 6 else "not-marked"  # Sunday = weekly off

    def to_dict(self) -> dict:
        return {
            "employeeId": self.employee_id,
            "date": self.date.isoformat(),
            "status": self.status,
            "checkIn": self.check_in,
            "checkOut": self.check_out,
            "mood": self.mood,
        }
