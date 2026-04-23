import { useState, useRef, type ChangeEvent, type FormEvent } from "react";
import type { ExpenseCreatePayload } from "../types";
import { sanitizeInput, todayISO } from "../utils";

const PRESET_CATEGORIES = [
  "Groceries",
  "Transport",
  "Entertainment",
  "Bills",
  "Healthcare",
  "Other",
];

const MAX_AMOUNT = 1_000_000;
const MAX_DESC = 500;
const MAX_CAT = 100;

type Props = {
  onSubmit: (expense: ExpenseCreatePayload) => void;
  submitting: boolean;
};

type Errors = Partial<Record<"amount" | "category" | "description" | "date", string>>;

export default function ExpenseForm({ onSubmit, submitting }: Props) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(PRESET_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  // Guard against concurrent double-clicks: ref is cheaper than state for this
  const submittingRef = useRef(false);

  const resolvedCategory =
    category === "Other" ? customCategory.trim() : category;

  // ── Inline amount filter: allow only digits + at most one dot + 2 decimals
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d+\.?\d{0,2}$/.test(val)) {
      setAmount(val);
      if (errors.amount) setErrors((prev) => ({ ...prev, amount: undefined }));
    }
    // Silently drop non-conforming characters — prevents pasting "abc" or "1e5"
  };

  const handleDescChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.slice(0, MAX_DESC);
    setDescription(val);
  };

  const validate = (): Errors => {
    const errs: Errors = {};

    // ── Date ────────────────────────────────────────────────────────────── #
    if (!date) {
      errs.date = "Date is required.";
    } else {
      const today = todayISO();
      if (date > today) {
        errs.date = "Future dates are not allowed.";
      }
    }

    // ── Category ────────────────────────────────────────────────────────── #
    const cat = sanitizeInput(resolvedCategory);
    if (!cat) {
      errs.category = "Category is required.";
    } else if (cat.length > MAX_CAT) {
      errs.category = `Category must be at most ${MAX_CAT} characters.`;
    }

    // ── Amount ──────────────────────────────────────────────────────────── #
    if (!amount) {
      errs.amount = "Amount is required.";
    } else if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      errs.amount = "Enter a valid amount (e.g. 100 or 99.99).";
    } else {
      const n = Number(amount);
      if (n < 1) {
        errs.amount = "Amount must be at least ₹1.";
      } else if (n > MAX_AMOUNT) {
        errs.amount = `Amount must not exceed ₹${MAX_AMOUNT.toLocaleString("en-IN")}.`;
      }
    }

    // ── Description ─────────────────────────────────────────────────────── #
    if (description.length > MAX_DESC) {
      errs.description = `Description must be at most ${MAX_DESC} characters.`;
    }

    return errs;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (submitting || submittingRef.current) return;

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    submittingRef.current = true;
    setErrors({});

    const cleanedDesc = sanitizeInput(description);
    const cleanedCat = sanitizeInput(resolvedCategory);

    onSubmit({
      // Always send exactly 2 decimal places so the server sees "100.00"
      amount: Number(amount).toFixed(2),
      category: cleanedCat,
      description: cleanedDesc || undefined,
      date,
    });

    // Reset form
    setAmount("");
    setCategory(PRESET_CATEGORIES[0]);
    setCustomCategory("");
    setDescription("");
    setDate("");
    submittingRef.current = false;
  };

  const today = todayISO();

  return (
    <form className="expense-form" onSubmit={handleSubmit} noValidate>
      {/* Date */}
      <div className="form-row">
        <label htmlFor="exp-date">Date</label>
        <input
          id="exp-date"
          type="date"
          value={date}
          max={today}
          onChange={(e) => {
            setDate(e.target.value);
            if (errors.date) setErrors((p) => ({ ...p, date: undefined }));
          }}
          aria-describedby={errors.date ? "exp-date-err" : undefined}
          aria-invalid={!!errors.date}
        />
        {errors.date && (
          <span id="exp-date-err" className="field-error" role="alert">
            {errors.date}
          </span>
        )}
      </div>

      {/* Category */}
      <div className="form-row">
        <label htmlFor="exp-category">Category</label>
        <select
          id="exp-category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            if (errors.category) setErrors((p) => ({ ...p, category: undefined }));
          }}
        >
          {PRESET_CATEGORIES.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {/* Custom category — only shown when "Other" is selected */}
      {category === "Other" && (
        <div className="form-row">
          <label htmlFor="exp-custom-cat">Custom category</label>
          <input
            id="exp-custom-cat"
            type="text"
            value={customCategory}
            maxLength={MAX_CAT}
            placeholder="e.g. Education"
            onChange={(e) => {
              setCustomCategory(e.target.value);
              if (errors.category) setErrors((p) => ({ ...p, category: undefined }));
            }}
            aria-describedby={errors.category ? "exp-cat-err" : undefined}
            aria-invalid={!!errors.category}
          />
          {errors.category && (
            <span id="exp-cat-err" className="field-error" role="alert">
              {errors.category}
            </span>
          )}
        </div>
      )}

      {/* Amount — text input to prevent browser step-spinner & enforce format */}
      <div className="form-row">
        <label htmlFor="exp-amount">Amount (₹)</label>
        <input
          id="exp-amount"
          type="text"
          inputMode="decimal"
          value={amount}
          placeholder="0.00"
          autoComplete="off"
          onChange={handleAmountChange}
          aria-describedby={errors.amount ? "exp-amount-err" : undefined}
          aria-invalid={!!errors.amount}
        />
        {errors.amount && (
          <span id="exp-amount-err" className="field-error" role="alert">
            {errors.amount}
          </span>
        )}
      </div>

      {/* Description */}
      <div className="form-row">
        <label htmlFor="exp-desc">
          Description
          <span className="char-count"> ({description.length}/{MAX_DESC})</span>
        </label>
        <input
          id="exp-desc"
          type="text"
          value={description}
          placeholder="Optional"
          maxLength={MAX_DESC}
          onChange={handleDescChange}
          aria-describedby={errors.description ? "exp-desc-err" : undefined}
          aria-invalid={!!errors.description}
        />
        {errors.description && (
          <span id="exp-desc-err" className="field-error" role="alert">
            {errors.description}
          </span>
        )}
      </div>

      {/* Submit */}
      <div className="form-actions">
        <button type="submit" disabled={submitting || submittingRef.current}>
          {submitting ? "Saving…" : "Add Expense"}
        </button>
      </div>
    </form>
  );
}
