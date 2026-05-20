import { formatLabel } from "../utils.js";

const PAGES = ["report", "daily", "weekly", "monthly", "quarterly", "archive"];

export function Nav({ page, setPage }) {
  return (
    <nav className="top-nav">
      <strong>The Horizon</strong>
      <div>
        {PAGES.map((item) => (
          <button
            key={item}
            className={page === item ? "active" : ""}
            onClick={() => setPage(item)}
          >
            {item === "report" ? "Report" : formatLabel(item)}
          </button>
        ))}
      </div>
    </nav>
  );
}
