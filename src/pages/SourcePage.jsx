import { useState, useEffect } from "react";
import { CategorySection, CategoryDetail } from "../components/CategorySection.jsx";
import { MAIN_CATEGORY_ORDER } from "../constants.js";
import { groupByCategory, formatLabel, formatDate } from "../utils.js";

export function SourcePage({ period }) {
  const [data, setData] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    setSelectedCategory(null);
    const endpoint =
      period === "daily" ? "/api/sources" : `/api/period-sources?period=${period}`;
    fetch(endpoint)
      .then((res) => res.json())
      .then(setData)
      .catch(console.error);
  }, [period]);

  if (!data) return <section className="panel">Loading {period} sources...</section>;

  const sources = data.sources || [];
  const grouped = groupByCategory(sources, "priority");
  const representedCategories = MAIN_CATEGORY_ORDER.filter(
    (category) => grouped[category]?.length > 0
  ).length;

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{formatLabel(period)} Intake</p>
        <h1>{formatLabel(period)} AI Threat Sources</h1>
        <p>Top sources by threat category.</p>
      </header>

      <section className="metrics-grid">
        <div className="metric-card">
          <p>Total sources</p>
          <strong>{data.count || sources.length}</strong>
        </div>
        <div className="metric-card">
          <p>Categories with sources</p>
          <strong>{representedCategories}</strong>
        </div>
        <div className="metric-card wide">
          <p>Publication window</p>
          <strong>
            {formatDate(data.reporting_window?.start_utc || data.start)} SGT →{" "}
            {formatDate(data.reporting_window?.end_utc || data.end)} SGT
          </strong>
        </div>
      </section>

      {sources.length === 0 ? (
        <section className="panel">
          <h2>No sources found</h2>
          <p>No source records matched this period.</p>
        </section>
      ) : selectedCategory ? (
        <CategoryDetail
          category={selectedCategory}
          sources={grouped[selectedCategory] || []}
          onBack={() => setSelectedCategory(null)}
        />
      ) : (
        MAIN_CATEGORY_ORDER.map((category) => (
          <CategorySection
            key={category}
            category={category}
            sources={grouped[category] || []}
            onViewAll={setSelectedCategory}
          />
        ))
      )}
    </>
  );
}
