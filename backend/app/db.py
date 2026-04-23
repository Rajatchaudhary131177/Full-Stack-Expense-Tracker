# Database initialization and session management
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

# Create database directory if it doesn't exist
DB_DIR = Path(__file__).parent.parent / "data"
DB_DIR.mkdir(exist_ok=True)

# SQLite database file path
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_DIR / 'expenses.db'}")

# Create engine with SQLite-specific optimizations
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency to get DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    from app.models import Base
    
    Base.metadata.create_all(bind=engine)
    print("✓ Database tables created successfully")


if __name__ == "__main__":
    init_db()
