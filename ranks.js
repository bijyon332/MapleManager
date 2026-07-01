// ranks.js
// EXP Progress Compare: overlay multiple characters' progression curves on a
// single Chart.js chart.
//
// Data source: MapleHub (maplehub.app) keeps ~90 days of daily snapshots for
// every ranked character in its own backend DB. We fetch it through our own
// Cloudflare Pages Function proxy (/maplehub?name=...&region=...) which adds the
// required `X-MapleHub-Request: true` header and CORS. No more console paste.
//
// Persistence:
//   - Roster:  localStorage[gmsManager.ranks.roster] = [{name, region}, ...]
//   - Cache:   localStorage[gmsManager.ranks.cache]  = { 'na:name': { labels, values, expDaily, charInfo, importedAt } }
//   - Prefs:   localStorage[gmsManager.ranks.prefs]  = { range, yMode, region }
//
//   values[]   : fractional level per day  (Lv + withinLevelExp / TNL(level))
//   expDaily[] : EXP gained that day (raw number)

const ranks = {
    STORAGE_KEY: 'gmsManager.ranks.roster',
    CACHE_KEY:   'gmsManager.ranks.cache',
    PREFS_KEY:   'gmsManager.ranks.prefs',

    initialized: false,
    roster: [],          // [{ name, region }]
    cache: {},           // { 'na:name': { labels, values, expDaily, charInfo, importedAt } }
    selectedRange: 14,   // 7 | 14 | 30 | 90
    yMode: 'absolute',   // 'absolute' | 'delta' | 'exp'
    pickedRegion: 'na',  // for the import form
    chart: null,
    busy: false,

    PALETTE: [
        '#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e',
        '#a855f7', '#84cc16', '#fb923c', '#0ea5e9', '#ec4899',
        '#14b8a6', '#eab308'
    ],

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.loadPrefs();
        this.loadRoster();
        this.loadCache();
        this.bindUI();
        this.renderRangeButtons();
        this.renderModeButtons();
        this.renderRegionButtons();
        this.renderRoster();
        this.renderChart();
    },

    /* ---------- storage ---------- */

    loadRoster() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) this.roster = JSON.parse(raw) || [];
        } catch (_) { this.roster = []; }
    },
    saveRoster() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.roster));
    },

    loadCache() {
        try {
            const raw = localStorage.getItem(this.CACHE_KEY);
            if (raw) this.cache = JSON.parse(raw) || {};
        } catch (_) { this.cache = {}; }
    },
    saveCache() {
        const lean = {};
        for (const [k, v] of Object.entries(this.cache)) {
            lean[k] = { labels: v.labels, values: v.values, expDaily: v.expDaily, charInfo: v.charInfo, importedAt: v.importedAt };
        }
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(lean));
    },

    loadPrefs() {
        try {
            const raw = localStorage.getItem(this.PREFS_KEY);
            if (!raw) return;
            const p = JSON.parse(raw);
            if ([7, 14, 30, 90].includes(p.range)) this.selectedRange = p.range;
            if (['absolute', 'delta', 'exp'].includes(p.yMode)) this.yMode = p.yMode;
            if (['na', 'eu'].includes(p.region)) this.pickedRegion = p.region;
        } catch (_) { /* ignore */ }
    },
    savePrefs() {
        const p = { range: this.selectedRange, yMode: this.yMode, region: this.pickedRegion };
        localStorage.setItem(this.PREFS_KEY, JSON.stringify(p));
    },

    /* ---------- ui bindings ---------- */

    bindUI() {
        const form = document.getElementById('ranks-import-form');
        if (form) form.addEventListener('submit', e => { e.preventDefault(); this.importFromApi(); });

        document.querySelectorAll('.ranks-range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedRange = parseInt(btn.dataset.range, 10);
                this.savePrefs();
                this.renderRangeButtons();
                this.renderChart();
            });
        });

        document.querySelectorAll('.ranks-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.yMode = btn.dataset.mode;
                this.savePrefs();
                this.renderModeButtons();
                this.renderChart();
            });
        });

        document.querySelectorAll('.ranks-region-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.pickedRegion = btn.dataset.region;
                this.savePrefs();
                this.renderRegionButtons();
            });
        });

        const refreshBtn = document.getElementById('ranks-refresh-all');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshAll());

        const clearBtn = document.getElementById('ranks-clear-form');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearForm());
    },

    renderRangeButtons() {
        document.querySelectorAll('.ranks-range-btn').forEach(btn => {
            const active = parseInt(btn.dataset.range, 10) === this.selectedRange;
            btn.className = `ranks-range-btn px-2.5 py-1 rounded text-[11px] font-bold transition-all ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`;
        });
    },
    renderModeButtons() {
        document.querySelectorAll('.ranks-mode-btn').forEach(btn => {
            const active = btn.dataset.mode === this.yMode;
            btn.className = `ranks-mode-btn px-2.5 py-1 rounded text-[11px] font-bold transition-all ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`;
        });
    },
    renderRegionButtons() {
        document.querySelectorAll('.ranks-region-btn').forEach(btn => {
            const active = btn.dataset.region === this.pickedRegion;
            btn.className = `ranks-region-btn px-3 py-1.5 rounded text-[11px] font-bold transition-all ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`;
        });
    },

    /* ---------- import (API) ---------- */

    async importFromApi() {
        if (this.busy) return;
        const nameEl = document.getElementById('ranks-input-name');
        if (!nameEl) return;

        const typedName = (nameEl.value || '').trim();
        const region = this.pickedRegion;
        if (!typedName) { this.showMsg('Enter a character name.', 'warn'); return; }

        this.setBusy(true);
        this.showMsg(`Fetching ${typedName} (${region.toUpperCase()})…`, 'info');
        try {
            const parsed = await this._fetchCharacter(typedName, region);
            if (!parsed.labels.length) {
                this.showMsg('No progression data found for that character.', 'err');
                return;
            }

            const canonicalName = (parsed.charInfo && parsed.charInfo.name) || typedName;
            const cacheKey = `${region}:${canonicalName.toLowerCase()}`;
            this.cache[cacheKey] = { ...parsed, importedAt: Date.now() };

            const existing = this.roster.findIndex(r => r.region === region && r.name.toLowerCase() === canonicalName.toLowerCase());
            if (existing === -1) this.roster.push({ name: canonicalName, region });
            else this.roster[existing].name = canonicalName;

            this.saveRoster();
            this.saveCache();
            this.renderRoster();
            this.renderChart();
            nameEl.value = '';
            this.showMsg(`Imported ${canonicalName} (${region.toUpperCase()}) · ${parsed.labels.length} days of data.`, 'ok');
        } catch (e) {
            this.showMsg(`Failed to fetch: ${e.message}`, 'err');
        } finally {
            this.setBusy(false);
        }
    },

    async refreshAll() {
        if (this.busy || this.roster.length === 0) return;
        this.setBusy(true);
        let ok = 0, fail = 0;
        for (const r of this.roster) {
            try {
                const parsed = await this._fetchCharacter(r.name, r.region);
                if (parsed.labels.length) {
                    this.cache[`${r.region}:${r.name.toLowerCase()}`] = { ...parsed, importedAt: Date.now() };
                    ok++;
                } else { fail++; }
            } catch (_) { fail++; }
        }
        this.saveCache();
        this.renderRoster();
        this.renderChart();
        this.setBusy(false);
        this.showMsg(`Refreshed ${ok} character(s)${fail ? `, ${fail} failed` : ''}.`, fail ? 'warn' : 'ok');
    },

    // Fetch + parse a single character from the MapleHub proxy.
    async _fetchCharacter(name, region) {
        const url = `/maplehub?name=${encodeURIComponent(name)}&region=${region}`;
        const res = await fetch(url, { cache: 'no-cache' });
        let data;
        try { data = await res.json(); } catch (_) { data = null; }
        if (!res.ok || !data || data.error) {
            throw new Error((data && data.error) || `HTTP ${res.status}`);
        }
        return this._parseApiResponse(data);
    },

    setBusy(on) {
        this.busy = on;
        const btn = document.getElementById('ranks-import-btn');
        const refresh = document.getElementById('ranks-refresh-all');
        [btn, refresh].forEach(b => { if (b) b.disabled = on; if (b) b.classList.toggle('opacity-50', on); });
    },

    clearForm() {
        const name = document.getElementById('ranks-input-name');
        if (name) name.value = '';
        this.showMsg('', 'info');
    },

    removeCharacter(name, region) {
        this.roster = this.roster.filter(r => !(r.name === name && r.region === region));
        delete this.cache[`${region}:${name.toLowerCase()}`];
        this.saveRoster();
        this.saveCache();
        this.renderRoster();
        this.renderChart();
    },

    /* ---------- API parsing ---------- */

    // MapleHub /api/character response → { labels, values, expDaily, charInfo }.
    // The time series lives under additionalData.graphData; the fallback endpoint
    // may expose it at the top level, so accept either.
    _parseApiResponse(data) {
        const g = (data.additionalData && data.additionalData.graphData) || data.graphData || {};
        const labels    = Array.isArray(g.labels)    ? g.labels.slice()    : [];
        const levelData = Array.isArray(g.levelData) ? g.levelData         : [];
        const expValues = Array.isArray(g.expValues) ? g.expValues         : []; // within-level EXP
        const expDataA  = Array.isArray(g.expData)   ? g.expData           : []; // daily EXP gained

        const tnl = (typeof tnlData !== 'undefined') ? tnlData : {};

        // Fractional level: Lv + (within-level EXP / EXP-to-next-level).
        const values = labels.map((_, i) => {
            const lv = Number(levelData[i]);
            if (!Number.isFinite(lv)) return null;
            const within = Number(expValues[i]);
            const need = tnl[lv];
            if (need && Number.isFinite(within)) return lv + Math.min(within / need, 0.9999);
            return lv;
        });

        const expDaily = labels.map((_, i) => {
            const v = Number(expDataA[i]);
            return Number.isFinite(v) ? v : null;
        });

        const level = Number(data.level) || (levelData.length ? Number(levelData[levelData.length - 1]) : null);
        let expPct = null;
        const curWithin = Number(expValues[expValues.length - 1]);
        if (level && tnl[level] && Number.isFinite(curWithin)) expPct = (curWithin / tnl[level]) * 100;

        const charInfo = {
            name: data.name || null,
            level,
            expPct,
            world: data.worldName || null
        };

        return { labels, values, expDaily, charInfo };
    },

    /* ---------- rendering ---------- */

    renderRoster() {
        const wrap = document.getElementById('ranks-roster');
        if (!wrap) return;

        if (this.roster.length === 0) {
            wrap.innerHTML = '<span class="text-[11px] text-slate-500 italic">No characters yet. Add one above to start.</span>';
            return;
        }

        wrap.innerHTML = this.roster.map((r, i) => {
            const color = this.PALETTE[i % this.PALETTE.length];
            const key = `${r.region}:${r.name.toLowerCase()}`;
            const cached = this.cache[key];
            let info = '';
            if (cached && cached.charInfo && cached.charInfo.level != null) {
                info = `<span class="text-[10px] text-slate-400 ml-1.5">Lv.${cached.charInfo.level}</span>`;
            } else {
                info = `<span class="text-[10px] text-amber-400 ml-1.5" title="No data cached. Refresh to load.">no data</span>`;
            }
            const importedAgo = cached && cached.importedAt
                ? `<span class="text-[9px] text-slate-600 ml-1" title="${new Date(cached.importedAt).toLocaleString()}">${this._timeAgo(cached.importedAt)}</span>`
                : '';
            return `
                <div class="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg pl-2 pr-1 py-1">
                    <span class="w-2.5 h-2.5 rounded-full" style="background:${color}"></span>
                    <span class="text-[11px] font-bold text-white">${this._escape(r.name)}</span>
                    <span class="text-[9px] uppercase tracking-wider text-slate-500">${r.region}</span>
                    ${info}
                    ${importedAgo}
                    <button type="button" title="Remove"
                            onclick="ranks.removeCharacter('${this._jsAttr(r.name)}','${r.region}')"
                            class="ml-1 w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition-colors">
                        <i data-lucide="x" class="w-3 h-3"></i>
                    </button>
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    },

    showMsg(text, kind) {
        const el = document.getElementById('ranks-msg');
        if (!el) return;
        if (!text) { el.classList.add('hidden'); el.textContent = ''; return; }
        el.classList.remove('hidden');
        const palette = { warn: 'text-amber-400', err: 'text-rose-400', ok: 'text-emerald-400', info: 'text-slate-400' };
        el.className = `mt-2 text-[11px] font-medium ${palette[kind] || palette.info}`;
        el.textContent = text;
    },

    /* ---------- chart ---------- */

    renderChart() {
        const wrap = document.getElementById('ranks-chart-wrap');
        const empty = document.getElementById('ranks-empty');
        const canvas = document.getElementById('ranks-chart');
        if (!wrap || !empty || !canvas) return;

        const isExp = this.yMode === 'exp';

        const ready = this.roster.filter(r => {
            const c = this.cache[`${r.region}:${r.name.toLowerCase()}`];
            return c && Array.isArray(c.labels) && c.labels.length > 0;
        });

        if (ready.length === 0) {
            wrap.classList.add('hidden');
            empty.classList.remove('hidden');
            if (this.chart) { this.chart.destroy(); this.chart = null; }
            return;
        }

        empty.classList.add('hidden');
        wrap.classList.remove('hidden');

        // Union of label dates (from the longest cached series), clipped to range.
        let unionLabels = [];
        for (const r of ready) {
            const c = this.cache[`${r.region}:${r.name.toLowerCase()}`];
            if (c.labels.length > unionLabels.length) unionLabels = c.labels.slice();
        }
        const N = this.selectedRange;
        const labels = unionLabels.slice(-N);
        const labelIndex = Object.fromEntries(labels.map((l, i) => [l, i]));

        const datasets = this.roster.map((r, idx) => {
            const c = this.cache[`${r.region}:${r.name.toLowerCase()}`];
            if (!c || !c.labels) return null;
            const src = isExp ? (c.expDaily || []) : (c.values || []);
            const aligned = new Array(labels.length).fill(null);
            for (let i = 0; i < c.labels.length; i++) {
                const li = labelIndex[c.labels[i]];
                if (li != null) aligned[li] = src[i];
            }
            let display = aligned;
            if (this.yMode === 'delta') {
                const base = aligned.find(v => typeof v === 'number');
                if (typeof base === 'number') {
                    display = aligned.map(v => typeof v === 'number' ? (v - base) : null);
                }
            }
            const color = this.PALETTE[idx % this.PALETTE.length];
            return {
                label: r.name,
                data: display,
                borderColor: color,
                backgroundColor: color + '22',
                borderWidth: 2,
                pointRadius: 2,
                pointHoverRadius: 4,
                tension: 0.25,
                spanGaps: true
            };
        }).filter(Boolean);

        const fmtExp = this._fmtExp;
        const cfg = {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const v = ctx.parsed.y;
                                if (v == null) return `${ctx.dataset.label}: —`;
                                if (isExp) return `${ctx.dataset.label}: ${fmtExp(v)} EXP`;
                                if (this.yMode === 'delta') return `${ctx.dataset.label}: +${v.toFixed(4)} lv`;
                                const lv = Math.floor(v);
                                const pct = (v - lv) * 100;
                                return `${ctx.dataset.label}: Lv.${lv} ${pct.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(148,163,184,0.08)' } },
                    y: {
                        beginAtZero: isExp,
                        ticks: {
                            color: '#94a3b8', font: { size: 10 },
                            callback: (v) => {
                                if (isExp) return fmtExp(v);
                                if (this.yMode === 'delta') return `+${Number(v).toFixed(2)}`;
                                const lv = Math.floor(v);
                                const pct = ((v - lv) * 100).toFixed(0);
                                return `${lv}.${pct.padStart(2, '0')}%`;
                            }
                        },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    }
                }
            }
        };

        if (this.chart) {
            this.chart.data = cfg.data;
            this.chart.options = cfg.options;
            this.chart.update();
        } else {
            this.chart = new Chart(canvas.getContext('2d'), cfg);
        }
    },

    /* ---------- misc ---------- */

    _fmtExp(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return '—';
        const abs = Math.abs(n);
        if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
        if (abs >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
        if (abs >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
        if (abs >= 1e3)  return (n / 1e3).toFixed(2) + 'K';
        return String(n);
    },

    _timeAgo(ts) {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        return `${Math.floor(s / 86400)}d ago`;
    },
    _escape(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    _jsAttr(s) {
        return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }
};
