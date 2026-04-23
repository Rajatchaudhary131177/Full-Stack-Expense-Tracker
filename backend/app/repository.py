from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from app.models import Expense
from app.schemas import ExpenseCreate


class ExpenseRepository:
    """Data-access layer with idempotency and safe pagination."""

    @staticmethod
    def create_with_idempotency(
        db: Session,
        expense_data: ExpenseCreate,
        idempotency_key: str,
    ) -> tuple[Expense, bool]:
        """
        Insert a new expense or return the existing one for the given key.

        Returns (expense, created_flag).  Race conditions are handled via the
        unique constraint on idempotency_key: if two concurrent requests slip
        past the initial SELECT, the second will hit IntegrityError and we
        re-fetch the winner.
        """
        if not idempotency_key:
            raise ValueError("Idempotency-Key header is required")

        existing = (
            db.query(Expense)
            .filter(Expense.idempotency_key == idempotency_key)
            .first()
        )
        if existing:
            return existing, False

        try:
            expense = Expense(
                amount=Decimal(expense_data.amount),   # already validated & normalised
                category=expense_data.category,
                description=expense_data.description,
                date=datetime.strptime(expense_data.date, "%Y-%m-%d").date(),
                idempotency_key=idempotency_key,
            )
            db.add(expense)
            db.commit()
            db.refresh(expense)
            return expense, True
        except IntegrityError:
            db.rollback()
            # Another concurrent request won the race; return its row.
            existing = (
                db.query(Expense)
                .filter(Expense.idempotency_key == idempotency_key)
                .first()
            )
            if existing:
                return existing, False
            raise

    @staticmethod
    def get_expenses(
        db: Session,
        category: str | None = None,
        sort: str = "date_desc",
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Expense], int, Decimal]:
        """
        Return (page_rows, total_filtered_count, total_filtered_amount).

        - category filter is case-insensitive
        - total_filtered_amount is the SUM across ALL matching rows,
          not just the current page (useful for budget summaries)
        - pagination is done at the SQL level (not Python slicing)
        """
        # ── Base filter ─────────────────────────────────────────────────── #
        filters = []
        if category:
            filters.append(func.lower(Expense.category) == func.lower(category))

        # ── Total filtered count ─────────────────────────────────────────── #
        total_count: int = db.query(Expense).filter(*filters).count()

        # ── Total filtered amount (SQL SUM – avoids loading all rows) ────── #
        raw_sum = (
            db.query(func.sum(Expense.amount))
            .filter(*filters)
            .scalar()
        )
        total_amount = (
            Decimal(str(raw_sum)).quantize(Decimal("0.01"))
            if raw_sum is not None
            else Decimal("0.00")
        )

        # ── Fetch page ───────────────────────────────────────────────────── #
        query = db.query(Expense).filter(*filters)

        # Only date_desc is exposed for now; extend here when needed
        query = query.order_by(Expense.date.desc(), Expense.created_at.desc())

        expenses: list[Expense] = query.offset(offset).limit(limit).all()

        return expenses, total_count, total_amount
