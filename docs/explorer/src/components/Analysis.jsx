import React, { useEffect, useMemo, useRef, useState } from "react";
import RadarViz from "./RadarViz";
import OverlayChips from "./OverlayChips";
import { useIsMobile, useIsCompact } from "../hooks/useMedia";
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
  const isMobile = useIsMobile();
  const isCompact = useIsCompact();
  const stackRef = useRef(null);
  const overlayRef = useRef(null);
  const [overlayH, setOverlayH] = useState(0);
  const [stackWidth, setStackWidth] = useState(0);
  const [vh, setVh] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);

  useEffect(() => {
    const measure = () => {
      const h = overlayRef.current ? Math.ceil(overlayRef.current.getBoundingClientRect().height) : 0;
      setOverlayH(h);
      const w = stackRef.current ? Math.floor(stackRef.current.clientWidth) : 0;
      setStackWidth(w);
    };
    measure();
    let rAF;
    const onResize = () => { cancelAnimationFrame(rAF); rAF = requestAnimationFrame(measure); };
    window.addEventListener('resize', onResize);
    const t = setTimeout(measure, 60);
    return () => { clearTimeout(t); cancelAnimationFrame(rAF); window.removeEventListener('resize', onResize); };
  }, [allModels, selected, isMobile]);

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight || 800);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

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

  const controlsH = overlayH || 0;
  const minSquare = (isMobile || isCompact) ? 600 : 720;
  const targetVH = vh; // fit to viewport height
  const availH = Math.max(minSquare, targetVH - controlsH - 24);
  const square = Math.max(minSquare, Math.min(availH, stackWidth || availH));

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

      {(isMobile || isCompact) ? (
        <div className="card radar-card">
          <div className="radar-stack" ref={stackRef} style={{ height: square, paddingTop: overlayH ? overlayH + 8 : 0 }}>
            <RadarViz
              models={enabledModels}
              showLegend={false}
              variant={"hero"}
              hoverSlug={hoverSlug}
              onHoverChange={setHoverSlug}
              colorMap={colorMap}
              style={{ width: square, height: square }}
            />
            <OverlayChips
              allModels={allModels}
              selected={selected}
              colorMap={colorMap}
              onToggle={toggleOne}
              onAll={allOn}
              onNone={allOff}
              bottom={false}
              onHover={setHoverSlug}
              ref={overlayRef}
              floating={true}
            />
          </div>
        </div>
      ) : (
        <div className="analysis-grid">
          <div className="card analysis-sidebar">
            <h4 style={{ marginBottom: '.5rem', fontFamily: 'var(--serif)' }}>Models</h4>
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
              <button className="chip action" onClick={allOn}>All</button>
              <button className="chip action" onClick={allOff}>None</button>
            </div>
            <div className="chip-column">
              {allModels.map((m) => {
                const active = selected.has(m.slug);
                return (
                  <button
                    key={m.slug}
                    className={`chip ${active ? 'active' : ''}`}
                    onClick={() => toggleOne(m.slug)}
                    onMouseEnter={() => setHoverSlug(m.slug)}
                    onMouseLeave={() => setHoverSlug(null)}
                    title={m.id}
                    style={{
                      justifyContent: 'flex-start',
                      borderColor: active ? colorMap[m.slug] : undefined,
                      background: active ? `${colorMap[m.slug]}22` : undefined,
                    }}
                  >
                    <span className="dot" style={{ background: colorMap[m.slug] }} />
                    <span className="label">{m.id}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="card radar-card">
            <div className="radar-stack" ref={stackRef} style={{ height: square }}>
              <RadarViz
                models={enabledModels}
                showLegend={false}
                variant={"modal"}
                hoverSlug={hoverSlug}
                onHoverChange={setHoverSlug}
                colorMap={colorMap}
                style={{ width: square, height: square }}
              />
            </div>
          </div>
        </div>
      )}

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
