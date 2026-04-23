"""
Backend tests for Expense Tracker.

Tests cover:
- Request validation (idempotency key, amount range, date rules, sanitization)
- Idempotency guarantees
- GET filtering, sorting, and pagination
- Decimal/money precision
- Edge cases (future dates, HTML injection, >2 dp amounts)
"""
import uuid
from decimal import Decimal
from datetime import datetime, date, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import pytest

from app.main import app, get_db
from app.models import Base, Expense
from app.db import DATABASE_URL  # noqa: F401  imported for completeness


# ── In-memory SQLite for isolation ─────────────────────────────────────── #
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


TODAY = datetime.now(timezone.utc).date().isoformat()
YESTERDAY = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
TOMORROW = (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat()


def _idem():
    """Return a fresh UUID idempotency key."""
    return str(uuid.uuid4())


def _post(amount="100.00", category="Groceries", date=TODAY, description=None, key=None):
    payload = {"amount": amount, "category": category, "date": date}
    if description is not None:
        payload["description"] = description
    return client.post(
        "/api/expenses",
        headers={"Idempotency-Key": key or _idem()},
        json=payload,
    )


# ═══════════════════════════════════════════════════════════════════════════ #
class TestValidation:
    """Request validation rules."""

    def test_missing_idempotency_key_returns_400(self):
        r = client.post(
            "/api/expenses",
            json={"amount": "100.00", "category": "Groceries", "date": TODAY},
        )
        assert r.status_code == 400
        assert r.json()["error"] == "ValidationError"
        assert "Idempotency-Key" in r.json()["details"]

    def test_invalid_idempotency_key_format_returns_400(self):
        r = client.post(
            "/api/expenses",
            headers={"Idempotency-Key": "not-a-uuid"},
            json={"amount": "100.00", "category": "Groceries", "date": TODAY},
        )
        assert r.status_code == 400

    # ── Amount rules ─────────────────────────────────────────────────── #

    def test_negative_amount_rejected(self):
        r = _post(amount="-50.00")
        assert r.status_code == 422

    def test_zero_amount_rejected(self):
        r = _post(amount="0.00")
        assert r.status_code == 422

    def test_amount_below_minimum_rejected(self):
        r = _post(amount="0.50")
        assert r.status_code == 422

    def test_amount_at_minimum_accepted(self):
        r = _post(amount="1.00")
        assert r.status_code == 201

    def test_amount_at_maximum_accepted(self):
        r = _post(amount="1000000.00")
        assert r.status_code == 201

    def test_amount_above_maximum_rejected(self):
        r = _post(amount="1000001.00")
        assert r.status_code == 422

    def test_non_numeric_amount_rejected(self):
        r = _post(amount="abc")
        assert r.status_code == 422

    def test_amount_with_currency_symbol_rejected(self):
        r = _post(amount="₹100")
        assert r.status_code == 422

    def test_amount_with_more_than_2_decimals_rejected(self):
        r = _post(amount="99.999")
        assert r.status_code == 422

    def test_amount_with_exactly_2_decimals_accepted(self):
        r = _post(amount="99.99")
        assert r.status_code == 201

    def test_scientific_notation_amount_rejected(self):
        r = _post(amount="1e5")
        assert r.status_code == 422

    # ── Date rules ───────────────────────────────────────────────────── #

    def test_missing_date_rejected(self):
        r = client.post(
            "/api/expenses",
            headers={"Idempotency-Key": _idem()},
            json={"amount": "100.00", "category": "Groceries"},
        )
        assert r.status_code == 422

    def test_invalid_date_format_rejected(self):
        r = _post(date="23-04-2026")  # dd-mm-yyyy not accepted
        assert r.status_code == 422

    def test_invalid_calendar_date_rejected(self):
        r = _post(date="2026-13-50")
        assert r.status_code == 422

    def test_future_date_rejected(self):
        r = _post(date=TOMORROW)
        assert r.status_code == 422

    def test_today_date_accepted(self):
        r = _post(date=TODAY)
        assert r.status_code == 201

    def test_past_date_accepted(self):
        r = _post(date="2025-01-01")
        assert r.status_code == 201

    # ── Category / description ────────────────────────────────────────── #

    def test_missing_category_rejected(self):
        r = client.post(
            "/api/expenses",
            headers={"Idempotency-Key": _idem()},
            json={"amount": "100.00", "date": TODAY},
        )
        assert r.status_code == 422

    def test_html_tags_in_category_rejected(self):
        r = _post(category="<script>alert(1)</script>")
        assert r.status_code == 422

    def test_html_tags_in_description_stripped(self):
        r = _post(description="<b>Bold</b> text")
        # Tags stripped; request succeeds
        assert r.status_code == 201
        assert "<b>" not in r.json()["description"]

    def test_description_too_long_rejected(self):
        r = _post(description="x" * 501)
        assert r.status_code == 422

    def test_description_max_length_accepted(self):
        r = _post(description="x" * 500)
        assert r.status_code == 201

    def test_category_too_long_rejected(self):
        r = _post(category="x" * 101)
        assert r.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════ #
class TestIdempotency:
    """Idempotency guarantees."""

    def test_post_creates_new_expense(self):
        r = _post(amount="250.50", category="Transport", description="Taxi")
        assert r.status_code == 201
        data = r.json()
        assert data["amount"] == "250.50"
        assert data["category"] == "Transport"

    def test_same_key_returns_existing_with_200(self):
        key = _idem()
        r1 = _post(amount="100.00", key=key)
        assert r1.status_code == 201
        id1 = r1.json()["id"]

        r2 = _post(amount="100.00", key=key)
        assert r2.status_code == 200
        assert r2.json()["id"] == id1

    def test_different_payload_same_key_returns_original(self):
        key = _idem()
        r1 = _post(amount="100.00", key=key)
        assert r1.status_code == 201

        r2 = _post(amount="999.00", key=key)  # different amount, same key
        assert r2.status_code == 200
        assert r2.json()["amount"] == "100.00"  # original preserved


# ═══════════════════════════════════════════════════════════════════════════ #
class TestGetExpenses:
    """GET /api/expenses – filtering, sorting, pagination."""

    def setup_method(self):
        """Rebuild DB and seed deterministic test data before every test."""
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        db = TestingSessionLocal()
        rows = [
            Expense(amount=Decimal("100.00"), category="Groceries",
                    date=date(2026, 4, 20), idempotency_key=_idem()),
            Expense(amount=Decimal("50.00"),  category="Transport",
                    date=date(2026, 4, 21), idempotency_key=_idem()),
            Expense(amount=Decimal("150.00"), category="Groceries",
                    date=date(2026, 4, 23), idempotency_key=_idem()),
            Expense(amount=Decimal("75.50"),  category="Entertainment",
                    date=date(2026, 4, 22), idempotency_key=_idem()),
        ]
        for row in rows:
            db.add(row)
        db.commit()
        db.close()

    def test_returns_all_expenses(self):
        r = client.get("/api/expenses")
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 4
        assert data["total"] == "375.50"

    def test_default_sort_newest_first(self):
        dates = [e["date"] for e in client.get("/api/expenses").json()["expenses"]]
        assert dates == sorted(dates, reverse=True)

    def test_filter_by_category(self):
        r = client.get("/api/expenses?category=Groceries")
        data = r.json()
        assert data["count"] == 2
        assert all(e["category"] == "Groceries" for e in data["expenses"])
        assert data["total"] == "250.00"

    def test_filter_case_insensitive(self):
        r = client.get("/api/expenses?category=groceries")
        assert r.json()["count"] == 2

    def test_filter_nonexistent_category_returns_empty(self):
        r = client.get("/api/expenses?category=Nonexistent")
        data = r.json()
        assert data["count"] == 0
        assert data["total"] == "0.00"
        assert data["expenses"] == []

    def test_pagination_limit_and_offset(self):
        r1 = client.get("/api/expenses?limit=2&offset=0")
        assert len(r1.json()["expenses"]) == 2

        r2 = client.get("/api/expenses?limit=2&offset=2")
        assert len(r2.json()["expenses"]) == 2

        # Pages should not overlap
        ids1 = {e["id"] for e in r1.json()["expenses"]}
        ids2 = {e["id"] for e in r2.json()["expenses"]}
        assert ids1.isdisjoint(ids2)

    def test_total_reflects_all_filtered_not_just_page(self):
        """total must be sum of ALL Groceries even when limit=1."""
        r = client.get("/api/expenses?category=Groceries&limit=1&offset=0")
        data = r.json()
        assert len(data["expenses"]) == 1
        assert data["total"] == "250.00"   # full filtered sum
        assert data["count"] == 2          # full filtered count

    def test_limit_capped_at_100(self):
        r = client.get("/api/expenses?limit=1000")
        assert r.status_code == 422  # FastAPI rejects limit > 100


# ═══════════════════════════════════════════════════════════════════════════ #
class TestDecimalHandling:
    """Money precision."""

    def test_amount_normalised_to_2dp(self):
        r = _post(amount="123.4")   # one decimal place → stored as 123.40
        assert r.status_code == 201
        assert r.json()["amount"] == "123.40"

    def test_decimal_precision_preserved(self):
        r = _post(amount="123.45")
        assert r.status_code == 201
        assert r.json()["amount"] == "123.45"

    def test_whole_number_amount_normalised(self):
        r = _post(amount="500")
        assert r.status_code == 201
        assert r.json()["amount"] == "500.00"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
