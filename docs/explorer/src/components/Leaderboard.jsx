import React, { useMemo, useState } from "react";
import { computePoints } from "../utils/scoring";
import { getProviderFromModelId } from "../utils/modelUtils";

export default function Leaderboard({
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
  const [showInfo, setShowInfo] = useState(false);

  const sortedModels = useMemo(() => {
    const arr = [...models];
    if (sortMode === "deltaH") {
      const toMap = (xs) => {
        const m = {}; (xs || []).forEach((x) => (m[x.slug] = x)); return m;
      };
      const minMap = toMap(minimalModels);
      const highMap = toMap(highModels);
      return arr.sort((a, b) => {
        const aMinPts = computePoints(minMap[a.slug]?.summary || {}, attemptsMinimal);
        const aHighPts = computePoints(highMap[a.slug]?.summary || {}, attemptsHigh);
        const bMinPts = computePoints(minMap[b.slug]?.summary || {}, attemptsMinimal);
        const bHighPts = computePoints(highMap[b.slug]?.summary || {}, attemptsHigh);
        const missing = sortDir === "desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
        const aD = isFinite(aHighPts) && isFinite(aMinPts) ? aHighPts - aMinPts : missing;
        const bD = isFinite(bHighPts) && isFinite(bMinPts) ? bHighPts - bMinPts : missing;
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
  }, [models, sortMode, sortDir, minimalModels, highModels, attemptsCurrent, attemptsMinimal, attemptsHigh]);

  const maxScore = (() => {
    const first = sortedModels[0];
    if (!first) return 1;
    return Math.max(1, computePoints(first.summary || {}, attemptsCurrent));
  })();

  const getRankClass = (rank) => {
    if (rank === 1) return "rank-1";
    if (rank === 2) return "rank-2";
    if (rank === 3) return "rank-3";
    return "rank-default";
  };

  const toMap = (arr) => {
    const map = {}; (arr || []).forEach((m) => { map[m.slug] = m; }); return map;
  };
  const minMap = useMemo(() => toMap(minimalModels), [minimalModels]);
  const highMap = useMemo(() => toMap(highModels), [highModels]);

  const rankMap = useMemo(() => {
    const getMetric = (m) => {
      if (sortMode === "deltaH") {
        const hp = computePoints(highMap[m.slug]?.summary || {}, attemptsHigh);
        const mp = computePoints(minMap[m.slug]?.summary || {}, attemptsMinimal);
        if (isFinite(hp) && isFinite(mp)) return hp - mp;
        return Number.NEGATIVE_INFINITY;
      }
      return computePoints(m.summary || {}, attemptsCurrent);
    };
    const arr = [...models];
    arr.sort((a, b) => getMetric(b) - getMetric(a));
    const map = {}; arr.forEach((m, i) => (map[m.slug] = i + 1));
    return map;
  }, [models, sortMode, minMap, highMap, attemptsHigh, attemptsMinimal, attemptsCurrent]);

  return (
    <>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div className="intro-meta" style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
          <span>Instruction level</span>
          <button className="info-button" title="Why two levels?" onClick={() => setShowInfo((v) => !v)} aria-label="Why two levels?">i</button>
        </div>
        <div className="segmented">
          <button className={instructionLevel === "minimal" ? "active" : ""} onClick={() => onInstructionLevelChange("minimal")}>Minimal</button>
          <button className={instructionLevel === "high" ? "active" : ""} onClick={() => hasHigh && onInstructionLevelChange("high")} disabled={!hasHigh}>High</button>
        </div>
        <div className="intro-meta sparkline-comment" style={{ opacity: 0.7 }}>Sparkline: light=min • dark=high</div>
        <div className="segmented" aria-label="Sort">
          <button
            className={sortMode === "score" ? "active" : ""}
            onClick={() => {
              if (sortMode === "score") { setSortDir((d) => (d === "desc" ? "asc" : "desc")); }
              else { setSortMode("score"); setSortDir("desc"); }
            }}
          >
            {`Sort: Score${sortMode === "score" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}`}
          </button>
          <button
            className={sortMode === "deltaH" ? "active" : ""}
            onClick={() => {
              if (sortMode === "deltaH") { setSortDir((d) => (d === "desc" ? "asc" : "desc")); }
              else { setSortMode("deltaH"); setSortDir("desc"); }
            }}
            disabled={(minimalModels || []).length === 0 || (highModels || []).length === 0}
          >
            {`Sort: ΔH${sortMode === "deltaH" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}`}
          </button>
        </div>
      </div>
      {showInfo && (
        <div className="card" role="note" aria-live="polite">
          <h3>Why two levels?</h3>
          <p className="intro">We report two instruction levels: Minimal and High. High includes explicit rubric-aligned guidance and often saturates performance; Minimal uses only a brief style prompt.</p>
          <p className="intro">To quantify instruction sensitivity, we focus on Δ(min→high): the improvement when moving from Minimal to High. A small Δ suggests the model already internalizes the style; a large Δ indicates greater dependence on detailed instruction. Medium exists in some runs but is omitted here to keep the comparison simple.</p>
        </div>
      )}

      <div className="leaderboard">
        {sortedModels.map((model, index) => {
          const rank = rankMap[model.slug] || index + 1;
          const scorePoints = computePoints(model.summary || {}, attemptsCurrent);
          const scorePercent = (scorePoints / maxScore) * 100;
          return (
            <div key={model.slug} className="model-row" onClick={() => onModelClick(model)}>
              <div className={`rank-badge ${getRankClass(rank)}`}>{rank}</div>
              <div className="model-info">
                <h3 className="model-name">{model.id}</h3>
                <div className="model-meta">
                  <span className="model-provider">{getProviderFromModelId(model.id)}</span>
                  <span className="click-hint">View poems →</span>
                  {(() => {
                    const minS = minMap[model.slug]?.summary?.overall_reward ?? null;
                    const highS = highMap[model.slug]?.summary?.overall_reward ?? null;
                    const y = (v) => 20 - Math.max(0, Math.min(1, v || 0)) * 16;
                    if (minS == null && highS == null) return null;
                    const path = [`5,${y(minS)}`, `95,${y(highS)}`].join(" ");
                    return (
                      <svg className="model-spark" viewBox="0 0 100 24" aria-label="instruction sensitivity sparkline">
                        <polyline points={path} fill="none" stroke="#111" strokeWidth="1" opacity="0.5" />
                        {minS != null && (<circle cx="5" cy={y(minS)} r="2.2" fill="#c8c2b6" title={`Minimal ${Math.round((minS || 0) * 1000)}`} />)}
                        {highS != null && (<circle cx="95" cy={y(highS)} r="2.2" fill="#111" title={`High ${Math.round((highS || 0) * 1000)}`} />)}
                      </svg>
                    );
                  })()}
                </div>
              </div>
              <div className="score-bar-container"><div className="score-bar" style={{ width: `${scorePercent}%` }} /></div>
              <div className="score-display">
                <div className="score-value" title="Normalized to 50 samples">{Math.round(scorePoints)}</div>
                <div className="score-label">SCORE</div>
                {(() => {
                  const hp = computePoints(highMap[model.slug]?.summary || {}, attemptsHigh);
                  const mp = computePoints(minMap[model.slug]?.summary || {}, attemptsMinimal);
                  if (!isFinite(hp) || !isFinite(mp)) return null;
                  const delta = hp - mp;
                  const sign = delta > 0 ? "+" : "";
                  return <div className="score-delta" title="Δ(min→high)">{sign}{Math.round(delta)}</div>;
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

