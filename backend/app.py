"""Dayflow Flask application factory."""
import os

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from config import get_config
from extensions import cors, db
from utils.responses import ApiError, fail


def create_app(config_name: str | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

    db.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
    )

    from routes import register_blueprints

    register_blueprints(app)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "dayflow-api"})

    # ---- consistent JSON errors (frontend reads `message`) ----
    @app.errorhandler(ApiError)
    def handle_api_error(err: ApiError):
        return fail(err.message, err.status)

    @app.errorhandler(HTTPException)
    def handle_http_error(err: HTTPException):
        message = err.description if err.description != err.name else err.name
        return fail(message, err.code or 500)

    @app.errorhandler(Exception)
    def handle_unexpected(err: Exception):
        app.logger.exception("Unhandled error")
        return fail("Something went wrong on our side. Please try again.", 500)

    # ---- local development convenience: create tables + demo data on startup ----
    if app.config["AUTO_INIT_DB"]:
        with app.app_context():
            db.create_all()
            if app.config["AUTO_SEED"]:
                from seed import seed_if_empty

                seed_if_empty(verbose=False)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
