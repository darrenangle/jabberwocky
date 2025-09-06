import React, { useEffect, useMemo, useState } from "react";
import { CRITERIA_LABELS, CRITERIA_SHORT } from "../utils/constants";
import { normalizeScore } from "../utils/scoring";
import { parseJudgeRawXML } from "../utils/judgeParsing";

export default function ModelModal({ model, samples, onClose }) {
  const sortedSamples = useMemo(() => {
    return [...samples].sort((a, b) => (b.reward || 0) - (a.reward || 0));
  }, [samples]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentSample = sortedSamples[currentIndex];

  // Keyboard navigation for left/right arrows
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          e.preventDefault();
          setCurrentIndex((i) => Math.max(0, i - 1));
        }
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < sortedSamples.length - 1) {
          e.preventDefault();
          setCurrentIndex((i) => Math.min(sortedSamples.length - 1, i + 1));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentIndex, sortedSamples.length]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-titlebar">
            <h2 className="modal-title">{model.id}</h2>
            <div className="modal-arrows">
              <button
                className="nav-btn"
                disabled={currentIndex === 0}
                onClick={() => currentIndex > 0 && setCurrentIndex(currentIndex - 1)}
                aria-label="Previous"
                title="Previous (←)"
              >
                ‹
              </button>
              <span className="modal-index">{currentIndex + 1}/{sortedSamples.length}</span>
              <button
                className="nav-btn"
                disabled={currentIndex === sortedSamples.length - 1}
                onClick={() => currentIndex < sortedSamples.length - 1 && setCurrentIndex(currentIndex + 1)}
                aria-label="Next"
                title="Next (→)"
              >
                ›
              </button>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="modal-body poem-full-layout">
          {(() => {
            const s = currentSample || {};
            const jr = String(s.judge_raw || "");
            const parsed = parseJudgeRawXML(jr);
            const label = s.label || "—";
            const score = normalizeScore(s.reward);
            const topic = s?.info?.topic || "—";
            const stanzas = String(s.poem || "").split("\n\n");

            return (
              <>
                <aside className="judge-float">
                  <div className="judge-title" style={{ marginBottom: '.25rem' }}>Judge Decisions — {parsed.sumYes}/{parsed.total}</div>
                  <div className="judge-summary">Label: {label} • Score: {score}</div>
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
                </aside>
                <div className="poem-book-wrap">
                  <div className="poem-page">
                    {(() => {
                      const p = s.poem || "";
                      const parts = p.split("\n\n");
                      const firstLine = parts[0] || "";
                      const hasTitleLine = /\S/.test(firstLine) && !firstLine.includes("\n");
                      const title = hasTitleLine ? firstLine.trim() : "";
                      const body = hasTitleLine ? parts.slice(1).join("\n\n") : p;
                      return (
                        <>
                          {title && <div className="poem-title">{title}</div>}
                          <div className="poem-body verse-content" dangerouslySetInnerHTML={{ __html: body.split("\n\n").map((s) => s.split("\n").map((line) => line.replace(/\*(.*?)\*/g, "<em>$1</em>")).join("<br />")).map((x) => `<p class=\"stanza\">${x}</p>`).join("") }} />
                          <div className="page-meta">
                            <span className="meta-pill">Topic: {topic}</span>
                            <span className="meta-pill">Label: {label}</span>
                            <span className="meta-pill score">{score}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
