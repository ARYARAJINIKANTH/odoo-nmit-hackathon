"""User = login credentials only (no employee data duplicated here)."""
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(10), nullable=False, default="employee")  # employee | hr
    active = db.Column(db.Boolean, nullable=False, default=True)          # deactivated accounts cannot log in
    employee_id = db.Column(
        db.String(15), db.ForeignKey("employees.id", ondelete="CASCADE"),
        unique=True, nullable=False,
    )
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    employee = db.relationship("Employee", back_populates="user", uselist=False)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)
