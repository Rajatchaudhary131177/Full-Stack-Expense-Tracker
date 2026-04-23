type Props = {
  page: number;          // 1-based
  pageSize: number;
  totalCount: number;
  onChange: (page: number) => void;
};

export default function Pagination({ page, pageSize, totalCount, onChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  const from = Math.min((page - 1) * pageSize + 1, totalCount);
  const to = Math.min(page * pageSize, totalCount);

  // Build page-number window: always show first, last, current ±1, with ellipsis
  const pages: (number | "…")[] = [];
  const add = (n: number) => {
    if (!pages.includes(n)) pages.push(n);
  };

  add(1);
  if (page > 3) pages.push("…");
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
    add(i);
  }
  if (page < totalPages - 2) pages.push("…");
  add(totalPages);

  return (
    <div className="pagination" role="navigation" aria-label="Pagination">
      <span className="pagination-info">
        Showing {from}–{to} of {totalCount}
      </span>

      <div className="pagination-controls">
        <button
          className="page-btn"
          onClick={() => onChange(1)}
          disabled={page === 1}
          aria-label="First page"
        >
          «
        </button>
        <button
          className="page-btn"
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
        >
          ‹
        </button>

        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="page-ellipsis">
              …
            </span>
          ) : (
            <button
              key={p}
              className={`page-btn${p === page ? " active" : ""}`}
              onClick={() => onChange(p as number)}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
            >
              {p}
            </button>
          ),
        )}

        <button
          className="page-btn"
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
        >
          ›
        </button>
        <button
          className="page-btn"
          onClick={() => onChange(totalPages)}
          disabled={page === totalPages}
          aria-label="Last page"
        >
          »
        </button>
      </div>
    </div>
  );
}
