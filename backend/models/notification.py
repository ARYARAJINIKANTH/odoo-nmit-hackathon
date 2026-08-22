"""Notification — per-user messages with persistent read/unread state.

Created by: leave submitted (→ every HR user), leave approved/rejected (→ the employee).
Read state is stored in the database, so unread counts survive refreshes/restarts.
"""
from datetime import datetime, timezone

from extensions import db


def _millis(dt: datetime) -> int:
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


class Notification(db.Model):
    __tablename__ = "notifications"
    __table_args__ = (db.Index("ix_notification_user_read", "user_id", "is_read"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    icon = db.Column(db.String(20), nullable=False, default="bell")
    text = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "icon": self.icon,
            "text": self.text,
            "read": self.is_read,
            "ts": _millis(self.created_at),
        }


def notify(user, icon: str, text: str) -> None:
    if user is not None:
        db.session.add(Notification(user_id=user.id, icon=icon, text=text))


def notify_all_hr(icon: str, text: str) -> None:
    from models.user import User

    for hr_user in User.query.filter_by(role="hr", active=True).all():
        notify(hr_user, icon, text)
