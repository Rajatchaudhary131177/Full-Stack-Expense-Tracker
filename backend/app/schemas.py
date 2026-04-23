import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator

# --- Constants ------------------------------------------------------------- #
MIN_AMOUNT = Decimal("1.00")
MAX_AMOUNT = Decimal("1000000.00")   # 10 lakh cap; prevents overflow & nonsense data
MAX_CATEGORY_LEN = 100
MAX_DESCRIPTION_LEN = 500

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_NULL_BYTE_RE = re.compile(r"\x00")
# Reject any character that is a common script-injection vector
_UNSAFE_CHARS_RE = re.compile(r"[<>\"\'`;]")


def sanitize_text(text: str) -> str:
    """Strip HTML tags, null bytes, and obvious injection characters."""
    text = _HTML_TAG_RE.sub("", text)
    text = _NULL_BYTE_RE.sub("", text)
    # Collapse multiple spaces / control chars to single space
    text = re.sub(r"[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]+", " ", text)
    return text.strip()


# ---------------------------------------------------------------------------  #
# Request schemas                                                               #
# ---------------------------------------------------------------------------  #

class ExpenseCreate(BaseModel):
    """Validated schema for POST /api/expenses request body."""

    amount: str = Field(
        ...,
        description=(
            f"Positive number with at most 2 decimal places, "
            f"between {MIN_AMOUNT} and {int(MAX_AMOUNT):,}"
        ),
    )
    category: str = Field(
        ...,
        min_length=1,
        max_length=MAX_CATEGORY_LEN,
        description="Expense category (max 100 chars)",
    )
    description: Optional[str] = Field(
        None,
        max_length=MAX_DESCRIPTION_LEN,
        description="Optional description (max 500 chars)",
    )
    date: str = Field(..., description="Date in YYYY-MM-DD format, not in the future")

    # ------------------------------------------------------------------ #
    # Field validators                                                     #
    # ------------------------------------------------------------------ #

    @field_validator("amount", mode="before")
    @classmethod
    def validate_amount(cls, v: object) -> str:
        """
        Accept a string or numeric value.

        Rules enforced:
        - Only digits with an optional single dot followed by 1-2 digits
        - Value must be between MIN_AMOUNT and MAX_AMOUNT (inclusive)
        - Normalised to exactly 2 decimal places ("123" → "123.00")
        """
        raw = str(v).strip()

        # Reject empty / whitespace only
        if not raw:
            raise ValueError("Amount is required")

        # Reject non-numeric characters (including currency symbols, spaces, etc.)
        if not re.match(r"^\d+(\.\d{1,2})?$", raw):
            raise ValueError(
                "Amount must be a positive number with at most 2 decimal places "
                "(e.g. 100 or 99.99)"
            )

        try:
            value = Decimal(raw)
        except InvalidOperation:
            raise ValueError("Amount must be a valid number")

        if value < MIN_AMOUNT:
            raise ValueError(f"Amount must be at least {int(MIN_AMOUNT)}")
        if value > MAX_AMOUNT:
            raise ValueError(f"Amount must not exceed {int(MAX_AMOUNT):,}")

        # Quantise to 2 d.p. to ensure DB precision and consistent serialisation
        return str(value.quantize(Decimal("0.01")))

    @field_validator("category", mode="before")
    @classmethod
    def validate_category(cls, v: object) -> str:
        if not isinstance(v, str):
            raise ValueError("Category must be a string")

        cleaned = sanitize_text(v)

        if not cleaned:
            raise ValueError("Category is required")
        if len(cleaned) > MAX_CATEGORY_LEN:
            raise ValueError(f"Category must not exceed {MAX_CATEGORY_LEN} characters")

        # Reject obvious injection patterns that survive sanitize_text
        if _UNSAFE_CHARS_RE.search(cleaned):
            raise ValueError("Category contains invalid characters")

        return cleaned

    @field_validator("description", mode="before")
    @classmethod
    def validate_description(cls, v: object) -> Optional[str]:
        if v is None or v == "":
            return None
        if not isinstance(v, str):
            raise ValueError("Description must be a string")

        cleaned = sanitize_text(v)

        if len(cleaned) > MAX_DESCRIPTION_LEN:
            raise ValueError(
                f"Description must not exceed {MAX_DESCRIPTION_LEN} characters"
            )

        return cleaned if cleaned else None

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        """
        Accepts YYYY-MM-DD only.  Future dates are rejected.
        """
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("Date must be in YYYY-MM-DD format")

        try:
            parsed = datetime.strptime(v, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("Date must be a valid calendar date (YYYY-MM-DD)")

        today = datetime.now(timezone.utc).date()
        if parsed > today:
            raise ValueError("Future dates are not allowed")

        return v


# ---------------------------------------------------------------------------  #
# Response schemas                                                              #
# ---------------------------------------------------------------------------  #

class ExpenseResponse(BaseModel):
    """Single expense as returned by the API."""
    id: str
    amount: str
    category: str
    description: Optional[str]
    date: str
    created_at: str

    class Config:
        from_attributes = True


class ExpenseListResponse(BaseModel):
    """Paginated list of expenses returned by GET /api/expenses."""
    expenses: List[ExpenseResponse]
    total: str          # Sum of ALL filtered records (not just current page)
    count: int          # Total filtered count (before pagination)
    limit: int          # Page size used
    offset: int         # Offset used


class ErrorDetail(BaseModel):
    error: str
    details: Optional[dict] = None


class ValidationError(BaseModel):
    error: str = "ValidationError"
    details: dict
