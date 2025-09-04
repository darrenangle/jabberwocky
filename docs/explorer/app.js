const { useState, useEffect, useMemo, useCallback } = React;

// Utility functions
function addCacheBust(url, cacheBust) {
    try {
        const urlObj = new URL(url, window.location.href);
        urlObj.searchParams.set('v', cacheBust || Date.now());
        return urlObj.toString();
    } catch {
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}v=${cacheBust || Date.now()}`;
    }
}

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.json();
}

// Get query param helper
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Corner ornaments component
function CornerOrnaments() {
    return (
        <>
            <div className="corner-ornament-tl" />
            <div className="corner-ornament-tr" />
            <div className="corner-ornament-bl" />
            <div className="corner-ornament-br" />
        </>
    );
}

// Header component
function CodexHeader({ manifestUrl, onManifestLoad, error }) {
    const [inputValue, setInputValue] = useState(manifestUrl || '');
    const [subtitle, setSubtitle] = useState("'Twas brillig, and the slithy models...");
    
    const subtitles = [
        "'Twas brillig, and the slithy models...",
        "All mimsy were the benchmarks...",
        "Beware the overfit, my son!",
        "O frabjous score! Callooh! Callay!",
        "And the mome RAGs outgrabe...",
        "Through the looking glass of evals..."
    ];
    
    useEffect(() => {
        const interval = setInterval(() => {
            setSubtitle(prev => {
                const currentIndex = subtitles.indexOf(prev);
                return subtitles[(currentIndex + 1) % subtitles.length];
            });
        }, 5000);
        return () => clearInterval(interval);
    }, []);
    
    const handleSubmit = (e) => {
        e.preventDefault();
        if (inputValue) onManifestLoad(inputValue);
    };
    
    return (
        <header className="codex-header">
            <h1 className="codex-title">The Jabberwocky Codex</h1>
            <p className="codex-subtitle">{subtitle}</p>
            
            <form className="manifest-controls" onSubmit={handleSubmit}>
                <input
                    type="text"
                    className="manifest-input"
                    placeholder="/runs/thy-quest-name/manifest.json"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                />
                <button type="submit" className="load-button">
                    Embark Upon Quest
                </button>
            </form>
            
            {error && (
                <div className="error-message">
                    ⚜️ {error}
                </div>
            )}
        </header>
    );
}

// Loading component
function Loading() {
    return (
        <div className="loading-container">
            <div className="loading-spinner" />
            <div className="loading-text">Consulting the ancient scrolls...</div>
        </div>
    );
}

// Tab navigation
function TabNav({ activeTab, onTabChange }) {
    const tabs = [
        { id: 'quest', label: 'Quest Log' },
        { id: 'champions', label: 'Champions' },
        { id: 'verses', label: 'Verses' }
    ];
    
    return (
        <nav className="tab-nav">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => onTabChange(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
        </nav>
    );
}

// Quest info component
function QuestLog({ manifest }) {
    if (!manifest) return null;
    
    const shareQuest = () => {
        const text = `Behold! The ${manifest.run_name} quest hath ${manifest.models.length} noble models competing in the Jabberwocky trials!`;
        const url = window.location.href;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    };
    
    return (
        <div className="codex-section">
            <button className="share-button" onClick={shareQuest} title="Share thy quest">
                📜
            </button>
            <h2 className="section-title">Quest Chronicles</h2>
            <div className="run-info-grid">
                <div className="info-item">
                    <span className="info-label">Quest Name</span>
                    <span className="info-value">{manifest.run_name}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Commenced</span>
                    <span className="info-value">{manifest.created_utc}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Arbiter</span>
                    <span className="info-value">{manifest.judge_model}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Arcane Seed</span>
                    <span className="info-value">{manifest.seed}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Trials</span>
                    <span className="info-value">{manifest.num_examples}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Attempts</span>
                    <span className="info-value">{manifest.rollouts_per_example}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Champions</span>
                    <span className="info-value">{manifest.models.length}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">Incantation</span>
                    <span className="info-value">{manifest.system_prompt_mode}</span>
                </div>
            </div>
        </div>
    );
}

// Champions leaderboard
function Champions({ models }) {
    const [hoveredModel, setHoveredModel] = useState(null);
    
    const sortedModels = useMemo(() => 
        [...models].sort((a, b) => (b.summary?.overall_reward || 0) - (a.summary?.overall_reward || 0)),
        [models]
    );
    
    const shareChampion = (model, rank) => {
        const text = `${rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '⚔️'} ${model.id} achieves a mighty score of ${(model.summary?.overall_reward || 0).toFixed(3)} in the Jabberwocky trials!`;
        const url = window.location.href;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    };
    
    const getRankClass = (rank) => {
        if (rank === 1) return 'rank-1';
        if (rank === 2) return 'rank-2';
        if (rank === 3) return 'rank-3';
        return 'rank-default';
    };
    
    return (
        <div className="codex-section">
            <h2 className="section-title">Noble Champions</h2>
            <div className="leaderboard-scroll">
                {sortedModels.map((model, index) => {
                    const rank = index + 1;
                    const score = model.summary?.overall_reward || 0;
                    const maxScore = sortedModels[0]?.summary?.overall_reward || 1;
                    const scorePercent = (score / maxScore) * 100;
                    
                    return (
                        <div 
                            key={model.slug}
                            className="leaderboard-item"
                            onMouseEnter={() => setHoveredModel(model.slug)}
                            onMouseLeave={() => setHoveredModel(null)}
                            onClick={() => shareChampion(model, rank)}
                        >
                            <div className={`rank-badge ${getRankClass(rank)}`}>
                                {rank}
                            </div>
                            
                            <div className="model-info">
                                <div className="model-name">{model.id}</div>
                                <div className="model-provider">{model.provider}</div>
                            </div>
                            
                            <div className="score-bar">
                                <div 
                                    className="score-fill"
                                    style={{ 
                                        width: `${scorePercent}%`,
                                        opacity: hoveredModel === model.slug ? 1 : 0.8
                                    }}
                                />
                            </div>
                            
                            <div className="model-score">
                                {score.toFixed(3)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Sample card component
function VerseCard({ sample }) {
    return (
        <div className="sample-card">
            <div className="sample-meta">
                <span>Scroll #{sample.i}</span>
                <span>Merit: {sample.reward.toFixed(3)}</span>
                <span>Seal: {sample.label || '—'}</span>
                <span>Marks: {sample.criteria_yes}/18</span>
                {sample.__modelId && <span>Scribe: {sample.__modelId}</span>}
            </div>
            <div className="sample-prompt">
                <strong>The Challenge:</strong> {sample.prompt}
            </div>
            <div className="sample-poem">
                {sample.poem}
            </div>
        </div>
    );
}

// Verses (samples) component
function Verses({ models, samples, loadSamples }) {
    const [filters, setFilters] = useState({
        modelSlug: '',
        minReward: 0,
        label: ''
    });
    const [displayedSamples, setDisplayedSamples] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    
    const pageSize = 20;
    
    // Load and filter samples
    const loadFilteredSamples = useCallback(async () => {
        setLoading(true);
        try {
            let allSamples = [];
            
            if (!filters.modelSlug || filters.modelSlug === '*') {
                // Load from multiple models (limit to prevent crashes)
                const modelsToLoad = models.slice(0, 5);
                for (const model of modelsToLoad) {
                    const modelSamples = await loadSamples(model);
                    allSamples = allSamples.concat(
                        modelSamples.slice(0, 50).map(s => ({
                            ...s,
                            __modelId: model.id
                        }))
                    );
                }
            } else {
                const model = models.find(m => m.slug === filters.modelSlug);
                if (model) {
                    const modelSamples = await loadSamples(model);
                    allSamples = modelSamples.map(s => ({
                        ...s,
                        __modelId: model.id
                    }));
                }
            }
            
            // Apply filters
            const filtered = allSamples
                .filter(s => s.reward >= filters.minReward)
                .filter(s => !filters.label || s.label === filters.label)
                .sort((a, b) => (b.reward || 0) - (a.reward || 0));
            
            // Paginate
            const start = 0;
            const end = (page + 1) * pageSize;
            setDisplayedSamples(filtered.slice(start, end));
            
            setLoading(false);
        } catch (err) {
            console.error('Error loading verses:', err);
            setLoading(false);
        }
    }, [filters, models, loadSamples, page]);
    
    useEffect(() => {
        loadFilteredSamples();
    }, [loadFilteredSamples]);
    
    return (
        <div className="codex-section">
            <h2 className="section-title">The Verses of Wonder</h2>
            
            <div className="filter-controls">
                <select
                    className="filter-select"
                    value={filters.modelSlug}
                    onChange={(e) => {
                        setFilters(prev => ({ ...prev, modelSlug: e.target.value }));
                        setPage(0);
                    }}
                >
                    <option value="*">First Five Champions</option>
                    {models.map(m => (
                        <option key={m.slug} value={m.slug}>{m.id}</option>
                    ))}
                </select>
                
                <input
                    type="number"
                    className="filter-input"
                    placeholder="Min merit"
                    step="0.1"
                    min="0"
                    max="1"
                    value={filters.minReward}
                    onChange={(e) => setFilters(prev => ({ 
                        ...prev, 
                        minReward: parseFloat(e.target.value) || 0 
                    }))}
                />
                
                <select
                    className="filter-select"
                    value={filters.label}
                    onChange={(e) => setFilters(prev => ({ ...prev, label: e.target.value }))}
                >
                    <option value="">Any Seal</option>
                    <option value="very_low">Very Low</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                </select>
                
                <button className="apply-button" onClick={() => setPage(0)}>
                    Apply
                </button>
            </div>
            
            {loading ? (
                <Loading />
            ) : (
                <>
                    {displayedSamples.map((sample, i) => (
                        <VerseCard key={`${sample.__modelId}-${sample.i}-${i}`} sample={sample} />
                    ))}
                    
                    {displayedSamples.length >= (page + 1) * pageSize && (
                        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                            <button 
                                className="load-button"
                                onClick={() => setPage(prev => prev + 1)}
                            >
                                Reveal More Verses
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// Main App Component
function App() {
    const [manifest, setManifest] = useState(null);
    const [models, setModels] = useState([]);
    const [samples, setSamples] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('quest');
    
    // Load manifest and models
    const loadManifest = useCallback(async (url) => {
        try {
            setLoading(true);
            setError(null);
            
            const manifestData = await fetchJSON(addCacheBust(url));
            setManifest(manifestData);
            
            // Load model summaries
            const loadedModels = [];
            for (const entry of manifestData.models) {
                const summaryUrl = addCacheBust(
                    new URL(entry.summary_path, new URL(url, window.location.href)).toString()
                );
                const summary = await fetchJSON(summaryUrl);
                
                loadedModels.push({
                    ...entry,
                    summary
                });
            }
            
            setModels(loadedModels);
            setLoading(false);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    }, []);
    
    // Load samples for a model
    const loadSamples = useCallback(async (model) => {
        if (samples[model.slug]) return samples[model.slug];
        
        try {
            const manifestUrl = getQueryParam('manifest');
            if (!manifestUrl) return [];
            
            const url = addCacheBust(
                new URL(model.samples_path, new URL(manifestUrl, window.location.href)).toString()
            );
            const res = await fetch(url);
            
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            
            const text = await res.text();
            const rows = text.trim().split('\n')
                .map(line => { 
                    try { 
                        return JSON.parse(line); 
                    } catch { 
                        return null; 
                    } 
                })
                .filter(Boolean);
            
            setSamples(prev => ({ ...prev, [model.slug]: rows }));
            return rows;
        } catch (err) {
            console.error(`Failed to load samples for ${model.id}:`, err);
            setSamples(prev => ({ ...prev, [model.slug]: [] }));
            return [];
        }
    }, [samples]);
    
    // Initialize from URL params
    useEffect(() => {
        const manifestParam = getQueryParam('manifest');
        if (manifestParam) {
            loadManifest(manifestParam);
        }
    }, [loadManifest]);
    
    const renderContent = () => {
        if (loading) return <Loading />;
        if (!manifest) {
            return (
                <div className="codex-section" style={{ textAlign: 'center' }}>
                    <h2 className="section-title">Welcome, Traveler</h2>
                    <p style={{ fontStyle: 'italic', marginBottom: '1rem' }}>
                        Enter the path to thy manifest scroll to begin the journey...
                    </p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--stone-mid)' }}>
                        Example: /runs/run-mixed/manifest.json
                    </p>
                </div>
            );
        }
        
        switch (activeTab) {
            case 'quest':
                return <QuestLog manifest={manifest} />;
            case 'champions':
                return <Champions models={models} />;
            case 'verses':
                return <Verses models={models} samples={samples} loadSamples={loadSamples} />;
            default:
                return null;
        }
    };
    
    return (
        <div className="codex-frame">
            <CornerOrnaments />
            <div className="codex-scroll">
                <CodexHeader 
                    manifestUrl={getQueryParam('manifest')} 
                    onManifestLoad={loadManifest}
                    error={error}
                />
                {manifest && <TabNav activeTab={activeTab} onTabChange={setActiveTab} />}
                {renderContent()}
            </div>
        </div>
    );
}

// Render the app
ReactDOM.render(<App />, document.getElementById('root'));