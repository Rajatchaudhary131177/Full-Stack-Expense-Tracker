import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import Decimal from "decimal.js";
import { fetchExpenses, createExpense } from "./api";
import { sumAmounts } from "./utils";
import type { PendingExpense, ExpenseCreatePayload } from "./types";
import ExpenseForm from "./components/ExpenseForm";
import ExpenseList from "./components/ExpenseList";
import FilterBar from "./components/FilterBar";
import TotalBar from "./components/TotalBar";
import Pagination from "./components/Pagination";
import Toast from "./components/Toast";

const PENDING_STORAGE_KEY = "expense_tracker_pending";
const PAGE_SIZE = 20;

function loadPending(): PendingExpense[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function savePending(items: PendingExpense[]) {
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(items));
}

export interface ToastMessage {
  id: string;
  type: "success" | "error";
  text: string;
}

export default function App() {
  const queryClient = useQueryClient();

  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pendingExpenses, setPendingExpenses] = useState<PendingExpense[]>(loadPending);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const offset = (page - 1) * PAGE_SIZE;

  // ── Reset to page 1 whenever the filter changes ───────────────────────── #
  const handleFilterChange = useCallback((cat: string) => {
    setCategoryFilter(cat);
    setPage(1);
  }, []);

  const addToast = useCallback((type: "success" | "error", text: string) => {
    const id = uuidv4();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // ── Data fetching ─────────────────────────────────────────────────────── #
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["expenses", categoryFilter, page],
    queryFn: () => fetchExpenses(categoryFilter || undefined, PAGE_SIZE, offset),
    placeholderData: (prev) => prev,   // keep previous data visible while loading new page
  });

  // ── Mutation ──────────────────────────────────────────────────────────── #
  const mutation = useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: ExpenseCreatePayload;
      idempotencyKey: string;
    }) => createExpense(payload, idempotencyKey),

    onSuccess: (_serverExpense, { idempotencyKey }) => {
      setPendingExpenses((prev) => {
        const updated = prev.filter((p) => p.idempotencyKey !== idempotencyKey);
        savePending(updated);
        return updated;
      });
      // Invalidate all pages so totals/counts are correct everywhere
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      addToast("success", "Expense added successfully");
    },

    onError: (err: Error, { idempotencyKey }) => {
      setPendingExpenses((prev) => {
        const updated = prev.map((p) =>
          p.idempotencyKey === idempotencyKey ? { ...p, status: "failed" as const } : p,
        );
        savePending(updated);
        return updated;
      });
      addToast("error", err.message || "Failed to save expense. Use Retry to resubmit.");
    },
  });

  const handleSubmit = useCallback(
    (payload: ExpenseCreatePayload) => {
      const idempotencyKey = uuidv4();
      const tempId = uuidv4();

      const pending: PendingExpense = { tempId, idempotencyKey, payload, status: "pending" };

      setPendingExpenses((prev) => {
        const updated = [...prev, pending];
        savePending(updated);
        return updated;
      });

      mutation.mutate({ payload, idempotencyKey });
    },
    [mutation],
  );

  const handleRetry = useCallback(
    (item: PendingExpense) => {
      setPendingExpenses((prev) => {
        const updated = prev.map((p) =>
          p.tempId === item.tempId ? { ...p, status: "pending" as const } : p,
        );
        savePending(updated);
        return updated;
      });
      mutation.mutate({ payload: item.payload, idempotencyKey: item.idempotencyKey });
    },
    [mutation],
  );

  // On mount, re-send any pending submissions that survived a page refresh
  useEffect(() => {
    const stored = loadPending();
    if (stored.length > 0) {
      stored.forEach((item) => {
        mutation.mutate({ payload: item.payload, idempotencyKey: item.idempotencyKey });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived values ────────────────────────────────────────────────────── #
  const serverExpenses = data?.expenses ?? [];
  const totalCount = data?.count ?? 0;

  // Server returns sum of ALL filtered records (used for budget summary)
  const filteredTotal = data?.total ?? "0.00";

  // Add pending amounts to filtered total using Decimal to avoid float drift
  const pendingAmounts = pendingExpenses
    .filter((p) => !categoryFilter || p.payload.category.toLowerCase() === categoryFilter.toLowerCase())
    .map((p) => p.payload.amount);

  const displayTotal = new Decimal(filteredTotal)
    .plus(new Decimal(sumAmounts(pendingAmounts)))
    .toDecimalPlaces(2)
    .toFixed(2);

  // Categories for the filter dropdown (deduplicated, sorted)
  const categories = Array.from(
    new Set([
      ...serverExpenses.map((e) => e.category),
      ...pendingExpenses.map((p) => p.payload.category),
    ]),
  ).sort();

  return (
    <div>
      <h1>Expense Tracker</h1>

      <div className="card">
        <ExpenseForm onSubmit={handleSubmit} submitting={mutation.isPending} />
      </div>

      <div className="card">
        <FilterBar
          categories={categories}
          selected={categoryFilter}
          onChange={handleFilterChange}
        />
        <TotalBar
          total={displayTotal}
          label={categoryFilter ? `Total — ${categoryFilter}` : "Total (all)"}
        />
        <ExpenseList
          expenses={serverExpenses}
          pendingExpenses={pendingExpenses}
          isLoading={isLoading}
          isError={isError}
          onRetry={refetch}
          onRetryPending={handleRetry}
          categoryFilter={categoryFilter}
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          onChange={setPage}
        />
      </div>

      <Toast messages={toasts} />
    </div>
  );
}
