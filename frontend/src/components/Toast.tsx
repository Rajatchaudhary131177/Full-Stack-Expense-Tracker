import type { ToastMessage } from "../App";

type Props = { messages: ToastMessage[] };

export default function Toast({ messages }: Props) {
  if (messages.length === 0) return null;
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`toast ${m.type}`}>
          {m.text}
        </div>
      ))}
    </div>
  );
}
