"""Axiom backend configuration.

All secrets come from environment variables (.env for local development).
No real secrets are hardcoded — the fallbacks below exist ONLY for local
hackathon development and are clearly marked.
"""
import os

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


def _env_bool(name: str, default: str = "true") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


class Config:
    # --- secrets (set real values in backend/.env for anything beyond local dev) ---
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret-change-me")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or SECRET_KEY
    JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "24"))
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com")

    # --- database ---
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", "sqlite:///" + os.path.join(BASE_DIR, "axiom.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # --- CORS: comma-separated origins in .env, defaults to allow all
    # (fine for hackathon: auth is via Bearer tokens, not cookies) ---
    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

    # --- dev conveniences: create tables + demo seed automatically on startup ---
    AUTO_INIT_DB = _env_bool("AUTO_INIT_DB")
    AUTO_SEED = _env_bool("AUTO_SEED")

    # --- business rules (mirrors the frontend mock leave policy) ---
    LEAVE_POLICY = {"paid": 18, "sick": 12, "unpaid": 6}
    HALF_DAY_THRESHOLD_MINUTES = 240  # < 4 worked hours = half day (matches frontend)


class DevelopmentConfig(Config):
    DEBUG = True


class TestingConfig(Config):
    TESTING = True
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    AUTO_INIT_DB = False
    AUTO_SEED = False


def get_config(name: str | None = None):
    name = (name or os.getenv("FLASK_ENV", "development")).lower()
    return {
        "development": DevelopmentConfig,
        "production": Config,
        "testing": TestingConfig,
    }.get(name, DevelopmentConfig)
