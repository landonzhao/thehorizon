import { SourceCard } from "./SourceCard.jsx";
import { CATEGORY_LABELS, CATEGORY_DESCRIPTIONS } from "../constants.js";

function FeaturedTopThree({ sources }) {
  const topSources = sources.slice(0, 3);

  if (topSources.length === 0) {
    return (
      <div className="empty-category">
        <p>No sources in this category for this period.</p>
      </div>
    );
  }

  if (topSources.length === 1) {
    return (
      <div className="featured-layout one">
        <SourceCard source={topSources[0]} featured />
      </div>
    );
  }

  if (topSources.length === 2) {
    return (
      <div className="featured-layout two">
        <SourceCard source={topSources[0]} featured />
        <SourceCard source={topSources[1]} featured />
      </div>
    );
  }

  return (
    <div className="featured-layout three">
      <div className="featured-top">
        <SourceCard source={topSources[0]} featured />
      </div>
      <div className="featured-bottom">
        <SourceCard source={topSources[1]} />
        <SourceCard source={topSources[2]} />
      </div>
    </div>
  );
}

export function CategorySection({ category, sources, onViewAll }) {
  const remaining = Math.max(0, sources.length - 3);

  return (
    <section className="category-panel">
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
          <button className="ghost-button" onClick={() => onViewAll(category)}>
            View all
          </button>
        </div>
      </div>

      <FeaturedTopThree sources={sources} />

      {remaining > 0 && (
        <p className="archive-note">
          Showing top 3 by priority. {remaining} more source
          {remaining === 1 ? "" : "s"} available in this category.
        </p>
      )}
    </section>
  );
}

export function CategoryDetail({ category, sources, onBack }) {
  return (
    <section className="category-panel">
      <div className="category-header">
        <div>
          <p className="eyebrow">Category Detail</p>
          <h2>{CATEGORY_LABELS[category]}</h2>
          <p>{CATEGORY_DESCRIPTIONS[category]}</p>
        </div>
        <button className="ghost-button" onClick={onBack}>
          ← Back to overview
        </button>
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
