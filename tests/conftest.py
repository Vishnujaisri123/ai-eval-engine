"""
Pytest configuration for AI Quality Evaluation Platform.

Provides a dedicated, isolated in-memory SQLite test database with StaticPool
and thread-safety, overriding the application's get_db dependency. Ensures that all
SQLAlchemy models are registered and initialized before any test runs, protecting
development and production databases.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base, get_db, init_db
from app.api import app
from app.models import Dataset
from app.services import dataset_service

# Dedicated in-memory test database using StaticPool to share connection across threads
TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=test_engine
)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# 1. Apply dependency override immediately at test configuration time
app.dependency_overrides[get_db] = override_get_db

# 2. Initialize all tables on test_engine
init_db(target_engine=test_engine)

# 3. Seed starter datasets into test database
_db = TestingSessionLocal()
try:
    if _db.query(Dataset).count() == 0:
        dataset_service.seed_starter_datasets(_db)
finally:
    _db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """
    Session fixture ensuring tables are created, seeded, and lifespan is managed.
    """
    app.dependency_overrides[get_db] = override_get_db
    init_db(target_engine=test_engine)

    db = TestingSessionLocal()
    try:
        if db.query(Dataset).count() == 0:
            dataset_service.seed_starter_datasets(db)
    finally:
        db.close()

    with TestClient(app) as test_client:
        yield test_client

    # Teardown
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client(setup_test_database):
    """Fixture providing a configured TestClient bound to the test database."""
    return setup_test_database
