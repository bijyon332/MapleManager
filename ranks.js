// ranks.js
// Rank Compare: fetch multiple characters from MapleRanks and overlay their
// Level Progress curves on one chart.
//
// Data flow:
//   1) Roster is persisted in localStorage as { name, region } entries.
//   2) For each roster entry we call /mapleranks?name=...&region=...
//      (Cloudflare Pages Function in functions/mapleranks.js) which returns
//      the decoded MapleRanks JSON.
//   3) We pluck the line-chart entry from the response and feed all
//      characters into a single Chart.js line chart.
//
// Fallback: if the proxy is unavailable (e.g. running locally without
// `wrangler pages dev`), we try a couple of public CORS proxies. Same
// pattern as `script.js#_fetchRanking`.

const ranks = {
    STORAGE_KEY: 'gmsManager.ranks.roster',
    PREFS_KEY: 'gmsManager.ranks.prefs',

    initialized: false,
    roster: [],          // [{ name, region }]
    cache: {},           // { 'na:name': { fetchedAt, raw, labels, exp } }
    pendingFetches: 0,
    selectedRange: 14,   // 7 | 14 | 30 | 90
    yMode: 'absolute',   // 'absolute' | 'delta'
    pickedRegion: 'na',  // for the Add form
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
        this.bindUI();
        this.renderRangeButtons();
        this.renderModeButtons();
        this.renderRegionButtons();
        this.renderRoster();
        this.fetchAll(false);
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
        const form = document.getElementById('ranks-add-form');
        if (form) form.addEventListener('submit', e => { e.preventDefault(); this.addFromInput(); });

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

        const refresh = document.getElementById('ranks-refresh-btn');
        if (refresh) refresh.addEventListener('click', () => this.fetchAll(true));
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

    /* ---------- roster ops ---------- */

    addFromInput() {
        const input = document.getElementById('ranks-input');
        if (!input) return;
        const name = (input.value || '').trim();
        if (!name) return;
        const region = this.pickedRegion;
        const key = `${region}:${name.toLowerCase()}`;

        if (this.roster.some(r => `${r.region}:${r.name.toLowerCase()}` === key)) {
            this.showMsg(`"${name}" is already in the roster.`, 'warn');
            return;
        }

        this.roster.push({ name, region });
        this.saveRoster();
        this.renderRoster();
        input.value = '';
        this.showMsg('', 'info');
        this.fetchOne(name, region, false).then(() => this.renderChart());
    },

    removeCharacter(name, region) {
        this.roster = this.roster.filter(r => !(r.name === name && r.region === region));
        delete this.cache[`${region}:${name.toLowerCase()}`];
        this.saveRoster();
        this.renderRoster();
        this.renderChart();
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
            if (cached && cached.error) {
                info = `<span class="text-[10px] text-rose-400 ml-1.5" title="${this._escape(cached.error)}">err</span>`;
            } else if (cached && cached.charInfo) {
                info = `<span class="text-[10px] text-slate-400 ml-1.5">Lv.${cached.charInfo.level}</span>`;
            } else if (cached && cached.loading) {
                info = `<span class="text-[10px] text-slate-500 ml-1.5">…</span>`;
            }
            return `
                <div class="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg pl-2 pr-1 py-1">
                    <span class="w-2.5 h-2.5 rounded-full" style="background:${color}"></span>
                    <span class="text-[11px] font-bold text-white">${this._escape(r.name)}</span>
                    <span class="text-[9px] uppercase tracking-wider text-slate-500">${r.region}</span>
                    ${info}
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

    updateStatus() {
        const el = document.getElementById('ranks-status');
        if (!el) return;
        if (this.pendingFetches > 0) {
            el.textContent = `Fetching… ${this.pendingFetches} pending`;
        } else {
            const errs = this.roster.filter(r => {
                const c = this.cache[`${r.region}:${r.name.toLowerCase()}`];
                return c && c.error;
            }).length;
            el.textContent = errs ? `Ready · ${errs} failed` : (this.roster.length ? 'Ready' : '');
        }
    },

    /* ---------- fetching ---------- */

    async fetchAll(force) {
        for (const r of this.roster) {
            await this.fetchOne(r.name, r.region, force);
        }
        this.renderChart();
    },

    async fetchOne(name, region, force) {
        const key = `${region}:${name.toLowerCase()}`;
        const existing = this.cache[key];
        if (!force && existing && existing.exp && !existing.error) return existing;

        this.cache[key] = { ...(existing || {}), loading: true, error: null };
        this.pendingFetches++;
        this.renderRoster();
        this.updateStatus();

        try {
            const data = await this._fetchMapleRanks(name, region);
            const parsed = this._extractFromPayload(data);
            this.cache[key] = { ...parsed, loading: false, error: null, fetchedAt: Date.now() };
        } catch (e) {
            this.cache[key] = { ...(this.cache[key] || {}), loading: false, error: e.message || String(e) };
        } finally {
            this.pendingFetches--;
            this.renderRoster();
            this.updateStatus();
        }
        return this.cache[key];
    },

    async _fetchMapleRanks(name, region, timeoutMs = 15000) {
        // 1) try the Cloudflare Pages function (deployed)
        // 2) fall back to public CORS proxies fetching mapleranks.com directly
        //    + decode client-side
        const path = region === 'eu' ? `/u/h/eu/${encodeURIComponent(name)}` : `/u/h/${encodeURIComponent(name)}`;
        const upstream = `https://mapleranks.com${path}`;

        const endpoints = [
            { kind: 'json', url: `/mapleranks?name=${encodeURIComponent(name)}&region=${region}` },
            { kind: 'enc',  url: `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(upstream)}` },
            { kind: 'enc',  url: `https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}` },
            { kind: 'enc',  url: `https://corsproxy.io/?${encodeURIComponent(upstream)}` }
        ];

        const errors = [];
        for (const ep of endpoints) {
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), timeoutMs);
                const res = await fetch(ep.url, { signal: controller.signal });
                clearTimeout(tid);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                if (ep.kind === 'json') {
                    const json = await res.json();
                    if (json && json.error) throw new Error(json.error);
                    return json;
                }
                // 'enc': raw base64 payload — decode client-side
                const encoded = (await res.text()).trim();
                if (!encoded) throw new Error('empty');
                const key = this._genKey(name.toLowerCase());
                return this._decode(encoded, key);
            } catch (e) {
                errors.push(`${ep.url.split('?')[0]}: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
            }
        }
        throw new Error('All endpoints failed. ' + errors.join(' | '));
    },

    /* ---------- payload parsing ---------- */

    _extractFromPayload(data) {
        // Find character info (the object that holds the player name) and the
        // line chart entry. Both live under obfuscated property names that
        // happen to be stable across characters (since MapleRanks publishes a
        // single client bundle that knows them).
        //
        // To stay resilient if those names change, we discover them by shape:
        //   - charInfo:  the first nested object that has a `c0b8373f`-style
        //                key whose value matches the requested name OR an
        //                object that contains both a numeric `ce118b77` (level)
        //                and a number `f0936776` (exp %). We rely on the name
        //                key by checking string fields.
        //   - lineChart: nested object containing { type: 'line', data: {...} }
        const flat = this._flatten(data);

        // 1) line chart — walk into data.f0936776.* objects looking for type==='line'
        let lineChart = null;
        const expBucket = data && typeof data === 'object'
            ? (Object.values(data).find(v => v && typeof v === 'object' && Object.values(v).some(x => x && x.type === 'line')) || null)
            : null;
        if (expBucket) {
            lineChart = Object.values(expBucket).find(x => x && x.type === 'line') || null;
        }
        // fallback: search deeper
        if (!lineChart) {
            lineChart = flat.objects.find(o => o.type === 'line' && o.data && Array.isArray(o.data.labels));
        }

        // 2) character info — find a nested object with name + level fields
        let charInfo = null;
        const tryObj = (o) => {
            if (!o || typeof o !== 'object') return null;
            const entries = Object.entries(o);
            const nameVal = entries.find(([k, v]) => typeof v === 'string' && v.length > 0 && v.length < 30)?.[1];
            const lvlVal = entries.find(([k, v]) => typeof v === 'number' && v > 0 && v < 350 && Number.isInteger(v))?.[1];
            const pctVal = entries.find(([k, v]) => typeof v === 'number' && v >= 0 && v <= 100 && !Number.isInteger(v))?.[1];
            const worldStr = entries.find(([k, v]) => typeof v === 'string' && /^[A-Z][a-z]+$/.test(v))?.[1];
            if (nameVal && lvlVal != null && pctVal != null) {
                return { name: nameVal, level: lvlVal, expPct: pctVal, world: worldStr || null };
            }
            return null;
        };

        for (const v of Object.values(data || {})) {
            const got = tryObj(v);
            if (got) { charInfo = got; break; }
        }

        // Build a simple { labels, values } shape from the line chart
        let labels = [], values = [];
        if (lineChart && lineChart.data) {
            labels = Array.from(lineChart.data.labels || []);
            const ds = (lineChart.data.datasets && lineChart.data.datasets[0]) || null;
            values = ds ? Array.from(ds.data || []) : [];
        }

        return {
            labels, values,
            charInfo: charInfo || null,
            raw: data
        };
    },

    _flatten(obj, depth = 0, acc = { objects: [] }) {
        if (depth > 4 || !obj || typeof obj !== 'object') return acc;
        acc.objects.push(obj);
        for (const v of Object.values(obj)) {
            if (v && typeof v === 'object' && !Array.isArray(v)) this._flatten(v, depth + 1, acc);
        }
        return acc;
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

        // Union of label dates, ordered as they appear in the longest cached series.
        // Take the last N labels per selectedRange.
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
            // delta mode: subtract first non-null value in range
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
                    legend: {
                        position: 'top',
                        labels: { color: '#cbd5e1', font: { size: 11, weight: 'bold' } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const v = ctx.parsed.y;
                                if (v == null) return `${ctx.dataset.label}: —`;
                                if (this.yMode === 'delta') {
                                    return `${ctx.dataset.label}: +${v.toFixed(4)} lv`;
                                }
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

    /* ---------- decode (client-side fallback) ---------- */

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

    _escape(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    _jsAttr(s) {
        return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }
};
