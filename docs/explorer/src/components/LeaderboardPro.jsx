import React, { useMemo, useState } from "react";
import { computePoints } from "../utils/scoring";
import { getProviderFromModelId } from "../utils/modelUtils";

// Keep a calm blue for outlines if needed
function colorAt(p) {
  const l = 62 - p * 18; // 62% → 44%
  const s = 38 + p * 8;  // 38% → 46%
  return `hsl(210 ${s}% ${l}%)`;
}

export default function LeaderboardPro({
  models,
  onModelClick,
  instructionLevel,
  onInstructionLevelChange,
  hasHigh,
  minimalModels,
  highModels,
  attemptsCurrent,
  attemptsMinimal,
  attemptsHigh,
}) {
  const [sortMode, setSortMode] = useState("score"); // 'score' | 'deltaH'
  const [sortDir, setSortDir] = useState("desc"); // 'asc' | 'desc'

  const mapBySlug = (arr) => { const m = {}; (arr || []).forEach((x) => (m[x.slug] = x)); return m; };
  const minMap = useMemo(() => mapBySlug(minimalModels), [minimalModels]);
  const highMap = useMemo(() => mapBySlug(highModels), [highModels]);

  const sorted = useMemo(() => {
    const arr = [...(models || [])];
    if (sortMode === "deltaH") {
      return arr.sort((a, b) => {
        const aMin = computePoints(minMap[a.slug]?.summary || {}, attemptsMinimal);
        const aHigh = computePoints(highMap[a.slug]?.summary || {}, attemptsHigh);
        const bMin = computePoints(minMap[b.slug]?.summary || {}, attemptsMinimal);
        const bHigh = computePoints(highMap[b.slug]?.summary || {}, attemptsHigh);
        const aD = isFinite(aHigh) && isFinite(aMin) ? aHigh - aMin : (sortDir === "desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
        const bD = isFinite(bHigh) && isFinite(bMin) ? bHigh - bMin : (sortDir === "desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
        if (aD === bD) {
          const as = computePoints(a.summary || {}, attemptsCurrent);
          const bs = computePoints(b.summary || {}, attemptsCurrent);
          return sortDir === "desc" ? bs - as : as - bs;
        }
        return sortDir === "desc" ? bD - aD : aD - bD;
      });
    }
    return arr.sort((a, b) => {
      const as = computePoints(a.summary || {}, attemptsCurrent);
      const bs = computePoints(b.summary || {}, attemptsCurrent);
      return sortDir === "desc" ? bs - as : as - bs;
    });
  }, [models, sortMode, sortDir, attemptsCurrent, attemptsMinimal, attemptsHigh, minMap, highMap]);

  const maxScore = useMemo(() => {
    const top = sorted[0];
    if (!top) return 1;
    return Math.max(1, computePoints(top.summary || {}, attemptsCurrent));
  }, [sorted, attemptsCurrent]);

  return (
    <>
      <div className="card pro-header">
        <div className="intro-meta" style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <span>Instruction level</span>
          <div className="segmented">
            <button className={instructionLevel === "minimal" ? "active" : ""} onClick={() => onInstructionLevelChange("minimal")}>Minimal</button>
            <button className={instructionLevel === "high" ? "active" : ""} onClick={() => hasHigh && onInstructionLevelChange("high")} disabled={!hasHigh}>High</button>
          </div>
        </div>
        <div className="segmented" aria-label="Sort">
          <button className={sortMode === "score" ? "active" : ""} onClick={() => { if (sortMode === "score") setSortDir((d) => (d === "desc" ? "asc" : "desc")); else { setSortMode("score"); setSortDir("desc"); } }}>Sort: Score{sortMode === "score" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</button>
          <button className={sortMode === "deltaH" ? "active" : ""} onClick={() => { if (sortMode === "deltaH") setSortDir((d) => (d === "desc" ? "asc" : "desc")); else { setSortMode("deltaH"); setSortDir("desc"); } }} disabled={(minimalModels || []).length === 0 || (highModels || []).length === 0}>Sort: ΔH{sortMode === "deltaH" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</button>
        </div>
      </div>

      <div className="pro-legend" style={{ display:'flex', alignItems:'center', gap:'.6rem', margin:'-.25rem 0 .25rem 180px', color:'#7a7a7a', fontSize:'.78rem' }}>
        <span style={{ fontFamily:'var(--mono)' }}>Label bands:</span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:'.35rem' }}>
          <span style={{ width:12, height:8, background:'#ead1cf', borderRadius:2, border:'1px solid #e4d4cf' }}></span> very low
        </span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:'.35rem' }}>
          <span style={{ width:12, height:8, background:'#e9e0c8', borderRadius:2, border:'1px solid #e2dac6' }}></span> low
        </span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:'.35rem' }}>
          <span style={{ width:12, height:8, background:'#d7e3cf', borderRadius:2, border:'1px solid #d0dbc8' }}></span> medium
        </span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:'.35rem' }}>
          <span style={{ width:12, height:8, background:'#cddbea', borderRadius:2, border:'1px solid #c6d3e2' }}></span> high
        </span>
      </div>
      <div className="pro-lb">
        {/* Axis ticks at 0,25,50,75,100 */}
        <div className="pro-axis">
          {[0,25,50,75,100].map((t) => (
            <div key={t} className="pro-tick" style={{ left: `${t}%` }}><span>{t === 0 ? "0" : t === 100 ? `${Math.round(maxScore)}` : ''}</span></div>
          ))}
        </div>
        {sorted.map((m, idx) => {
          const points = computePoints(m.summary || {}, attemptsCurrent);
          const pct = Math.max(0, Math.min(100, (points / maxScore) * 100));
          const provider = getProviderFromModelId(m.id);
          const bands = (() => {
            const lc = m.summary?.label_counts || {};
            const total = Math.max(1, Number(m.summary?.num_samples || 50));
            const veryLow = Number(lc.very_low || 0) / total * 100;
            const low = Number(lc.low || 0) / total * 100;
            const medium = Number(lc.medium || 0) / total * 100;
            const high = Number(lc.high || 0) / total * 100;
            return [
              { key: 'very_low', w: veryLow, c: '#e89a97' },   // rose
              { key: 'low', w: low, c: '#e6c26a' },            // amber
              { key: 'medium', w: medium, c: '#93c58c' },      // sage green
              { key: 'high', w: high, c: '#7baee8' },          // blue
            ];
          })();
          return (
            <div key={m.slug} className="pro-row" onClick={() => onModelClick(m)}>
              <div className="pro-name">
                <div className="pro-rank">{idx + 1}</div>
                <div className="pro-id">
                  <div className="pro-model">{m.id}</div>
                  <div className="pro-sub">{provider}</div>
                </div>
              </div>
              <div className="pro-bar">
                <div className="pro-track">
                  <div className="pro-fill" style={{ width: `${pct}%` }}>
                    <div className="pro-fill-bands">
                      {bands.map((b) => b.w > 0 ? (
                        <div key={b.key} className="pro-fill-band" style={{ width: `${b.w}%`, background: b.c }} />
                      ) : null)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="pro-score">
                <div className="pro-points">{Math.round(points)}</div>
                {/* Legend is global; no per-row delta */}
              </div>
              <div className="pro-bar-mobile">
                <div className="pro-mobile-fill" style={{ width: `${pct}%` }}>
                  <div className="pro-fill-bands">
                    {bands.map((b) => b.w > 0 ? (
                      <div key={b.key} className="pro-fill-band" style={{ width: `${b.w}%`, background: b.c }} />
                    ) : null)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
