import React, { useEffect, useMemo, useState } from "react";
import RadarViz from "./RadarViz";
import { CRITERIA_KEYS, CRITERIA_LABELS, RADAR_COLORS } from "../utils/constants";

export default function Analysis({ models, instructionLevel, onInstructionLevelChange }) {
  const allModels = useMemo(() => models || [], [models]);
  const [selected, setSelected] = useState(() => new Set(allModels.slice(0, 10).map((m) => m.slug)));
  const [hoverSlug, setHoverSlug] = useState(null);

  useEffect(() => {
    setSelected(new Set(allModels.slice(0, 10).map((m) => m.slug)));
  }, [allModels]);

  const colorMap = useMemo(() => {
    const map = {};
    allModels.forEach((m, idx) => { map[m.slug] = RADAR_COLORS[idx % RADAR_COLORS.length]; });
    return map;
  }, [allModels]);

  const enabledModels = useMemo(() => allModels.filter((m) => selected.has(m.slug)), [allModels, selected]);

  const spread = useMemo(() => {
    const rows = [];
    for (let i = 0; i < CRITERIA_KEYS.length; i++) {
      const key = CRITERIA_KEYS[i];
      const label = CRITERIA_LABELS[i] || key;
      const vals = (models || [])
        .map((m) => m?.summary?.metrics_mean?.[key])
        .filter((v) => typeof v === "number" && isFinite(v));
      if (vals.length === 0) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length;
      const std = Math.sqrt(variance);
      rows.push({ key, label, mean, std, n: vals.length });
    }
    rows.sort((a, b) => a.mean - b.mean);
    return rows;
  }, [models]);

  const hardest = useMemo(() => spread.slice(0, 5), [spread]);
  const easiest = useMemo(() => spread.slice(-5).reverse(), [spread]);

  const allOn = () => setSelected(new Set(allModels.map((m) => m.slug)));
  const allOff = () => setSelected(new Set());
  const toggleOne = (slug) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  return (
    <div className="analysis">
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".75rem", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ marginBottom: ".35rem" }}>Analysis</h3>
          <div className="intro">Explore criteria performance and model radar overlays.</div>
        </div>
        <div className="segmented">
          <button className={instructionLevel === "minimal" ? "active" : ""} onClick={() => onInstructionLevelChange("minimal")}>Minimal</button>
          <button className={instructionLevel === "high" ? "active" : ""} onClick={() => onInstructionLevelChange("high")}>High</button>
        </div>
      </div>

      <div className="card radar-card">
        <div className="radar-toolbar">
          <div className="radar-toolbar-left">
            <button className="btn" onClick={allOn}>Enable all</button>
            <button className="btn secondary" onClick={allOff}>Disable all</button>
          </div>
          <div className="radar-grid legend">
            {allModels.map((m) => (
              <label key={m.slug} className={`legend-check ${selected.has(m.slug) ? "active" : ""}`}>
                <input type="checkbox" checked={selected.has(m.slug)} onChange={() => toggleOne(m.slug)} />
                <span className="legend-swatch" style={{ background: colorMap[m.slug] }} />
                <span>{m.id}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="radar-wrap">
          <RadarViz models={enabledModels} showLegend={false} variant="modal" hoverSlug={hoverSlug} onHoverChange={setHoverSlug} colorMap={colorMap} />
        </div>
      </div>

      <div className="card">
        <h3>Rubric spread</h3>
        <div className="summary-grid">
          <div className="summary-box hardest">
            <h4>Hardest Criteria</h4>
            <div className="summary-list">
              {hardest.map((r, idx) => (
                <div key={r.key} className="summary-item">
                  <span className="summary-rank">#{idx + 1}</span>
                  <span className="summary-label">{r.label}</span>
                  <span className="summary-value">{Math.round(r.mean * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="summary-box easiest">
            <h4>Easiest Criteria</h4>
            <div className="summary-list">
              {easiest.map((r, idx) => (
                <div key={r.key} className="summary-item">
                  <span className="summary-rank">#{idx + 1}</span>
                  <span className="summary-label">{r.label}</span>
                  <span className="summary-value">{Math.round(r.mean * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

