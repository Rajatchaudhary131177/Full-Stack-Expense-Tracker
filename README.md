# Full-Stack Expense Tracker

A production-minded minimal expense tracker built with FastAPI backend and React + TypeScript frontend. Features idempotent expense creation to handle network retries gracefully, optimistic UI updates, and localStorage persistence for pending submissions.

## Features

- **Create Expenses**: Add expenses with amount, category, description, and date
- **View Expenses**: List all expenses sorted by date (newest first)
- **Filter by Category**: Filter expenses by exact category match
- **Total Calculation**: Shows total amount for the current visible list
- **Idempotent Creation**: Safe to retry submissions without creating duplicates
- **Optimistic UI**: Immediate feedback with pending states and retry on failure
- **Offline Resilience**: Pending submissions persist in localStorage across page refreshes

## Tech Stack

- **Backend**: FastAPI (Python 3.11+), SQLAlchemy ORM, SQLite database, Pydantic for validation
- **Frontend**: React + TypeScript, Vite for build tooling, React Query for data fetching and caching
- **Testing**: pytest for backend, Jest + React Testing Library for frontend
- **Infrastructure**: Docker + Docker Compose for local development
- **CI/CD**: GitHub Actions for automated testing

## Architecture Decisions

### Money Handling
- Uses `Decimal` type in Python and `NUMERIC(12,2)` in SQLite to avoid floating-point precision issues
- Amounts are stored and calculated as decimal values, never as floats

### Idempotency
- Client generates a UUID `Idempotency-Key` header for each logical expense submission
- Server stores the key in the database with a unique index to prevent duplicates
- On retry with the same key, server returns the existing expense instead of creating a new one
- This ensures safe retries under network flakiness without duplicate expenses

### Optimistic UI
- Form submissions immediately show a "pending" row in the expense list
- Total calculations include pending amounts
- On success, pending row transitions to "confirmed"
- On failure, retry button allows resubmission with the same idempotency key
- Pending submissions are persisted in localStorage to survive page refreshes

## Trade-offs and Limitations

- **Database**: SQLite for simplicity; schema is compatible with PostgreSQL for production scaling
- **Authentication**: None implemented; add JWT-based auth for multi-user support
- **Pagination**: Basic limit/offset implemented; no cursor-based pagination for large datasets
- **Validation**: Server-side validation only; client validation is minimal
- **Error Handling**: Basic error states; no comprehensive retry logic for all network failures
- **Testing**: Unit and integration tests for core functionality; no end-to-end tests
- **Deployment**: Backend deployable as container; frontend static hosting ready

## Local Development

### Prerequisites
- Python 3.11+ (3.13 may require additional build tools)
- Node.js 18+
- Docker and Docker Compose (optional)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Full-Stack-Expense-Tracker
   ```

2. **Backend Setup**
   ```bash
   cd backend
   python -m venv .venv
   # On Windows: .venv\Scripts\activate
   # On Unix: source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Frontend Setup**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Run Backend**
   ```bash
   cd ../backend
   # Activate venv if not already
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

5. **Run Frontend** (in another terminal)
   ```bash
   cd frontend
   npm run dev
   ```

6. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs (FastAPI automatic docs)

### Docker Setup

1. **Build and run with Docker Compose**
   ```bash
   cd infra
   docker-compose up --build
   ```

2. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000

## API Documentation

Base URL: `http://localhost:8000/api`

### Create Expense
```http
POST /api/expenses
Content-Type: application/json
Idempotency-Key: <uuid>

{
  "amount": "123.45",
  "category": "Food",
  "description": "Lunch",
  "date": "2026-04-23"
}
```

**Validation:**
- `amount`: Required, must be a valid decimal and greater than 0 (minimum amount is 1)
- `category`: Required, non-empty string
- `description`: Optional, max 1000 characters
- `date`: Required, ISO8601 date format (YYYY-MM-DD)

**Response (201 Created):**
```json
{
  "id": "uuid",
  "amount": "123.45",
  "category": "Food",
  "description": "Lunch",
  "date": "2026-04-23",
  "created_at": "2026-04-23T12:00:00Z"
}
```

**Response (200 OK - Idempotent):** Returns existing expense if Idempotency-Key was already used.

### Get Expenses
```http
GET /api/expenses?category=Food&sort=date_desc&limit=100&offset=0
```

**Response (200 OK):**
```json
{
  "expenses": [
    {
      "id": "uuid",
      "amount": "123.45",
      "category": "Food",
      "description": "Lunch",
      "date": "2026-04-23",
      "created_at": "2026-04-23T12:00:00Z"
    }
  ],
  "total": "123.45",
  "count": 1,
  "limit": 100,
  "offset": 0
}
```

## Sample API Calls

### Create an expense
```bash
curl -X POST http://localhost:8000/api/expenses \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 11111111-2222-3333-4444-555555555555" \
  -d '{"amount":"250.00","category":"Transport","description":"Taxi","date":"2026-04-23"}'
```

### Get all expenses (newest first)
```bash
curl "http://localhost:8000/api/expenses?sort=date_desc"
```

### Get expenses filtered by category
```bash
curl "http://localhost:8000/api/expenses?category=Groceries&sort=date_desc"
```

## Testing

### Backend Tests
```bash
cd backend
# Activate venv
pytest app/tests/test_expenses.py -v
```

### Frontend Tests
```bash
cd frontend
npm test
```

## CI/CD

GitHub Actions workflow runs on push and pull requests:
- Python linting and formatting checks
- Backend test execution
- Frontend linting and test execution
- Docker image builds (optional)

## Deployment

### Backend
- Containerized with Docker
- Deploy to cloud platforms like Render, Railway, or Heroku
- Environment variables for production database URL

### Frontend
- Static build with `npm run build`
- Deploy to Vercel, Netlify, or any static hosting service
- Configure API base URL via environment variables

## Extending the Application

### Authentication
- Add JWT-based authentication to FastAPI backend
- Store user_id in expenses table
- Filter expenses by authenticated user

### Database Migration
- Switch to PostgreSQL for production
- Use Alembic for schema migrations
- Update connection string via environment variables

### Advanced Features
- Add expense editing and deletion endpoints
- Implement advanced filtering (date ranges, amount ranges)
- Add expense categories management
- Implement data export (CSV/PDF)
- Add charts and analytics dashboard

### Performance Improvements
- Add database indexes for better query performance
- Implement caching for frequently accessed data
- Add pagination with cursor-based navigation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Ensure CI passes
5. Submit a pull request

## License

MIT License - see LICENSE file for details.