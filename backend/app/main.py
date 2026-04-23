# FastAPI application with Expense Tracker endpoints
import logging
import uuid as uuid_lib
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Header, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.db import get_db, init_db
from app.schemas import (
    ExpenseCreate,
    ExpenseResponse,
    ExpenseListResponse,
    ValidationError as ValidationErrorSchema,
)
from app.repository import ExpenseRepository

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Expense Tracker API",
    description="Production-minded minimal expense tracker with idempotency",
    version="1.0.0",
)

# Add CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Custom exception handler for validation errors
@app.exception_handler(ValidationError)
async def validation_exception_handler(request, exc):
    """Handle Pydantic validation errors."""
    error_details = {}
    for error in exc.errors():
        # loc is a tuple like ("body", "amount") or ("amount",)
        field = ".".join(str(p) for p in error["loc"] if p != "body") or "unknown"
        error_details[field] = error["msg"].removeprefix("Value error, ")

    return JSONResponse(
        status_code=400,
        content={
            "error": "ValidationError",
            "details": error_details,
        },
    )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post(
    "/api/expenses",
    response_model=ExpenseResponse,
    status_code=201,
    summary="Create a new expense",
    responses={
        201: {"description": "Expense created"},
        200: {"description": "Expense already exists (idempotent)"},
        400: {"description": "Bad request (missing header or validation error)"},
    },
)
async def create_expense(
    expense_data: ExpenseCreate,
    idempotency_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Create a new expense with idempotency support.
    
    Requires Idempotency-Key header. If the same key is used twice,
    the existing expense is returned with 200 status.
    """
    # Validate idempotency key presence
    if not idempotency_key:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "ValidationError",
                "details": {"Idempotency-Key": "Header is required"},
            },
        )

    try:
        # Validate idempotency key format (should be UUID-like)
        try:
            uuid_lib.UUID(idempotency_key)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "ValidationError",
                    "details": {"Idempotency-Key": "Must be a valid UUID"},
                },
            )

        # Create expense with idempotency
        expense, created = ExpenseRepository.create_with_idempotency(
            db, expense_data, idempotency_key
        )

        logger.info(
            f"Expense {'created' if created else 'retrieved'}: "
            f"id={expense.id}, idempotency_key={idempotency_key}"
        )

        # Return 201 if created, 200 if already exists
        response = ExpenseResponse(**expense.to_dict())
        status_code = 201 if created else 200
        return JSONResponse(
            status_code=status_code,
            content=response.model_dump(),
        )

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={"error": "ValidationError", "details": {"body": str(e)}},
        )
    except Exception as e:
        logger.error(f"Error creating expense: {e}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Internal server error"},
        )


@app.get(
    "/api/expenses",
    response_model=ExpenseListResponse,
    summary="List expenses with filtering and sorting",
    responses={
        200: {"description": "List of expenses"},
    },
)
async def get_expenses(
    category: Optional[str] = Query(None, description="Filter by category"),
    sort: str = Query("date_desc", description="Sort order (date_desc)"),
    limit: int = Query(20, ge=1, le=100, description="Page size (1-100, default 20)"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    db: Session = Depends(get_db),
):
    """
    Get expenses with optional filtering and sorting.
    
    Query Parameters:
    - category: Optional filter by exact category
    - sort: Sort order (default: date_desc for newest first)
    - limit: Max items to return (default: 100)
    - offset: Number of items to skip (default: 0)
    
    Returns total sum of amounts for the current page.
    """
    try:
        expenses, total_count, total_amount = ExpenseRepository.get_expenses(
            db,
            category=category,
            sort=sort,
            limit=limit,
            offset=offset,
        )

        expense_responses = [
            ExpenseResponse(**expense.to_dict()) for expense in expenses
        ]

        return ExpenseListResponse(
            expenses=expense_responses,
            total=str(total_amount),
            count=total_count,
            limit=limit,
            offset=offset,
        )

    except Exception as e:
        logger.error(f"Error fetching expenses: {e}")
        raise HTTPException(
            status_code=500,
            detail={"error": "Internal server error"},
        )


# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    """Initialize database tables on app startup."""
    init_db()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
