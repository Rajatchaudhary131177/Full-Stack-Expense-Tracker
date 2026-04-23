import type { Expense, ExpenseCreatePayload, ExpensesResponse } from "./types";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8000/api";

export async function fetchExpenses(
  category?: string,
  limit = 20,
  offset = 0,
): Promise<ExpensesResponse> {
  const params = new URLSearchParams({
    sort: "date_desc",
    limit: String(limit),
    offset: String(offset),
  });
  if (category) {
    params.set("category", category);
  }

  const response = await fetch(`${API_BASE}/expenses?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to fetch expenses");
  }
  return response.json();
}

export async function createExpense(
  payload: ExpenseCreatePayload,
  idempotencyKey: string,
): Promise<Expense> {
  const response = await fetch(`${API_BASE}/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    // Surface the first field-level validation message if present
    const detail = json?.detail;
    let msg = json?.error ?? "Failed to create expense";
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const firstField = Object.values(detail)[0];
      if (firstField) msg = String(firstField);
    } else if (Array.isArray(detail) && detail[0]?.msg) {
      msg = detail[0].msg;
    }
    throw new Error(msg);
  }

  return response.json();
}
