import React, { useCallback, useEffect, useState } from "react";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Analysis from "./components/Analysis";
import Verses from "./components/Verses";
import Leaderboard from "./components/Leaderboard";
import ModelModal from "./components/ModelModal";
import Loading from "./components/Loading";
import About from "./components/About";
import Methodology from "./components/Methodology";
import { addCacheBust, fetchJSON, getQueryParam } from "./utils/api";
import { computePoints } from "./utils/scoring";

export default function App() {
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
      const lvl = level || instructionLevel;
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
    [samplesByLevel, instructionLevel, manifestUrls]
  );

  const handleModelClick = async (model) => {
    const modelSamples = await loadSamples(model, instructionLevel);
    setSelectedModel(model);
    setModelSamples(modelSamples);
  };

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
    })();
  }, [loadOneManifest]);

  const renderContent = () => {
    const models = modelsByLevel[instructionLevel] || [];
    const manifest = manifests[instructionLevel];
    if (loading) return <Loading />;
    if (!manifest) return (<div className="empty-state"><h3>Loading Jabberwocky Data...</h3></div>);
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
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank");
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
            onSecondary={() => window.scrollTo({ top: document.body.scrollHeight / 3, behavior: "smooth" })}
            onOpenRadar={() => setActiveTab("analysis")}
          />
        )}
        {renderContent()}
      </main>
      {manifests[instructionLevel] && (
        <button className="share-fab" onClick={shareResults}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          onClose={() => { setSelectedModel(null); setModelSamples([]); }}
        />
      )}
    </div>
  );
}

