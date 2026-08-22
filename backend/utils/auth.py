"""JWT authentication + role authorization utilities."""
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, request

from extensions import db
from models.user import User
from utils.responses import ApiError


def create_token(user: "User") -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "emp": user.employee_id,
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(hours=current_app.config["JWT_EXPIRES_HOURS"]),
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET_KEY"], algorithm="HS256")


def _authenticate():
    """Decodes the Bearer token and attaches g.user / g.employee_id / g.role."""
    header = request.headers.get("Authorization", "")
    token = request.args.get("token", "")
    
    if header.startswith("Bearer "):
        token = header[7:]
        
    if not token:
        raise ApiError("Authentication required. Please sign in.", 401)
    try:
        payload = jwt.decode(
            token, current_app.config["JWT_SECRET_KEY"], algorithms=["HS256"]
        )
    except jwt.ExpiredSignatureError:
        raise ApiError("Your session has expired. Please sign in again.", 401)
    except jwt.InvalidTokenError:
        raise ApiError("Invalid authentication token.", 401)

    user = db.session.get(User, int(payload["sub"]))
    if user is None:
        raise ApiError("This account no longer exists.", 401)

    g.user = user
    g.employee_id = user.employee_id
    g.role = user.role
    return user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        _authenticate()
        return fn(*args, **kwargs)

    return wrapper


def hr_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        _authenticate()
        if g.role != "hr":
            raise ApiError("HR/Admin access required.", 403)
        return fn(*args, **kwargs)

    return wrapper


def self_or_hr(employee_id):
    """Employees may only touch their own records; HR may touch anyone's."""
    if employee_id in (None, "", "undefined", "null"):
        raise ApiError("employee_id is required.", 400)
    if g.role != "hr" and g.employee_id != employee_id:
        raise ApiError("You are not allowed to access another employee's data.", 403)
