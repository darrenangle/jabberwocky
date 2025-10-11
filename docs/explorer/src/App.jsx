import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, Outlet, useNavigate, useParams, useOutletContext } from "react-router-dom";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Analysis from "./components/Analysis";
import Leaderboard from "./components/Leaderboard";
import LeaderboardPro from "./components/LeaderboardPro";
import Loading from "./components/Loading";
import About from "./components/About";
import Methodology from "./components/Methodology";
import { addCacheBust, fetchJSON, getQueryParam } from "./utils/api";
import { computePoints } from "./utils/scoring";
import { CRITERIA_LABELS, CRITERIA_SHORT } from "./utils/constants";
import { parseJudgeRawXML } from "./utils/judgeParsing";
import { mdInline, mdBlock } from "./utils/markdown";

// ---------- PAGES (route-level components) ----------

function OverviewPage() {
  const { level = "minimal" } = useParams();
  const navigate = useNavigate();
  const ctx = useOutletContext();
  const models = ctx.modelsByLevel[level] || [];
  const manifest = ctx.manifests[level];
  const hasHigh = (ctx.modelsByLevel.high || []).length > 0;
  const attemptsCurrent = (ctx.manifests[level]?.num_examples || 0) * (ctx.manifests[level]?.rollouts_per_example || 1);
  const attemptsMinimal = (ctx.manifests.minimal?.num_examples || 0) * (ctx.manifests.minimal?.rollouts_per_example || 1);
  const attemptsHigh = (ctx.manifests.high?.num_examples || 0) * (ctx.manifests.high?.rollouts_per_example || 1);
  if (ctx.loading) return <Loading />;
  if (!manifest) return (<div className="empty-state"><h3>Loading Jabberwocky Data...</h3></div>);

  return (
    <>
      <section>
        <Hero
          manifest={manifest}
          models={models}
          onPrimary={() => { const first = models[0]; if (first) navigate(`/${level}/poem/${first.slug}`); }}
          onSecondary={() => window.scrollTo({ top: document.body.scrollHeight / 3, behavior: "smooth" })}
          onOpenRadar={() => navigate(`/${level}/analysis`)}
        />
      </section>
      <LeaderboardPro
        models={models}
        onModelClick={(model) => navigate(`/${level}/poem/${model.slug}`)}
        instructionLevel={level}
        onInstructionLevelChange={(lvl) => navigate(`/${lvl}/overview`)}
        hasHigh={hasHigh}
        minimalModels={ctx.modelsByLevel.minimal || []}
        highModels={ctx.modelsByLevel.high || []}
        attemptsCurrent={attemptsCurrent}
        attemptsMinimal={attemptsMinimal}
        attemptsHigh={attemptsHigh}
      />
    </>
  );
}

function AnalysisPage() {
  const { level = "minimal" } = useParams();
  const navigate = useNavigate();
  const ctx = useOutletContext();
  if (ctx.loading && !(ctx.manifests[level])) return <Loading />;
  return (
    <Analysis
      models={ctx.modelsByLevel[level] || []}
      instructionLevel={level}
      onInstructionLevelChange={(lvl) => navigate(`/${lvl}/analysis`)}
    />
  );
}

function AboutPage() { return <About />; }
function MethodsPage() { return <Methodology />; }

function PoemDefault() {
  const { level = "minimal" } = useParams();
  const navigate = useNavigate();
  const ctx = useOutletContext();
  const models = ctx.modelsByLevel[level] || [];
  useEffect(() => {
    if (models.length > 0) {
      navigate(`/${level}/poem/${models[0].slug}`, { replace: true });
    }
  }, [models, level, navigate]);
  return ctx.loading
    ? <Loading />
    : <div className="empty-state"><h3>Loading poems…</h3></div>;
}

  function PoemPage() {
    const { level = "minimal", modelSlug, i } = useParams();
    const navigate = useNavigate();
    const ctx = useOutletContext();
    const models = ctx.modelsByLevel[level] || [];
    const model = useMemo(() => models.find((m) => m.slug === modelSlug), [models, modelSlug]);

  const [localLoading, setLocalLoading] = useState(false);
  const [modelSamples, setModelSamples] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!model) return;
      setLocalLoading(true);
      const rows = await ctx.loadSamples(model, level);
      if (!mounted) return;
      setModelSamples(rows || []);
      setLocalLoading(false);
      if (!i && (rows || []).length > 0) {
        // default to top by reward
        const top = [...rows].sort((a, b) => (b.reward || 0) - (a.reward || 0))[0];
        if (top && typeof top.i !== 'undefined') {
          navigate(`/${level}/poem/${modelSlug}/${top.i}`, { replace: true });
        }
      }
    })();
    return () => { mounted = false; };
  }, [model, level, i, modelSlug, navigate, ctx]);

  const ordered = useMemo(() => {
    const rows = [...(modelSamples || [])];
    return rows.sort((a, b) => (b.reward || 0) - (a.reward || 0)); // ranked by score
  }, [modelSamples]);

  const currentIndex = useMemo(() => {
    const idx = ordered.findIndex((s) => String(s.i) === String(i));
    return idx >= 0 ? idx : 0;
  }, [ordered, i]);

  const currentSample = ordered[currentIndex];

  const goPrev = () => { if (currentIndex > 0) navigate(`/${level}/poem/${modelSlug}/${ordered[currentIndex - 1].i}`); };
  const goNext = () => { if (currentIndex < ordered.length - 1) navigate(`/${level}/poem/${modelSlug}/${ordered[currentIndex + 1].i}`); };

  // Keyboard navigation: ← → to move between samples
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) { e.preventDefault(); navigate(`/${level}/poem/${modelSlug}/${ordered[currentIndex - 1].i}`); }
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < ordered.length - 1) { e.preventDefault(); navigate(`/${level}/poem/${modelSlug}/${ordered[currentIndex + 1].i}`); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentIndex, ordered, navigate, level, modelSlug]);

  if (!ctx.manifests[level]) return <div className="empty-state"><h3>Loading Jabberwocky Data...</h3></div>;
  if (!model) return <div className="empty-state"><h3>Model not found</h3></div>;
  if (ctx.loading || localLoading) return <Loading />;

  return (
    <div className="poem-layout">
      {(() => {
        const s = currentSample || {};
        const jr = String(s.judge_raw || "");
        const parsed = parseJudgeRawXML(jr);
        const p = s.poem || "";
        const parts = p.split("\n\n");
        const firstLine = parts[0] || "";
        const hasTitleLine = /\S/.test(firstLine) && !firstLine.includes("\n");
        const title = hasTitleLine ? firstLine.trim() : "";
        const body = hasTitleLine ? parts.slice(1).join("\n\n") : p;
        return (
          <>
            <div className="poem-left">
              <div className="card poem-meta-card">
                
                <div className="poem-model">
                  <label htmlFor="modelSelect" className="sr-only">Model</label>
                  <select
                    id="modelSelect"
                    className="model-select"
                    value={modelSlug}
                    onChange={(e) => navigate(`/${level}/poem/${e.target.value}`, { replace: true })}
                  >
                    {models.map((m) => (
                      <option key={m.slug} value={m.slug}>{m.id}</option>
                    ))}
                  </select>
                </div>
                <div className="poem-meta">
                  <div><span className="meta-label">Topic:</span> {s?.info?.topic || "—"}</div>
                  <div><span className="meta-label">Score:</span> {Math.round((s?.reward || 0) * 1000)}</div>
                  <div><span className="meta-label">ID:</span> #{(currentSample?.i ?? 0) + 1}</div>
                  <div className="meta-row" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                    <span className="meta-label">Instruction:</span>
                    <div className="segmented" aria-label="Instruction level">
                      <button
                        className={level === 'minimal' ? 'active' : ''}
                        onClick={() => {
                          if (level === 'minimal') return;
                          const targetModels = ctx.modelsByLevel.minimal || [];
                          const keepSlug = targetModels.some(m => m.slug === modelSlug) ? modelSlug : (targetModels[0]?.slug || '');
                          const idx = currentSample?.i;
                          const path = idx != null ? `/minimal/poem/${keepSlug}/${idx}` : `/minimal/poem/${keepSlug}`;
                          if (keepSlug) navigate(path);
                        }}
                      >
                        Minimal
                      </button>
                      <button
                        className={level === 'high' ? 'active' : ''}
                        onClick={() => {
                          if (level === 'high') return;
                          const targetModels = ctx.modelsByLevel.high || [];
                          if (targetModels.length === 0) return;
                          const keepSlug = targetModels.some(m => m.slug === modelSlug) ? modelSlug : (targetModels[0]?.slug || '');
                          const idx = currentSample?.i;
                          const path = idx != null ? `/high/poem/${keepSlug}/${idx}` : `/high/poem/${keepSlug}`;
                          if (keepSlug) navigate(path);
                        }}
                        disabled={(ctx.modelsByLevel.high || []).length === 0}
                      >
                        High
                      </button>
                    </div>
                  </div>
                </div>
              <div className="poem-nav">
                <button className="nav-btn" disabled={currentIndex === 0} onClick={goPrev} aria-label="Previous" title="Previous">‹</button>
                <span className="poem-index">Rank {currentIndex + 1}/{ordered.length}</span>
                <button className="nav-btn" disabled={currentIndex === ordered.length - 1} onClick={goNext} aria-label="Next" title="Next">›</button>
              </div>
              </div>
              <div className="card judge-card">
                <div className="judge-title" style={{ marginBottom: '.25rem' }}>Judge Decisions — {parsed.sumYes}/{parsed.total}</div>
                <div className="judge-summary">Label: {s.label || "—"} • Score: {Math.round((s.reward || 0) * 1000)}</div>
                <div className="judge-list">
                  {CRITERIA_SHORT.map((short, i) => {
                    const lbl = CRITERIA_LABELS[i] || short;
                    const yn = parsed.decide[short];
                    const think = parsed.think[short] || "";
                    const good = yn === "yes";
                    const bad = yn === "no";
                    return (
                      <details key={short} className="judge-item">
                        <summary className="judge-line">
                          <span className={`judge-pill ${good ? "good" : bad ? "bad" : ""}`} title={yn || "n/a"}>
                            {good ? "Yes" : bad ? "No" : "—"}
                          </span>
                          <span className="judge-key">{short} — {lbl}</span>
                        </summary>
                        {think && <div className="judge-think">{think}</div>}
                      </details>
                    );
                  })}
                </div>
                {jr && (
                  <details className="judge-raw-wrap">
                    <summary>Show raw judge XML</summary>
                    <pre className="judge-raw">{jr}</pre>
                  </details>
                )}
              </div>
            </div>
            <div className="poem-right">
              <div className="poem-book-wrap">
                <div className="poem-page">
                  <div className="poem-inner">
                    {title && <div className="poem-title" dangerouslySetInnerHTML={{ __html: mdInline(title) }} />}
                    <div className="poem-body" dangerouslySetInnerHTML={{ __html: body.split("\n\n").map((stanza) => `<div class=\"stanza\">${mdBlock(stanza)}<\/div>`).join("") }} />
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

// ---------- DATA LAYOUT (provides context and chrome) ----------

function DataLayout() {
  const { level = "minimal" } = useParams();
  const [manifests, setManifests] = useState({ minimal: null, high: null });
  const [modelsByLevel, setModelsByLevel] = useState({ minimal: [], high: [] });
  const [samplesByLevel, setSamplesByLevel] = useState({ minimal: {}, high: {} });
  const [manifestUrls, setManifestUrls] = useState({ minimal: null, high: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [runsIndex, setRunsIndex] = useState([]);

  const loadOneManifest = useCallback(async (url, level) => {
    const manifestData = await fetchJSON(addCacheBust(url));
    const loadedModels = [];
    for (const entry of manifestData.models) {
      const summaryUrl = addCacheBust(new URL(entry.summary_path, new URL(url, window.location.href)).toString());
      const summary = await fetchJSON(summaryUrl);
      loadedModels.push({ ...entry, summary });
    }
    loadedModels.sort((a, b) => (b.summary?.overall_reward || 0) - (a.summary?.overall_reward || 0));
    setManifests((prev) => ({ ...prev, [level]: manifestData }));
    setModelsByLevel((prev) => ({ ...prev, [level]: loadedModels }));
    setManifestUrls((prev) => ({ ...prev, [level]: url }));
  }, []);

  const loadSamples = useCallback(
    async (model, level) => {
      const lvl = level;
      const cache = samplesByLevel[lvl] || {};
      if (cache[model.slug]) return cache[model.slug];
      try {
        const manifestUrl = manifestUrls[lvl];
        if (!manifestUrl) return [];
        const url = addCacheBust(new URL(model.samples_path, new URL(manifestUrl, window.location.href)).toString());
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const text = await res.text();
        const rows = text
          .trim()
          .split("\n")
          .map((line) => { try { return JSON.parse(line); } catch { return null; } })
          .filter(Boolean);
        setSamplesByLevel((prev) => ({ ...prev, [lvl]: { ...(prev[lvl] || {}), [model.slug]: rows } }));
        return rows;
      } catch (err) {
        console.error(`Failed to load samples for ${model.id} (${lvl}):`, err);
        setSamplesByLevel((prev) => ({ ...prev, [lvl]: { ...(prev[lvl] || {}), [model.slug]: [] } }));
        return [];
      }
    },
    [samplesByLevel, manifestUrls]
  );

  useEffect(() => {
    const basePath = window.location.hostname === "jabberwocky.darren.computer" ? "" : "..";
    const urlMinimal = getQueryParam("manifest") || `${basePath}/runs/run-50-20250905-2001/manifest.json`;
    const urlHigh = getQueryParam("manifest_high") || `${basePath}/runs/run-50-high-20250906-0017/manifest.json`;
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
      try { await loadOneManifest(urlHigh, "high"); } catch (e) { console.warn("High-instruction run not available:", e?.message || e); }
      // Load runs index for admin dropdown
      try {
        const idx = await fetchJSON(addCacheBust(`runs/index.json`));
        setRunsIndex(Array.isArray(idx) ? idx : []);
      } catch (e) {
        // optional
      }
    })();
  }, [loadOneManifest]);

  const shareResults = () => {
    const models = modelsByLevel[level] || [];
    const topModel = models[0];
    if (!topModel) return;
    const attempts = (manifests[level]?.num_examples || 0) * (manifests[level]?.rollouts_per_example || 1);
    const points = computePoints(topModel.summary || {}, attempts);
    const text = `${topModel.id} leads the Jabberwocky Bench (${level}) with a score of ${points}!`;
    const url = window.location.href;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank");
  };

  return (
    <div className="app-container">
      <Header adminVisible={adminOpen} onToggleAdmin={() => setAdminOpen((v) => !v)} />
      {error && <div className="error-banner">{error}</div>}
      <main className="main-content">
        {adminOpen && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3>Admin</h3>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '.5rem' }}>
              <span className="meta-label">Load run into</span>
              <div className="segmented" aria-label="Target level">
                <button className={level === 'minimal' ? 'active' : ''} onClick={() => { if (level !== 'minimal') window.location.hash = window.location.hash.replace('/high/', '/minimal/'); }}>Minimal</button>
                <button className={level === 'high' ? 'active' : ''} onClick={() => { if (level !== 'high') window.location.hash = window.location.hash.replace('/minimal/', '/high/'); }}>High</button>
              </div>
              <select onChange={async (e) => {
                const sel = e.target.value;
                if (!sel) return;
                try { setLoading(true); await loadOneManifest(sel, level); }
                catch (err) { setError(`Failed loading run: ${err?.message || err}`); }
                finally { setLoading(false); }
              }} style={{ padding: '.4rem .6rem', border: '1px solid var(--hair)', borderRadius: '8px' }}>
                <option value="">Select a run…</option>
                {runsIndex.map((r, i) => (<option key={i} value={r.manifest}>{r.label}</option>))}
              </select>
              <span className="meta-label">or URL</span>
              <input id="run-url" type="text" placeholder="../runs/your-run/manifest.json" style={{ padding: '.4rem .6rem', border: '1px solid var(--hair)', borderRadius: '8px', minWidth: '320px' }} />
              <button className="btn" onClick={async () => {
                const el = document.getElementById('run-url');
                const val = el && 'value' in el ? el.value : '';
                if (!val) return;
                try { setLoading(true); await loadOneManifest(val, level); }
                catch (err) { setError(`Failed loading run: ${err?.message || err}`); }
                finally { setLoading(false); }
              }}>Load</button>
            </div>
          </div>
        )}
        <Outlet context={{
          manifests,
          modelsByLevel,
          samplesByLevel,
          loadSamples,
          manifestUrls,
          loading,
        }} />
      </main>
      {manifests[level] && (
        <button className="share-fab" onClick={shareResults}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------- APP ROUTES ----------

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/minimal/overview" replace />} />
      <Route path="/:level/*" element={<DataLayout />}>
        <Route path="overview" element={<OverviewPage />} />
        <Route path="analysis" element={<AnalysisPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="methods" element={<MethodsPage />} />
        <Route path="poem" element={<PoemDefault />} />
        <Route path="poem/:modelSlug" element={<PoemPage />} />
        <Route path="poem/:modelSlug/:i" element={<PoemPage />} />
        <Route path="*" element={<Navigate to="/minimal/overview" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/minimal/overview" replace />} />
    </Routes>
  );
}
