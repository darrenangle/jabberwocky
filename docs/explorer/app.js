const { useState, useEffect, useMemo, useCallback, useRef } = React;

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

function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Normalize score to display format (multiply by 100)
function normalizeScore(score) {
    return Math.round((score || 0) * 1000);
}

// Header component with integrated navigation
function Header({ activeTab, onTabChange }) {
    const [subtitle, setSubtitle] = useState(0);
    
    const subtitles = [
        "Instruction-following under creative constraints",
        "Can models invent and obey?",
        "A benchmark for non‑verifiable rewards",
        "Style, structure, and surprise"
    ];
    
    const tabs = [
        { id: 'leaderboard', label: 'Overview' },
        { id: 'verses', label: 'Verses' },
        { id: 'about', label: 'Why' },
        { id: 'methodology', label: 'Methods' }
    ];
    
    useEffect(() => {
        const interval = setInterval(() => {
            setSubtitle(prev => (prev + 1) % subtitles.length);
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
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}
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
    const attempts = (manifest?.num_examples || 0) * (manifest?.rollouts_per_example || 1);
    const topScore = normalizeScore(topModel?.summary?.overall_reward || 0);
    const top10 = (models || []).slice(0, 10);
    const maxScore = top10.length ? (top10[0].summary?.overall_reward || 1) : 1;
    return (
        <section className="hero">
            <div className="hero-inner">
                <div>
                    <div className="hero-kicker">Jabberwocky Bench</div>
                    <h2 className="hero-title">How well do LLMs imitate difficult poetry?</h2>
                    <p className="hero-copy">
                        A focused test of instruction‑following and inventiveness under hard‑to‑verify constraints. Models must match
                        style, keep meter, invent believable words, and build a narrative arc — without copying the original.
                    </p>
                    <div className="hero-cta">
                        <button className="btn" onClick={onPrimary}>Browse poems</button>
                        <button className="btn secondary" onClick={onSecondary}>See leaderboard</button>
                    </div>
                </div>
                <div className="hero-art">
                    {top10.length > 0 && (
                        <RadarViz models={top10} onOpenModal={onOpenRadar} />
                    )}
                    <div className="hero-ribbon">{topModel ? `${topModel.id} • ${topScore} score • ${attempts} attempts` : 'Loading run...'}</div>
                </div>
            </div>
        </section>
    );
}

// Criteria keys (must mirror environment rubric)
const CRITERIA_KEYS = [
    'C1_title_present',
    'C2_quatrain_shape',
    'C3_ballad_meter_echo',
    'C4_ballad_rhyme',
    'C5_ring_composition',
    'C6_warning_admonition',
    'C7_preparation_armament',
    'C8_encounter_confrontation',
    'C9_slaying_decisive_action',
    'C10_return_celebration',
    'C11_coinage_count',
    'C12_coinage_spread',
    'C13_creature_naming',
    'C14_onomatopoeia',
    'C15_alliteration_consonance',
    'C16_tone_alignment',
    'C17_no_verbatim_lines',
    'C18_canonical_budget',
    'C19_syllable_tightness',
];
const CRITERIA_SHORT = CRITERIA_KEYS.map((k, i) => `C${i+1}`);
const RADAR_COLORS = [
    '#111111', '#1f78b4', '#e4572e', '#2a9d8f', '#8a6a2a',
    '#7b2cbf', '#f4a261', '#0ea5e9', '#ef476f', '#06d6a0'
];

function RadarViz({ models, onOpenModal, showLegend = true }) {
    const colors = RADAR_COLORS;
    const size = 100; const cx = 50; const cy = 50; const r = 40; const n = CRITERIA_KEYS.length;

    const getVec = (m) => {
        const mm = m.summary?.metrics_mean || {}; // 0..1
        return CRITERIA_KEYS.map(k => {
            const v = mm[k];
            return typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 0;
        });
    };

    const angleFor = (i) => ((-90 + (360 * i / n)) * Math.PI / 180);
    const xy = (t, ang) => [cx + r * t * Math.cos(ang), cy + r * t * Math.sin(ang)];

    return (
        <div className="hero-viz" aria-label="Top criteria radar" onClick={onOpenModal} title="Click to expand">
            <svg viewBox={`0 0 ${size} ${size}`} className="hero-viz-svg">
                <defs>
                    <linearGradient id="radarFade" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.92)"/>
                        <stop offset="100%" stopColor="rgba(255,255,255,0.82)"/>
                    </linearGradient>
                </defs>
                <circle cx={cx} cy={cy} r={r+6} fill="url(#radarFade)" stroke="var(--hair)" />
                {[0.25,0.5,0.75,1].map((t,i)=>(
                    <circle key={i} cx={cx} cy={cy} r={r*t} fill="none" stroke="#c9c3b6" strokeDasharray="1,3" />
                ))}
                {CRITERIA_KEYS.map((_, i) => {
                    const a = angleFor(i);
                    const [x,y] = xy(1, a);
                    const [lx,ly] = xy(1.12, a);
                    return (
                        <g key={`axis-${i}`}>
                            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#d9d3c6" strokeWidth={0.5} />
                            <text x={lx} y={ly} fontSize="2.6" textAnchor={Math.cos(a)>0? 'start':'end'} dominantBaseline="middle" fill="#6f6658">{CRITERIA_SHORT[i]}</text>
                        </g>
                    );
                })}
                {models.map((m, idx) => {
                    const vec = getVec(m);
                    const pts = vec.map((t, i) => {
                        const a = angleFor(i);
                        const [x,y] = xy(t, a); return `${x},${y}`;
                    }).join(' ');
                    const color = colors[idx % colors.length];
                    return (
                        <g key={m.slug}>
                            <polyline points={pts} fill={color} opacity={0.12} stroke={color} strokeWidth={1.1} />
                        </g>
                    );
                })}
            </svg>
            {showLegend && (
                <div className="hero-legend">
                    {models.map((m, idx)=> (
                        <div key={m.slug} className="legend-line"><span className="legend-dot" style={{background: colors[idx%colors.length]}} />{m.id}</div>
                    ))}
                </div>
            )}
        </div>
    );
}

function RadarPanel({ models }) {
    const [selected, setSelected] = useState(() => new Set(models.map(m=>m.slug)));
    const toggle = (slug) => setSelected(prev => { const n = new Set(prev); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
    const chosen = models.filter(m => selected.has(m.slug));
    return (
        <div className="radar-wrap">
            <RadarViz models={chosen} showLegend={false} />
            <div className="radar-controls">
                <div className="radar-grid">
                    {models.map((m, idx)=> (
                        <label key={m.slug} className="legend-check">
                            <input type="checkbox" checked={selected.has(m.slug)} onChange={()=>toggle(m.slug)} />
                            <span className="legend-swatch" style={{background: RADAR_COLORS[idx%RADAR_COLORS.length]}} />
                            <span>{m.id}</span>
                        </label>
                    ))}
                </div>
                <div className="radar-note">Toggle models to compare shapes. Axes map to C1–C19.</div>
            </div>
        </div>
    );
}

function RadarModal({ models, onClose }) {
    const top10 = (models||[]).slice(0,10);
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content wide" onClick={e=>e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Top Models — Criteria Radar</h2>
                    <button className="modal-close" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div className="modal-body">
                    <RadarPanel models={top10} />
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
                            y: (s.reward || 0) * 1000
                        }));
                        data.push({
                            id: model.id,
                            provider: model.provider,
                            color: getModelColor(data.length),
                            points: points,
                            average: points.reduce((sum, p) => sum + p.y, 0) / points.length
                        });
                    }
                } catch (err) {
                    console.error('Error loading samples for', model.id, err);
                }
            }
            
            setChartData(data);
            setSelectedModels(data.slice(0, 5).map(d => d.id));
            setLoading(false);
        }
        
        if (models.length > 0) {
            loadChartData();
        }
    }, [models, loadSamples]);
    
    const getModelColor = (index) => {
        const colors = [
            '#8b5cf6', '#ef4444', '#10b981', '#f59e0b', '#3b82f6',
            '#ec4899', '#14b8a6', '#f97316', '#a855f7', '#06b6d4'
        ];
        return colors[index % colors.length];
    };
    
    if (loading) return <Loading />;
    if (!chartData || chartData.length === 0) return <div className="empty-state"><p>No data available</p></div>;
    
    const filteredData = chartData.filter(d => selectedModels.includes(d.id));
    const maxY = 1000;
    
    return (
        <div className="trends-container">
            <div className="card">
                <h3>Performance Over 50 Attempts</h3>
                <p className="chart-subtitle">Model scores across all poem generation attempts</p>
                
                <div className="chart-wrapper">
                    <svg viewBox="0 0 800 400" className="line-chart">
                        {/* Grid lines */}
                        {[0, 200, 400, 600, 800, 1000].map(y => (
                            <g key={y}>
                                <line
                                    x1="60"
                                    y1={350 - (y / maxY * 300)}
                                    x2="750"
                                    y2={350 - (y / maxY * 300)}
                                    stroke="rgba(148, 163, 184, 0.2)"
                                    strokeDasharray="2,2"
                                />
                                <text
                                    x="50"
                                    y={355 - (y / maxY * 300)}
                                    textAnchor="end"
                                    className="chart-label"
                                >
                                    {y}
                                </text>
                            </g>
                        ))}
                        
                        {/* Lines */}
                        {filteredData.map(series => (
                            <g key={series.id}>
                                <polyline
                                    points={series.points.map((p, i) => 
                                        `${60 + (i / 49) * 690},${350 - (p.y / maxY * 300)}`
                                    ).join(' ')}
                                    fill="none"
                                    stroke={series.color}
                                    strokeWidth="3"
                                    opacity="0.9"
                                />
                            </g>
                        ))}
                        
                        {/* X axis */}
                        <line x1="60" y1="350" x2="750" y2="350" stroke="rgba(148, 163, 184, 0.4)" />
                        <text x="405" y="390" textAnchor="middle" className="chart-label">Attempt Number</text>
                    </svg>
                </div>
                
                <div className="model-legend">
                    {chartData.map(series => (
                        <label key={series.id} className="legend-item">
                            <input
                                type="checkbox"
                                checked={selectedModels.includes(series.id)}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setSelectedModels([...selectedModels, series.id]);
                                    } else {
                                        setSelectedModels(selectedModels.filter(id => id !== series.id));
                                    }
                                }}
                            />
                            <span className="legend-color" style={{backgroundColor: series.color}} />
                            <span className="legend-label">{series.id}</span>
                            <span className="legend-avg">avg: {Math.round(series.average)}</span>
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
                    Writing a Jabberwocky‑style poem on command forces a model to do two hard things at once: obey precise formal
                    instructions and invent convincingly. That combination is a sharp probe of instruction‑following under creative constraints.
                </p>
            </div>
            <div className="card">
                <h3>What it really tests</h3>
                <div className="rubric-grid">
                    <div className="rubric-item"><div className="rubric-score">Follow the brief</div><div className="rubric-desc">Hold meter, rhyme and stanza shape while keeping tone consistent.</div></div>
                    <div className="rubric-item"><div className="rubric-score">Inventive control</div><div className="rubric-desc">Coin phonologically plausible nonsense words and deploy them purposefully.</div></div>
                    <div className="rubric-item"><div className="rubric-score">Narrative arc</div><div className="rubric-desc">Build a clear arc: warning → preparation → encounter → resolution → return.</div></div>
                    <div className="rubric-item"><div className="rubric-score">Anti‑copying</div><div className="rubric-desc">Avoid verbatim reuse; stay within a small “canonical budget”.</div></div>
                </div>
            </div>
            <div className="card">
                <h3>When High instructions saturate</h3>
                <p>
                    Seeing High‑instruction scores cluster near the ceiling is expected. It shows that with a clear rubric,
                    modern LLMs can execute. The useful signal is the guidance required to get there — the <strong>instruction sensitivity</strong>.
                    Minimal reflects “cold‑start” prior and self‑prompting ability; Medium shows how quickly the model aligns with partial hints.
                </p>
            </div>
            <div className="card">
                <h3>Secondary purpose</h3>
                <p>
                    This site doubles as a template for <strong>non‑verifiable reward modeling</strong> in creative domains. Even when “ground truth”
                    is fuzzy, structured judges can score style‑matching, coinage quality, and arc building with transparent, reproducible checks.
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
                <p className="intro">Reward is the mean of 19 binary checks applied by an LLM judge. The checks cover form, style, coinage, arc, and syllable tightness. No gold labels; just crisp, reproducible constraints.</p>
            </div>
            <div className="card">
                <h3>The 19 checks (glance)</h3>
                <div className="rubric-grid">
                    <div className="rubric-item"><div className="rubric-score">C1 Title</div><div className="rubric-desc">Non‑empty title preceding the first stanza.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C2 Quatrains</div><div className="rubric-desc">Mostly 4‑line stanzas; sensible count overall.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C3 Meter echo</div><div className="rubric-desc">Alternating longer/shorter lines across stanzas.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C4 Rhyme</div><div className="rubric-desc">(2,4) rhyme; ABAB when appropriate.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C5 Ring close</div><div className="rubric-desc">Final stanza echoes the opening.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C6 Admonition</div><div className="rubric-desc">An early warning (e.g., “Beware…”).</div></div>
                    <div className="rubric-item"><div className="rubric-score">C7 Preparation</div><div className="rubric-desc">Tool/resolve/wait/plan before the encounter.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C8 Encounter</div><div className="rubric-desc">A clear meeting with the foe or obstacle.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C9 Decisive act</div><div className="rubric-desc">Climactic action that resolves tension.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C10 Return/joy</div><div className="rubric-desc">Homecoming and celebration.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C11 Coinage count</div><div className="rubric-desc">Enough distinct invented words.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C12 Coinage spread</div><div className="rubric-desc">Coinages appear across stanzas.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C13 Creature naming</div><div className="rubric-desc">A named adversary (Jabberwock‑like).</div></div>
                    <div className="rubric-item"><div className="rubric-score">C14 Onomatopoeia</div><div className="rubric-desc">Burbles, snickersnacks, and friends.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C15 Alliteration</div><div className="rubric-desc">Consonance/assonance used well.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C16 Tone</div><div className="rubric-desc">Whimsical, brisk, and adventurous.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C17 No verbatim</div><div className="rubric-desc">Avoids copying canonical lines.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C18 Canonical budget</div><div className="rubric-desc">Stays under allowed canonical reuse.</div></div>
                    <div className="rubric-item"><div className="rubric-score">C19 Syllable tightness</div><div className="rubric-desc">Most stanzas keep ~8–10 syllables for long lines and ~6–8 for short lines.</div></div>
                </div>
            </div>
            <div className="card">
                <h3>Judge and labels</h3>
                <p>Default judge: GPT‑4.1‑mini. Labels reflect satisfied checks:</p>
                <ul className="label-list">
                    <li><strong>High</strong>: ≥ 12 checks</li>
                    <li><strong>Medium</strong>: 9–11</li>
                    <li><strong>Low</strong>: 6–8</li>
                    <li><strong>Very Low</strong>: ≤ 5</li>
                </ul>
            </div>
        </div>
    );
}

// Model Leaderboard
function Leaderboard({ models, onModelClick, instructionLevel, onInstructionLevelChange, hasMedium, hasHigh, minimalModels, mediumModels, highModels }) {
    const [sortMode, setSortMode] = React.useState('score'); // 'score' | 'deltaH'
    const sortedModels = useMemo(() => 
        {
            const arr = [...models];
            if (sortMode === 'deltaH') {
                const toMap = (xs) => { const m={}; (xs||[]).forEach(x=>m[x.slug]=x); return m; };
                const minMap = toMap(minimalModels);
                const highMap = toMap(highModels);
                return arr.sort((a,b)=>{
                    const aMin = minMap[a.slug]?.summary?.overall_reward; const aHigh = highMap[a.slug]?.summary?.overall_reward;
                    const bMin = minMap[b.slug]?.summary?.overall_reward; const bHigh = highMap[b.slug]?.summary?.overall_reward;
                    const aD = (aMin!=null && aHigh!=null) ? (aHigh - aMin) : Number.POSITIVE_INFINITY;
                    const bD = (bMin!=null && bHigh!=null) ? (bHigh - bMin) : Number.POSITIVE_INFINITY;
                    if (aD === bD) return (b.summary?.overall_reward || 0) - (a.summary?.overall_reward || 0);
                    return aD - bD; // smaller delta first
                });
            }
            return arr.sort((a, b) => (b.summary?.overall_reward || 0) - (a.summary?.overall_reward || 0));
        },
        [models, sortMode, minimalModels, highModels]
    );
    
    const maxScore = sortedModels[0]?.summary?.overall_reward || 1;
    
    const getRankClass = (rank) => {
        if (rank === 1) return 'rank-1';
        if (rank === 2) return 'rank-2';
        if (rank === 3) return 'rank-3';
        return 'rank-default';
    };
    
    const avg = (arr) => arr && arr.length ? (arr.reduce((s,m)=>s+(m.summary?.overall_reward||0),0)/arr.length) : null;
    const avgMin = avg(minimalModels||[]);
    const avgMed = avg(mediumModels||[]);
    const avgHigh = avg(highModels||[]);

    const toMap = (arr) => {
        const map = {};
        (arr||[]).forEach(m => { map[m.slug] = m; });
        return map;
    };
    const minMap = useMemo(() => toMap(minimalModels), [minimalModels]);
    const medMap = useMemo(() => toMap(mediumModels), [mediumModels]);
    const highMap = useMemo(() => toMap(highModels), [highModels]);
    
    return (
        <>
            <div className="card benchmark-intro">
                <h3>Jabberwocky Bench</h3>
                <p>Structured creativity under pressure: match Carroll’s form, coin words that feel right, and carry a story arc — no copying. If a model can do that on demand, it’s probably good at following tricky instructions while inventing.</p>
                <p className="intro-meta">19 binary checks • LLM judge • built with verifiers</p>
            </div>
            
            <div className="card" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'1rem',flexWrap:'wrap'}}>
                <div className="intro-meta">Instruction level</div>
                <div className="segmented">
                    <button className={instructionLevel==='minimal' ? 'active' : ''} onClick={() => onInstructionLevelChange('minimal')}>Minimal</button>
                    <button className={instructionLevel==='medium' ? 'active' : ''} onClick={() => hasMedium && onInstructionLevelChange('medium')} disabled={!hasMedium}>Medium</button>
                    <button className={instructionLevel==='high' ? 'active' : ''} onClick={() => hasHigh && onInstructionLevelChange('high')} disabled={!hasHigh}>High</button>
                </div>
                <div className="intro-meta" style={{opacity:.7}}>Sparkline: light=min • mid=med • dark=high</div>
                <div className="segmented" aria-label="Sort">
                    <button className={sortMode==='score' ? 'active' : ''} onClick={() => setSortMode('score')}>Sort: Score</button>
                    <button className={sortMode==='deltaH' ? 'active' : ''} onClick={() => setSortMode('deltaH')} disabled={(minimalModels||[]).length===0 || (highModels||[]).length===0}>Sort: ΔH</button>
                </div>
            </div>

            <div className="card">
                <h3>Why three levels?</h3>
                <p className="intro">
                    High instructions often saturate — most capable models hit the ceiling when the rubric is explicit.
                    The signal we want is how much guidance a model needs to get there.
                    Treat High as the ceiling, Minimal as cold‑start inventiveness, and Medium as coaching.
                </p>
                <p className="intro">
                    A quick read on this run:
                    {avgMin!=null && <> Minimal avg {normalizeScore(avgMin)}</>}
                    {avgMed!=null && <> • Medium avg {normalizeScore(avgMed)}</>}
                    {avgHigh!=null && <> • High avg {normalizeScore(avgHigh)}</>}
                    {(avgMin!=null && avgHigh!=null) && <> • Δ(min→high) +{normalizeScore(avgHigh-avgMin)}</>}
                </p>
                <p className="intro">
                    If High clusters near 1000, that’s expected — it shows models can execute when fully briefed.
                    The gap from Minimal to High is the “instruction sensitivity” of the style: lower gaps mean strong internalized priors; bigger gaps mean the model relies on coaching.
                </p>
            </div>

            <div className="leaderboard">
                {sortedModels.map((model, index) => {
                const rank = index + 1;
                const score = model.summary?.overall_reward || 0;
                const scorePercent = (score / maxScore) * 100;
                
                return (
                    <div 
                        key={model.slug}
                        className="model-row"
                        onClick={() => onModelClick(model)}
                    >
                        <div className={`rank-badge ${getRankClass(rank)}`}>
                            {rank}
                        </div>
                        
                        <div className="model-info">
                            <h3 className="model-name">{model.id}</h3>
                            <div className="model-meta">
                                <span className="model-provider">{model.provider}</span>
                                <span className="click-hint">View poems →</span>
                                {/* per-model sparkline */}
                                {(() => {
                                    const minS = minMap[model.slug]?.summary?.overall_reward ?? null;
                                    const medS = medMap[model.slug]?.summary?.overall_reward ?? null;
                                    const highS = highMap[model.slug]?.summary?.overall_reward ?? null;
                                    const y = (v) => 20 - Math.max(0, Math.min(1, v||0)) * 16; // 0..1 -> 20..4
                                    const pts = [minS, medS, highS];
                                    if (pts.every(v => v == null)) return null;
                                    const path = [
                                        `5,${y(minS)}`,
                                        `50,${y(medS)}`,
                                        `95,${y(highS)}`
                                    ].join(' ');
                                    return (
                                        <svg className="model-spark" viewBox="0 0 100 24" aria-label="instruction sensitivity sparkline">
                                            <polyline points={path} fill="none" stroke="#111" strokeWidth="1" opacity="0.5" />
                                            {minS!=null && <circle cx="5" cy={y(minS)} r="2.2" fill="#c8c2b6" title={`Minimal ${normalizeScore(minS)}`} />}
                                            {medS!=null && <circle cx="50" cy={y(medS)} r="2.2" fill="#8f8676" title={`Medium ${normalizeScore(medS)}`} />}
                                            {highS!=null && <circle cx="95" cy={y(highS)} r="2.2" fill="#111" title={`High ${normalizeScore(highS)}`} />}
                                        </svg>
                                    );
                                })()}
                            </div>
                        </div>
                        
                        <div className="score-bar-container">
                            <div className="score-bar" style={{ width: `${scorePercent}%` }} />
                        </div>
                        
                        <div className="score-display">
                            <div className="score-value">{normalizeScore(score)}</div>
                            <div className="score-label">SCORE</div>
                            {(() => {
                                const minS = minMap[model.slug]?.summary?.overall_reward ?? null;
                                const medS = medMap[model.slug]?.summary?.overall_reward ?? null;
                                const highS = highMap[model.slug]?.summary?.overall_reward ?? null;
                                const badges = [];
                                if (minS!=null && medS!=null) {
                                    const d = normalizeScore(medS - minS); const sign = d>=0?'+':'';
                                    badges.push(<div key="m" className="isi-badge" title="Instruction Sensitivity (Medium − Minimal)">ΔM {sign}{d}</div>);
                                }
                                if (minS!=null && highS!=null) {
                                    const d = normalizeScore(highS - minS); const sign = d>=0?'+':'';
                                    badges.push(<div key="h" className="isi-badge" title="Instruction Sensitivity (High − Minimal)">ΔH {sign}{d}</div>);
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
    
    const sortedSamples = useMemo(() => 
        [...samples].sort((a, b) => (b.reward || 0) - (a.reward || 0)).slice(0, 50),
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
        if (e.key === 'ArrowLeft' && currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
        if (e.key === 'ArrowRight' && currentIndex < sortedSamples.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };
    
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex]);
    
    const currentSample = sortedSamples[currentIndex];

    const parsePoem = (poem) => {
        const lines = (poem || '').split('\n');
        let i = 0;
        while (i < lines.length && lines[i].trim() === '') i++;
        let title = '';
        if (i < lines.length && lines[i].trim().startsWith('##')) {
            title = lines[i].replace(/^#+\s*/, '').trim();
            i++;
            if (lines[i] && lines[i].trim() === '') i++;
        } else if (i < lines.length && lines[i].trim().length <= 60) {
            // Treat first short line as title when plausible
            title = lines[i].trim();
            i++;
            if (lines[i] && lines[i].trim() === '') i++;
        }
        const body = lines.slice(i).join('\n');
        return { title, body };
    };
    
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">{model.id}</h2>
                    <button className="modal-close" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                    {currentSample && (() => {
                        const parsed = parsePoem(currentSample.poem);
                        const topic = currentSample.info?.topic || '—';
                        const label = currentSample.label || '—';
                        const score = normalizeScore(currentSample.reward);
                        const stanzas = (parsed.body || '').split(/\n\s*\n/);
                        return (
                            <div className="verse-card">
                                <div className="modal-poem-meta">
                                    <div>
                                        {parsed.title && <div className="poem-title">{parsed.title}</div>}
                                        <div className="meta-right">
                                            <span className="tag">{topic}</span>
                                            <span className="tag">Label: {label}</span>
                                            <span className="tag badge-score">{score}</span>
                                        </div>
                                    </div>
                                    <div className="modal-nav">
                                        <button className="nav-btn" disabled={currentIndex===0} onClick={() => currentIndex>0 && setCurrentIndex(currentIndex-1)} aria-label="Previous">‹</button>
                                        <span className="modal-index">{currentIndex+1}/{sortedSamples.length}</span>
                                        <button className="nav-btn" disabled={currentIndex===sortedSamples.length-1} onClick={() => currentIndex<sortedSamples.length-1 && setCurrentIndex(currentIndex+1)} aria-label="Next">›</button>
                                    </div>
                                </div>
                                <div className="modal-poem-content">
                                    <div className="verse-content">
                                        {stanzas.map((s, idx) => (
                                            <p key={idx} className="stanza" dangerouslySetInnerHTML={{
                                                __html: s.split('\n').map(line => line.replace(/\*(.*?)\*/g, '<em>$1</em>')).join('<br />')
                                            }} />
                                        ))}
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

// Verses browser
function Verses({ models, samples, loadSamples }) {
    const [filters, setFilters] = useState({
        modelSlug: '',
        minReward: 0,
        label: ''
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
                            .map(s => ({
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
                .filter(s => (s.reward || 0) >= filters.minReward)
                .filter(s => !filters.label || s.label === filters.label)
                .sort((a, b) => (b.reward || 0) - (a.reward || 0))
                .slice(0, 50);
            
            setDisplayedSamples(filtered);
            setLoading(false);
        } catch (err) {
            console.error('Error loading verses:', err);
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
                    onChange={(e) => setFilters(prev => ({ ...prev, modelSlug: e.target.value }))}
                >
                    <option value="">Top 3 Models</option>
                    {models.map(m => (
                        <option key={m.slug} value={m.slug}>{m.id}</option>
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
                    <div key={`${sample.__modelId}-${sample.i}-${i}`} className="verse-card">
                        <div className="verse-meta">
                            <span>{sample.__modelId}</span>
                            <span>Score: {normalizeScore(sample.reward)}</span>
                            <span>Label: {sample.label || '—'}</span>
                        </div>
                        
                        <div className="verse-prompt">
                            {sample.prompt}
                        </div>
                        
                        <div className="verse-content" dangerouslySetInnerHTML={{
                            __html: sample.poem.split('\n').map(line => 
                                line.replace(/\*(.*?)\*/g, '<em>$1</em>')
                            ).join('<br />')
                        }} />
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
    const [instructionLevel, setInstructionLevel] = useState('minimal');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('leaderboard');
    const [selectedModel, setSelectedModel] = useState(null);
    const [modelSamples, setModelSamples] = useState([]);
    const [radarOpen, setRadarOpen] = useState(false);

    // Load one manifest+summaries
    const loadOneManifest = useCallback(async (url, level) => {
        const manifestData = await fetchJSON(addCacheBust(url));
        const loadedModels = [];
        for (const entry of manifestData.models) {
            const summaryUrl = addCacheBust(new URL(entry.summary_path, new URL(url, window.location.href)).toString());
            const summary = await fetchJSON(summaryUrl);
            loadedModels.push({ ...entry, summary });
        }
        loadedModels.sort((a, b) => (b.summary?.overall_reward || 0) - (a.summary?.overall_reward || 0));
        setManifests(prev => ({ ...prev, [level]: manifestData }));
        setModelsByLevel(prev => ({ ...prev, [level]: loadedModels }));
        setManifestUrls(prev => ({ ...prev, [level]: url }));
    }, []);

    // Load samples for a model at an instruction level
    const loadSamples = useCallback(async (model, level) => {
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
            const rows = text.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
            setSamplesByLevel(prev => ({ ...prev, [lvl]: { ...(prev[lvl]||{}), [model.slug]: rows } }));
            return rows;
        } catch (err) {
            console.error(`Failed to load samples for ${model.id} (${lvl}):`, err);
            setSamplesByLevel(prev => ({ ...prev, [lvl]: { ...(prev[lvl]||{}), [model.slug]: [] } }));
            return [];
        }
    }, [samplesByLevel, instructionLevel, manifestUrls]);
    
    // Handle model click
    const handleModelClick = async (model) => {
        const modelSamples = await loadSamples(model, instructionLevel);
        setSelectedModel(model);
        setModelSamples(modelSamples);
    };
    
    // Initialize instruction levels (minimal + medium + high)
    useEffect(() => {
        const urlMinimal = getQueryParam('manifest') || '../runs/run-mixed/manifest.json';
        const urlMedium = getQueryParam('manifest_medium') || '../runs/run-mixed-50-medium/manifest.json';
        const urlHigh = getQueryParam('manifest_high') || '../runs/run-mixed-50-high/manifest.json';
        (async () => {
            try {
                setLoading(true);
                setError(null);
                await loadOneManifest(urlMinimal, 'minimal');
            } catch (e) {
                console.error('Failed loading minimal manifest', e);
                setError(`Failed loading minimal run: ${e.message}`);
            } finally {
                setLoading(false);
            }
            try {
                await loadOneManifest(urlMedium, 'medium');
            } catch (e) {
                console.warn('Medium-instruction run not available:', e?.message || e);
            }
            try {
                await loadOneManifest(urlHigh, 'high');
            } catch (e) {
                console.warn('High-instruction run not available:', e?.message || e);
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
            case 'leaderboard':
                return (
                    <Leaderboard
                        models={models}
                        onModelClick={handleModelClick}
                        instructionLevel={instructionLevel}
                        onInstructionLevelChange={setInstructionLevel}
                        hasMedium={(modelsByLevel.medium || []).length > 0}
                        hasHigh={(modelsByLevel.high || []).length > 0}
                        minimalModels={modelsByLevel.minimal || []}
                        mediumModels={modelsByLevel.medium || []}
                        highModels={modelsByLevel.high || []}
                    />
                );
            case 'methodology':
                return <Methodology />;
            case 'verses':
                return <Verses models={modelsByLevel[instructionLevel] || []} samples={samplesByLevel[instructionLevel] || {}} loadSamples={(m)=>loadSamples(m, instructionLevel)} />;
            case 'about':
                return <About />;
            default:
                return null;
        }
    };
    
    const shareResults = () => {
        const models = modelsByLevel[instructionLevel] || [];
        const topModel = models[0];
        if (!topModel) return;
        
        const text = `${topModel.id} leads the Jabberwocky Bench (${instructionLevel}) with a score of ${normalizeScore(topModel.summary?.overall_reward)}!`;
        const url = window.location.href;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    };
    
    return (
        <div className="app-container">
            <Header activeTab={activeTab} onTabChange={setActiveTab} />
            
            {error && (
                <div className="error-banner">
                    {error}
                </div>
            )}
            
            <main className="main-content">
                {activeTab === 'leaderboard' && (
                    <Hero
                        manifest={manifests[instructionLevel]}
                        models={modelsByLevel[instructionLevel] || []}
                        onPrimary={() => setActiveTab('verses')}
                        onSecondary={() => window.scrollTo({ top: document.body.scrollHeight / 3, behavior: 'smooth' })}
                        onOpenRadar={() => setRadarOpen(true)}
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
                    onClose={() => {
                        setSelectedModel(null);
                        setModelSamples([]);
                    }}
                />
            )}

            {radarOpen && (
                <RadarModal
                    models={modelsByLevel[instructionLevel] || []}
                    onClose={() => setRadarOpen(false)}
                />
            )}
        </div>
    );
}

// Render the app
ReactDOM.render(<App />, document.getElementById('root'));
