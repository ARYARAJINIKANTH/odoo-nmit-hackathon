"""Activities & notifications endpoints (both used by the existing frontend).

GET   /api/activities?limit=               → [{ts, icon, text}] activity feed
GET   /api/notifications?limit=            → own notifications (read/unread persists in DB)
GET   /api/notifications/unread/count      → number of unread notifications
POST  /api/notifications/mark-read         → mark own notifications as read
"""
from flask import Blueprint, g, jsonify, request

from models.activity import Activity
from models.notification import Notification
from utils.auth import login_required
from utils.validators import parse_limit

activities_bp = Blueprint("activities", __name__, url_prefix="/api")


@activities_bp.get("/activities")
@login_required
def list_activities():
    limit = parse_limit(request.args.get("limit"), default=8)
    activities = (Activity.query.order_by(Activity.created_at.desc())
                  .limit(limit).all())
    return jsonify([a.to_dict() for a in activities])


@activities_bp.get("/notifications")
@login_required
def list_notifications():
    limit = parse_limit(request.args.get("limit"), default=10)
    notifications = (Notification.query.filter_by(user_id=g.user.id)
                     .order_by(Notification.created_at.desc())
                     .limit(limit).all())
    return jsonify([n.to_dict() for n in notifications])


@activities_bp.get("/notifications/unread/count")
@login_required
def unread_count():
    count = Notification.query.filter_by(user_id=g.user.id, is_read=False).count()
    return jsonify(count)


@activities_bp.post("/notifications/mark-read")
@login_required
def mark_notifications_read():
    unread = Notification.query.filter_by(user_id=g.user.id, is_read=False).all()
    for n in unread:
        n.is_read = True
    from extensions import db

    db.session.commit()
    return jsonify({"success": True, "marked": len(unread)})
