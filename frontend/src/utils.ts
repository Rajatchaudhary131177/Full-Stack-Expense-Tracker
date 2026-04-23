import Decimal from "decimal.js";

Decimal.set({ toExpPos: 40, toExpNeg: -40 }); // never use scientific notation

/** Format a string or numeric amount as ₹1,23,456.78 (Indian locale). */
export function formatCurrency(amount: string | number): string {
  try {
    const num = new Decimal(String(amount)).toDecimalPlaces(2).toNumber();
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return "₹0.00";
  }
}

/** Safe Decimal sum of an array of string amounts. Never overflows JS float. */
export function sumAmounts(amounts: string[]): string {
  return amounts
    .reduce((acc, a) => {
      try {
        return acc.plus(new Decimal(a));
      } catch {
        return acc;
      }
    }, new Decimal(0))
    .toDecimalPlaces(2)
    .toFixed(2);
}

/** Strip HTML tags and common injection characters from user input. */
export function sanitizeInput(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")        // HTML tags
    .replace(/[<>"'`;]/g, "")       // injection chars
    .replace(/\x00/g, "")           // null bytes
    .trim();
}

/** Today's date in YYYY-MM-DD, used as the max= for date inputs. */
export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

/** Display date from YYYY-MM-DD → DD/MM/YYYY */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
