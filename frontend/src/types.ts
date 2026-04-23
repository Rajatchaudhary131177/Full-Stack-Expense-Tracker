export interface Expense {
  id: string;
  amount: string;
  category: string;
  description?: string | null;
  date: string;
  created_at: string;
}

export interface ExpenseCreatePayload {
  amount: string;
  category: string;
  description?: string;
  date: string;
}

export interface ExpensesResponse {
  expenses: Expense[];
  total: string;
  count: number;
  limit: number;
  offset: number;
}

export interface PendingExpense {
  tempId: string;
  idempotencyKey: string;
  payload: ExpenseCreatePayload;
  status: "pending" | "failed";
}
