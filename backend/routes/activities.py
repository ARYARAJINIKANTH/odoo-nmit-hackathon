"""Activities & notifications endpoints (both used by the existing frontend).

GET /api/activities?limit=               → [{ts, icon, text}]
GET /api/notifications/unread/count      → number (HR: pending leaves, employee: own pending)
"""
from flask import Blueprint, g, jsonify, request

from models.activity import Activity
from models.leave import Leave
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


@activities_bp.get("/notifications/unread/count")
@login_required
def unread_count():
    query = Leave.query.filter_by(status="pending")
    if g.role != "hr":
        query = query.filter_by(employee_id=g.employee_id)
    return jsonify(query.count())
