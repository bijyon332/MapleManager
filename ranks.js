// ranks.js
// EXP Leaderboard & Progress: per-character EXP tracking with two tabs.
//   - リーダーボード: sortable table (yesterday / 7d / 14d / 30d averages,
//     +1..+5 level ETAs, predicted order of reaching Lv.290 / Lv.295).
//     Clicking a row expands an inline level / daily-EXP chart (7/14/30/90d).
//   - 推移: pick characters from the roster list and overlay their curves
//     on a single Chart.js chart (level / delta / daily EXP).
//
// Data source: MapleHub (maplehub.app) keeps ~90 days of daily snapshots for
// every ranked character in its own backend DB. We fetch it through our own
// Cloudflare Pages Function proxy (/maplehub?name=...&region=...) which adds the
// required `X-MapleHub-Request: true` header and CORS.
//
// Level predictions use tnlData (exp_data.js, Lv.200-299). Characters outside
// that table show "—" instead of a forecast.
//
// Persistence:
//   - Roster:  localStorage[gmsManager.ranks.roster] = [{name, region}, ...]
//   - Cache:   localStorage[gmsManager.ranks.cache]  = { 'na:name': { labels, values, expDaily, charInfo, importedAt } }
//   - Prefs:   localStorage[gmsManager.ranks.prefs]  = { range, yMode, region, tab, sortKey, sortDir, selected, detailMode, detailRange }
//
//   values[]   : fractional level per day  (Lv + withinLevelExp / TNL(level))
//   expDaily[] : EXP gained that day (raw number; the series ends on yesterday)

const ranks = {
    STORAGE_KEY: 'gmsManager.ranks.roster',
    CACHE_KEY:   'gmsManager.ranks.cache',
    PREFS_KEY:   'gmsManager.ranks.prefs',

    initialized: false,
    roster: [],          // [{ name, region }]
    cache: {},           // { 'na:name': { labels, values, expDaily, charInfo, importedAt } }
    busy: false,

    // tabs & leaderboard state
    activeTab: 'board',  // 'board' | 'trend'
    sortKey: 'char',     // column key
    sortDir: 'desc',
    expandedKey: null,   // cache key of the expanded leaderboard row
    detailMode: 'level', // 'level' | 'exp'
    detailRange: 30,     // 7 | 14 | 30 | 90
    detailChart: null,

    // trend tab state
    selectedKeys: null,  // array of cache keys shown in the trend chart (null = all)
    selectedRange: 14,   // 7 | 14 | 30 | 90
    yMode: 'absolute',   // 'absolute' | 'delta' | 'exp'
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
        this.renderRegionButtons();
        this.renderAll();
        this._refreshMissing(); // pull icon/withinExp for entries cached by the old version
    },

    renderAll() {
        this.renderTabs();
        this.renderBoard();
        this.renderTrend();
    },

    _key(r) { return `${r.region}:${r.name.toLowerCase()}`; },

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
            if (['board', 'trend'].includes(p.tab)) this.activeTab = p.tab;
            if (typeof p.sortKey === 'string' && this.BOARD_COLUMNS.some(c => c.key === p.sortKey && c.sortable !== false)) this.sortKey = p.sortKey;
            if (['asc', 'desc'].includes(p.sortDir)) this.sortDir = p.sortDir;
            if (Array.isArray(p.selected)) this.selectedKeys = p.selected;
            if (['level', 'exp'].includes(p.detailMode)) this.detailMode = p.detailMode;
            if ([7, 14, 30, 90].includes(p.detailRange)) this.detailRange = p.detailRange;
        } catch (_) { /* ignore */ }
    },
    savePrefs() {
        const p = {
            range: this.selectedRange, yMode: this.yMode, region: this.pickedRegion,
            tab: this.activeTab, sortKey: this.sortKey, sortDir: this.sortDir,
            selected: this.selectedKeys, detailMode: this.detailMode, detailRange: this.detailRange
        };
        localStorage.setItem(this.PREFS_KEY, JSON.stringify(p));
    },

    /* ---------- ui bindings ---------- */

    bindUI() {
        const form = document.getElementById('ranks-import-form');
        if (form) form.addEventListener('submit', e => { e.preventDefault(); this.importFromApi(); });

        document.querySelectorAll('.ranks-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeTab = btn.dataset.tab;
                this.savePrefs();
                this.renderAll();
            });
        });

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
    },

    renderTabs() {
        document.querySelectorAll('.ranks-tab-btn').forEach(btn => {
            const active = btn.dataset.tab === this.activeTab;
            btn.classList.toggle('bg-indigo-600', active);
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('text-slate-400', !active);
        });
        const board = document.getElementById('ranks-tab-board');
        const trend = document.getElementById('ranks-tab-trend');
        if (board) board.classList.toggle('hidden', this.activeTab !== 'board');
        if (trend) trend.classList.toggle('hidden', this.activeTab !== 'trend');
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
        if (!typedName) { this.showMsg('キャラクター名を入力してください。', 'warn'); return; }

        this.setBusy(true);
        this.showMsg(`${typedName} (${region.toUpperCase()}) を取得中…`, 'info');
        try {
            const parsed = await this._fetchCharacter(typedName, region);
            if (!parsed.labels.length) {
                this.showMsg('このキャラクターの推移データが見つかりませんでした。', 'err');
                return;
            }

            const canonicalName = (parsed.charInfo && parsed.charInfo.name) || typedName;
            const cacheKey = `${region}:${canonicalName.toLowerCase()}`;
            this.cache[cacheKey] = { ...parsed, importedAt: Date.now() };

            const existing = this.roster.findIndex(r => r.region === region && r.name.toLowerCase() === canonicalName.toLowerCase());
            if (existing === -1) this.roster.push({ name: canonicalName, region });
            else this.roster[existing].name = canonicalName;

            // newly added characters join the trend chart selection
            if (Array.isArray(this.selectedKeys) && !this.selectedKeys.includes(cacheKey)) {
                this.selectedKeys.push(cacheKey);
            }

            this.saveRoster();
            this.saveCache();
            this.savePrefs();
            this.renderAll();
            nameEl.value = '';
            this.showMsg(`${canonicalName} (${region.toUpperCase()}) を追加しました · ${parsed.labels.length}日分のデータ`, 'ok');
        } catch (e) {
            this.showMsg(`取得に失敗しました: ${e.message}`, 'err');
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
                    this.cache[this._key(r)] = { ...parsed, importedAt: Date.now() };
                    ok++;
                } else { fail++; }
            } catch (_) { fail++; }
        }
        this.saveCache();
        this.renderAll();
        this.setBusy(false);
        this.showMsg(`${ok}キャラを更新しました${fail ? `(${fail}件失敗)` : ''}。`, fail ? 'warn' : 'ok');
    },

    // Entries cached by the old ranks.js lack charInfo.img / withinExp.
    // Silently re-fetch just those so the leaderboard fills in without a manual refresh.
    async _refreshMissing() {
        const stale = this.roster.filter(r => {
            const c = this.cache[this._key(r)];
            return c && (!c.charInfo || !('img' in c.charInfo));
        });
        if (this.busy || stale.length === 0) return;
        this.setBusy(true);
        for (const r of stale) {
            try {
                const parsed = await this._fetchCharacter(r.name, r.region);
                if (parsed.labels.length) this.cache[this._key(r)] = { ...parsed, importedAt: Date.now() };
            } catch (_) { /* keep old data */ }
        }
        this.saveCache();
        this.setBusy(false);
        this.renderAll();
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

    removeCharacter(key) {
        this.roster = this.roster.filter(r => this._key(r) !== key);
        delete this.cache[key];
        if (Array.isArray(this.selectedKeys)) this.selectedKeys = this.selectedKeys.filter(k => k !== key);
        if (this.expandedKey === key) this.expandedKey = null;
        this.saveRoster();
        this.saveCache();
        this.savePrefs();
        this.renderAll();
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
        const curWithin = Number(expValues[expValues.length - 1]);
        let expPct = null;
        if (level && tnl[level] && Number.isFinite(curWithin)) expPct = (curWithin / tnl[level]) * 100;

        const charInfo = {
            name: data.name || null,
            level,
            expPct,
            withinExp: Number.isFinite(curWithin) ? curWithin : null,
            world: data.worldName || null,
            job: data.jobName || null,
            img: data.characterImgURL || null
        };

        return { labels, values, expDaily, charInfo };
    },

    /* ---------- stats & predictions ---------- */

    // Per-character derived numbers for the leaderboard.
    _computeStats(c) {
        const s = {
            level: null, frac: null, expPct: null, tnl: null,
            yesterday: null, avg7: null, avg14: null, avg30: null, avg90: null,
            rate: null, longRate: null, preds: [null, null, null, null, null],
            to290: null, to295: null
        };
        if (!c || !c.charInfo) return s;
        const tnl = (typeof tnlData !== 'undefined') ? tnlData : {};
        const lv = Number(c.charInfo.level);
        const within = Number.isFinite(Number(c.charInfo.withinExp)) ? Number(c.charInfo.withinExp) : 0;
        if (Number.isFinite(lv)) {
            s.level = lv;
            s.tnl = tnl[lv] || null;
            s.expPct = (s.tnl) ? (within / s.tnl) * 100 : (Number.isFinite(c.charInfo.expPct) ? c.charInfo.expPct : null);
            s.frac = lv + (s.tnl ? Math.min(within / s.tnl, 0.9999) : 0);
        }

        const daily = Array.isArray(c.expDaily) ? c.expDaily : [];
        const finite = n => Number.isFinite(Number(n));
        const avgN = n => {
            const arr = daily.slice(-n).filter(finite).map(Number);
            if (!arr.length) return null;
            return arr.reduce((a, b) => a + b, 0) / arr.length;
        };
        // series ends on yesterday → last finite value = yesterday's gain
        for (let i = daily.length - 1; i >= 0; i--) {
            if (finite(daily[i])) { s.yesterday = Number(daily[i]); break; }
        }
        s.avg7 = avgN(7);
        s.avg14 = avgN(14);
        s.avg30 = avgN(30);
        s.avg90 = avgN(90);
        // Short-term rate for the +1..+5 level ETAs (reacts to recent pace).
        s.rate = s.avg14 || s.avg7 || s.avg30 || null;
        // Long-term rate for the 290/295 milestones: 30-day first (stable, reflects
        // sustained motivation), then 90-day. Avoids event-day spikes skewing the
        // far-out forecast. Falls back to the short rate only for very new characters.
        s.longRate = s.avg30 || s.avg90 || s.rate;

        if (Number.isFinite(lv) && s.rate > 0) {
            for (let k = 1; k <= 5; k++) {
                const need = this._expForLevels(tnl, lv, within, k);
                s.preds[k - 1] = (need == null) ? null : this._eta(need, s.rate);
            }
            s.to290 = this._reachEta(tnl, lv, within, 290, s.longRate);
            s.to295 = this._reachEta(tnl, lv, within, 295, s.longRate);
        } else if (Number.isFinite(lv)) {
            if (lv >= 290) s.to290 = { days: 0, date: new Date(), reached: true };
            if (lv >= 295) s.to295 = { days: 0, date: new Date(), reached: true };
        }
        return s;
    },

    // EXP needed to gain k levels from (lv, within). null if tnlData doesn't cover it.
    _expForLevels(tnl, lv, within, k) {
        let total = 0;
        for (let i = 0; i < k; i++) {
            const need = tnl[lv + i];
            if (!need) return null;
            total += (i === 0) ? Math.max(need - within, 0) : need;
        }
        return total;
    },

    _reachEta(tnl, lv, within, target, rate) {
        if (lv >= target) return { days: 0, date: new Date(), reached: true };
        const need = this._expForLevels(tnl, lv, within, target - lv);
        if (need == null || !(rate > 0)) return null;
        return this._eta(need, rate);
    },

    _eta(needExp, rate) {
        const days = Math.max(Math.ceil(needExp / rate), 0);
        const date = new Date();
        date.setDate(date.getDate() + days);
        return { days, date, reached: false };
    },

    // Rank roster characters by predicted arrival at `target` level.
    // Characters that have already reached the target are excluded from the
    // ranking entirely (not counted, not shown as a position), so the fastest
    // not-yet-there character gets rank 1.
    // Returns { cacheKey: rank }.
    _reachRanks(rows, prop) {
        const ranked = rows
            .filter(row => row.s[prop] && !row.s[prop].reached)
            .sort((a, b) => {
                const d = a.s[prop].days - b.s[prop].days;
                if (d !== 0) return d;
                return (b.s.frac || 0) - (a.s.frac || 0); // earlier = higher current progress
            });
        const map = {};
        ranked.forEach((row, i) => { map[row.key] = i + 1; });
        return map;
    },

    /* ---------- leaderboard ---------- */

    // group: buckets columns that share a meaning so each gets its own tint.
    //   avg   = 実績(昨日/n日平均)  · sky
    //   pred  = +nLv 予測           · violet
    //   reach = 到達予想ランキング   · amber
    BOARD_COLUMNS: [
        { key: 'char',      label: 'キャラ',        align: 'left',   group: null },
        { key: 'yesterday', label: '昨日の獲得EXP', align: 'right',  group: 'avg' },
        { key: 'avg7',      label: '7日平均',       align: 'right',  group: 'avg' },
        { key: 'avg14',     label: '14日平均',      align: 'right',  group: 'avg' },
        { key: 'avg30',     label: '30日平均',      align: 'right',  group: 'avg' },
        { key: 'lv1',       label: '+1Lv予測',      align: 'center', group: 'pred' },
        { key: 'lv2',       label: '+2Lv予測',      align: 'center', group: 'pred' },
        { key: 'lv3',       label: '+3Lv予測',      align: 'center', group: 'pred' },
        { key: 'lv4',       label: '+4Lv予測',      align: 'center', group: 'pred' },
        { key: 'lv5',       label: '+5Lv予測',      align: 'center', group: 'pred' },
        { key: 'r290',      label: '290到達予想',   align: 'center', group: 'reach' },
        { key: 'r295',      label: '295到達予想',   align: 'center', group: 'reach' },
        { key: 'del',       label: '',              align: 'center', sortable: false, group: null }
    ],

    GROUP_BG: {
        avg:   { head: 'bg-sky-500/10',    cell: 'bg-sky-500/5' },
        pred:  { head: 'bg-violet-500/10', cell: 'bg-violet-500/5' },
        reach: { head: 'bg-amber-500/10',  cell: 'bg-amber-500/5' }
    },
    ACTIVE_BG: { head: 'bg-indigo-500/25', cell: 'bg-indigo-500/10' },

    // td background for a column: active-sort highlight wins, else group tint.
    _colBg(col, which) {
        const active = this.sortKey === col.key && col.sortable !== false;
        if (active) return this.ACTIVE_BG[which];
        return col.group ? this.GROUP_BG[col.group][which] : (which === 'head' ? 'bg-slate-800/40' : '');
    },

    // Sort value accessor. Returns null for "no data" (always sorted last).
    _sortValue(row, key, rank290, rank295) {
        const s = row.s;
        switch (key) {
            case 'char':      return s.frac;
            case 'yesterday': return s.yesterday;
            case 'avg7':      return s.avg7;
            case 'avg14':     return s.avg14;
            case 'avg30':     return s.avg30;
            case 'lv1': case 'lv2': case 'lv3': case 'lv4': case 'lv5': {
                const p = s.preds[parseInt(key.slice(2), 10) - 1];
                return p ? -p.days : null; // fewer days = "bigger" so desc shows fastest first
            }
            case 'r290': return rank290[row.key] != null ? -rank290[row.key] : null;
            case 'r295': return rank295[row.key] != null ? -rank295[row.key] : null;
            default: return null;
        }
    },

    setSort(key) {
        if (this.sortKey === key) {
            this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
        } else {
            this.sortKey = key;
            this.sortDir = 'desc';
        }
        this.savePrefs();
        this.renderBoard();
    },

    toggleExpand(key) {
        this.expandedKey = (this.expandedKey === key) ? null : key;
        this.renderBoard();
    },

    renderBoard() {
        const wrap = document.getElementById('ranks-board-wrap');
        const empty = document.getElementById('ranks-board-empty');
        const head = document.getElementById('ranks-board-head');
        const body = document.getElementById('ranks-board-body');
        if (!wrap || !empty || !head || !body) return;

        this._destroyDetailChart();

        if (this.roster.length === 0) {
            wrap.classList.add('hidden');
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        wrap.classList.remove('hidden');

        const rows = this.roster.map((r, idx) => {
            const key = this._key(r);
            const c = this.cache[key];
            return { r, idx, key, c, s: this._computeStats(c) };
        });

        const rank290 = this._reachRanks(rows, 'to290');
        const rank295 = this._reachRanks(rows, 'to295');

        rows.sort((a, b) => {
            const va = this._sortValue(a, this.sortKey, rank290, rank295);
            const vb = this._sortValue(b, this.sortKey, rank290, rank295);
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            return this.sortDir === 'desc' ? vb - va : va - vb;
        });

        head.innerHTML = '<tr class="border-b border-slate-700">' + this.BOARD_COLUMNS.map(col => {
            const sortable = col.sortable !== false;
            const active = this.sortKey === col.key;
            const arrow = active ? (this.sortDir === 'desc' ? ' ▼' : ' ▲') : '';
            const alignCls = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
            const textCls = active ? 'text-indigo-300' : 'text-slate-400';
            return `<th data-sort="${sortable ? col.key : ''}" class="px-3 py-3 text-xs font-bold tracking-wide whitespace-nowrap ${alignCls} ${this._colBg(col, 'head')} ${textCls} ${sortable ? 'cursor-pointer select-none hover:text-white' : ''}">${col.label}${arrow}</th>`;
        }).join('') + '</tr>';

        body.innerHTML = rows.map(row => this._boardRowHtml(row, rank290, rank295)).join('');

        // listeners
        head.querySelectorAll('th[data-sort]').forEach(th => {
            const key = th.dataset.sort;
            if (key) th.addEventListener('click', () => this.setSort(key));
        });
        body.querySelectorAll('tr[data-key]').forEach(tr => {
            tr.addEventListener('click', e => {
                if (e.target.closest('[data-del]')) return;
                this.toggleExpand(tr.dataset.key);
            });
        });
        body.querySelectorAll('button[data-del]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.removeCharacter(btn.dataset.del);
            });
        });

        if (this.expandedKey) this._renderDetail();
        if (window.lucide) lucide.createIcons();
    },

    _boardRowHtml(row, rank290, rank295) {
        const { r, key, s } = row;
        const info = (row.c && row.c.charInfo) || {};
        const expanded = this.expandedKey === key;

        // inner content per column key (no <td> wrapper — the loop adds it)
        const inner = {
            char:      this._charCellInner(r, info, s),
            yesterday: this._expInner(s.yesterday, s),
            avg7:      this._expInner(s.avg7, s),
            avg14:     this._expInner(s.avg14, s),
            avg30:     this._expInner(s.avg30, s),
            lv1:       this._predInner(s.preds[0]),
            lv2:       this._predInner(s.preds[1]),
            lv3:       this._predInner(s.preds[2]),
            lv4:       this._predInner(s.preds[3]),
            lv5:       this._predInner(s.preds[4]),
            r290:      this._reachInner(s.to290, rank290[key]),
            r295:      this._reachInner(s.to295, rank295[key]),
            del:       this._delInner(key)
        };

        const tds = this.BOARD_COLUMNS.map(col => {
            const alignCls = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
            return `<td class="px-3 py-2.5 align-middle ${alignCls} ${this._colBg(col, 'cell')}">${inner[col.key]}</td>`;
        }).join('');

        const rowHtml = `
            <tr data-key="${this._escape(key)}" class="border-b border-slate-800 cursor-pointer transition-colors ${expanded ? 'bg-slate-800/60' : 'hover:bg-slate-800/30'}">
                ${tds}
            </tr>`;

        if (!expanded) return rowHtml;

        // inline detail: per-character level / daily-EXP chart
        const modeBtn = (mode, label) => `
            <button type="button" data-detail-mode="${mode}" class="px-2.5 py-1 rounded text-[11px] font-bold transition-all ${this.detailMode === mode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}">${label}</button>`;
        const rangeBtn = n => `
            <button type="button" data-detail-range="${n}" class="px-2.5 py-1 rounded text-[11px] font-bold transition-all ${this.detailRange === n ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}">${n}d</button>`;

        return rowHtml + `
            <tr class="border-b border-slate-800 bg-slate-950/60">
                <td colspan="${this.BOARD_COLUMNS.length}" class="px-4 py-3">
                    <div class="flex items-center gap-3 flex-wrap mb-3">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">グラフ</span>
                        <div class="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                            ${modeBtn('level', 'レベル推移')}${modeBtn('exp', '獲得経験値')}
                        </div>
                        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 ml-2">期間</span>
                        <div class="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                            ${rangeBtn(7)}${rangeBtn(14)}${rangeBtn(30)}${rangeBtn(90)}
                        </div>
                    </div>
                    <div class="relative h-[300px]">
                        <canvas id="ranks-detail-canvas"></canvas>
                    </div>
                </td>
            </tr>`;
    },

    /* ---------- board cell renderers (inner HTML, no <td>) ---------- */

    _charCellInner(r, info, s) {
        const img = info.img
            ? `<img src="${this._escape(info.img)}" alt="" class="w-16 h-16 object-contain object-bottom flex-shrink-0 -my-2" loading="lazy">`
            : `<div class="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0"><i data-lucide="user" class="w-6 h-6 text-slate-600"></i></div>`;

        const pct = (s.expPct != null) ? Math.max(0, Math.min(100, s.expPct)) : null;
        const lvTxt = s.level != null
            ? `<span class="text-sm font-bold text-white">Lv.${s.level}</span>${s.expPct != null ? ` <span class="text-xs font-bold text-indigo-300">${s.expPct.toFixed(2)}%</span>` : ''}`
            : '<span class="text-sm font-bold text-amber-400">データなし</span>';
        const sub = [info.job, info.world].filter(Boolean).join(' · ');
        const bar = pct != null
            ? `<div class="mt-1.5 h-2 w-full rounded-full bg-slate-800/80 overflow-hidden shadow-inner">
                   <div class="h-full rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-sky-400" style="width:${pct.toFixed(2)}%"></div>
               </div>`
            : '';

        return `
            <div class="flex items-center gap-3 min-w-[220px]">
                ${img}
                <div class="min-w-0 flex-1">
                    <div class="text-base font-bold text-white truncate leading-tight">${this._escape(r.name)}
                        <span class="text-[10px] uppercase tracking-wider text-slate-500 ml-1">${r.region}</span>
                    </div>
                    <div class="leading-tight mt-0.5">${lvTxt}</div>
                    ${sub ? `<div class="text-[11px] text-slate-500 truncate">${this._escape(sub)}</div>` : ''}
                    ${bar}
                </div>
            </div>`;
    },

    _expInner(v, s) {
        if (v == null) return '<span class="text-slate-600 text-sm">—</span>';
        const pct = s.tnl ? (v / s.tnl) * 100 : null;
        return `<div class="text-sm font-bold text-white font-mono whitespace-nowrap">${this._fmtExp(v)}</div>
                <div class="text-xs text-slate-400">${pct != null ? pct.toFixed(2) + '%' : '—'}</div>`;
    },

    _predInner(p) {
        if (!p) return '<span class="text-slate-600 text-sm">—</span>';
        return `<div class="text-sm font-bold text-white font-mono whitespace-nowrap">${this._fmtDate(p.date)}</div>
                <div class="text-xs text-slate-400">${p.days}日後</div>`;
    },

    // Reached characters are not ranked, so show only a muted "到達済" (no position).
    _reachInner(eta, rank) {
        if (!eta) return '<span class="text-slate-600 text-sm">—</span>';
        if (eta.reached) return '<span class="text-xs font-bold text-slate-500">到達済</span>';
        return `<div class="text-base font-black text-amber-300 whitespace-nowrap leading-tight">${rank != null ? rank + '位' : '—'}</div>
                <div class="text-xs text-slate-400 whitespace-nowrap">${this._fmtDate(eta.date)} · ${eta.days}日後</div>`;
    },

    _delInner(key) {
        return `<button type="button" data-del="${this._escape(key)}" title="削除"
                    class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>`;
    },

    _destroyDetailChart() {
        if (this.detailChart) { this.detailChart.destroy(); this.detailChart = null; }
    },

    _renderDetail() {
        const canvas = document.getElementById('ranks-detail-canvas');
        const c = this.cache[this.expandedKey];
        if (!canvas || !c || !Array.isArray(c.labels)) return;

        document.querySelectorAll('[data-detail-mode]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.detailMode = btn.dataset.detailMode;
                this.savePrefs();
                this.renderBoard();
            });
        });
        document.querySelectorAll('[data-detail-range]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.detailRange = parseInt(btn.dataset.detailRange, 10);
                this.savePrefs();
                this.renderBoard();
            });
        });

        const N = this.detailRange;
        const labels = c.labels.slice(-N);
        const isExp = this.detailMode === 'exp';
        const data = (isExp ? (c.expDaily || []) : (c.values || [])).slice(-N);
        const fmtExp = this._fmtExp;

        this._destroyDetailChart();
        this.detailChart = new Chart(canvas.getContext('2d'), {
            type: isExp ? 'bar' : 'line',
            data: {
                labels,
                datasets: [{
                    label: (c.charInfo && c.charInfo.name) || '',
                    data,
                    borderColor: '#6366f1',
                    backgroundColor: isExp ? '#3b82f6' : '#6366f122',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    tension: 0.25,
                    spanGaps: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const v = ctx.parsed.y;
                                if (v == null) return '—';
                                if (isExp) return `${fmtExp(v)} EXP`;
                                const lv = Math.floor(v);
                                return `Lv.${lv} ${((v - lv) * 100).toFixed(2)}%`;
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
                            callback: v => {
                                if (isExp) return fmtExp(v);
                                const lv = Math.floor(v);
                                return `${lv}.${(((v - lv) * 100).toFixed(0)).padStart(2, '0')}%`;
                            }
                        },
                        grid: this._yGrid(!isExp)
                    }
                }
            }
        });
    },

    /* ---------- trend tab ---------- */

    // null selection = "all roster characters"
    _selKeys() {
        if (!Array.isArray(this.selectedKeys)) return this.roster.map(r => this._key(r));
        return this.selectedKeys;
    },

    toggleSelect(key) {
        const cur = this._selKeys();
        this.selectedKeys = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
        this.savePrefs();
        this.renderTrend();
    },

    renderTrend() {
        this.renderRangeButtons();
        this.renderModeButtons();
        this.renderTrendList();
        this.renderChart();
    },

    renderTrendList() {
        const wrap = document.getElementById('ranks-trend-list');
        if (!wrap) return;

        if (this.roster.length === 0) {
            wrap.innerHTML = '<div class="text-[11px] text-slate-500 italic px-1 py-2">キャラクターがいません。上の検索バーから追加してください。</div>';
            return;
        }

        const sel = this._selKeys();
        wrap.innerHTML = this.roster.map((r, idx) => {
            const key = this._key(r);
            const c = this.cache[key];
            const info = (c && c.charInfo) || {};
            const selected = sel.includes(key);
            const color = this.PALETTE[idx % this.PALETTE.length];
            const img = info.img
                ? `<img src="${this._escape(info.img)}" alt="" class="w-9 h-9 object-contain object-bottom flex-shrink-0" loading="lazy">`
                : `<div class="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0"><i data-lucide="user" class="w-4 h-4 text-slate-600"></i></div>`;
            const lvTxt = info.level != null
                ? `Lv.${info.level}${Number.isFinite(info.expPct) ? ` (${info.expPct.toFixed(2)}%)` : ''}`
                : 'データなし';
            return `
                <button type="button" data-key="${this._escape(key)}"
                        class="ranks-trend-item w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all text-left ${selected ? 'bg-indigo-600/20 border-indigo-500/60' : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-500 opacity-60 hover:opacity-100'}">
                    <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${selected ? color : '#475569'}"></span>
                    ${img}
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-bold text-white truncate">${this._escape(r.name)}
                            <span class="text-[9px] uppercase tracking-wider text-slate-500 ml-1">${r.region}</span>
                        </div>
                        <div class="text-[10px] text-slate-400">${lvTxt}</div>
                    </div>
                    ${selected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-indigo-400 flex-shrink-0"></i>' : ''}
                </button>`;
        }).join('');

        wrap.querySelectorAll('.ranks-trend-item').forEach(btn => {
            btn.addEventListener('click', () => this.toggleSelect(btn.dataset.key));
        });
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

    /* ---------- trend chart ---------- */

    // Scriptable y-axis grid: emphasize the "clean" reference lines so the chart
    // reads at a glance. The zero baseline is strongest; in level modes the
    // whole-level lines (integers) stand out over the fractional ticks; in EXP
    // mode every auto-tick is already a round value so they share one weight.
    _yGrid(isLevel) {
        const FAINT = 'rgba(148,163,184,0.06)';
        const MID   = 'rgba(148,163,184,0.16)';
        const STRONG = 'rgba(148,163,184,0.38)';
        const isWhole = v => Math.abs(v - Math.round(v)) < 1e-6;
        return {
            color: (ctx) => {
                const v = ctx.tick && ctx.tick.value;
                if (v == null) return FAINT;
                if (Math.abs(v) < 1e-9) return STRONG;                 // zero baseline
                if (isLevel) return isWhole(v) ? MID : FAINT;          // whole levels only
                return MID;                                            // exp: all ticks round
            },
            lineWidth: (ctx) => {
                const v = ctx.tick && ctx.tick.value;
                if (v == null) return 1;
                if (Math.abs(v) < 1e-9) return 1.5;                    // thicker baseline
                if (isLevel && isWhole(v)) return 1.25;
                return 1;
            }
        };
    },

    renderChart() {
        const wrap = document.getElementById('ranks-chart-wrap');
        const empty = document.getElementById('ranks-empty');
        const canvas = document.getElementById('ranks-chart');
        if (!wrap || !empty || !canvas) return;

        const isExp = this.yMode === 'exp';
        const sel = this._selKeys();

        const ready = this.roster.filter(r => {
            const key = this._key(r);
            const c = this.cache[key];
            return sel.includes(key) && c && Array.isArray(c.labels) && c.labels.length > 0;
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
            const c = this.cache[this._key(r)];
            if (c.labels.length > unionLabels.length) unionLabels = c.labels.slice();
        }
        const N = this.selectedRange;
        const labels = unionLabels.slice(-N);
        const labelIndex = Object.fromEntries(labels.map((l, i) => [l, i]));

        const datasets = this.roster.map((r, idx) => {
            const key = this._key(r);
            if (!sel.includes(key)) return null;
            const c = this.cache[key];
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
                        grid: this._yGrid(this.yMode !== 'exp')
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

    _fmtDate(d) {
        if (!(d instanceof Date) || isNaN(d)) return '—';
        return `${d.getMonth() + 1}月${d.getDate()}日`;
    },

    _escape(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
};
