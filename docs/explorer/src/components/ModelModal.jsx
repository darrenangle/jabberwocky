import React, { useMemo, useState } from "react";
import { CRITERIA_LABELS, CRITERIA_SHORT } from "../utils/constants";
import { normalizeScore } from "../utils/scoring";
import { parseJudgeRawXML } from "../utils/judgeParsing";

export default function ModelModal({ model, samples, onClose }) {
  const sortedSamples = useMemo(() => {
    return [...samples].sort((a, b) => (b.reward || 0) - (a.reward || 0));
  }, [samples]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentSample = sortedSamples[currentIndex];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{model.id}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="modal-body poem-layout">
          {(() => {
            const s = currentSample || {};
            const jr = String(s.judge_raw || "");
            const parsed = parseJudgeRawXML(jr);
            const label = s.label || "—";
            const score = normalizeScore(s.reward);
            const topic = s?.info?.topic || "—";
            const stanzas = String(s.poem || "").split("\n\n");

            return (
              <div className="poem-shell">
                <div className="poem-book">
                  <div className="modal-poem-meta">
                    <div>
                      <div className="meta-right">
                        <span className="tag">Topic: {topic}</span>
                        <span className="tag">Label: {label}</span>
                        <span className="tag badge-score">{score}</span>
                      </div>
                    </div>
                    <div className="modal-nav">
                      <button className="nav-btn" disabled={currentIndex === 0} onClick={() => currentIndex > 0 && setCurrentIndex(currentIndex - 1)} aria-label="Previous">‹</button>
                      <span className="modal-index">{currentIndex + 1}/{sortedSamples.length}</span>
                      <button className="nav-btn" disabled={currentIndex === sortedSamples.length - 1} onClick={() => currentIndex < sortedSamples.length - 1 && setCurrentIndex(currentIndex + 1)} aria-label="Next">›</button>
                    </div>
                  </div>
                  <div className="modal-poem-content">
                    {(() => {
                      const p = s.poem || "";
                      const parts = p.split("\n\n");
                      const firstLine = parts[0] || "";
                      const hasTitleLine = /\S/.test(firstLine) && !firstLine.includes("\n");
                      const title = hasTitleLine ? firstLine.trim() : "";
                      const body = hasTitleLine ? parts.slice(1).join("\n\n") : p;
                      if (title) {
                        return (
                          <>
                            <div className="poem-title">{title}</div>
                            <div className="verse-content" dangerouslySetInnerHTML={{ __html: body.split("\n\n").map((s) => s.split("\n").map((line) => line.replace(/\*(.*?)\*/g, "<em>$1</em>")).join("<br />")).map((x) => `<p class=\"stanza\">${x}</p>`).join("") }} />
                          </>
                        );
                      }
                      return (
                        <div className="verse-content" dangerouslySetInnerHTML={{ __html: body.split("\n\n").map((s) => s.split("\n").map((line) => line.replace(/\*(.*?)\*/g, "<em>$1</em>")).join("<br />")).map((x) => `<p class=\"stanza\">${x}</p>`).join("") }} />
                      );
                    })()}
                    {s.judge_raw && (
                      <div className="judge-block">
                        <div className="judge-title">Judge Decisions</div>
                        <div className="judge-summary">{parsed.sumYes}/{parsed.total} checks • Label: {label} • Score: {score}</div>
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
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

