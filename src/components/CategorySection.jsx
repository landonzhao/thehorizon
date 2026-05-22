import { SourceCard } from "./SourceCard.jsx";
import { CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, CAT_COLOURS } from "../constants.js";

function FeaturedTopThree({ sources }) {
  const top = sources.slice(0, 3);

  if (top.length === 0) {
    return (
      <div className="empty-category">
        <p>No sources in this category for this period.</p>
      </div>
    );
  }

  if (top.length === 1) {
    return (
      <div className="featured-layout one">
        <SourceCard source={top[0]} featured />
      </div>
    );
  }

  if (top.length === 2) {
    return (
      <div className="featured-layout two">
        <SourceCard source={top[0]} featured />
        <SourceCard source={top[1]} featured />
      </div>
    );
  }

  return (
    <div className="featured-layout three">
      <div className="featured-top">
        <SourceCard source={top[0]} featured />
      </div>
      <div className="featured-bottom">
        <SourceCard source={top[1]} />
        <SourceCard source={top[2]} />
      </div>
    </div>
  );
}

export function CategorySection({ category, sources, onViewAll }) {
  const remaining = Math.max(0, sources.length - 3);
  const accent = CAT_COLOURS[category] || "#334155";

  return (
    <section className="category-panel" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="category-header">
        <div>
          <p className="eyebrow">Category</p>
          <h2>{CATEGORY_LABELS[category]}</h2>
          <p>{CATEGORY_DESCRIPTIONS[category]}</p>
        </div>

        <div className="category-actions">
          <div className="category-count">
            <strong>{sources.length}</strong>
            <span>sources</span>
          </div>
          {sources.length > 0 && (
            <button className="ghost-button" onClick={() => onViewAll(category)}>
              View all
            </button>
          )}
        </div>
      </div>

      <FeaturedTopThree sources={sources} />

      {remaining > 0 && (
        <p className="archive-note">
          Showing top 3 by priority — {remaining} more source{remaining === 1 ? "" : "s"} available.{" "}
          <button className="inline-link" onClick={() => onViewAll(category)}>
            View all →
          </button>
        </p>
      )}
    </section>
  );
}

export function CategoryDetail({ category, sources, onBack }) {
  const accent = CAT_COLOURS[category] || "#334155";

  return (
    <section className="category-panel" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="category-header">
        <div>
          <p className="eyebrow">Category Detail</p>
          <h2>{CATEGORY_LABELS[category]}</h2>
          <p>{CATEGORY_DESCRIPTIONS[category]}</p>
        </div>
        <div className="category-actions">
          <div className="category-count">
            <strong>{sources.length}</strong>
            <span>sources</span>
          </div>
          <button className="ghost-button" onClick={onBack}>
            ← Back
          </button>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="empty-category">
          <p>No sources in this category for this period.</p>
        </div>
      ) : (
        <div className="source-grid">
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      )}
    </section>
  );
}
