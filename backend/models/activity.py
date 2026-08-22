"""Activity feed (dashboard + notifications bell).

`text` may contain simple <b> markup — the frontend renders it via innerHTML
(escaped at creation time from trusted server-side templates only).
`ts` serialises to epoch milliseconds.
"""
from datetime import datetime, timezone

from extensions import db


class Activity(db.Model):
    __tablename__ = "activities"

    id = db.Column(db.Integer, primary_key=True)
    icon = db.Column(db.String(20), nullable=False, default="info")
    text = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)

    def to_dict(self) -> dict:
        return {
            "ts": int(self.created_at.replace(tzinfo=timezone.utc).timestamp() * 1000),
            "icon": self.icon,
            "text": self.text,
        }


def log_activity(icon: str, text: str) -> None:
    db.session.add(Activity(icon=icon, text=text))
