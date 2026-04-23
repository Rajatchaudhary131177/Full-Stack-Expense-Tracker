type Props = {
  categories: string[];
  selected: string;
  onChange: (value: string) => void;
};

export default function FilterBar({ categories, selected, onChange }: Props) {
  return (
    <div className="filter-bar">
      <label htmlFor="category-filter">Filter by category</label>
      <select
        id="category-filter"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter expenses by category"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {selected && (
        <button
          className="clear-btn"
          onClick={() => onChange("")}
          aria-label="Clear category filter"
        >
          Clear
        </button>
      )}
    </div>
  );
}
