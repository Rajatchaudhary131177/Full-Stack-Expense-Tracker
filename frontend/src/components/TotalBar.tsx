import { formatCurrency } from "../utils";

type Props = {
  total: string;
  label?: string;
};

export default function TotalBar({ total, label = "Total" }: Props) {
  return (
    <div className="total-bar">
      <span className="label">{label}:</span>
      <span className="amount">{formatCurrency(total)}</span>
    </div>
  );
}
