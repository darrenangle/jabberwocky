// Chart.js global defaults: no responsiveness, no animation
if (typeof Chart !== 'undefined' && Chart?.defaults) {
  Chart.defaults.responsive = false;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.animation = false;
}

function showError(msg) {
  const el = document.getElementById('errorBox');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
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

function formatLabelCounts(lc) {
  const keys = ["very_low", "low", "medium", "high"]; // keep order
  return keys.map(k => `${k}:${lc[k] || 0}`).join(", ");
}

let state = {
  manifest: null,
  models: [],
  selectedModel: null,
  samples: {}, // slug -> array of rows
  chart: null,
  samplePage: 0,
  cacheBust: null,
};

// --- Color + vendor helpers ---
const vendorBaseColors = {
  openai: '#0B8FFF',
  anthropic: '#FF6F3D',
  google: '#34A853',
  meta: '#8B5CF6',
  xai: '#7C3AED',
  qwen: '#00BCD4',
  deepseek: '#FFCA28',
  mistral: '#FF4081',
  cohere: '#5C6BC0',
  other: '#7c8a9e',
};

function inferVendor(m) {
  const prov = (m.provider || '').toLowerCase();
  const model = (m.model || '').toLowerCase();
  if (prov === 'openai') return 'openai';
  // Try to infer from model path prefix
  const prefix = model.includes('/') ? model.split('/')[0] : '';
  switch (prefix) {
    case 'openai': return 'openai';
    case 'anthropic': return 'anthropic';
    case 'google': return 'google';
    case 'meta-llama': return 'meta';
    case 'x-ai': return 'xai';
    case 'qwen': return 'qwen';
    case 'deepseek': return 'deepseek';
    case 'mistral': return 'mistral';
    case 'cohere': return 'cohere';
    default:
      if (prov === 'groq') return 'meta'; // most groq models are llama variants
      return 'other';
  }
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 124, g: 138, b: 158 };
}

function rgbToHex({ r, g, b }) {
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function tint(hex, t = 0.15) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c) => Math.max(0, Math.min(255, Math.round(c + (255 - c) * t)));
  return rgbToHex({ r: mix(r), g: mix(g), b: mix(b) });
}

function shade(hex, t = 0.15) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c) => Math.max(0, Math.min(255, Math.round(c * (1 - t))));
  return rgbToHex({ r: mix(r), g: mix(g), b: mix(b) });
}

function assignColors(models, manifest) {
  // Priority: model.color -> manifest.model_colors[id] -> vendor variant -> fallback palette
  const palette = [
    '#2563EB','#DB2777','#16A34A','#F59E0B','#8B5CF6','#F97316','#059669','#DC2626','#0EA5E9','#7C3AED',
    '#10B981','#D97706','#EF4444','#14B8A6','#E11D48','#22C55E','#F43F5E','#A855F7','#84CC16','#FB7185',
    '#06B6D4','#9333EA','#F59E0B','#3B82F6','#EC4899','#65A30D','#EA580C','#0891B2','#BE185D','#4F46E5'
  ];

  const modelColors = (manifest && manifest.model_colors) || {};
  const vendorCounts = {};
  let paletteIdx = 0;

  models.forEach((m) => {
    let color = m.color || modelColors[m.id];
    if (!color) {
      const vendor = inferVendor(m);
      const base = vendorBaseColors[vendor] || vendorBaseColors.other;
      const k = vendor;
      vendorCounts[k] = (vendorCounts[k] || 0) + 1;
      const idx = vendorCounts[k] - 1;
      // Alternate tint/shade by index to keep vendor family but distinct per model
      const variant = idx % 3 === 0 ? base : (idx % 3 === 1 ? tint(base, 0.22) : shade(base, 0.18));
      color = variant;
    }
    if (!color) {
      color = palette[paletteIdx % palette.length];
      paletteIdx += 1;
    }
    m.color = color;
  });
}

function renderRunMeta() {
  const m = state.manifest;
  const el = document.getElementById('runMeta');
  el.innerHTML = '';
  if (!m) return;
  const div = document.createElement('div');
  div.className = 'meta';
  div.innerHTML = `
    <div><b>Run:</b> ${m.run_name}</div>
    <div><b>Created:</b> ${m.created_utc}</div>
    <div><b>Judge:</b> ${m.judge_model}</div>
    <div><b>Seed:</b> ${m.seed}</div>
    <div><b>Examples:</b> ${m.num_examples}</div>
    <div><b>Rollouts:</b> ${m.rollouts_per_example}</div>
    <div><b>Eval Profile:</b> ${m.eval_hint_profile}</div>
    <div><b>System Prompt:</b> ${m.system_prompt_mode}</div>
  `;
  el.appendChild(div);
}

function renderRewardChart() {
  const canvas = document.getElementById('rewardChart');
  const ctx = canvas.getContext('2d');
  // Sort models by score (descending)
  const sorted = state.models
    .map(m => ({ m, score: (m.summary?.overall_reward || 0) }))
    .sort((a, b) => b.score - a.score);
  const labels = sorted.map(x => x.m.id);
  const data = sorted.map(x => x.score);
  const colors = sorted.map(x => x.m.color || '#3fb950');
  // Fixed-size rendering to avoid responsive resize loops
  const width = Math.max(700, Math.floor(labels.length * 36)); // px per bar
  const height = 420;
  // Only update attributes if changed to avoid reflow churn
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  // Explicitly set CSS size to fixed pixels so Chart.js won't try to stretch
  const wpx = `${width}px`;
  const hpx = `${height}px`;
  if (canvas.style.width !== wpx) canvas.style.width = wpx;
  if (canvas.style.height !== hpx) canvas.style.height = hpx;
  if (state.chart) state.chart.destroy();
  state.chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Overall Reward', data, backgroundColor: colors, borderColor: colors.map(c => shade(c, 0.2)), borderWidth: 1 }] },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      animations: { colors: false, numbers: false },
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { maxRotation: 60, minRotation: 60, autoSkip: false, color: '#334155', font: { size: 10, weight: '600' } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          max: 1.0,
          ticks: { color: '#475569' },
          grid: { color: 'rgba(0,0,0,0.06)' },
        }
      },
      datasets: { bar: { barPercentage: 0.72, categoryPercentage: 0.72 } },
    },
  });
  // Freeze the chart to a static image by destroying it after render.
  // This avoids any internal observers from mutating size.
  let snapshot = null;
  try {
    state.chart.draw();
    snapshot = state.chart.toBase64Image();
  } catch {}
  // Allow a single paint before destroy to ensure pixels are on canvas
  setTimeout(() => {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    if (snapshot) {
      const img = new Image();
      img.onload = () => {
        try { ctx.clearRect(0, 0, width, height); } catch {}
        try { ctx.drawImage(img, 0, 0, width, height); } catch {}
      };
      img.src = snapshot;
    }
  }, 0);
}

function renderLegend() {
  const holder = document.getElementById('legend');
  holder.innerHTML = '';
  // Determine vendors present
  const vendors = new Map();
  state.models.forEach(m => {
    const v = inferVendor(m);
    if (!vendors.has(v)) vendors.set(v, vendorBaseColors[v] || vendorBaseColors.other);
  });
  vendors.forEach((color, vendor) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `<span class="swatch" style="background:${color}"></span><span>${vendor}</span>`;
    holder.appendChild(item);
  });
}

function renderModelCards() {
  const list = document.getElementById('modelList');
  list.innerHTML = '';
  state.models.forEach(m => {
    const card = document.createElement('div');
    card.className = 'model-card';
    card.innerHTML = `
      <div class="stripe" style="background:${m.color || '#cbd5e1'}"></div>
      <div>
        <div class="name">${m.id}</div>
        <div class="provider">${m.provider} • ${m.model}</div>
        <div class="reward">reward ${(m.summary?.overall_reward || 0).toFixed(3)}</div>
        <div class="labels">${formatLabelCounts(m.summary?.label_counts || {})}</div>
      </div>
    `;
    card.addEventListener('click', () => selectModel(m));
    list.appendChild(card);
  });
}

function populateModelSelect() {
  const sel = document.getElementById('modelSelect');
  sel.innerHTML = '';
  // Add an All Models option
  const allOpt = document.createElement('option');
  allOpt.value = '*';
  allOpt.textContent = '(All models)';
  sel.appendChild(allOpt);
  state.models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.slug;
    opt.textContent = m.id;
    sel.appendChild(opt);
  });
  if (state.selectedModel) sel.value = state.selectedModel.slug;
}

function selectModel(m) {
  state.selectedModel = m;
  state.samplePage = 0;
  populateModelSelect();
  renderSamples();
}

async function ensureSamplesLoaded(model) {
  if (state.samples[model.slug]) return;
  const url = addCacheBust(new URL(model.samples_path, state.manifestBase).toString());
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const text = await res.text();
  const rows = text.trim().split(/\n+/).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  state.samples[model.slug] = rows;
}

function sampleCard(row) {
  const div = document.createElement('div');
  div.className = 'sample';
  // color accent based on selected model
  const color = row.__modelColor || state.selectedModel?.color;
  if (color) { div.style.borderLeft = `4px solid ${color}`; div.style.paddingLeft = '10px'; }
  const meta = document.createElement('div');
  meta.className = 'meta';
  const modelPart = row.__modelId ? ` • model:${row.__modelId}` : '';
  meta.textContent = `i:${row.i} • reward:${row.reward.toFixed(3)} • label:${row.label || '—'} • criteria:${row.criteria_yes}/18${modelPart}`;
  const prm = document.createElement('div');
  prm.className = 'prompt';
  prm.textContent = row.prompt;
  const poem = document.createElement('div');
  poem.className = 'poem';
  poem.textContent = row.poem;
  div.appendChild(meta);
  div.appendChild(prm);
  div.appendChild(poem);
  return div;
}

async function renderSamples() {
  const list = document.getElementById('sampleList');
  const loadMoreBtn = document.getElementById('loadMore');
  if (state.samplePage === 0) list.innerHTML = '';
  const modelSel = document.getElementById('modelSelect').value;
  let rows = [];
  if (modelSel === '*' ) {
    // Load all models lazily
    for (const m of state.models) {
      await ensureSamplesLoaded(m);
      const ms = (state.samples[m.slug] || []).map(r => ({...r, __modelSlug: m.slug, __modelId: m.id, __modelColor: m.color}));
      rows = rows.concat(ms);
    }
  } else {
    const model = state.models.find(x => x.slug === modelSel) || state.selectedModel || state.models[0];
    if (!model) return;
    await ensureSamplesLoaded(model);
    rows = (state.samples[model.slug] || []).map(r => ({...r, __modelSlug: model.slug, __modelId: model.id, __modelColor: model.color}));
  }

  // Filters
  const minReward = parseFloat(document.getElementById('minReward').value || '0');
  const label = document.getElementById('labelFilter').value;
  const filtered = rows.filter(r => (r.reward >= minReward) && (!label || r.label === label));
  // Order by reward descending for consistency
  filtered.sort((a,b) => (b.reward||0) - (a.reward||0));
  const pageSize = 200;
  const end = Math.min(filtered.length, (state.samplePage + 1) * pageSize);
  const start = state.samplePage * pageSize;
  filtered.slice(start, end).forEach(r => list.appendChild(sampleCard(r)));
  // Show or hide Load More button
  if (end < filtered.length) {
    loadMoreBtn.style.display = 'inline-block';
  } else {
    loadMoreBtn.style.display = 'none';
  }
}

async function loadManifest(url) {
  state.manifestBase = new URL(url, window.location.href);
  const m = await fetchJSON(url);
  state.manifest = m;
  state.cacheBust = m.created_utc || String(Date.now());
  // Load per-model summaries
  const models = [];
  for (const entry of m.models) {
    const base = state.manifestBase;
    const summaryUrl = addCacheBust(new URL(entry.summary_path, base));
    const summary = await fetchJSON(summaryUrl);
    models.push({
      id: entry.id,
      slug: entry.slug,
      provider: entry.provider,
      model: entry.model,
      summary_path: entry.summary_path,
      samples_path: entry.samples_path,
      summary,
      color: entry.color || (m.model_colors && m.model_colors[entry.id]) || null,
    });
  }
  state.models = models;
  assignColors(state.models, state.manifest);
  // Ensure summaries reflect actual written samples (file-based truth)
  await recomputeSummariesFromSamples();
  renderRunMeta();
  renderLegend();
  renderRewardChart();
  renderModelCards();
  populateModelSelect();
  selectModel(state.models[0]);
}

function initUI() {
  const input = document.getElementById('manifestInput');
  const btn = document.getElementById('loadBtn');
  const apply = document.getElementById('applyFilters');
  btn.addEventListener('click', () => {
    const url = input.value.trim();
    if (url) loadManifest(url);
  });
  document.getElementById('modelSelect').addEventListener('change', (e) => {
    const selSlug = e.target.value;
    if (selSlug === '*') {
      state.selectedModel = null;
      state.samplePage = 0;
      renderSamples();
      return;
    }
    const m = state.models.find(x => x.slug === selSlug);
    if (m) selectModel(m);
  });
  apply.addEventListener('click', () => { state.samplePage = 0; renderSamples(); });
  document.getElementById('loadMore').addEventListener('click', () => { state.samplePage += 1; renderSamples(); });
}

window.addEventListener('DOMContentLoaded', async () => {
  if (location.protocol === 'file:') {
    showError('Local file access detected. Please serve this folder over HTTP to avoid browser CORS restrictions. Example: "python -m http.server --directory environments/jabberwocky/docs 8000" then open http://localhost:8000/explorer/?manifest=/runs/<run>/manifest.json');
  }
  initUI();
  const manifestParam = getQueryParam('manifest');
  if (manifestParam) {
    document.getElementById('manifestInput').value = manifestParam;
    try {
      await loadManifest(addCacheBust(manifestParam));
    } catch (e) {
      showError(String(e));
    }
  }
});

// --- Cache-busting helpers and fallback summarization ---
function addCacheBust(u) {
  try {
    const url = new URL(u, window.location.href);
    const v = state.cacheBust || String(Date.now());
    if (url.search) {
      url.search += `&v=${encodeURIComponent(v)}`;
    } else {
      url.search = `?v=${encodeURIComponent(v)}`;
    }
    return url.toString();
  } catch {
    // Fall back to string manipulation
    const sep = u.includes('?') ? '&' : '?';
    const v = state.cacheBust || String(Date.now());
    return `${u}${sep}v=${encodeURIComponent(v)}`;
  }
}

async function recomputeSummariesFromSamples() {
  // Recompute overall reward and label counts from samples.jsonl per model
  for (const m of state.models) {
    try {
      await ensureSamplesLoaded(m);
      const rows = state.samples[m.slug] || [];
      if (!m.summary) m.summary = {};
      // Only include rows with a non-empty poem and a numeric, non-zero reward (visual only)
      const usable = rows.filter(r => {
        const hasPoem = typeof r.poem === 'string' && r.poem.trim().length > 0;
        const hasReward = typeof r.reward === 'number' && !Number.isNaN(r.reward);
        const nonZero = Number(r.reward) > 0; // exclude pure 0 scores from visual averages
        return hasPoem && hasReward && nonZero;
      });
      if (usable.length > 0) {
        const rewards = usable.map(r => Number(r.reward) || 0);
        const mean = rewards.reduce((a,b)=>a+b,0) / rewards.length;
        const lc = { very_low: 0, low: 0, medium: 0, high: 0 };
        usable.forEach(r => { if (r.label && lc.hasOwnProperty(r.label)) lc[r.label] += 1; });
        m.summary.overall_reward = mean;
        m.summary.label_counts = lc;
      } else {
        // If nothing usable, clear the summary so charts treat as 0 and no labels
        m.summary.overall_reward = 0;
        m.summary.label_counts = { very_low: 0, low: 0, medium: 0, high: 0 };
      }
    } catch (e) {
      // ignore; keep existing summary
    }
  }
}
