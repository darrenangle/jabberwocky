import React, { useMemo, useState } from "react";
import { computePoints } from "../utils/scoring";
import { getProviderFromModelId } from "../utils/modelUtils";
import { RADAR_COLORS } from "../utils/constants";

export default function LeaderboardBars({
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

  const toMap = (arr) => { const m = {}; (arr || []).forEach((x) => (m[x.slug] = x)); return m; };
  const minMap = useMemo(() => toMap(minimalModels), [minimalModels]);
  const highMap = useMemo(() => toMap(highModels), [highModels]);

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
    const first = sorted[0];
    if (!first) return 1;
    return Math.max(1, computePoints(first.summary || {}, attemptsCurrent));
  }, [sorted, attemptsCurrent]);

  const rankMap = useMemo(() => {
    const arr = [...(models || [])];
    const metric = (m) => sortMode === "deltaH"
      ? (computePoints(highMap[m.slug]?.summary || {}, attemptsHigh) - computePoints(minMap[m.slug]?.summary || {}, attemptsMinimal))
      : computePoints(m.summary || {}, attemptsCurrent);
    arr.sort((a, b) => metric(b) - metric(a));
    const map = {}; arr.forEach((m, i) => (map[m.slug] = i + 1));
    return map;
  }, [models, sortMode, attemptsCurrent, attemptsMinimal, attemptsHigh, minMap, highMap]);

  return (
    <>
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem", flexWrap: "wrap" }}>
        <div className="intro-meta" style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
          <span>Instruction level</span>
          <button className="info-button" title="Why two levels?" onClick={() => window.alert('High includes rubric guidance; minimal is light prompt. Δ(min→high) measures instruction sensitivity.')}>i</button>
        </div>
        <div className="segmented">
          <button className={instructionLevel === "minimal" ? "active" : ""} onClick={() => onInstructionLevelChange("minimal")}>Minimal</button>
          <button className={instructionLevel === "high" ? "active" : ""} onClick={() => hasHigh && onInstructionLevelChange("high")} disabled={!hasHigh}>High</button>
        </div>
        <div className="intro-meta" style={{ opacity: .7 }}>Sparkline: light=min • dark=high</div>
        <div className="segmented" aria-label="Sort">
          <button
            className={sortMode === "score" ? "active" : ""}
            onClick={() => { if (sortMode === "score") setSortDir((d) => (d === "desc" ? "asc" : "desc")); else { setSortMode("score"); setSortDir("desc"); } }}
          >
            {`Sort: Score${sortMode === "score" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}`}
          </button>
          <button
            className={sortMode === "deltaH" ? "active" : ""}
            onClick={() => { if (sortMode === "deltaH") setSortDir((d) => (d === "desc" ? "asc" : "desc")); else { setSortMode("deltaH"); setSortDir("desc"); } }}
            disabled={(minimalModels || []).length === 0 || (highModels || []).length === 0}
          >
            {`Sort: ΔH${sortMode === "deltaH" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}`}
          </button>
        </div>
      </div>

      <div className="lb-list">
        {sorted.map((model, index) => {
          const rank = rankMap[model.slug] || index + 1;
          const points = computePoints(model.summary || {}, attemptsCurrent);
          const pct = (points / maxScore) * 100;
          const provider = getProviderFromModelId(model.id);
          const color = RADAR_COLORS[index % RADAR_COLORS.length];
          const hp = computePoints(highMap[model.slug]?.summary || {}, attemptsHigh);
          const mp = computePoints(minMap[model.slug]?.summary || {}, attemptsMinimal);
          const delta = isFinite(hp) && isFinite(mp) ? hp - mp : null;
          return (
            <div key={model.slug} className="lb-item" onClick={() => onModelClick(model)}>
              <div className={`lb-rank r-${rank}`}>{rank}</div>
              <div className="lb-main">
                <div className="lb-head">
                  <div className="lb-name">{model.id}</div>
                  <div className="lb-sub">
                    <span className="lb-provider">{provider}</span>
                    <span className="lb-view">View poems →</span>
                    {(() => {
                      const y = (v) => 20 - Math.max(0, Math.min(1, v || 0)) * 16;
                      if (!isFinite(minMap[model.slug]?.summary?.overall_reward) && !isFinite(highMap[model.slug]?.summary?.overall_reward)) return null;
                      return (
                        <svg className="lb-spark" viewBox="0 0 100 24" aria-label="instruction sensitivity sparkline">
                          <polyline points={`5,${y(minMap[model.slug]?.summary?.overall_reward)} 95,${y(highMap[model.slug]?.summary?.overall_reward)}`} fill="none" stroke="#111" strokeWidth="1" opacity="0.45" />
                          {minMap[model.slug]?.summary?.overall_reward != null && (<circle cx="5" cy={y(minMap[model.slug]?.summary?.overall_reward)} r="2.1" fill="#c8c2b6" />)}
                          {highMap[model.slug]?.summary?.overall_reward != null && (<circle cx="95" cy={y(highMap[model.slug]?.summary?.overall_reward)} r="2.1" fill="#111" />)}
                        </svg>
                      );
                    })()}
                  </div>
                </div>
                <div className="lb-bar">
                  <div className="lb-track">
                    <div className="lb-fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              </div>
              <div className="lb-score">
                <div className="lb-points">{Math.round(points)}</div>
                <div className="lb-label">SCORE</div>
                {delta != null && <div className="lb-delta">{delta > 0 ? "+" : ""}{Math.round(delta)}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

