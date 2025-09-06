import React, { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { CRITERIA_KEYS, CRITERIA_LABELS, RADAR_COLORS } from "../utils/constants";

export default function RadarViz({
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
    const mm = m.summary?.metrics_mean || {};
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

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const datasets = models.map((m, idx) => {
      const color = (colorMap && colorMap[m.slug]) || colors[idx % colors.length];
      return {
        label: m.id,
        data: getVec(m),
        fill: true,
        backgroundColor: color + "20",
        borderColor: color,
        borderWidth: 2,
        pointBackgroundColor: color,
        pointBorderColor: "#fff",
        pointBorderWidth: 1,
        pointRadius: variant === "hero" ? 0 : 3,
        pointHoverRadius: 5,
        hidden: false,
      };
    });

    chartRef.current = new Chart(ctx, {
      type: "radar",
      data: { labels: CRITERIA_LABELS, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: "point", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: variant !== "hero",
            callbacks: {
              label: function (context) {
                return `${context.dataset.label}: ${Math.round(context.parsed.r)}%`;
              },
            },
          },
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            min: 0,
            ticks: {
              stepSize: 25,
              display: variant !== "hero",
              callback: function (value) { return value + "%"; },
              font: { size: variant === "hero" ? 10 : 12 },
            },
            pointLabels: {
              display: true,
              font: { size: variant === "hero" ? 10 : 12, family: "var(--ui)" },
              color: "#6f6658",
              padding: variant === "hero" ? 5 : 10,
            },
            grid: { color: "#e7e2d9", lineWidth: 1 },
            angleLines: { color: "#e7e2d9", lineWidth: 1 },
          },
        },
        layout: { padding: variant === "hero" ? 0 : 20 },
        animation: { duration: 300 },
        onHover: (event, activeElements) => {
          if (activeElements.length > 0) {
            const datasetIndex = activeElements[0].datasetIndex;
            const model = models[datasetIndex];
            handleHover(model.slug);
          } else {
            handleHover(null);
          }
        },
      },
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [models, variant, colorMap]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;
    models.forEach((m, idx) => {
      const color = (colorMap && colorMap[m.slug]) || colors[idx % colors.length];
      const isHover = effectiveHover === m.slug;
      const dim = effectiveHover && !isHover;
      chart.data.datasets[idx].backgroundColor = color + (isHover ? "80" : dim ? "08" : "20");
      chart.data.datasets[idx].borderColor = color + (isHover ? "FF" : dim ? "40" : "FF");
      chart.data.datasets[idx].borderWidth = isHover ? 3 : dim ? 0.5 : 2;
    });
    chart.update("none");
  }, [effectiveHover, models, colorMap]);

  return (
    <div className={containerClass} aria-label="Top criteria radar" onClick={variant === "hero" ? onOpenModal : undefined} title={variant === "hero" ? "Click to expand" : undefined}>
      <canvas ref={canvasRef} style={{ maxWidth: "100%", maxHeight: "100%" }} />
      {showLegend && (
        <div className="hero-legend">
          {models.map((m, idx) => (
            <div key={m.slug} className="legend-line" onMouseEnter={() => handleHover(m.slug)} onMouseLeave={() => handleHover(null)}>
              <span className="legend-dot" style={{ background: (colorMap && colorMap[m.slug]) || colors[idx % colors.length] }} />
              {m.id}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
