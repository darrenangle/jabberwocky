import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import Chart from 'chart.js/auto';

// Utility functions
function addCacheBust(url, cacheBust) {
  try {
    const urlObj = new URL(url, window.location.href);
    urlObj.searchParams.set("v", cacheBust || Date.now());
    return urlObj.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${cacheBust || Date.now()}`;
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function getQueryParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// Normalize score to display format (multiply by 100)
function normalizeScore(score) {
  // For per-sample visualization only (0..1 -> 0..1000)
  return Math.round((score || 0) * 1000);
}

// Compute normalized points (n=50): mean_reward * 5000
// If mean is unavailable, derive from total_score and sample count; else fall back to total_score.
function computePoints(summary, attemptsFallback) {
  if (!summary) return 0;
  const mean = (typeof summary.overall_reward === "number" && isFinite(summary.overall_reward))
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

// Header component with integrated navigation
function Header({ activeTab, onTabChange }) {
  const [subtitle, setSubtitle] = useState(0);

  const subtitles = [
    "Instruction-following under creative constraints",
    "Can models invent and obey?",
    "A benchmark for non‑verifiable rewards",
    "Style, structure, and surprise",
  ];

  const tabs = [
    { id: "leaderboard", label: "Overview" },
    { id: "analysis", label: "Analysis" },
    { id: "verses", label: "Verses" },
    { id: "about", label: "Why" },
    { id: "methodology", label: "Methods" },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setSubtitle((prev) => (prev + 1) % subtitles.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <h1 className="app-title">Jabberwocky Bench</h1>
          <p className="app-subtitle">{subtitles[subtitle]}</p>
        </div>
        <nav className="header-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

// Hero section for Overview
function Hero({ manifest, models, onPrimary, onSecondary, onOpenRadar }) {
  const topModel = models[0];
  const attempts =
    (manifest?.num_examples || 0) * (manifest?.rollouts_per_example || 1);
  const topScore = (() => {
    if (!topModel || !topModel.summary) return 0;
    return computePoints(
      topModel.summary,
      (manifest?.num_examples || 0) * (manifest?.rollouts_per_example || 1)
    );
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
          <h2 className="hero-title">
            How well do LLMs imitate difficult poetry?
          </h2>
          <p className="hero-copy">
            A focused test of instruction‑following and inventiveness under
            hard‑to‑verify constraints. Models must match style, keep meter,
            invent believable words, and build a narrative arc — without copying
            the original.
          </p>
          <div className="hero-cta">
            <button className="btn" onClick={onPrimary}>
              Browse poems
            </button>
            <button className="btn secondary" onClick={onSecondary}>
              See leaderboard
            </button>
          </div>
        </div>
        <div className="hero-art">
          {top10.length > 0 && (
            <RadarViz
              models={top10}
              onOpenModal={onOpenRadar}
              colorMap={colorMap}
            />
          )}
          <div className="hero-ribbon">
            {topModel
              ? `${topModel.id} • ${topScore} score • ${attempts} attempts`
              : "Loading run..."}
          </div>
        </div>
      </div>
    </section>
  );
}

// Criteria keys (must mirror environment rubric)
const CRITERIA_KEYS = [
  "C1_title_present",
  "C2_quatrain_shape",
  "C3_ballad_meter_echo",
  "C4_ballad_rhyme",
  "C5_ring_composition",
  "C6_warning_admonition",
  "C7_preparation_armament",
  "C8_encounter_confrontation",
  "C9_slaying_decisive_action",
  "C10_return_celebration",
  "C11_coinage_count",
  "C12_coinage_spread",
  "C13_creature_naming",
  "C14_onomatopoeia",
  "C15_alliteration_consonance",
  "C16_arc_order",
  "C17_no_verbatim_lines",
  "C18_canonical_budget",
  "C19_syllable_tightness",
  "C20_rhyme_variety",
  "C21_lexical_repetition_guard",
  "C22_coinage_variety",
  "C23_topic_adherence",
  "C24_subtext",
];
const CRITERIA_SHORT = CRITERIA_KEYS.map((k, i) => `C${i + 1}`);
const CRITERIA_LABELS = [
  "Title",
  "Quatrains",
  "Meter",
  "Rhyme",
  "Ring",
  "Warning",
  "Prepare",
  "Encounter",
  "Act",
  "Return",
  "Coinages",
  "Spread",
  "Creature",
  "Onomatopoeia",
  "Alliteration",
  "Arc order",
  "No verbatim",
  "Canonical",
  "Syllables",
  "Rhyme variety",
  "Repetition",
  "Coinage variety",
  "Topic adherence",
  "Subtext",
];
const RADAR_COLORS = [
  "#1f77b4", // blue
  "#e76f51", // terracotta
  "#2a9d8f", // teal
  "#f4a261", // apricot
  "#bc6ff1", // lavender
  "#06d6a0", // mint
  "#ef476f", // magenta
  "#0ea5e9", // light blue
  "#ffb703", // goldenrod
  "#8ecae6", // sky
];

function RadarViz({
  models,
  onOpenModal,
  showLegend = true,
  variant = "hero",
  hoverSlug,
  onHoverChange,
  colorMap,
}) {
  const colors = RADAR_COLORS;
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [localHover, setLocalHover] = useState(null);
  const effectiveHover = hoverSlug !== undefined ? hoverSlug : localHover;

  const getVec = (m) => {
    const mm = m.summary?.metrics_mean || {}; // 0..1
    return CRITERIA_KEYS.map((k) => {
      const v = mm[k];
      return typeof v === "number" ? Math.max(0, Math.min(1, v)) * 100 : 0;
    });
  };

  const containerClass = variant === "hero" ? "hero-viz" : "radar-embed";
  const handleHover = (slug) => {
    if (onHoverChange) onHoverChange(slug);
    else setLocalHover(slug);
  };

  // Create chart only once
  useEffect(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    
    // Initial datasets
    const datasets = models.map((m, idx) => {
      const color = (colorMap && colorMap[m.slug]) || colors[idx % colors.length];
      
      return {
        label: m.id,
        data: getVec(m),
        fill: true,
        backgroundColor: color + '25',
        borderColor: color,
        borderWidth: 1.5,
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        pointRadius: variant === "hero" ? 0 : 2,
        pointHoverRadius: 4,
        hidden: false
      };
    });

    chartRef.current = new Chart.Chart(ctx, {
      type: 'radar',
      data: {
        labels: CRITERIA_LABELS,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: {
          mode: 'point',
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: variant !== "hero",
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + Math.round(context.parsed.r) + '%';
              }
            }
          }
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            min: 0,
            ticks: {
              stepSize: 25,
              display: variant !== "hero",
              callback: function(value) {
                return value + '%';
              },
              font: {
                size: variant === "hero" ? 10 : 12
              }
            },
            pointLabels: {
              display: true,
              font: {
                size: variant === "hero" ? 10 : 12,
                family: 'var(--ui)'
              },
              color: '#6f6658',
              padding: variant === "hero" ? 5 : 10
            },
            grid: {
              color: '#e7e2d9',
              lineWidth: 1
            },
            angleLines: {
              color: '#e7e2d9',
              lineWidth: 1
            }
          }
        },
        layout: {
          padding: variant === "hero" ? 0 : 20
        },
        animation: {
          duration: 300
        },
        onHover: (event, activeElements) => {
          if (activeElements.length > 0) {
            const datasetIndex = activeElements[0].datasetIndex;
            const model = models[datasetIndex];
            handleHover(model.slug);
          } else {
            handleHover(null);
          }
        }
      }
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [models, variant, colorMap]); // Remove effectiveHover from dependencies

  // Update only the visual properties when hover changes
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = chartRef.current;
    
    // Update dataset styles based on hover
    models.forEach((m, idx) => {
      const color = (colorMap && colorMap[m.slug]) || colors[idx % colors.length];
      const isHover = effectiveHover === m.slug;
      const dim = effectiveHover && !isHover;
      
      // More dramatic fade for non-hovered items
      chart.data.datasets[idx].backgroundColor = color + (isHover ? '55' : dim ? '08' : '25');
      chart.data.datasets[idx].borderColor = color + (isHover ? 'FF' : dim ? '40' : 'FF');
      chart.data.datasets[idx].borderWidth = isHover ? 3 : dim ? 0.5 : 1.5;
    });
    
    // Update without animation for smooth hover effect
    chart.update('none');
  }, [effectiveHover, models, colorMap]);

  return (
    <div
      className={containerClass}
      aria-label="Top criteria radar"
      onClick={variant === "hero" ? onOpenModal : undefined}
      title={variant === "hero" ? "Click to expand" : undefined}
    >
      <canvas 
        ref={canvasRef}
        style={{ maxWidth: '100%', maxHeight: '100%' }}
      />
      {showLegend && (
        <div className="hero-legend">
          {models.map((m, idx) => (
            <div
              key={m.slug}
              className="legend-line"
              onMouseEnter={() => handleHover(m.slug)}
              onMouseLeave={() => handleHover(null)}
            >
              <span
                className="legend-dot"
                style={{
                  background:
                    (colorMap && colorMap[m.slug]) ||
                    colors[idx % colors.length],
                }}
              />
              {m.id}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RadarModal({ models, onClose }) {
  const top10 = (models || []).slice(0, 10);
  const [hoverSlug, setHoverSlug] = useState(null);
  const colorMap = useMemo(() => {
    const map = {};
    top10.forEach((m, idx) => {
      map[m.slug] = RADAR_COLORS[idx % RADAR_COLORS.length];
    });
    return map;
  }, [top10]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Top Models — Criteria Radar</h2>
          <button className="modal-close" onClick={onClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
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
                  <div
                    key={m.slug}
                    className="legend-check"
                    onMouseEnter={() => setHoverSlug(m.slug)}
                    onMouseLeave={() => setHoverSlug(null)}
                  >
                    <span
                      className="legend-swatch"
                      style={{ background: colorMap[m.slug] }}
                    />
                    <span>{m.id}</span>
                  </div>
                ))}
              </div>
              <div className="radar-note">
                Hover to focus a model. Axes are labeled by criterion.
              </div>
            </div>
          </div>
          <div className="radar-main">
            <RadarViz
              models={top10}
              showLegend={false}
              variant="modal"
              hoverSlug={hoverSlug}
              colorMap={colorMap}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Analysis page: large radar + rubric spread
function Analysis({
  models,
  instructionLevel,
  onInstructionLevelChange,
}) {
  const allModels = useMemo(() => models || [], [models]);
  const [selected, setSelected] = useState(() => new Set(allModels.slice(0, 10).map((m) => m.slug)));
  const [hoverSlug, setHoverSlug] = useState(null);

  useEffect(() => {
    // Reset selection to top 10 when models change
    setSelected(new Set(allModels.slice(0, 10).map((m) => m.slug)));
  }, [allModels]);

  const colorMap = useMemo(() => {
    const map = {};
    allModels.forEach((m, idx) => {
      map[m.slug] = RADAR_COLORS[idx % RADAR_COLORS.length];
    });
    return map;
  }, [allModels]);

  const enabledModels = useMemo(
    () => allModels.filter((m) => selected.has(m.slug)),
    [allModels, selected]
  );

  // Rubric spread across all models in level
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
      const variance =
        vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length;
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
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
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
        <div className="segmented" aria-label="Instruction level">
          <button
            className={instructionLevel === "minimal" ? "active" : ""}
            onClick={() => onInstructionLevelChange("minimal")}
          >
            Minimal
          </button>
          <button
            className={instructionLevel === "high" ? "active" : ""}
            onClick={() => onInstructionLevelChange("high")}
          >
            High
          </button>
        </div>
      </div>

      <div className="card analysis-layout">
        <div className="radar-side">
          <h3 style={{ marginBottom: ".5rem" }}>All Models — Radar</h3>
          <div className="radar-controls">
            <div style={{ display: "flex", gap: ".4rem", marginBottom: ".25rem", flexWrap: "wrap" }}>
              <button className="btn secondary" onClick={allOn}>Enable all</button>
              <button className="btn secondary" onClick={allOff}>Clear</button>
              <button className="btn secondary" onClick={() => setSelected(new Set(allModels.slice(0, 10).map((m) => m.slug)))}>Top 10</button>
            </div>
            <div className="radar-grid" style={{ maxHeight: "400px", overflowY: "auto" }}>
              {allModels.map((m, idx) => (
                <label
                  key={m.slug}
                  className="legend-check"
                  onMouseEnter={() => setHoverSlug(m.slug)}
                  onMouseLeave={() => setHoverSlug(null)}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.slug)}
                    onChange={() => toggleOne(m.slug)}
                  />
                  <span
                    className="legend-swatch"
                    style={{ background: colorMap[m.slug] }}
                  />
                  <span>{idx + 1}. {m.id}</span>
                </label>
              ))}
            </div>
            <div className="radar-note">Hover to focus a model; toggle to include/exclude.</div>
          </div>
        </div>
        <div className="radar-main">
          <RadarViz
            models={enabledModels}
            showLegend={false}
            variant="modal"
            hoverSlug={hoverSlug}
            colorMap={colorMap}
          />
        </div>
      </div>

      <div className="card">
        <h3>Rubric Spread — Pass Rates by Criterion</h3>
        <div className="intro" style={{ marginBottom: "1rem" }}>
          Aggregated across all models in this level. Higher bars mean models pass that check more often.
        </div>
        <div className="criteria-chart">
          {spread.map((row, idx) => {
            const percent = Math.round(row.mean * 100);
            const isHardest = percent < 30;
            const isEasiest = percent > 70;
            return (
              <div key={row.key} className="criteria-item">
                <div className="criteria-header">
                  <span className="criteria-number">C{idx + 1}</span>
                  <span className="criteria-label">{row.label}</span>
                  <span className={`criteria-percent ${isHardest ? 'hardest' : isEasiest ? 'easiest' : ''}`}>
                    {percent}%
                  </span>
                </div>
                <div className="criteria-bar-wrapper">
                  <div className="criteria-bar">
                    <div
                      className={`criteria-fill ${isHardest ? 'hardest' : isEasiest ? 'easiest' : ''}`}
                      style={{ 
                        width: `${percent}%`,
                        background: isHardest ? '#ef4444' : isEasiest ? '#10b981' : undefined
                      }}
                    >
                      <span className="criteria-fill-label">{percent}%</span>
                    </div>
                  </div>
                  <div className="criteria-markers">
                    <span className="marker" style={{ left: '25%' }} />
                    <span className="marker" style={{ left: '50%' }} />
                    <span className="marker" style={{ left: '75%' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="criteria-summary">
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

// Loading component
function Loading() {
  return (
    <div className="loading-container">
      <div className="loading-spinner" />
      <div>Loading data...</div>
    </div>
  );
}

// Trends component - line graphs
function Trends({ models, loadSamples }) {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedModels, setSelectedModels] = useState([]);

  useEffect(() => {
    async function loadChartData() {
      setLoading(true);
      const data = [];

      // Load top 10 models
      const topModels = models.slice(0, 10);
      for (const model of topModels) {
        try {
          const samples = await loadSamples(model);
          if (samples && samples.length > 0) {
            const points = samples.map((s, i) => ({
              x: i + 1,
              y: (s.reward || 0) * 1000,
            }));
            data.push({
              id: model.id,
              provider: model.provider,
              color: getModelColor(data.length),
              points: points,
              average: points.reduce((sum, p) => sum + p.y, 0) / points.length,
            });
          }
        } catch (err) {
          console.error("Error loading samples for", model.id, err);
        }
      }

      setChartData(data);
      setSelectedModels(data.slice(0, 5).map((d) => d.id));
      setLoading(false);
    }

    if (models.length > 0) {
      loadChartData();
    }
  }, [models, loadSamples]);

  const getModelColor = (index) => {
    const colors = [
      "#8b5cf6",
      "#ef4444",
      "#10b981",
      "#f59e0b",
      "#3b82f6",
      "#ec4899",
      "#14b8a6",
      "#f97316",
      "#a855f7",
      "#06b6d4",
    ];
    return colors[index % colors.length];
  };

  if (loading) return <Loading />;
  if (!chartData || chartData.length === 0)
    return (
      <div className="empty-state">
        <p>No data available</p>
      </div>
    );

  const filteredData = chartData.filter((d) => selectedModels.includes(d.id));
  const maxY = 1000;

  return (
    <div className="trends-container">
      <div className="card">
        <h3>Performance Over 50 Attempts</h3>
        <p className="chart-subtitle">
          Model scores across all poem generation attempts
        </p>

        <div className="chart-wrapper">
          <svg viewBox="0 0 800 400" className="line-chart">
            {/* Grid lines */}
            {[0, 200, 400, 600, 800, 1000].map((y) => (
              <g key={y}>
                <line
                  x1="60"
                  y1={350 - (y / maxY) * 300}
                  x2="750"
                  y2={350 - (y / maxY) * 300}
                  stroke="rgba(148, 163, 184, 0.2)"
                  strokeDasharray="2,2"
                />
                <text
                  x="50"
                  y={355 - (y / maxY) * 300}
                  textAnchor="end"
                  className="chart-label"
                >
                  {y}
                </text>
              </g>
            ))}

            {/* Lines */}
            {filteredData.map((series) => (
              <g key={series.id}>
                <polyline
                  points={series.points
                    .map(
                      (p, i) =>
                        `${60 + (i / 49) * 690},${350 - (p.y / maxY) * 300}`
                    )
                    .join(" ")}
                  fill="none"
                  stroke={series.color}
                  strokeWidth="3"
                  opacity="0.9"
                />
              </g>
            ))}

            {/* X axis */}
            <line
              x1="60"
              y1="350"
              x2="750"
              y2="350"
              stroke="rgba(148, 163, 184, 0.4)"
            />
            <text x="405" y="390" textAnchor="middle" className="chart-label">
              Attempt Number
            </text>
          </svg>
        </div>

        <div className="model-legend">
          {chartData.map((series) => (
            <label key={series.id} className="legend-item">
              <input
                type="checkbox"
                checked={selectedModels.includes(series.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedModels([...selectedModels, series.id]);
                  } else {
                    setSelectedModels(
                      selectedModels.filter((id) => id !== series.id)
                    );
                  }
                }}
              />
              <span
                className="legend-color"
                style={{ backgroundColor: series.color }}
              />
              <span className="legend-label">{series.id}</span>
              <span className="legend-avg">
                avg: {Math.round(series.average)}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// About component - explains why this benchmark matters
function About() {
  return (
    <div className="methodology-content">
      <div className="card">
        <h3>Why this benchmark matters</h3>
        <p className="intro">
          Writing a Jabberwocky‑style poem on command forces a model to do two
          hard things at once: obey precise formal instructions and invent
          convincingly. That combination is a sharp probe of
          instruction‑following under creative constraints.
        </p>
      </div>
      <div className="card">
        <h3>What it really tests</h3>
        <div className="rubric-grid">
          <div className="rubric-item">
            <div className="rubric-score">Follow the brief</div>
            <div className="rubric-desc">
              Hold meter, rhyme and stanza shape while keeping the classic arc in order.
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">Inventive control</div>
            <div className="rubric-desc">
              Coin phonologically plausible nonsense words and deploy them
              purposefully.
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">Narrative arc</div>
            <div className="rubric-desc">
              Build a clear arc: warning → preparation → encounter → resolution
              → return.
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">Anti‑copying</div>
            <div className="rubric-desc">
              Avoid verbatim reuse; stay within a small “canonical budget”.
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>When High instructions saturate</h3>
        <p>
          Seeing High‑instruction scores cluster near the ceiling is expected.
          It shows that with a clear rubric, modern LLMs can execute. The useful
          signal is the guidance required to get there — the{" "}
          <strong>instruction sensitivity</strong>. Minimal reflects
          “cold‑start” prior and self‑prompting ability; Medium shows how
          quickly the model aligns with partial hints.
        </p>
      </div>
      <div className="card">
        <h3>Secondary purpose</h3>
        <p>
          This site doubles as a template for{" "}
          <strong>non‑verifiable reward modeling</strong> in creative domains.
          Even when “ground truth” is fuzzy, structured judges can score
          style‑matching, coinage quality, and arc building with transparent,
          reproducible checks.
        </p>
      </div>
    </div>
  );
}

// Methodology component - explains the rubric and judging
function Methodology() {
  return (
    <div className="methodology-content">
      <div className="card">
        <h3>How scoring works</h3>
        <p className="intro">
          Reward is the mean of 22 binary checks applied by an LLM judge. The
          checks cover form, style, coinage, arc, syllable tightness, rhyme
          variety, and repetition guards. No gold labels; just crisp,
          reproducible constraints.
        </p>
      </div>
      <div className="card">
        <h3>The checks (glance)</h3>
        <div className="rubric-grid">
          <div className="rubric-item">
            <div className="rubric-score">C1 Title</div>
            <div className="rubric-desc">
              Is there a non‑empty title before the first stanza?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C2 Quatrains</div>
            <div className="rubric-desc">
              Do all stanzas have 4 lines (total 5–8)?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C3 Meter echo</div>
            <div className="rubric-desc">
              Do lines alternate long/short in ≥60% stanzas?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C4 Rhyme</div>
            <div className="rubric-desc">
              Do (2,4) rhyme in ≥60% stanzas (no AABB dominance)?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C5 Ring close</div>
            <div className="rubric-desc">
              Does the final stanza echo the opening?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C6 Admonition</div>
            <div className="rubric-desc">
              Is there an early warning/caution?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C7 Preparation</div>
            <div className="rubric-desc">
              Is there visible preparation before the encounter?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C8 Encounter</div>
            <div className="rubric-desc">
              Is there a clear meeting with the foe/obstacle?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C9 Decisive act</div>
            <div className="rubric-desc">
              Is there a decisive action resolving tension?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C10 Return/joy</div>
            <div className="rubric-desc">
              Is there a homecoming and celebration?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C11 Coinage count</div>
            <div className="rubric-desc">
              Are there ≥8 distinct invented words?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C12 Coinage spread</div>
            <div className="rubric-desc">
              Does each stanza include a coinage?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C13 Creature naming</div>
            <div className="rubric-desc">
              Is a non‑canonical creature named and central?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C14 Onomatopoeia</div>
            <div className="rubric-desc">Are there ≥2 onomatopoeic bursts?</div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C15 Alliteration</div>
            <div className="rubric-desc">
              Do ≥2 stanzas show clear alliteration/consonance?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C16 Arc order</div>
            <div className="rubric-desc">
              Do the beats occur in sequence: warning → preparation → encounter → decisive act → return?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C17 No verbatim</div>
            <div className="rubric-desc">
              Is no line verbatim from the canonical poem?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C18 Canonical budget</div>
            <div className="rubric-desc">Are canonical tokens ≤8?</div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C19 Syllables</div>
            <div className="rubric-desc">
              In every stanza, are long lines ~8–9 and short lines ~5–7?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C20 Rhyme variety</div>
            <div className="rubric-desc">
              Are (2,4) end rhymes varied across stanzas?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C21 Repetition guard</div>
            <div className="rubric-desc">
              Is no single content word overused?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C22 Coinage variety</div>
            <div className="rubric-desc">
              Do coinages vary in roots/suffixes?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C23 Topic adherence</div>
            <div className="rubric-desc">
              Does the poem clearly address the given topic without switching subjects?
            </div>
          </div>
          <div className="rubric-item">
            <div className="rubric-score">C24 Subtext</div>
            <div className="rubric-desc">
              Is there a coherent implied layer beyond surface action?
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Judge and labels</h3>
        <p>Default judge: GPT‑4.1‑mini. Labels reflect satisfied checks:</p>
        <ul className="label-list">
          <li>
            <strong>High</strong>: ≥ 12 checks
          </li>
          <li>
            <strong>Medium</strong>: 9–11
          </li>
          <li>
            <strong>Low</strong>: 6–8
          </li>
          <li>
            <strong>Very Low</strong>: ≤ 5
          </li>
        </ul>
      </div>
    </div>
  );
}

// Model Leaderboard
function Leaderboard({
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
  const [sortMode, setSortMode] = React.useState("score"); // 'score' | 'deltaH'
  const [sortDir, setSortDir] = React.useState("desc"); // 'asc' | 'desc'
  const [showInfo, setShowInfo] = React.useState(false);
  const sortedModels = useMemo(() => {
    const arr = [...models];
    if (sortMode === "deltaH") {
      const toMap = (xs) => {
        const m = {};
        (xs || []).forEach((x) => (m[x.slug] = x));
        return m;
      };
      const minMap = toMap(minimalModels);
      const highMap = toMap(highModels);
      return arr.sort((a, b) => {
        const aMinPts = computePoints(minMap[a.slug]?.summary || {}, attemptsMinimal);
        const aHighPts = computePoints(highMap[a.slug]?.summary || {}, attemptsHigh);
        const bMinPts = computePoints(minMap[b.slug]?.summary || {}, attemptsMinimal);
        const bHighPts = computePoints(highMap[b.slug]?.summary || {}, attemptsHigh);
        const missing = sortDir === "desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
        const aD = (isFinite(aHighPts) && isFinite(aMinPts)) ? (aHighPts - aMinPts) : missing;
        const bD = (isFinite(bHighPts) && isFinite(bMinPts)) ? (bHighPts - bMinPts) : missing;
        if (aD === bD) {
          // tie-break by points
          const as = computePoints(a.summary || {}, attemptsCurrent);
          const bs = computePoints(b.summary || {}, attemptsCurrent);
          return (sortDir === "desc" ? (bs - as) : (as - bs));
        }
        return sortDir === "desc" ? (bD - aD) : (aD - bD);
      });
    }
    return arr.sort((a, b) => {
      const as = computePoints(a.summary || {}, attemptsCurrent);
      const bs = computePoints(b.summary || {}, attemptsCurrent);
      return sortDir === "desc" ? (bs - as) : (as - bs);
    });
  }, [models, sortMode, sortDir, minimalModels, highModels]);

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
    const map = {};
    (arr || []).forEach((m) => {
      map[m.slug] = m;
    });
    return map;
  };
  const minMap = useMemo(() => toMap(minimalModels), [minimalModels]);
  const highMap = useMemo(() => toMap(highModels), [highModels]);

  // Rank map: ranks always computed as if sorting DESC by the active metric
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
    arr.sort((a, b) => getMetric(b) - getMetric(a)); // DESC for ranking
    const map = {};
    arr.forEach((m, i) => (map[m.slug] = i + 1));
    return map;
  }, [models, sortMode, minMap, highMap, attemptsHigh, attemptsMinimal, attemptsCurrent]);

  return (
    <>
      <div className="card benchmark-intro">
        <h3>Jabberwocky Bench</h3>
        <p>
          Structured creativity under pressure: match Carroll’s form, coin words
          that feel right, and carry a story arc — no copying. If a model can do
          that on demand, it’s probably good at following tricky instructions
          while inventing.
        </p>
        <p className="intro-meta">
          22 binary checks • LLM judge • built with verifiers
        </p>
      </div>

      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div className="intro-meta" style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
          <span>Instruction level</span>
          <button
            className="info-button"
            title="Why two levels?"
            onClick={() => setShowInfo((v) => !v)}
            aria-label="Why two levels?"
          >
            i
          </button>
        </div>
        <div className="segmented">
          <button
            className={instructionLevel === "minimal" ? "active" : ""}
            onClick={() => onInstructionLevelChange("minimal")}
          >
            Minimal
          </button>
          <button
            className={instructionLevel === "high" ? "active" : ""}
            onClick={() => hasHigh && onInstructionLevelChange("high")}
            disabled={!hasHigh}
          >
            High
          </button>
        </div>
        <div className="intro-meta" style={{ opacity: 0.7 }}>
          Sparkline: light=min • dark=high
        </div>
        <div className="segmented" aria-label="Sort">
          <button
            className={sortMode === "score" ? "active" : ""}
            onClick={() => {
              if (sortMode === "score") {
                setSortDir((d) => (d === "desc" ? "asc" : "desc"));
              } else {
                setSortMode("score");
                setSortDir("desc"); // default: highest score first
              }
            }}
          >
            {`Sort: Score${sortMode === 'score' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}`}
          </button>
          <button
            className={sortMode === "deltaH" ? "active" : ""}
            onClick={() => {
              if (sortMode === "deltaH") {
                setSortDir((d) => (d === "desc" ? "asc" : "desc"));
              } else {
                setSortMode("deltaH");
                setSortDir("desc"); // default: highest ΔH first
              }
            }}
            disabled={
              (minimalModels || []).length === 0 ||
              (highModels || []).length === 0
            }
          >
            {`Sort: ΔH${sortMode === 'deltaH' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}`}
          </button>
        </div>
      </div>
      {showInfo && (
        <div className="card" role="note" aria-live="polite">
          <h3>Why two levels?</h3>
          <p className="intro">
            We report two instruction levels: Minimal and High. High includes
            explicit rubric‑aligned guidance and often saturates performance;
            Minimal uses only a brief style prompt.
          </p>
          <p className="intro">
            To quantify instruction sensitivity, we focus on Δ(min→high): the
            improvement when moving from Minimal to High. A small Δ suggests the
            model already internalizes the style; a large Δ indicates greater
            dependence on detailed instruction. Medium exists in some runs but is
            omitted here to keep the comparison simple.
          </p>
        </div>
      )}

      <div className="leaderboard">
        {sortedModels.map((model, index) => {
              const rank = rankMap[model.slug] || index + 1;
          const scorePoints = computePoints(model.summary || {}, attemptsCurrent);
          const scorePercent = (scorePoints / maxScore) * 100;

          return (
            <div
              key={model.slug}
              className="model-row"
              onClick={() => onModelClick(model)}
            >
              <div className={`rank-badge ${getRankClass(rank)}`}>{rank}</div>

              <div className="model-info">
                <h3 className="model-name">{model.id}</h3>
                <div className="model-meta">
                  <span className="model-provider">{model.provider}</span>
                  <span className="click-hint">View poems →</span>
                  
                  {/* per-model sparkline */}
                  {(() => {
                    const minS =
                      minMap[model.slug]?.summary?.overall_reward ?? null;
                    const highS =
                      highMap[model.slug]?.summary?.overall_reward ?? null;
                    const y = (v) => 20 - Math.max(0, Math.min(1, v || 0)) * 16; // 0..1 -> 20..4
                    if (minS == null && highS == null) return null;
                    const path = [`5,${y(minS)}`, `95,${y(highS)}`].join(" ");
                    return (
                      <svg
                        className="model-spark"
                        viewBox="0 0 100 24"
                        aria-label="instruction sensitivity sparkline"
                      >
                        <polyline
                          points={path}
                          fill="none"
                          stroke="#111"
                          strokeWidth="1"
                          opacity="0.5"
                        />
                        {minS != null && (
                          <circle
                            cx="5"
                            cy={y(minS)}
                            r="2.2"
                            fill="#c8c2b6"
                            title={`Minimal ${normalizeScore(minS)}`}
                          />
                        )}
                        {highS != null && (
                          <circle
                            cx="95"
                            cy={y(highS)}
                            r="2.2"
                            fill="#111"
                            title={`High ${normalizeScore(highS)}`}
                          />
                        )}
                      </svg>
                    );
                  })()}
                </div>
              </div>

              <div className="score-bar-container">
                <div
                  className="score-bar"
                  style={{ width: `${scorePercent}%` }}
                />
              </div>

              <div className="score-display">
              <div className="score-value" title="Normalized to 50 samples">{Math.round(scorePoints)}</div>
                <div className="score-label">SCORE</div>
                {(() => {
                  const minPoints = computePoints(minMap[model.slug]?.summary || {}, attemptsMinimal);
                  const highPoints = computePoints(highMap[model.slug]?.summary || {}, attemptsHigh);
                  const badges = [];
                  if (minPoints && highPoints) {
                    const d = Math.round(highPoints - minPoints);
                    const sign = d >= 0 ? "+" : "";
                    badges.push(
                      <div
                        key="h"
                        className="isi-badge"
                        title="Instruction Sensitivity (High − Minimal), normalized to 50"
                      >
                        ΔH {sign}
                        {d}
                      </div>
                    );
                  }
                  return badges;
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Modal for model verses
function ModelModal({ model, samples, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  const sortedSamples = useMemo(
    () =>
      [...samples]
        .sort((a, b) => (b.reward || 0) - (a.reward || 0))
        .slice(0, 50),
    [samples]
  );

  const handleTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentIndex < sortedSamples.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowLeft" && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
    if (e.key === "ArrowRight" && currentIndex < sortedSamples.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex]);

  const currentSample = sortedSamples[currentIndex];

  const parsePoem = (poem) => {
    const lines = (poem || "").split("\n");
    let i = 0;
    while (i < lines.length && lines[i].trim() === "") i++;
    let title = "";
    if (i < lines.length && lines[i].trim().startsWith("##")) {
      title = lines[i].replace(/^#+\s*/, "").trim();
      i++;
      if (lines[i] && lines[i].trim() === "") i++;
    } else if (i < lines.length && lines[i].trim().length <= 60) {
      // Treat first short line as title when plausible
      title = lines[i].trim();
      i++;
      if (lines[i] && lines[i].trim() === "") i++;
    }
    const body = lines.slice(i).join("\n");
    return { title, body };
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{model.id}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div
          className="modal-body swipeable"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {currentSample &&
            (() => {
              const parsed = parsePoem(currentSample.poem);
              const topic = currentSample.info?.topic || "—";
              const label = currentSample.label || "—";
              const score = normalizeScore(currentSample.reward);
              const stanzas = (parsed.body || "").split(/\n\s*\n/);
              return (
                <div className="verse-card">
                  <div className="modal-poem-meta">
                    <div>
                      {parsed.title && (
                        <div className="poem-title">{parsed.title}</div>
                      )}
                      <div className="meta-right">
                        <span className="tag">Topic: {topic}</span>
                        <span className="tag">Label: {label}</span>
                        <span className="tag badge-score">{score}</span>
                      </div>
                    </div>
                    <div className="modal-nav">
                      <button
                        className="nav-btn"
                        disabled={currentIndex === 0}
                        onClick={() =>
                          currentIndex > 0 && setCurrentIndex(currentIndex - 1)
                        }
                        aria-label="Previous"
                      >
                        ‹
                      </button>
                      <span className="modal-index">
                        {currentIndex + 1}/{sortedSamples.length}
                      </span>
                      <button
                        className="nav-btn"
                        disabled={currentIndex === sortedSamples.length - 1}
                        onClick={() =>
                          currentIndex < sortedSamples.length - 1 &&
                          setCurrentIndex(currentIndex + 1)
                        }
                        aria-label="Next"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                  <div className="modal-poem-content">
                    <div className="verse-content">
                      {stanzas.map((s, idx) => (
                        <p
                          key={idx}
                          className="stanza"
                          dangerouslySetInnerHTML={{
                            __html: s
                              .split("\n")
                              .map((line) =>
                                line.replace(/\*(.*?)\*/g, "<em>$1</em>")
                              )
                              .join("<br />"),
                          }}
                        />
                      ))}
                    </div>
                    {/* Prompt intentionally hidden per request */}
                    {currentSample.judge_raw && (() => {
                      const jr = String(currentSample.judge_raw || "");
                      const parsed = parseJudgeRawXML(jr);
                      const yesCount = parsed.sumYes;
                      const total = parsed.total;
                      return (
                        <div className="judge-block">
                          <div className="judge-title">Judge Decisions</div>
                          <div className="judge-summary">
                            {yesCount}/{total} checks • Label: {label} • Score: {score}
                          </div>
                          <div className="judge-grid">
                            {CRITERIA_SHORT.map((short, i) => {
                              const lbl = CRITERIA_LABELS[i] || short;
                              const yn = parsed.decide[short];
                              const think = parsed.think[short] || "";
                              const good = yn === "yes";
                              return (
                                <div key={short} className="judge-row">
                                  <div className={`judge-pill ${good ? "good" : "bad"}`} title={yn || "n/a"}>
                                    {good ? "Yes" : yn === "no" ? "No" : "—"}
                                  </div>
                                  <div className="judge-body">
                                    <div className="judge-key">{short} — {lbl}</div>
                                    {think && <div className="judge-think">{think}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <details className="judge-raw-wrap">
                            <summary>Show raw judge XML</summary>
                            <pre className="judge-raw">{jr}</pre>
                          </details>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}

// Verses browser
function Verses({ models, samples, loadSamples }) {
  const [filters, setFilters] = useState({
    modelSlug: "",
    minReward: 0,
    label: "",
  });
  const [displayedSamples, setDisplayedSamples] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFilteredSamples = useCallback(async () => {
    setLoading(true);
    try {
      let allSamples = [];

      if (!filters.modelSlug) {
        // Just show top samples from top 3 models
        const topModels = models.slice(0, 3);
        for (const model of topModels) {
          const modelSamples = await loadSamples(model);
          allSamples = allSamples.concat(
            modelSamples
              .sort((a, b) => (b.reward || 0) - (a.reward || 0))
              .slice(0, 10)
              .map((s) => ({
                ...s,
                __modelId: model.id,
              }))
          );
        }
      } else {
        const model = models.find((m) => m.slug === filters.modelSlug);
        if (model) {
          const modelSamples = await loadSamples(model);
          allSamples = modelSamples.map((s) => ({
            ...s,
            __modelId: model.id,
          }));
        }
      }

      // Apply filters
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

  useEffect(() => {
    if (models.length > 0) {
      loadFilteredSamples();
    }
  }, [loadFilteredSamples, models]);

  return (
    <div>
      <div className="filter-bar">
        <select
          className="filter-select"
          value={filters.modelSlug}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, modelSlug: e.target.value }))
          }
        >
          <option value="">Top 3 Models</option>
          {models.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.id}
            </option>
          ))}
        </select>

        <input
          type="number"
          className="filter-input"
          placeholder="Min score"
          step="0.1"
          min="0"
          max="1"
          value={filters.minReward}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              minReward: parseFloat(e.target.value) || 0,
            }))
          }
        />

        <select
          className="filter-select"
          value={filters.label}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, label: e.target.value }))
          }
        >
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
          <div
            key={`${sample.__modelId}-${sample.i}-${i}`}
            className="verse-card"
          >
            <div className="verse-meta">
              <span>{sample.__modelId}</span>
              <span>Score: {normalizeScore(sample.reward)}</span>
              <span>Label: {sample.label || "—"}</span>
            </div>

            <div className="verse-prompt">{sample.prompt}</div>

            <div
              className="verse-content"
              dangerouslySetInnerHTML={{
                __html: sample.poem
                  .split("\n")
                  .map((line) => line.replace(/\*(.*?)\*/g, "<em>$1</em>"))
                  .join("<br />"),
              }}
            />
          </div>
        ))
      )}
    </div>
  );
}

// Main App Component
function App() {
  const [manifests, setManifests] = useState({ minimal: null, high: null });
  const [modelsByLevel, setModelsByLevel] = useState({ minimal: [], high: [] });
  const [samplesByLevel, setSamplesByLevel] = useState({ minimal: {}, high: {} });
  const [manifestUrls, setManifestUrls] = useState({ minimal: null, high: null });
  const [instructionLevel, setInstructionLevel] = useState("minimal");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("leaderboard");
  const [selectedModel, setSelectedModel] = useState(null);
  const [modelSamples, setModelSamples] = useState([]);
  // removed modal radar; use Analysis tab instead

  // Load one manifest+summaries
  const loadOneManifest = useCallback(async (url, level) => {
    const manifestData = await fetchJSON(addCacheBust(url));
    const loadedModels = [];
    for (const entry of manifestData.models) {
      const summaryUrl = addCacheBust(
        new URL(
          entry.summary_path,
          new URL(url, window.location.href)
        ).toString()
      );
      const summary = await fetchJSON(summaryUrl);
      loadedModels.push({ ...entry, summary });
    }
    loadedModels.sort(
      (a, b) =>
        (b.summary?.overall_reward || 0) - (a.summary?.overall_reward || 0)
    );
    setManifests((prev) => ({ ...prev, [level]: manifestData }));
    setModelsByLevel((prev) => ({ ...prev, [level]: loadedModels }));
    setManifestUrls((prev) => ({ ...prev, [level]: url }));
  }, []);

  // Load samples for a model at an instruction level
  const loadSamples = useCallback(
    async (model, level) => {
      const lvl = level || instructionLevel;
      const cache = samplesByLevel[lvl] || {};
      if (cache[model.slug]) return cache[model.slug];
      try {
        const manifestUrl = manifestUrls[lvl];
        if (!manifestUrl) return [];
        const url = addCacheBust(
          new URL(
            model.samples_path,
            new URL(manifestUrl, window.location.href)
          ).toString()
        );
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const text = await res.text();
        const rows = text
          .trim()
          .split("\n")
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        setSamplesByLevel((prev) => ({
          ...prev,
          [lvl]: { ...(prev[lvl] || {}), [model.slug]: rows },
        }));
        return rows;
      } catch (err) {
        console.error(`Failed to load samples for ${model.id} (${lvl}):`, err);
        setSamplesByLevel((prev) => ({
          ...prev,
          [lvl]: { ...(prev[lvl] || {}), [model.slug]: [] },
        }));
        return [];
      }
    },
    [samplesByLevel, instructionLevel, manifestUrls]
  );

  // ELO removed per request

  // Handle model click
  const handleModelClick = async (model) => {
    const modelSamples = await loadSamples(model, instructionLevel);
    setSelectedModel(model);
    setModelSamples(modelSamples);
  };

  // Initialize instruction levels (minimal + medium + high)
  useEffect(() => {
    const urlMinimal =
      getQueryParam("manifest") || "../runs/run-mixed-50-minimal/manifest.json";
    const urlHigh =
      getQueryParam("manifest_high") ||
      "../runs/run-mixed-50-high/manifest.json";
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadOneManifest(urlMinimal, "minimal");
      } catch (e) {
        console.error("Failed loading minimal manifest", e);
        setError(`Failed loading minimal run: ${e.message}`);
      } finally {
        setLoading(false);
      }
      try {
        await loadOneManifest(urlHigh, "high");
      } catch (e) {
        console.warn("High-instruction run not available:", e?.message || e);
      }
    })();
  }, [loadOneManifest]);

  const renderContent = () => {
    const models = modelsByLevel[instructionLevel] || [];
    const manifest = manifests[instructionLevel];
    if (loading) return <Loading />;
    if (!manifest) {
      return (
        <div className="empty-state">
          <h3>Loading Jabberwocky Data...</h3>
        </div>
      );
    }

    switch (activeTab) {
      case "leaderboard":
        return (
          <Leaderboard
            models={models}
            onModelClick={handleModelClick}
            instructionLevel={instructionLevel}
            onInstructionLevelChange={setInstructionLevel}
            hasHigh={(modelsByLevel.high || []).length > 0}
            minimalModels={modelsByLevel.minimal || []}
            highModels={modelsByLevel.high || []}
            attemptsCurrent={(manifests[instructionLevel]?.num_examples || 0) * (manifests[instructionLevel]?.rollouts_per_example || 1)}
            attemptsMinimal={(manifests.minimal?.num_examples || 0) * (manifests.minimal?.rollouts_per_example || 1)}
            attemptsHigh={(manifests.high?.num_examples || 0) * (manifests.high?.rollouts_per_example || 1)}
          />
        );
      case "analysis":
        return (
          <Analysis
            models={modelsByLevel[instructionLevel] || []}
            instructionLevel={instructionLevel}
            onInstructionLevelChange={setInstructionLevel}
          />
        );
      case "methodology":
        return <Methodology />;
      case "verses":
        return (
          <Verses
            models={modelsByLevel[instructionLevel] || []}
            samples={samplesByLevel[instructionLevel] || {}}
            loadSamples={(m) => loadSamples(m, instructionLevel)}
          />
        );
      case "about":
        return <About />;
      default:
        return null;
    }
  };

  const shareResults = () => {
    const models = modelsByLevel[instructionLevel] || [];
    const topModel = models[0];
    if (!topModel) return;

    const attempts = (manifests[instructionLevel]?.num_examples || 0) * (manifests[instructionLevel]?.rollouts_per_example || 1);
    const points = computePoints(topModel.summary || {}, attempts);
    const text = `${topModel.id} leads the Jabberwocky Bench (${instructionLevel}) with a score of ${points}!`;
    const url = window.location.href;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        text
      )}&url=${encodeURIComponent(url)}`,
      "_blank"
    );
  };

  return (
    <div className="app-container">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />

      {error && <div className="error-banner">{error}</div>}

      <main className="main-content">
        {activeTab === "leaderboard" && (
          <Hero
            manifest={manifests[instructionLevel]}
            models={modelsByLevel[instructionLevel] || []}
            onPrimary={() => setActiveTab("verses")}
            onSecondary={() =>
              window.scrollTo({
                top: document.body.scrollHeight / 3,
                behavior: "smooth",
              })
            }
            onOpenRadar={() => setActiveTab("analysis")}
          />
        )}
        {renderContent()}
      </main>

      {manifests[instructionLevel] && (
        <button className="share-fab" onClick={shareResults}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </button>
      )}

      {selectedModel && modelSamples.length > 0 && (
        <ModelModal
          model={selectedModel}
          samples={modelSamples}
          onClose={() => {
            setSelectedModel(null);
            setModelSamples([]);
          }}
        />
      )}

      {/* Radar modal removed; Analysis tab replaces it */}
    </div>
  );
}

// Render the app
ReactDOM.render(<App />, document.getElementById("root"));
// Parse judge_raw into think and decision maps
function parseJudgeRawXML(xml) {
  if (!xml) return { think: {}, decide: {}, sumYes: 0, total: CRITERIA_KEYS.length };
  const outThink = {};
  const outDecide = {};
  try {
    // Extract <think>...</think>
    const thinkMatch = xml.match(/<think>([\s\S]*?)<\/think>/i);
    const thinkBlock = thinkMatch ? thinkMatch[1] : "";
    CRITERIA_SHORT.forEach((short, idx) => {
      const key = CRITERIA_KEYS[idx];
      const re = new RegExp(`<${short}_think>([\\s\\S]*?)<\/${short}_think>`, "i");
      const m = thinkBlock.match(re);
      if (m) {
        // Clean up any nested tags and trim
        outThink[short] = m[1].replace(/\s+/g, " ").trim();
      }
    });
    // Parse final decisions <C1>yes</C1>
    CRITERIA_SHORT.forEach((short) => {
      const re = new RegExp(`<${short}>(yes|no)<\/${short}>`, "i");
      const m = xml.match(re);
      if (m) outDecide[short] = m[1].toLowerCase();
    });
  } catch (e) {
    // fall back silently
  }
  const yesCount = Object.values(outDecide).filter((v) => v === "yes").length;
  return { think: outThink, decide: outDecide, sumYes: yesCount, total: CRITERIA_KEYS.length };
}
