import React, { useMemo, useState } from "react";
import RadarViz from "./RadarViz";
import { RADAR_COLORS } from "../utils/constants";

export default function RadarModal({ models, onClose }) {
  const top10 = (models || []).slice(0, 10);
  const [hoverSlug, setHoverSlug] = useState(null);
  const colorMap = useMemo(() => {
    const map = {};
    top10.forEach((m, idx) => { map[m.slug] = RADAR_COLORS[idx % RADAR_COLORS.length]; });
    return map;
  }, [top10]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Top Models — Criteria Radar</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="modal-body radar-layout">
          <div className="radar-side">
            <div className="radar-controls">
              <div className="radar-grid">
                {top10.map((m) => (
                  <div key={m.slug} className="legend-check" onMouseEnter={() => setHoverSlug(m.slug)} onMouseLeave={() => setHoverSlug(null)}>
                    <span className="legend-swatch" style={{ background: colorMap[m.slug] }} />
                    <span>{m.id}</span>
                  </div>
                ))}
              </div>
              <div className="radar-note">Hover to focus a model. Axes are labeled by criterion.</div>
            </div>
          </div>
          <div className="radar-main">
            <RadarViz models={top10} showLegend={false} variant="modal" hoverSlug={hoverSlug} colorMap={colorMap} />
          </div>
        </div>
      </div>
    </div>
  );
}

