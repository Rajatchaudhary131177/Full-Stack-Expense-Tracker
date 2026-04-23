import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";
import * as api from "../api";

jest.mock("../api");

const mockFetch = api.fetchExpenses as jest.MockedFunction<typeof api.fetchExpenses>;
const mockCreate = api.createExpense as jest.MockedFunction<typeof api.createExpense>;

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
}

const emptyResponse = { expenses: [], total: "0.00", count: 0, limit: 100, offset: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockFetch.mockResolvedValue(emptyResponse);
});

describe("ExpenseForm validation", () => {
  it("shows error when amount is missing", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));
    expect(await screen.findByText(/amount must be/i)).toBeInTheDocument();
  });

  it("shows error when date is missing", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));
    expect(await screen.findByText(/date is required/i)).toBeInTheDocument();
  });

  it("shows error when amount < 1", async () => {
    renderApp();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));
    expect(await screen.findByText(/at least 1/i)).toBeInTheDocument();
  });
});

describe("Optimistic submit flow", () => {
  it("shows pending row immediately and confirmed after success", async () => {
    const serverExpense = {
      id: "abc-123",
      amount: "50.00",
      category: "Groceries",
      description: "",
      date: "2026-04-24",
      created_at: "2026-04-24T10:00:00Z",
    };

    let resolveMutate!: (v: typeof serverExpense) => void;
    mockCreate.mockReturnValue(new Promise((r) => { resolveMutate = r; }));

    renderApp();

    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-04-24" } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));

    expect(await screen.findByText("pending")).toBeInTheDocument();

    mockFetch.mockResolvedValue({
      expenses: [serverExpense],
      total: "50.00",
      count: 1,
      limit: 100,
      offset: 0,
    });
    resolveMutate(serverExpense);

    await waitFor(() => expect(screen.queryByText("pending")).not.toBeInTheDocument());
  });

  it("shows failed status and retry button on network error", async () => {
    mockCreate.mockRejectedValue(new Error("Network error"));

    renderApp();

    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-04-24" } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));

    await waitFor(() => expect(screen.getByText("failed")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
