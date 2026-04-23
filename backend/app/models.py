# SQLAlchemy models for Expense Tracker
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import Column, String, Numeric, Text, Date, DateTime, Index, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class Expense(Base):
    """Expense model with idempotency support."""
    __tablename__ = "expenses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    amount = Column(Numeric(12, 2), nullable=False)
    category = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    date = Column(Date, nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    idempotency_key = Column(String(36), nullable=True, unique=True, index=True)

    def __repr__(self):
        return f"<Expense(id={self.id}, amount={self.amount}, category={self.category})>"

    def to_dict(self):
        """Convert model to dictionary for JSON responses."""
        return {
            "id": self.id,
            "amount": str(self.amount),
            "category": self.category,
            "description": self.description,
            "date": self.date.isoformat(),
            "created_at": self.created_at.isoformat(),
        }
