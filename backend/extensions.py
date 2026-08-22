"""Shared Flask extension instances (avoid circular imports)."""
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
cors = CORS()
