import { formatLabel, formatDate, getCredibilityLabel } from "../utils.js";

export function TagList({ tags = [] }) {
  const cleanTags = [...new Set(tags)].filter(Boolean).slice(0, 10);
  if (!cleanTags.length) return null;

  return (
    <div className="tag-row">
      {cleanTags.map((tag) => (
        <span key={tag}>{formatLabel(tag)}</span>
      ))}
    </div>
  );
}

export function SourceCard({ source, featured = false }) {
  const credibility = getCredibilityLabel(source);
  const text = source.short_summary || source.summary || source.full_text || "";
  const priorityScore = source.priority_score ?? "—";
  const priorityLabel = source.priority_label || "unscored";

  return (
    <article className={`source-card ${featured ? "featured-card" : ""}`}>
      <div className="source-card-top">
        <span className="source-type">{formatLabel(source.source_type)}</span>
        <span className={`priority-pill ${priorityLabel}`}>
          {formatLabel(priorityLabel)} · {priorityScore}
        </span>
      </div>

      <h3>{source.title}</h3>

      <p className="meta">
        {source.publisher || "Unknown publisher"} · {formatDate(source.date_published)}
      </p>

      {source.priority_reason && <p className="reason">{source.priority_reason}</p>}

      <p className="summary">
        {text ? text.slice(0, featured ? 620 : 420) : "No summary available."}
      </p>

      <TagList tags={source.tags || []} />

      <div className="card-footer">
        <span className={`credibility ${credibility}`}>{formatLabel(credibility)}</span>
        <a href={source.url} target="_blank" rel="noreferrer">
          Open source →
        </a>
      </div>
    </article>
  );
}
