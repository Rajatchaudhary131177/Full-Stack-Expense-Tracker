import { displayDate, formatCurrency } from "../utils";
import type { Expense, PendingExpense } from "../types";

type Props = {
  expenses: Expense[];
  pendingExpenses: PendingExpense[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onRetryPending: (item: PendingExpense) => void;
  categoryFilter: string;
};

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <tr key={i} className="skeleton-row">
          {[80, 100, 120, 90, 70].map((w, j) => (
            <td key={j}>
              <div className="skeleton-cell" style={{ width: `${w}px` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function ExpenseList({
  expenses,
  pendingExpenses,
  isLoading,
  isError,
  onRetry,
  onRetryPending,
  categoryFilter,
}: Props) {
  // Case-insensitive filter match for pending rows, consistent with backend
  const filteredPending = categoryFilter
    ? pendingExpenses.filter(
        (p) => p.payload.category.toLowerCase() === categoryFilter.toLowerCase(),
      )
    : pendingExpenses;

  const hasRows = expenses.length > 0 || filteredPending.length > 0;

  if (isError) {
    return (
      <div className="error-state" role="alert">
        <p>Failed to load expenses.</p>
        <button onClick={onRetry}>Retry</button>
      </div>
    );
  }

  return (
    <div className="expense-table-wrap">
      <table aria-label="Expenses">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Category</th>
            <th scope="col">Description</th>
            <th scope="col" className="col-amount">Amount</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <SkeletonRows />
          ) : !hasRows ? (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">
                  {categoryFilter
                    ? `No expenses found for "${categoryFilter}".`
                    : "No expenses yet. Add one above."}
                </div>
              </td>
            </tr>
          ) : (
            <>
              {/* Pending / failed rows at the top */}
              {filteredPending.map((p) => (
                <tr key={p.tempId} className="pending-row">
                  <td>{displayDate(p.payload.date)}</td>
                  <td>{p.payload.category}</td>
                  <td className="col-desc">{p.payload.description || "—"}</td>
                  <td className="col-amount">{formatCurrency(p.payload.amount)}</td>
                  <td>
                    <span className={`status-badge ${p.status}`}>{p.status}</span>
                    {p.status === "failed" && (
                      <button
                        className="retry-btn"
                        onClick={() => onRetryPending(p)}
                        aria-label="Retry failed submission"
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Confirmed server rows */}
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>{displayDate(e.date)}</td>
                  <td>{e.category}</td>
                  <td className="col-desc">{e.description || "—"}</td>
                  <td className="col-amount">{formatCurrency(e.amount)}</td>
                  <td>
                    <span className="status-badge confirmed">confirmed</span>
                  </td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
