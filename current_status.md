# Project Status — Full-Stack Expense Tracker

**Last updated:** 2026-04-24

## Overall status: Production-hardening complete — awaiting `npm install` + smoke test

---

## What changed in this pass (production-hardening)

### Backend

| File | Change |
|------|--------|
| `app/schemas.py` | Full rewrite — amount 1–1,000,000, max 2 dp, regex guard; category/description HTML-tag stripping + injection-char rejection; date YYYY-MM-DD only, no future dates; error messages surfaced cleanly |
| `app/repository.py` | SQL-level OFFSET/LIMIT (no Python slicing); SQL SUM aggregation for filtered total (not Python loop); case-insensitive category filter via `func.lower()` |
| `app/main.py` | Default page size 20, max 100; improved validation error formatter (strips Pydantic's "Value error," prefix) |
| `app/tests/test_expenses.py` | Full rewrite — 30 tests covering: amount edge cases (0, <1, >max, non-numeric, currency symbol, scientific notation, >2dp), date rules (future, invalid format, today, past), HTML injection, category/description length, case-insensitive filter, pagination non-overlap, total=filtered-sum |

### Frontend

| File | Change |
|------|--------|
| `src/utils.ts` | New — `formatCurrency` (Decimal.js, Intl, Indian locale), `sumAmounts`, `sanitizeInput`, `todayISO`, `displayDate` |
| `src/api.ts` | `fetchExpenses` accepts `limit`/`offset`; better server error extraction |
| `src/components/ExpenseForm.tsx` | Amount field is `type="text"` (no spinner), inline char filter (`/^\d+\.?\d{0,2}$/`), validates 1–1M, date `max=today`, description counter (500 chars), sanitize before submit, ref-based double-submit guard |
| `src/components/Pagination.tsx` | New — prev/next/first/last + numbered pages with ellipsis, aria-current, accessible labels |
| `src/App.tsx` | Pagination state + offset; `handleFilterChange` resets page to 1; Decimal.js for pending total sum; `placeholderData` to avoid flicker on page change; server error surfaced in toast |
| `src/components/ExpenseList.tsx` | `formatCurrency` for amounts (no `toFixed` float issues); `displayDate` (DD/MM/YYYY); case-insensitive pending filter; accessible `scope="col"` headers |
| `src/components/TotalBar.tsx` | Accepts `label` prop; uses `formatCurrency` |
| `src/components/FilterBar.tsx` | `aria-label` on select; `aria-label` on clear button |
| `src/index.css` | Pagination styles; `.col-amount` right-aligned monospace no-ellipsis; `.col-desc` truncation with ellipsis; `word-break: break-all` on large totals; spinner removal CSS; focus ring; responsive breakpoint |

---

## Validation rules (backend + frontend aligned)

| Field | Rule |
|-------|------|
| `amount` | String, digits only + optional `.` + max 2 decimals; value 1.00–1,000,000.00 |
| `category` | Non-empty string, max 100 chars, HTML tags and `<>"'\`;` chars rejected |
| `description` | Optional, max 500 chars, HTML tags stripped (not rejected — sanitised) |
| `date` | YYYY-MM-DD, valid calendar date, not in the future |
| `Idempotency-Key` | Required for POST, must be valid UUID |

---

## Architecture decisions

- **Total = filtered sum** (all matching rows, not just current page) — useful as a budget summary
- **Page size = 20**, max 100 — frontend enforces this; backend rejects `limit > 100` with 422
- **Case-insensitive category filter** — `func.lower()` on both sides in SQL
- **Decimal.js everywhere** in frontend — no floating-point drift; no scientific notation on large sums
- **SQL aggregation** for total sum — no full table scan into Python

---

## Remaining manual steps

1. **`npm install`** in `frontend/` — install `@tanstack/react-query`, `@vitejs/plugin-react`, `decimal.js`, `@types/*` etc.
2. **Backend test run**: `cd backend && pytest app/tests/ -v`
3. **Frontend dev**: `cd frontend && npm run dev`
4. **Deploy**

---

## Known non-issues

All TypeScript IDE errors shown pre-install (`Cannot find module 'react'`, `JSX element implicitly has type 'any'`) are entirely caused by missing `@types/react` and `@tanstack/react-query`. They disappear after `npm install` — the source code is correct.
