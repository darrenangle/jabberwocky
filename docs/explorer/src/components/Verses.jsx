import React, { useCallback, useEffect, useState } from "react";
import Loading from "./Loading";
import { normalizeScore } from "../utils/scoring";

export default function Verses({ models, samples, loadSamples }) {
  const [filters, setFilters] = useState({ modelSlug: "", minReward: 0, label: "" });
  const [displayedSamples, setDisplayedSamples] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFilteredSamples = useCallback(async () => {
    setLoading(true);
    try {
      let allSamples = [];
      if (!filters.modelSlug) {
        const topModels = models.slice(0, 3);
        for (const model of topModels) {
          const modelSamples = await loadSamples(model);
          allSamples = allSamples.concat(
            modelSamples
              .sort((a, b) => (b.reward || 0) - (a.reward || 0))
              .slice(0, 10)
              .map((s) => ({ ...s, __modelId: model.id }))
          );
        }
      } else {
        const model = models.find((m) => m.slug === filters.modelSlug);
        if (model) {
          const modelSamples = await loadSamples(model);
          allSamples = modelSamples.map((s) => ({ ...s, __modelId: model.id }));
        }
      }
      const filtered = allSamples
        .filter((s) => (s.reward || 0) >= filters.minReward)
        .filter((s) => !filters.label || s.label === filters.label)
        .sort((a, b) => (b.reward || 0) - (a.reward || 0))
        .slice(0, 50);
      setDisplayedSamples(filtered);
      setLoading(false);
    } catch (err) {
      console.error("Error loading verses:", err);
      setLoading(false);
    }
  }, [filters, models, loadSamples]);

  useEffect(() => { if (models.length > 0) loadFilteredSamples(); }, [loadFilteredSamples, models]);

  return (
    <div>
      <div className="filter-bar">
        <select className="filter-select" value={filters.modelSlug} onChange={(e) => setFilters((prev) => ({ ...prev, modelSlug: e.target.value }))}>
          <option value="">Top 3 Models</option>
          {models.map((m) => (<option key={m.slug} value={m.slug}>{m.id}</option>))}
        </select>
        <input type="number" className="filter-input" placeholder="Min score" step="0.1" min="0" max="1" value={filters.minReward} onChange={(e) => setFilters((prev) => ({ ...prev, minReward: parseFloat(e.target.value) || 0 }))} />
        <select className="filter-select" value={filters.label} onChange={(e) => setFilters((prev) => ({ ...prev, label: e.target.value }))}>
          <option value="">All Labels</option>
          <option value="very_low">Very Low</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      {loading ? (
        <Loading />
      ) : (
        displayedSamples.map((sample, i) => (
          <div key={`${sample.__modelId}-${sample.i}-${i}`} className="verse-card">
            <div className="verse-meta">
              <span>{sample.__modelId}</span>
              <span>Score: {normalizeScore(sample.reward)}</span>
              <span>Label: {sample.label || "—"}</span>
              {(() => { const t = sample?.info?.topic; return <span title="Prompt topic">Topic: {t || "—"}</span>; })()}
            </div>
            <div className="verse-prompt">{sample.prompt}</div>
            <div className="verse-content" dangerouslySetInnerHTML={{ __html: sample.poem.split("\n").map((line) => line.replace(/\*(.*?)\*/g, "<em>$1</em>")).join("<br />") }} />
          </div>
        ))
      )}
    </div>
  );
}

