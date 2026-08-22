"""Consistent JSON response helpers.

IMPORTANT (frontend contract):
- SUCCESS responses are the bare JSON objects the frontend expects
  (e.g. {"token": ..., "role": ...}). They are NOT wrapped, because
  frontend/js/api.js consumes the fields directly.
- ERROR responses use {"success": false, "message": "..."} — the frontend
  surfaces `data.message` to the user via toasts / error areas.
"""


class ApiError(Exception):
    """Raise anywhere in a route to return a clean JSON error."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def fail(message: str, status: int = 400):
    from flask import jsonify

    return jsonify({"success": False, "message": message}), status
