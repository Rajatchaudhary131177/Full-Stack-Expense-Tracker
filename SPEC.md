### Spec for Full‑Stack Expense Tracker (FastAPI + SQLite)

#### Purpose
This document is a single, actionable spec you can feed to Copilot to scaffold, implement, test, and deliver a production‑minded minimal Expense Tracker. It contains the API contract, data model, idempotency rules, frontend behavior, tests, CI/CD, deployment notes, and a checklist for the README and final deliverables.

---

### Goals
- **MVP features:** create expense, list expenses, filter by category, sort by date (newest first), show total for visible list.
- **Production minded:** idempotent writes, correct money handling, server validation, simple resilience for unreliable networks, clear structure and tests.
- **Fast delivery:** FastAPI backend, SQLite persistence, React + TypeScript frontend.

---

### Tech stack (explicit)
- **Backend:** FastAPI, Python 3.11+, SQLAlchemy (ORM), Alembic optional, Pydantic, Uvicorn.
- **DB:** SQLite (file) via SQLAlchemy; schema compatible with Postgres for later migration.
- **Frontend:** React + TypeScript, Vite, React Query (or SWR) for data fetching, UUID library for idempotency keys.
- **Testing:** pytest for backend, React Testing Library + Jest for frontend.
- **Devops:** Docker + docker‑compose for local dev; GitHub Actions for CI; deploy backend as container (Render/Heroku) and frontend to Vercel/Netlify.
- **Lint/format:** black/isort (Python), ESLint + Prettier (frontend), pre-commit hooks.

---

### API specification

#### Common
- **Base URL:** `/api` (prefix all routes)
- **Content-Type:** `application/json`
- **Auth:** none required for assignment (note in README how to add JWT later)
- **Idempotency header:** `Idempotency-Key: <uuid>` (required for POST /expenses)

---

#### `POST /api/expenses`
- **Purpose:** create a new expense; must be safe to retry.
- **Headers:** `Idempotency-Key: <uuid>` (client-generated UUID per logical submit)
- **Request body (JSON):**
```json
{
  "amount": "1234.56",
  "category": "Groceries",
  "description": "Weekly shopping",
  "date": "2026-04-23"
}
```
- **Validation rules:**
  - **amount**: required, decimal string or number; must be > 0 (minimum 1); stored as `Decimal`.
  - **category**: required, non-empty string.
  - **description**: optional string (max length 1000 recommended).
  - **date**: required, ISO8601 date (YYYY-MM-DD).
- **Behavior (server):**
  1. Require `Idempotency-Key` header. If missing, return `400`.
  2. Begin DB transaction.
  3. Check `expenses` table for existing row with same `idempotency_key`. If found, return that row with `200 OK`.
  4. Otherwise, insert new row with generated `id` (UUID), `created_at` timestamp, and store `idempotency_key`.
  5. Commit and return `201 Created` with created resource.
- **Responses:**
  - `201 Created` with created expense JSON.
  - `200 OK` if idempotency key already used (return existing resource).
  - `400 Bad Request` for validation errors or missing header.
  - `500` for unexpected server errors.

- **Response body (JSON):**
```json
{
  "id": "uuid",
  "amount": "1234.56",
  "category": "Groceries",
  "description": "Weekly shopping",
  "date": "2026-04-23",
  "created_at": "2026-04-23T18:00:00Z"
}
```

---

#### `GET /api/expenses`
- **Purpose:** return list of expenses with optional filter and sort.
- **Query parameters:**
  - `category` (optional) — filter by exact category.
  - `sort` (optional) — allowed value `date_desc` to sort newest first. Default: `date_desc`.
  - `limit` (optional) — integer, default 100.
  - `offset` (optional) — integer, default 0.
- **Behavior:**
  - Apply `category` filter if present.
  - Apply `sort=date_desc` to return newest first.
  - Compute **total** (sum of `amount`) for the returned page and include in response.
- **Response (200):**
```json
{
  "expenses": [
    { "id":"...", "amount":"...", "category":"...", "description":"...", "date":"YYYY-MM-DD", "created_at":"..." }
  ],
  "total": "12345.67",
  "count": 10,
  "limit": 100,
  "offset": 0
}
```

---

### Data model (SQLAlchemy / schema)
- **Table:** `expenses`
  - `id` — UUID primary key
  - `amount` — NUMERIC(12,2) / Decimal, not null
  - `category` — TEXT, not null
  - `description` — TEXT, nullable
  - `date` — DATE, not null
  - `created_at` — TIMESTAMP WITH TIME ZONE, default now()
  - `idempotency_key` — TEXT, nullable, **unique index** (enforces dedupe)
- **Indexes:** unique index on `idempotency_key`, index on `date`, index on `category`.

---

### Idempotency & concurrency
- **Client responsibility:** generate a new UUID `Idempotency-Key` for each logical submit. If user retries the same submit (e.g., refresh or double-click), reuse the same key.
- **Server responsibility:** store `idempotency_key` with the created row and enforce uniqueness at DB level. On conflict, return existing row.
- **Why:** prevents duplicate expense creation under retries or network flakiness.
- **Edge cases:** if client reuses same key but changes payload, server returns the original resource (document in README that client must generate new key for changed payload).

---

### Validation, error handling, and money handling
- **Money:** use `Decimal` in Python and `NUMERIC` in DB. Never use float for storage or calculations.
- **Validation:** Pydantic models validate types and constraints. Return structured error JSON:
```json
{ "error": "ValidationError", "details": { "amount": "must be >= 0" } }
```
- **Errors:** consistent error envelope with `status`, `error`, and `details`.
- **Timezones:** store `created_at` in UTC; `date` is a local date (no timezone).
- **Logging:** structured logs with request id and idempotency key for POSTs.

---

### Frontend spec (React + TypeScript)

#### Pages / Components
- **App**
  - **ExpenseForm** — inputs: amount, category (select + free text option), description, date.
  - **ExpenseList** — table of expenses with columns: Date, Category, Description, Amount, Status (pending/confirmed).
  - **FilterBar** — category filter dropdown, sort toggle (newest first).
  - **TotalBar** — shows `Total: ₹X` for currently visible list.
  - **Toast/Error** — global error and success messages.

#### Submit flow (detailed)
1. **User fills form** and clicks Submit.
2. **Client generates `Idempotency-Key`** (UUID v4) and stores it in memory for that submit attempt.
3. **Optimistic UI:** append a pending row to the list with `temp_id` and `pending: true`. Compute total including pending.
4. **Disable submit button** and show spinner.
5. **Send POST** with header `Idempotency-Key`.
6. **On success (201 or 200):**
   - Replace pending row with server row (match by idempotency key or temp_id).
   - Mark as confirmed.
7. **On network failure or timeout:**
   - Keep pending row visible with `Retry` button that reuses same idempotency key.
   - Show error toast.
8. **On duplicate response (server returns existing):**
   - Reconcile by replacing pending row with server row.
9. **If user refreshes page before server responds:**
   - Pending row is lost unless you persist pending submissions in `localStorage`. Optional: store pending submissions in `localStorage` keyed by idempotency key and attempt resend on app load.

#### Fetching & caching
- Use React Query to fetch `/api/expenses` and invalidate on successful create.
- Show loading skeleton while fetching.
- Show friendly error UI on fetch failure with retry.

#### UX & validation
- **Client validation:** amount ≥ 0, date required, category required.
- **Prevent double submits:** disable button after first click; but still allow retry if network fails.
- **Accessibility:** labels for inputs, keyboard accessible, semantic HTML.

---

### Nice‑to‑have (prioritize)
1. **Client persistence of pending submissions** in `localStorage` so refresh doesn’t lose pending items.
2. **Summary view:** total per category (group by category).
3. **Basic tests:** one integration test for POST+GET; unit tests for validation.
4. **Loading and error states** in UI.

---

### Tests
- **Backend unit tests:**
  - Validation tests (negative amount, missing date).
  - Idempotency test: POST same idempotency key twice → only one DB row created; second returns existing.
  - GET filtering and sorting tests.
- **Integration test:** start test DB (SQLite in-memory), run app, POST expense, GET list, assert presence and total.
- **Frontend tests:**
  - Form validation tests.
  - Submit flow test with mocked API: optimistic UI shows pending, then confirmed after response.

---

### CI / GitHub Actions
- **On PR / push to main:**
  - Run Python lint (ruff/flake8), black formatting check.
  - Run backend tests.
  - Run frontend lint and tests.
  - Build Docker images (optional).
- **Secrets:** store deployment credentials in GitHub Secrets.

---

### Docker & local dev
- **Dockerfile (backend):** small image using `python:3.11-slim`, install deps, copy app, run `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- **docker-compose.yml:** services: `backend` (exposes 8000), `frontend` (dev server), optional `adminer` for DB inspection.
- **Local run steps (README):**
  1. `python -m venv .venv && source .venv/bin/activate`
  2. `pip install -r backend/requirements.txt`
  3. `cd backend && alembic upgrade head` (or run `python -m app.db_init` to create SQLite file)
  4. `uvicorn app.main:app --reload`
  5. `cd frontend && npm install && npm run dev`

---

### README checklist (what to include)
- **Project overview** and live demo link.
- **Tech choices** and rationale (FastAPI + SQLite).
- **How idempotency works** (Idempotency-Key header + DB unique index).
- **Trade-offs** due to timebox (e.g., no auth, SQLite vs Postgres, limited tests).
- **How to run locally** (dev and docker).
- **API docs** (endpoints, sample requests).
- **Deployment instructions** and CI summary.
- **What’s not implemented** and how to extend (pagination, auth, multi-user).
- **Sample curl commands**.

---

### Sample curl commands (copyable)

**Create expense**
```bash
curl -X POST http://localhost:8000/api/expenses \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 11111111-2222-3333-4444-555555555555" \
  -d '{"amount":"250.00","category":"Transport","description":"Taxi","date":"2026-04-23"}'
```

**Get expenses (newest first)**
```bash
curl "http://localhost:8000/api/expenses?sort=date_desc"
```

**Get expenses filtered**
```bash
curl "http://localhost:8000/api/expenses?category=Groceries&sort=date_desc"
```

---

### Acceptance criteria mapping (explicit)
- **Create new expense:** `POST /api/expenses` with required fields and idempotency header → server stores and returns created resource.
- **View list:** `GET /api/expenses` returns list.
- **Filter by category:** `GET /api/expenses?category=...` filters server-side.
- **Sort by date (newest first):** `GET /api/expenses?sort=date_desc` returns newest first.
- **Total for current list:** `GET` response includes `total` field; frontend computes total for visible list as well.

---

### Minimal deliverables
- `backend/` with FastAPI app, models, migrations (or DB init), tests.
- `frontend/` with React app, form, list, filter, total.
- `Dockerfile` and `docker-compose.yml`.
- `README.md` with run & deploy instructions, design notes, trade-offs.
- Live deployment link (frontend + backend) and GitHub repo link.

---

### Suggested implementation task breakdown (2–3 day plan)
1. **Day 1:** scaffold backend, models, DB init, implement POST with idempotency and GET with filters; write unit tests for idempotency and validation.
2. **Day 2:** scaffold frontend, implement form + optimistic submit + list + filter + total; integrate with backend; add client validation.
3. **Day 3:** add tests, CI, Docker, README, deploy backend and frontend, polish error states and README.

---

### Final notes for Copilot prompt
When you pass this spec to Copilot, include:
- **Root prompt:** “Generate a FastAPI backend and React TypeScript frontend for the Expense Tracker per the spec below.”
- **Attach this spec.md** as the single source of truth.
- **Ask Copilot to scaffold:** models, routes, Pydantic schemas, DB init script, Dockerfile, React components (ExpenseForm, ExpenseList, FilterBar), and example tests.
- **Emphasize:** idempotency header handling, Decimal money handling, and returning `total` in GET.

---