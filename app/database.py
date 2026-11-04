from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ai_eval.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_column(connection, table_name: str, col_name: str, col_type: str):
    """Adds missing columns dynamically to existing SQLite tables."""
    inspector = inspect(connection)
    if table_name in inspector.get_table_names():
        existing_cols = [c["name"] for c in inspector.get_columns(table_name)]
        if col_name not in existing_cols:
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))


def init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Perform lightweight migration for SQLite tables if needed
    with engine.begin() as conn:
        _ensure_column(conn, "test_cases", "actual_output", "TEXT DEFAULT ''")
        _ensure_column(conn, "evaluation_runs", "notes", "TEXT DEFAULT ''")
        _ensure_column(conn, "evaluation_results", "instruction_following", "FLOAT DEFAULT 1.0")
        _ensure_column(conn, "evaluation_results", "judge_verdict", "VARCHAR DEFAULT 'none'")
        _ensure_column(conn, "evaluation_results", "judge_reasoning", "TEXT DEFAULT ''")
        _ensure_column(conn, "evaluation_results", "is_llm_judge", "BOOLEAN DEFAULT 0")
        _ensure_column(conn, "evaluation_results", "error", "TEXT DEFAULT ''")
        _ensure_column(conn, "safety_runs", "provider", "VARCHAR DEFAULT ''")
        _ensure_column(conn, "safety_results", "expected_safe_behavior", "TEXT DEFAULT ''")
        _ensure_column(conn, "safety_results", "explanation", "TEXT DEFAULT ''")
