// ranks.js
// Rank Compare: overlay multiple MapleRanks characters' Level Progress
// curves on a single Chart.js chart.
//
// Why paste-import: mapleranks.com sits behind Cloudflare's bot challenge
// for `/u/...` paths, so any server-side or CORS-proxy fetch is blocked.
// Only a real browser session (with cf_clearance) can read the data. The
// user provides it by pasting `window.__MR__` from the MapleRanks tab; we
// decode it client-side using the same XOR-with-LCG-key algorithm the
// MapleRanks bundle uses.
//
// Persistence:
//   - Roster:  localStorage[gmsManager.ranks.roster] = [{name, region}, ...]
//   - Decoded: localStorage[gmsManager.ranks.cache]  = { 'na:name': { labels, values, charInfo, importedAt } }
//   - Prefs:   localStorage[gmsManager.ranks.prefs]  = { range, yMode, region }
//
// Both roster and cache are persisted so a page reload restores the chart
// without requiring another paste.

const ranks = {
    STORAGE_KEY: 'gmsManager.ranks.roster',
    CACHE_KEY:   'gmsManager.ranks.cache',
    PREFS_KEY:   'gmsManager.ranks.prefs',

    initialized: false,
    roster: [],          // [{ name, region }]
    cache: {},           // { 'na:name': { labels, values, charInfo, importedAt } }
    selectedRange: 14,   // 7 | 14 | 30 | 90
    yMode: 'absolute',   // 'absolute' | 'delta'
    pickedRegion: 'na',  // for the import form
    chart: null,

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
        // Keep persisted form lean — never save raw payload to localStorage.
        const lean = {};
        for (const [k, v] of Object.entries(this.cache)) {
            lean[k] = { labels: v.labels, values: v.values, charInfo: v.charInfo, importedAt: v.importedAt };
        }
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(lean));
    },

    loadPrefs() {
        try {
            const raw = localStorage.getItem(this.PREFS_KEY);
            if (!raw) return;
            const p = JSON.parse(raw);
            if ([7, 14, 30, 90].includes(p.range)) this.selectedRange = p.range;
            if (['absolute', 'delta'].includes(p.yMode)) this.yMode = p.yMode;
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
        if (form) form.addEventListener('submit', e => { e.preventDefault(); this.importFromPaste(); });

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

        const copyBtn = document.getElementById('ranks-copy-snippet');
        if (copyBtn) copyBtn.addEventListener('click', () => this.copyConsoleSnippet());

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

    /* ---------- import ---------- */

    copyConsoleSnippet() {
        // Snippet for the user to run on mapleranks.com in DevTools console.
        // Copies the encoded MR payload + detected name/region to the clipboard.
        // window.__MR__ is only injected on the initial server-rendered page
        // load, so if the user navigated via the in-app search it'll be absent.
        // We alert in that case instead of silently copying a half-empty JSON.
        const snippet =
            "(()=>{" +
            "if(typeof window.__MR__!=='string'){" +
            "alert('window.__MR__ is missing. Open https://mapleranks.com/u/YOURNAME directly in the URL bar and press F5, then re-run this snippet.');return;" +
            "}" +
            "copy(JSON.stringify({" +
            "n:location.pathname.split('/').filter(Boolean).pop()," +
            "r:location.pathname.includes('/eu/')?'eu':'na'," +
            "d:window.__MR__" +
            "}));" +
            "console.log('Copied %d bytes — paste into the GMS Manager Rank Compare tab.',window.__MR__.length);" +
            "})()";
        navigator.clipboard.writeText(snippet).then(
            () => this.showMsg('Snippet copied. Paste it into the MapleRanks DevTools console (F12) and press Enter.', 'ok'),
            () => this.showMsg('Could not write to clipboard. Copy the snippet from the textarea hint manually.', 'err')
        );
    },

    clearForm() {
        const name = document.getElementById('ranks-input-name');
        const data = document.getElementById('ranks-input-data');
        if (name) name.value = '';
        if (data) data.value = '';
        this.showMsg('', 'info');
    },

    importFromPaste() {
        const nameEl = document.getElementById('ranks-input-name');
        const dataEl = document.getElementById('ranks-input-data');
        if (!nameEl || !dataEl) return;

        let typedName = (nameEl.value || '').trim();
        let region = this.pickedRegion;
        let encoded = (dataEl.value || '').trim();
        if (!encoded) { this.showMsg('Paste the MapleRanks data first.', 'warn'); return; }

        // The pasted value may be either:
        //   (a) the raw base64 string from `copy(window.__MR__)`
        //   (b) a JSON object {n, r, d} produced by our console snippet
        if (encoded.startsWith('{')) {
            try {
                const obj = JSON.parse(encoded);
                if (obj && typeof obj === 'object') {
                    if (!typedName && obj.n) typedName = String(obj.n).trim();
                    if (obj.r && ['na', 'eu'].includes(obj.r)) region = obj.r;
                    if (obj.d) {
                        encoded = String(obj.d).trim();
                    } else {
                        this.showMsg(
                            'Snippet captured the name/region but window.__MR__ was empty. ' +
                            'Open https://mapleranks.com/u/' + (obj.n || 'YourName') +
                            ' directly in a new tab, press F5, then re-run the snippet.',
                            'err'
                        );
                        return;
                    }
                }
            } catch (e) {
                this.showMsg('Pasted JSON could not be parsed.', 'err');
                return;
            }
        }

        // Strip quotes if the user pasted `copy(window.__MR__)` literally (sometimes the
        // copied form is wrapped in quotes by the browser).
        encoded = encoded.replace(/^["']|["']$/g, '');

        if (!typedName) { this.showMsg('Enter the character name (or use the console snippet).', 'warn'); return; }
        if (encoded.length < 100) { this.showMsg('Pasted data looks too short to be a MapleRanks payload.', 'err'); return; }

        // Decode locally
        let decoded;
        try {
            const key = this._genKey(typedName.toLowerCase());
            decoded = this._decode(encoded, key);
        } catch (e) {
            this.showMsg(`Decode failed: ${e.message}. Make sure the character name matches the one in the MapleRanks URL.`, 'err');
            return;
        }

        const parsed = this._extractFromPayload(decoded);
        if (!parsed.labels.length) {
            this.showMsg('Decoded the payload but found no Level Progress data inside.', 'err');
            return;
        }

        // Use the character name MapleRanks reports rather than the typed casing
        const canonicalName = (parsed.charInfo && parsed.charInfo.name) || typedName;
        const cacheKey = `${region}:${canonicalName.toLowerCase()}`;
        this.cache[cacheKey] = { ...parsed, importedAt: Date.now() };

        // Upsert into roster (preserve original entry order)
        const existing = this.roster.findIndex(r => r.region === region && r.name.toLowerCase() === canonicalName.toLowerCase());
        if (existing === -1) {
            this.roster.push({ name: canonicalName, region });
        } else {
            this.roster[existing].name = canonicalName;
        }

        this.saveRoster();
        this.saveCache();
        this.renderRoster();
        this.renderChart();
        this.clearForm();
        this.showMsg(`Imported ${canonicalName} (${region.toUpperCase()}) · ${parsed.labels.length} days of data.`, 'ok');
    },

    removeCharacter(name, region) {
        this.roster = this.roster.filter(r => !(r.name === name && r.region === region));
        delete this.cache[`${region}:${name.toLowerCase()}`];
        this.saveRoster();
        this.saveCache();
        this.renderRoster();
        this.renderChart();
    },

    /* ---------- rendering ---------- */

    renderRoster() {
        const wrap = document.getElementById('ranks-roster');
        if (!wrap) return;

        if (this.roster.length === 0) {
            wrap.innerHTML = '<span class="text-[11px] text-slate-500 italic">No characters yet. Import one above to start.</span>';
            return;
        }

        wrap.innerHTML = this.roster.map((r, i) => {
            const color = this.PALETTE[i % this.PALETTE.length];
            const key = `${r.region}:${r.name.toLowerCase()}`;
            const cached = this.cache[key];
            let info = '';
            if (cached && cached.charInfo) {
                info = `<span class="text-[10px] text-slate-400 ml-1.5">Lv.${cached.charInfo.level}</span>`;
            } else {
                info = `<span class="text-[10px] text-amber-400 ml-1.5" title="No data cached. Paste again to refresh.">no data</span>`;
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

        // Union of label dates, ordered as they appear in the longest cached
        // series, then clipped to the selected range from the right end.
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
            const aligned = new Array(labels.length).fill(null);
            for (let i = 0; i < c.labels.length; i++) {
                const li = labelIndex[c.labels[i]];
                if (li != null) aligned[li] = c.values[i];
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
                        ticks: {
                            color: '#94a3b8', font: { size: 10 },
                            callback: (v) => {
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

    /* ---------- payload parsing ---------- */

    _extractFromPayload(data) {
        // MapleRanks ships its decoded payload with obfuscated property names
        // that happen to be stable. We avoid hardcoding them and instead
        // discover entries by shape:
        //   - lineChart: nested object with { type:'line', data:{labels,...} }
        //   - charInfo:  nested object that has a short string name, an
        //                integer level, and a fractional exp percentage.
        const flat = this._flatten(data);

        let lineChart = null;
        for (const o of flat.objects) {
            if (o && o.type === 'line' && o.data && Array.isArray(o.data.labels)) {
                lineChart = o; break;
            }
        }

        let charInfo = null;
        for (const o of flat.objects) {
            if (!o || typeof o !== 'object') continue;
            const entries = Object.entries(o);
            const nameVal = entries.find(([k, v]) => typeof v === 'string' && v.length > 0 && v.length < 30)?.[1];
            const lvlVal = entries.find(([k, v]) => typeof v === 'number' && v > 0 && v < 350 && Number.isInteger(v))?.[1];
            const pctVal = entries.find(([k, v]) => typeof v === 'number' && v >= 0 && v <= 100 && !Number.isInteger(v))?.[1];
            const worldStr = entries.find(([k, v]) => typeof v === 'string' && /^[A-Z][a-z]+$/.test(v))?.[1];
            if (nameVal && lvlVal != null && pctVal != null) {
                charInfo = { name: nameVal, level: lvlVal, expPct: pctVal, world: worldStr || null };
                break;
            }
        }

        let labels = [], values = [];
        if (lineChart && lineChart.data) {
            labels = Array.from(lineChart.data.labels || []);
            const ds = (lineChart.data.datasets && lineChart.data.datasets[0]) || null;
            values = ds ? Array.from(ds.data || []) : [];
        }
        return { labels, values, charInfo };
    },

    _flatten(obj, depth = 0, acc = { objects: [] }) {
        if (depth > 4 || !obj || typeof obj !== 'object') return acc;
        acc.objects.push(obj);
        for (const v of Object.values(obj)) {
            if (v && typeof v === 'object' && !Array.isArray(v)) this._flatten(v, depth + 1, acc);
        }
        return acc;
    },

    /* ---------- decode ---------- */

    _genKey(name) {
        let h = 0;
        for (let i = 0; i < name.length; i++) {
            h = (h << 5) - h + name.charCodeAt(i);
            h &= h;
        }
        const seed = Math.abs(h);
        const k = new Uint8Array(16);
        let r = seed;
        for (let i = 0; i < 16; i++) {
            r = (1664525 * r + 1013904223) % 4294967296;
            k[i] = 255 & r;
        }
        return k;
    },

    _decode(base64, key) {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const saltLen = bytes[0];
        const payload = bytes.slice(1 + saltLen);
        const out = new Uint8Array(payload.length);
        for (let i = 0; i < payload.length; i++) {
            out[i] = payload[i] ^ key[i % key.length];
        }
        return JSON.parse(new TextDecoder().decode(out));
    },

    /* ---------- misc ---------- */

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
