// Score utilities

// Normalize score to display format (0..1 -> 0..1000)
export function normalizeScore(score) {
  return Math.round((score || 0) * 1000);
}

// Compute normalized points (n=50): mean_reward * 5000
// If mean is unavailable, derive from total_score and sample count; else fall back to total_score.
export function computePoints(summary, attemptsFallback) {
  if (!summary) return 0;
  const mean =
    typeof summary.overall_reward === "number" && isFinite(summary.overall_reward)
      ? Number(summary.overall_reward)
      : (() => {
          if (typeof summary.total_score === "number" && isFinite(summary.total_score)) {
            const n = Number(summary.num_samples || attemptsFallback || 0);
            if (n > 0) {
              // total_score ≈ sum(reward_i * 100); mean = sum/100 / n
              return Number(summary.total_score) / (n * 100);
            }
          }
          return null;
        })();
  if (mean != null) return Math.round(mean * 5000);
  if (typeof summary.total_score === "number") return Math.round(summary.total_score);
  return 0;
}

