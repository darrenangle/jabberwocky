import React, { useMemo } from "react";
import RadarViz from "./RadarViz";
import { computePoints } from "../utils/scoring";
import { RADAR_COLORS } from "../utils/constants";

export default function Hero({ manifest, models, onPrimary, onSecondary, onOpenRadar }) {
  const topModel = models[0];
  const attempts = (manifest?.num_examples || 0) * (manifest?.rollouts_per_example || 1);
  const topScore = (() => {
    if (!topModel || !topModel.summary) return 0;
    return computePoints(topModel.summary, attempts);
  })();
  const top10 = (models || []).slice(0, 10);
  const colorMap = useMemo(() => {
    const map = {};
    top10.forEach((m, idx) => {
      map[m.slug] = RADAR_COLORS[idx % RADAR_COLORS.length];
    });
    return map;
  }, [top10]);

  return (
    <section className="hero">
      <div className="hero-inner">
        <div>
          <div className="hero-kicker">Jabberwocky Bench</div>
          <h2 className="hero-title">Quantifying the poetic skill of large language models</h2>
          <p className="hero-copy">
            Can models write poetry that follows complex constraints while inventing new words? This benchmark uses 24 binary
            criteria to evaluate poems in the style of Lewis Carroll's Jabberwocky, testing whether LLMs can balance form,
            creativity, and coherence.
          </p>
          <div className="hero-cta">
            <button className="btn" onClick={onPrimary}>Browse poems</button>
            <button className="btn secondary" onClick={onSecondary}>See leaderboard</button>
          </div>
        </div>
        <div className="hero-art">
          {top10.length > 0 && (
            <RadarViz models={top10} onOpenModal={onOpenRadar} colorMap={colorMap} />
          )}
          <div className="hero-ribbon">
            {topModel ? `${topModel.id} • ${topScore} score • ${attempts} attempts` : "Loading run..."}
          </div>
        </div>
      </div>
    </section>
  );
}

