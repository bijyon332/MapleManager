// ranks.js
// EXP Leaderboard & Progress: per-character EXP tracking with two tabs.
//   - リーダーボード: sortable table (yesterday / 7d / 14d / 30d averages,
//     +1..+5 level ETAs, predicted order of reaching Lv.290 / Lv.295).
//     Clicking a row opens a modal with that character's level / daily-EXP chart (7/14/30/90d).
//   - 推移: pick characters from the roster list and overlay their curves
//     on a single Chart.js chart (level / delta / cumulative EXP / daily EXP).
//     The window is the last N days, or an explicit date range.
//
// Data source: MapleHub (maplehub.app) keeps daily snapshots for every ranked
// character in its own backend DB (the response format changed in 2026-10 and
// now returns a shorter window, so refreshed data is merged into the local cache). We fetch it through our own
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

    SNAPSHOT_HOUR_JST: 3, // MapleHub's daily snapshot lands around 03:00 JST

    initialized: false,
    roster: [],          // [{ name, region }]
    cache: {},           // { 'na:name': { labels, values, expDaily, charInfo, importedAt } }
    busy: false,
    autoAttemptAt: 0,    // last automatic refresh attempt (epoch ms)
    _watcher: null,

    // tabs & leaderboard state
    activeTab: 'board',  // 'board' | 'trend'
    sortKey: 'char',     // column key
    sortDir: 'desc',
    detailKey: null,     // cache key of the character shown in the chart modal
    boardOrder: [],      // cache keys in the order the board last drew them (for ◀ ▶ in the modal)
    detailMode: 'level', // 'level' | 'exp'
    detailRange: 30,     // 7 | 14 | 30 | 90
    detailChart: null,

    // trend tab state
    selectedKeys: null,  // array of cache keys shown in the trend chart (null = all)
    selectedRange: 14,   // 7 | 14 | 30 | 90
    dateFrom: null,      // 'YYYY-MM-DD'。入っていれば selectedRange より優先する
    dateTo: null,        // 'YYYY-MM-DD'
    yMode: 'absolute',   // 'absolute' | 'delta' | 'expCum' | 'exp'
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
        this.autoRefresh();     // pull a new day's snapshot if 03:00 JST has passed
        this.startAutoWatcher();
    },

    /* ---------- auto refresh ---------- */

    // MapleHub publishes the previous day's snapshot around 03:00 JST, so cache
    // taken before the most recent 03:00 is a day behind. Returns that boundary.
    lastSnapshotAt(now = new Date()) {
        const JST = 9 * 3600000;
        const j = new Date(now.getTime() + JST); // shifted, so getUTC* reads as JST
        const ms = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate(), this.SNAPSHOT_HOUR_JST) - JST;
        return ms > now.getTime() ? ms - 86400000 : ms; // before 03:00 → yesterday's
    },

    // One automatic refresh per 03:00 window: if fetches fail we keep the old data
    // and wait for the next window rather than retrying on every tick.
    async autoRefresh() {
        if (this.busy || this.roster.length === 0) return;
        const cutoff = this.lastSnapshotAt();
        const stale = this.roster.some(r => {
            const c = this.cache[this._key(r)];
            return c && !(c.importedAt >= cutoff);
        });
        if (stale && !(this.autoAttemptAt >= cutoff)) {
            this.autoAttemptAt = Date.now();
            this.savePrefs();
            await this.refreshAll(true);
            return;
        }
        this._refreshMissing(); // pull icon/withinExp for entries cached by the old version
    },

    // The tab can stay open across 03:00 JST.
    startAutoWatcher() {
        if (this._watcher) return;
        this._watcher = setInterval(() => this.autoRefresh(), 5 * 60000);
    },

    renderAll() {
        this.renderTabs();
        this.renderBoard();
        this.renderTrend();
    },

    _key(r) { return `${r.region}:${r.name.toLowerCase()}`; },

    /* ---------- 日付での期間指定 ---------- */

    _isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); },
    _hasDateRange() { return !!(this.dateFrom || this.dateTo); },

    // MapleHubのラベルは "6/9" のように年が入っていない。系列は最大90日ぶんで
    // 末尾が直近の日なので、末尾から遡りながら「月が大きくなったら前年」で年を補う。
    // 返すのは labels と同じ並びの 'YYYY-MM-DD'（読めなかった要素は null）。
    _labelDates(labels) {
        const out = new Array(labels.length).fill(null);
        const parse = (s) => {
            const m = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(String(s || '').trim());
            return m ? { mo: +m[1], d: +m[2] } : null;
        };
        let i = labels.length - 1;
        while (i >= 0 && !parse(labels[i])) i--;
        if (i < 0) return out;

        const today = new Date();
        const last = parse(labels[i]);
        let year = today.getFullYear();
        // 年をまたいだ直後は、末尾の日付が「今年」だと未来になってしまう。
        if (new Date(year, last.mo - 1, last.d) > today) year--;

        let prevMo = last.mo;
        for (; i >= 0; i--) {
            const p = parse(labels[i]);
            if (!p) continue;
            if (p.mo > prevMo) year--;   // 遡っていて月が増えた＝前の年に入った
            prevMo = p.mo;
            out[i] = `${year}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
        }
        return out;
    },

    // グラフに出すラベルの添字。日付指定があればそれで絞り、無ければ末尾N日ぶん。
    _visibleIndices(labels) {
        if (!this._hasDateRange()) {
            const start = Math.max(0, labels.length - this.selectedRange);
            return labels.map((_, i) => i).filter(i => i >= start);
        }
        const dates = this._labelDates(labels);
        const from = this.dateFrom, to = this.dateTo;
        return labels
            .map((_, i) => i)
            .filter(i => dates[i] && (!from || dates[i] >= from) && (!to || dates[i] <= to));
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
            if (this._isDate(p.dateFrom)) this.dateFrom = p.dateFrom;
            if (this._isDate(p.dateTo)) this.dateTo = p.dateTo;
            if (['absolute', 'delta', 'expCum', 'exp'].includes(p.yMode)) this.yMode = p.yMode;
            if (['na', 'eu'].includes(p.region)) this.pickedRegion = p.region;
            if (['board', 'trend'].includes(p.tab)) this.activeTab = p.tab;
            if (typeof p.sortKey === 'string' && this.BOARD_COLUMNS.some(c => c.key === p.sortKey && c.sortable !== false)) this.sortKey = p.sortKey;
            if (['asc', 'desc'].includes(p.sortDir)) this.sortDir = p.sortDir;
            if (Array.isArray(p.selected)) this.selectedKeys = p.selected;
            if (['level', 'exp'].includes(p.detailMode)) this.detailMode = p.detailMode;
            if ([7, 14, 30, 90].includes(p.detailRange)) this.detailRange = p.detailRange;
            if (Number.isFinite(p.autoAttemptAt)) this.autoAttemptAt = p.autoAttemptAt;
        } catch (_) { /* ignore */ }
    },
    savePrefs() {
        const p = {
            range: this.selectedRange, dateFrom: this.dateFrom, dateTo: this.dateTo,
            yMode: this.yMode, region: this.pickedRegion,
            tab: this.activeTab, sortKey: this.sortKey, sortDir: this.sortDir,
            selected: this.selectedKeys, detailMode: this.detailMode, detailRange: this.detailRange,
            autoAttemptAt: this.autoAttemptAt
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
                // プリセットを押したら日付指定は解除する（両方効いていると分かりにくい）
                this.dateFrom = this.dateTo = null;
                this.savePrefs();
                this.renderRangeButtons();
                this.renderChart();
            });
        });

        const applyDates = () => {
            const f = document.getElementById('ranks-date-from');
            const t = document.getElementById('ranks-date-to');
            let from = f && f.value ? f.value : null;
            let to = t && t.value ? t.value : null;
            if (from && to && from > to) { const x = from; from = to; to = x; }   // 逆に入れても通す
            this.dateFrom = from;
            this.dateTo = to;
            this.savePrefs();
            this.renderRangeButtons();
            this.renderChart();
        };
        ['ranks-date-from', 'ranks-date-to'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', applyDates);
        });
        const clearDates = document.getElementById('ranks-date-clear');
        if (clearDates) clearDates.addEventListener('click', () => {
            this.dateFrom = this.dateTo = null;
            this.savePrefs();
            this.renderRangeButtons();
            this.renderChart();
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

        const openPicker = document.getElementById('ranks-community-open');
        if (openPicker) openPicker.addEventListener('click', () => this.openCommunityPicker());

        this.initCommunity();
    },

    // ---- コミュニティ名簿との連携 ---------------------------------------
    // 「名簿から追加」を押すと、まだ入っていないキャラをカードで並べたモーダルが
    // 開く。複数選んでまとめて取り込める。名簿が無い環境では導線ごと隠し、
    // 今までどおり手入力だけで使える。
    initCommunity() {
        const store = window.communityStore;
        const row = document.getElementById('ranks-community-row');
        if (!store || !row) return;
        store.ready().then(() => {
            store.onChange(() => this.renderCommunityRow());
            this.renderCommunityRow();
        });
    },

    _esc(v) {
        return String(v == null ? '' : v)
            .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    // 名簿にいて、まだリーダーボードに入っていないキャラ（持ち主の情報つき）。
    _communityCandidates() {
        const store = window.communityStore;
        if (!store) return [];
        const region = this.pickedRegion;
        const already = new Set(this.roster.map(r => this._key(r)));
        return store.members().flatMap(m => m.characters
            .filter(c => c.name && !already.has(`${region}:${c.name.toLowerCase()}`))
            .map(c => ({ char: c, member: m, who: store.label(m) })));
    },

    renderCommunityRow() {
        const store = window.communityStore;
        const row = document.getElementById('ranks-community-row');
        const note = document.getElementById('ranks-community-note');
        if (!store || !row) return;

        const hasRoster = store.members().some(m => m.characters.length);
        row.classList.toggle('hidden', !hasRoster);
        row.classList.toggle('flex', hasRoster);
        if (!hasRoster) return;

        const left = this._communityCandidates().length;
        const btn = document.getElementById('ranks-community-open');
        if (btn) btn.disabled = !left;
        if (note) note.textContent = left ? `未追加 ${left}体` : 'すべて追加済み';
    },

    // 名簿のキャラをカードで選ぶモーダル。
    openCommunityPicker() {
        const store = window.communityStore;
        if (!store) return;
        const cands = this._communityCandidates();
        if (!cands.length) { this.showMsg('名簿のキャラはすべて追加済みです。', 'warn'); return; }

        const esc = v => this._esc(v);
        const picked = new Set();

        const veil = document.createElement('div');
        veil.className = 'modal modal-open bg-slate-950/80 z-50';
        veil.innerHTML = `
<div class="modal-box max-w-5xl w-full p-0 flex flex-col max-h-[88vh] bg-base-100 border border-base-content/15">
    <div class="px-4 py-3 border-b border-base-content/10 flex items-center gap-3">
        <div>
            <h3 class="text-white font-bold text-sm leading-tight">名簿から追加</h3>
            <p class="text-[11px] text-base-content/50 mt-0.5">追加したいキャラを選んでください（${cands.length}体が未追加・${this.pickedRegion.toUpperCase()}）</p>
        </div>
        <div class="flex-1"></div>
        <input type="search" data-x="q" placeholder="キャラ名 / 職 / メンバーで絞り込み"
            class="input input-sm w-64">
        <button type="button" data-x="close" class="btn btn-sm btn-ghost btn-square"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div data-x="grid" class="flex-1 overflow-y-auto custom-scrollbar p-4 grid gap-2"
        style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr));align-content:start"></div>
    <div class="px-4 py-2.5 border-t border-base-content/10 flex items-center gap-2">
        <button type="button" data-x="all" class="btn btn-sm">表示中をすべて選択</button>
        <button type="button" data-x="none" class="btn btn-sm">選択を解除</button>
        <span data-x="status" class="text-[11px] text-base-content/50 ml-1"></span>
        <div class="flex-1"></div>
        <button type="button" data-x="add" class="btn btn-sm btn-primary">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i><span data-x="add-label">追加</span>
        </button>
    </div>
</div>`;
        document.body.appendChild(veil);

        const $ = k => veil.querySelector(`[data-x="${k}"]`);
        const card = e => {
            const c = e.char;
            const on = picked.has(c.id);
            const face = c.imgURL
                ? `<img src="${esc(c.imgURL)}" alt="" loading="lazy" class="absolute inset-0 w-full h-full object-contain">`
                : '<div class="absolute inset-0 flex items-center justify-center text-slate-700"><i data-lucide="user" class="w-6 h-6"></i></div>';
            return `<button type="button" data-cid="${c.id}"
    class="text-left flex gap-3 p-2 border transition-colors ${on ? 'border-indigo-500 bg-indigo-500/10' : 'border-base-content/10 bg-base-200 hover:border-base-content/30'}">
    <span class="relative w-14 h-14 bg-base-300 overflow-hidden shrink-0">${face}</span>
    <span class="min-w-0 flex-1">
        <span class="block text-[13px] font-bold text-white truncate">${esc(c.name)}</span>
        <span class="block text-[11px] text-slate-400">${c.level ? 'Lv.' + c.level : 'Lv.--'}${c.job ? ' · ' + esc(c.job) : ''}</span>
        <span class="block text-[10px] text-slate-500 truncate mt-0.5">${esc(e.who)}</span>
    </span>
    <span class="shrink-0 self-start w-4 h-4 rounded border ${on ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'} flex items-center justify-center">
        ${on ? '<i data-lucide="check" class="w-3 h-3 text-white"></i>' : ''}
    </span>
</button>`;
        };
        const visible = () => {
            const q = ($('q').value || '').trim().toLowerCase();
            if (!q) return cands;
            return cands.filter(e => [e.char.name, e.char.job, e.who, e.member.discordName]
                .some(v => String(v || '').toLowerCase().includes(q)));
        };
        // 表示中のキャラを持ち主ごとにまとめる。並びは名簿の順。
        const groups = () => {
            const map = new Map();
            visible().forEach(e => {
                if (!map.has(e.member.id)) map.set(e.member.id, { member: e.member, who: e.who, items: [] });
                map.get(e.member.id).items.push(e);
            });
            return Array.from(map.values());
        };
        const memberPicked = (mid) => {
            const items = visible().filter(e => e.member.id === mid);
            return items.length > 0 && items.every(e => picked.has(e.char.id));
        };
        // 見出しは1行まるごと使う（グリッドの列をまたぐ）。
        const header = (g) => `<div class="col-span-full flex items-center gap-2 pt-3 first:pt-0">
    <span class="w-2 h-2 rounded-full shrink-0" style="background:${store.color(g.member)}"></span>
    <span class="text-[12px] font-bold text-slate-200">${esc(g.who)}</span>
    ${g.who !== g.member.discordName ? `<span class="text-[10px] text-slate-500">@${esc(g.member.discordName)}</span>` : ''}
    <span class="text-[10px] text-slate-500 font-mono">${g.items.length}体</span>
    <span class="flex-1 h-px bg-slate-800"></span>
    <button type="button" data-mid="${g.member.id}"
        class="text-[10px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition-colors">${memberPicked(g.member.id) ? 'この人を解除' : 'この人をすべて選択'}</button>
</div>`;
        // 選択の切り替えで一覧を作り直すと、スクロール位置が先頭に戻ってしまう。
        // 押したカードと下のボタンだけを塗り替える。
        const paintCard = (btn) => {
            const on = picked.has(btn.dataset.cid);
            btn.className = 'text-left flex gap-3 p-2 border transition-colors '
                + (on ? 'border-indigo-500 bg-indigo-500/10' : 'border-base-content/10 bg-base-200 hover:border-base-content/30');
            const box = btn.lastElementChild;
            box.className = 'shrink-0 self-start w-4 h-4 rounded border '
                + (on ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600')
                + ' flex items-center justify-center';
            box.innerHTML = on ? '<i data-lucide="check" class="w-3 h-3 text-white"></i>' : '';
            if (on && window.lucide) lucide.createIcons();
        };
        const paintFooter = () => {
            $('status').textContent = picked.size ? `${picked.size}体を選択中` : '';
            $('add').disabled = !picked.size;
            $('add-label').textContent = picked.size ? `選択した${picked.size}体を追加` : '追加';
        };
        const paintHeaders = () => {
            veil.querySelectorAll('[data-mid]').forEach(btn => {
                btn.textContent = memberPicked(btn.dataset.mid) ? 'この人を解除' : 'この人をすべて選択';
            });
        };
        const paintAll = () => {
            veil.querySelectorAll('[data-cid]').forEach(paintCard);
            paintHeaders();
            paintFooter();
        };
        const draw = () => {
            const gs = groups();
            $('grid').innerHTML = gs.length
                ? gs.map(g => header(g) + g.items.map(card).join('')).join('')
                : '<div class="col-span-full text-center text-slate-500 text-xs py-10">条件に合うキャラがいません。</div>';
            paintFooter();
            if (window.lucide) lucide.createIcons();
        };
        draw();
        $('q').focus();

        const close = () => { document.removeEventListener('keydown', onKey); veil.remove(); };
        const onKey = e => { if (e.key === 'Escape' && !this.busy) close(); };
        document.addEventListener('keydown', onKey);

        $('q').addEventListener('input', draw);
        veil.addEventListener('click', async e => {
            if (e.target === veil) { if (!this.busy) close(); return; }
            const cardBtn = e.target.closest('[data-cid]');
            if (cardBtn) {
                const id = cardBtn.dataset.cid;
                if (picked.has(id)) picked.delete(id); else picked.add(id);
                paintCard(cardBtn);
                paintHeaders();
                paintFooter();
                return;
            }
            const memberBtn = e.target.closest('[data-mid]');
            if (memberBtn) {
                const mid = memberBtn.dataset.mid;
                const items = visible().filter(e2 => e2.member.id === mid);
                const on = memberPicked(mid);
                items.forEach(e2 => { if (on) picked.delete(e2.char.id); else picked.add(e2.char.id); });
                paintAll();
                return;
            }
            const b = e.target.closest('[data-x]');
            if (!b || b.tagName === 'INPUT') return;
            const x = b.dataset.x;
            if (x === 'close') { if (!this.busy) close(); }
            else if (x === 'all' || x === 'none') {
                if (x === 'all') visible().forEach(e2 => picked.add(e2.char.id));
                else picked.clear();
                paintAll();
            }
            else if (x === 'add' && picked.size && !this.busy) {
                b.disabled = true;
                await this.importCharsFromCommunity(Array.from(picked), t => { $('status').textContent = t; });
                close();
            }
        });
    },

    // 選んだキャラをまとめて取り込む。1体ずつMapleHubを見に行く。
    async importCharsFromCommunity(charIds, onProgress) {
        const store = window.communityStore;
        if (this.busy || !store || !charIds.length) return;
        const region = this.pickedRegion;
        const targets = charIds.map(id => store.charById(id)).filter(Boolean);

        this.setBusy(true);
        let ok = 0;
        const missed = [];
        for (let i = 0; i < targets.length; i++) {
            const { char } = targets[i];
            const msg = `取得中 (${i + 1}/${targets.length}) ${char.name}`;
            this.showMsg(msg, 'info');
            if (onProgress) onProgress(msg);
            try {
                const parsed = await this._fetchCharacter(char.name, region);
                if (!parsed.labels.length) { missed.push(char.name); continue; }
                const canonicalName = (parsed.charInfo && parsed.charInfo.name) || char.name;
                const key = `${region}:${canonicalName.toLowerCase()}`;
                this._storeParsed(key, parsed);
                if (!this.roster.some(r => this._key(r) === key)) this.roster.push({ name: canonicalName, region });
                if (Array.isArray(this.selectedKeys) && !this.selectedKeys.includes(key)) this.selectedKeys.push(key);
                ok++;
            } catch (e) {
                missed.push(char.name);
            }
        }
        this.saveRoster();
        this.saveCache();
        this.savePrefs();
        this.renderAll();
        this.renderCommunityRow();
        this.setBusy(false);
        this.showMsg(
            `${ok}体を追加しました` + (missed.length ? ` / 推移データが見つからなかったキャラ: ${missed.join(', ')}` : ''),
            missed.length ? 'warn' : 'ok');
    },

    renderTabs() {
        document.querySelectorAll('.ranks-tab-btn').forEach(btn => {
            const active = btn.dataset.tab === this.activeTab;
            // タブは上部バー（index.html の ranks-nav）にある。
            btn.classList.toggle('tab-active', active);
        });
        const board = document.getElementById('ranks-tab-board');
        const trend = document.getElementById('ranks-tab-trend');
        if (board) board.classList.toggle('hidden', this.activeTab !== 'board');
        if (trend) trend.classList.toggle('hidden', this.activeTab !== 'trend');
    },

    renderRangeButtons() {
        // 日付を入れているあいだはプリセットを効いていない見た目にする。
        const byDate = this._hasDateRange();
        document.querySelectorAll('.ranks-range-btn').forEach(btn => {
            const active = !byDate && parseInt(btn.dataset.range, 10) === this.selectedRange;
            btn.className = `ranks-range-btn join-item btn btn-xs ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'text-base-content/60'}${byDate ? ' opacity-50' : ''}`;
        });

        const f = document.getElementById('ranks-date-from');
        const t = document.getElementById('ranks-date-to');
        const clear = document.getElementById('ranks-date-clear');
        if (!f || !t) return;
        if (f.value !== (this.dateFrom || '')) f.value = this.dateFrom || '';
        if (t.value !== (this.dateTo || '')) t.value = this.dateTo || '';

        // 選べる範囲は、手元にあるデータの範囲に合わせる。
        let longest = [];
        for (const r of this.roster) {
            const c = this.cache[this._key(r)];
            if (c && Array.isArray(c.labels) && c.labels.length > longest.length) longest = c.labels;
        }
        const dates = this._labelDates(longest).filter(Boolean);
        const min = dates[0] || '';
        const max = dates[dates.length - 1] || '';
        [f, t].forEach(el => { el.min = min; el.max = max; });
        [f, t].forEach(el => el.classList.toggle('border-indigo-500', byDate));
        if (clear) clear.style.visibility = byDate ? 'visible' : 'hidden';
    },
    renderModeButtons() {
        document.querySelectorAll('.ranks-mode-btn').forEach(btn => {
            const active = btn.dataset.mode === this.yMode;
            btn.className = `ranks-mode-btn join-item btn btn-xs ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'text-base-content/60'}`;
        });
    },
    renderRegionButtons() {
        document.querySelectorAll('.ranks-region-btn').forEach(btn => {
            const active = btn.dataset.region === this.pickedRegion;
            btn.className = `ranks-region-btn join-item btn btn-sm ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'text-base-content/60'}`;
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
            this._storeParsed(cacheKey, parsed);

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

    async refreshAll(auto = false) {
        if (this.busy || this.roster.length === 0) return;
        this.setBusy(true);
        if (auto) this.showMsg('新しい日次データを自動取得中…', 'info');
        let ok = 0, fail = 0;
        for (const r of this.roster) {
            try {
                const parsed = await this._fetchCharacter(r.name, r.region);
                if (parsed.labels.length) {
                    this._storeParsed(this._key(r), parsed);
                    ok++;
                } else { fail++; }
            } catch (_) { fail++; }
        }
        this.saveCache();
        this.renderAll();
        this.setBusy(false);
        this.showMsg(`${auto ? '自動更新: ' : ''}${ok}キャラを更新しました${fail ? `(${fail}件失敗)` : ''}。`, fail ? 'warn' : 'ok');
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
                if (parsed.labels.length) this._storeParsed(this._key(r), parsed);
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
        if (!res.ok || !data || data.error || data.success === false) {
            throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
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
        if (this.detailKey === key) this.closeDetail();
        this.saveRoster();
        this.saveCache();
        this.savePrefs();
        this.renderAll();
    },

    /* ---------- API parsing ---------- */

    // MapleHub /api/character response → { labels, values, expDaily, charInfo }.
    // 2026-10 から応答の形が { success, data: { character, expHistory, levelHistory } }
    // に変わった。旧形式（additionalData.graphData）も念のため読めるようにしておく。
    _parseApiResponse(data) {
        if (data && data.data && (data.data.character || data.data.expHistory || data.data.levelHistory)) {
            return this._parseApiResponseV2(data.data);
        }
        return this._parseApiResponseV1(data);
    },

    // 新形式。expHistory = [{ date:'2026-10-05', exp(その日の獲得EXP), level }]、
    // levelHistory = [{ date, level, exp(レベル内EXP), expPercent }]。日付で突き合わせる。
    _parseApiResponseV2(d) {
        const tnl = (typeof tnlData !== 'undefined') ? tnlData : {};
        const byDate = {};
        const at = (date) => (byDate[date] = byDate[date] || {});
        (Array.isArray(d.levelHistory) ? d.levelHistory : []).forEach(r => {
            if (r && this._isDate(r.date)) Object.assign(at(r.date), { lv: Number(r.level), within: Number(r.exp), pct: Number(r.expPercent) });
        });
        (Array.isArray(d.expHistory) ? d.expHistory : []).forEach(r => {
            if (!r || !this._isDate(r.date)) return;
            const e = at(r.date);
            e.gain = Number(r.expExact != null ? r.expExact : r.exp);
            if (!Number.isFinite(e.lv)) e.lv = Number(r.level);
        });
        const dates = Object.keys(byDate).sort();
        // 先頭の日は前日が無いので獲得EXPが 0 で入ってくる。実際の値ではないので空にする。
        if (dates.length && byDate[dates[0]].gain === 0) byDate[dates[0]].gain = null;

        const fracLevel = (e) => {
            if (!Number.isFinite(e.lv)) return null;
            const need = tnl[e.lv];
            if (need && Number.isFinite(e.within)) return e.lv + Math.min(e.within / need, 0.9999);
            if (Number.isFinite(e.pct)) return e.lv + Math.min(e.pct / 100, 0.9999);
            return e.lv;
        };
        const labels   = dates.map(dt => this._dateToLabel(dt));
        const values   = dates.map(dt => fracLevel(byDate[dt]));
        const expDaily = dates.map(dt => Number.isFinite(byDate[dt].gain) ? byDate[dt].gain : null);

        const ch = d.character || {};
        const lastE = dates.length ? byDate[dates[dates.length - 1]] : {};
        const level = Number(ch.level) || (Number.isFinite(lastE.lv) ? lastE.lv : null);
        const within = Number.isFinite(Number(ch.exp)) ? Number(ch.exp) : (Number.isFinite(lastE.within) ? lastE.within : null);
        let expPct = Number.isFinite(Number(ch.expPercent)) ? Number(ch.expPercent) : null;
        if (level && tnl[level] && Number.isFinite(within)) expPct = (within / tnl[level]) * 100;

        const charInfo = {
            name: ch.name || null,
            level,
            expPct,
            withinExp: within,
            world: ch.world || null,
            job: ch.job || null,
            img: this._fixImgUrl(ch.imageUrl)
        };
        return { labels, values, expDaily, charInfo };
    },

    // 'YYYY-MM-DD' → 旧形式と同じ "M/D" ラベル（キャッシュと推移グラフの突き合わせがこの形なので揃える）。
    _dateToLabel(dt) {
        const [, m, d] = dt.split('-').map(Number);
        return `${m}/${d}`;
    },

    // 取り込んだ系列を手元のキャッシュと日付で合わせて保存する。MapleHub が返す
    // 期間が手元より短くなっても、過去の日次データを失わないため。重なる日は新しい方を使う。
    MAX_DAYS: 180,
    _storeParsed(key, parsed) {
        const prev = this.cache[key];
        let merged = parsed;
        if (prev && Array.isArray(prev.labels) && prev.labels.length) {
            const rows = {};
            const put = (c) => {
                this._labelDates(c.labels).forEach((dt, i) => {
                    if (!dt) return;
                    const old = rows[dt] || {};
                    const v = c.values ? c.values[i] : null, e = c.expDaily ? c.expDaily[i] : null;
                    rows[dt] = { v: v ?? old.v ?? null, e: e ?? old.e ?? null };
                });
            };
            put(prev);
            put(parsed);
            const dates = Object.keys(rows).sort().slice(-this.MAX_DAYS);
            merged = {
                ...parsed,
                labels:   dates.map(dt => this._dateToLabel(dt)),
                values:   dates.map(dt => rows[dt].v ?? null),
                expDaily: dates.map(dt => rows[dt].e ?? null)
            };
        }
        this.cache[key] = { ...merged, importedAt: Date.now() };
    },

    // 旧形式。時系列は additionalData.graphData（fallback では最上位）にある。
    _parseApiResponseV1(data) {
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
            img: this._fixImgUrl(data.characterImgURL)
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
        return col.group ? this.GROUP_BG[col.group][which] : '';
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

    // 行クリックでグラフをモーダルで開く。表の下に差し込むと表がずれるので、上に重ねる。
    // 開けるのは1つだけで、別のキャラは ◀ ▶（または ← → キー）で切り替える。
    openDetail(key) {
        this.detailKey = key;
        this.renderBoard();
        this._renderDetail();
    },
    closeDetail() {
        this._destroyDetailChart();
        const m = document.getElementById('ranks-detail-modal');
        if (m) m.remove();
        if (this._detailKeyHandler) { document.removeEventListener('keydown', this._detailKeyHandler); this._detailKeyHandler = null; }
        const had = this.detailKey;
        this.detailKey = null;
        if (had) this.renderBoard();
    },
    stepDetail(delta) {
        const order = this.boardOrder;
        const i = order.indexOf(this.detailKey);
        if (i < 0 || order.length < 2) return;
        this.openDetail(order[(i + delta + order.length) % order.length]);
    },

    renderBoard() {
        const wrap = document.getElementById('ranks-board-wrap');
        const empty = document.getElementById('ranks-board-empty');
        const head = document.getElementById('ranks-board-head');
        const body = document.getElementById('ranks-board-body');
        if (!wrap || !empty || !head || !body) return;

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

        head.innerHTML = '<tr>' + this.BOARD_COLUMNS.map(col => {
            const sortable = col.sortable !== false;
            const active = this.sortKey === col.key;
            const arrow = active ? (this.sortDir === 'desc' ? ' ▼' : ' ▲') : '';
            const alignCls = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';
            const textCls = active ? 'text-indigo-300' : 'text-base-content/60';
            return `<th data-sort="${sortable ? col.key : ''}" class="text-[11px] font-semibold whitespace-nowrap ${alignCls} ${this._colBg(col, 'head')} ${textCls} ${sortable ? 'cursor-pointer select-none hover:text-white' : ''}">${col.label}${arrow}</th>`;
        }).join('') + '</tr>';

        this.boardOrder = rows.map(row => row.key);
        body.innerHTML = rows.map(row => this._boardRowHtml(row, rank290, rank295)).join('');

        // listeners
        head.querySelectorAll('th[data-sort]').forEach(th => {
            const key = th.dataset.sort;
            if (key) th.addEventListener('click', () => this.setSort(key));
        });
        body.querySelectorAll('tr[data-key]').forEach(tr => {
            tr.addEventListener('click', e => {
                if (e.target.closest('[data-del]')) return;
                this.openDetail(tr.dataset.key);
            });
        });
        body.querySelectorAll('button[data-del]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.removeCharacter(btn.dataset.del);
            });
        });

        if (window.lucide) lucide.createIcons();
    },

    _boardRowHtml(row, rank290, rank295) {
        const { r, key, s } = row;
        const info = (row.c && row.c.charInfo) || {};
        const expanded = this.detailKey === key;

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
            return `<td class="py-1 align-middle ${alignCls} ${this._colBg(col, 'cell')}">${inner[col.key]}</td>`;
        }).join('');

        return `
            <tr data-key="${this._escape(key)}" class="cursor-pointer transition-colors ${expanded ? 'bg-base-200' : 'hover:bg-base-200/60'}">
                ${tds}
            </tr>`;
    },

    /* ---------- board cell renderers (inner HTML, no <td>) ---------- */

    _charCellInner(r, info, s) {
        const imgUrl = this._fixImgUrl(info.img);
        const img = imgUrl
            ? `<img src="${this._escape(imgUrl)}" alt="" class="w-12 h-12 object-contain object-bottom shrink-0 -my-1" loading="lazy">`
            : `<div class="w-12 h-12 bg-base-300 flex items-center justify-center shrink-0"><i data-lucide="user" class="w-5 h-5 text-base-content/30"></i></div>`;

        const pct = (s.expPct != null) ? Math.max(0, Math.min(100, s.expPct)) : null;
        const lvTxt = s.level != null
            ? `<span class="font-bold text-white font-mono">Lv.${s.level}</span>${s.expPct != null ? ` <span class="font-bold text-indigo-300 font-mono">${s.expPct.toFixed(2)}%</span>` : ''}`
            : '<span class="font-bold text-amber-400">データなし</span>';
        const sub = [info.job, info.world].filter(Boolean).join(' · ');
        const bar = pct != null ? `<progress class="progress progress-primary h-1 w-full block mt-1" value="${pct.toFixed(2)}" max="100"></progress>` : '';

        return `
            <div class="flex items-center gap-2.5 min-w-[230px]">
                ${img}
                <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-1.5 leading-tight">
                        <span class="text-sm font-bold text-white truncate">${this._escape(r.name)}</span>
                        <span class="text-[10px] uppercase tracking-wider text-base-content/40">${r.region}</span>
                        <span class="ml-auto text-xs whitespace-nowrap">${lvTxt}</span>
                    </div>
                    ${sub ? `<div class="text-[11px] text-base-content/50 truncate leading-tight">${this._escape(sub)}</div>` : ''}
                    ${bar}
                </div>
            </div>`;
    },

    _expInner(v, s) {
        if (v == null) return '<span class="text-base-content/30">—</span>';
        const pct = s.tnl ? (v / s.tnl) * 100 : null;
        return `<div class="text-sm font-bold text-white font-mono whitespace-nowrap">${this._fmtExp(v)}</div>
                <div class="text-[11px] text-base-content/50">${pct != null ? pct.toFixed(2) + '%' : '—'}</div>`;
    },

    _predInner(p) {
        if (!p) return '<span class="text-base-content/30">—</span>';
        return `<div class="text-sm font-bold text-white font-mono whitespace-nowrap">${this._fmtDate(p.date)}</div>
                <div class="text-[11px] text-base-content/50">${p.days}日後</div>`;
    },

    // Reached characters are not ranked, so show only a muted "到達済" (no position).
    _reachInner(eta, rank) {
        if (!eta) return '<span class="text-base-content/30">—</span>';
        if (eta.reached) return '<span class="text-xs font-bold text-base-content/40">到達済</span>';
        return `<div class="text-base font-black text-amber-300 whitespace-nowrap leading-tight">${rank != null ? rank + '位' : '—'}</div>
                <div class="text-[11px] text-base-content/50 whitespace-nowrap">${this._fmtDate(eta.date)} · ${eta.days}日後</div>`;
    },

    _delInner(key) {
        return `<button type="button" data-del="${this._escape(key)}" title="削除"
                    class="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-rose-400">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>`;
    },

    _destroyDetailChart() {
        if (this.detailChart) { this.detailChart.destroy(); this.detailChart = null; }
    },

    _renderDetail() {
        const key = this.detailKey;
        const c = this.cache[key];
        const r = this.roster.find(x => this._key(x) === key);
        if (!r) { this.closeDetail(); return; }
        const info = (c && c.charInfo) || {};
        const s = this._computeStats(c);

        let m = document.getElementById('ranks-detail-modal');
        if (!m) {
            m = document.createElement('div');
            m.id = 'ranks-detail-modal';
            m.className = 'modal modal-open bg-slate-950/80 z-50';
            m.addEventListener('click', e => { if (e.target === m) this.closeDetail(); });
            document.body.appendChild(m);
            this._detailKeyHandler = e => {
                if (e.key === 'Escape') this.closeDetail();
                else if (e.key === 'ArrowLeft') this.stepDetail(-1);
                else if (e.key === 'ArrowRight') this.stepDetail(1);
            };
            document.addEventListener('keydown', this._detailKeyHandler);
        }

        const seg = (attr, val, label, on) => `
            <button type="button" ${attr}="${val}" class="join-item btn btn-xs ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'text-base-content/60'}">${label}</button>`;
        const navBtn = (d, icon, title) => `
            <button type="button" data-detail-step="${d}" title="${title}" class="btn btn-sm btn-square"><i data-lucide="${icon}" class="w-4 h-4"></i></button>`;
        const pos = this.boardOrder.indexOf(key);
        const imgUrl = this._fixImgUrl(info.img);
        const sub = [info.job, info.world].filter(Boolean).join(' · ');
        const lv = s.level != null ? `Lv.${s.level}${s.expPct != null ? ` ${s.expPct.toFixed(2)}%` : ''}` : 'データなし';

        m.innerHTML = `
<div class="modal-box max-w-4xl w-full p-0 flex flex-col bg-base-100 border border-base-content/15">
    <div class="flex items-center gap-3 px-3 py-2 border-b border-base-content/10">
        ${imgUrl ? `<img src="${this._escape(imgUrl)}" alt="" class="w-10 h-10 object-contain object-bottom shrink-0">` : ''}
        <div class="min-w-0">
            <div class="flex items-baseline gap-2">
                <span class="text-base font-bold text-white truncate">${this._escape(r.name)}</span>
                <span class="text-[10px] uppercase tracking-wider text-base-content/40">${r.region}</span>
                <span class="font-mono text-xs font-bold text-indigo-300">${lv}</span>
            </div>
            ${sub ? `<div class="text-[11px] text-base-content/50 truncate">${this._escape(sub)}</div>` : ''}
        </div>
        <div class="flex-1"></div>
        ${navBtn(-1, 'chevron-left', '前のキャラ（←）')}
        <span class="font-mono text-[11px] text-base-content/50 w-12 text-center">${pos + 1}/${this.boardOrder.length}</span>
        ${navBtn(1, 'chevron-right', '次のキャラ（→）')}
        <button type="button" data-detail-close title="閉じる（Esc）" class="btn btn-sm btn-ghost btn-square ml-1"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-base-content/10">
        <span class="text-[11px] text-base-content/50">グラフ</span>
        <div class="join">
            ${seg('data-detail-mode', 'level', 'レベル推移', this.detailMode === 'level')}${seg('data-detail-mode', 'exp', '獲得経験値', this.detailMode === 'exp')}
        </div>
        <span class="text-[11px] text-base-content/50 ml-2">期間</span>
        <div class="join">
            ${[7, 14, 30, 90].map(n => seg('data-detail-range', n, `${n}d`, this.detailRange === n)).join('')}
        </div>
    </div>
    <div class="relative h-[340px] p-3">
        ${c && Array.isArray(c.labels) ? '<canvas id="ranks-detail-canvas"></canvas>' : '<div class="h-full flex items-center justify-center text-xs text-base-content/50">データがありません</div>'}
    </div>
</div>`;

        m.querySelector('[data-detail-close]').addEventListener('click', () => this.closeDetail());
        m.querySelectorAll('[data-detail-step]').forEach(btn => btn.addEventListener('click', () => this.stepDetail(parseInt(btn.dataset.detailStep, 10))));
        m.querySelectorAll('[data-detail-mode]').forEach(btn => btn.addEventListener('click', () => {
            this.detailMode = btn.dataset.detailMode;
            this.savePrefs();
            this._renderDetail();
        }));
        m.querySelectorAll('[data-detail-range]').forEach(btn => btn.addEventListener('click', () => {
            this.detailRange = parseInt(btn.dataset.detailRange, 10);
            this.savePrefs();
            this._renderDetail();
        }));
        if (window.lucide) lucide.createIcons();

        const canvas = document.getElementById('ranks-detail-canvas');
        if (!canvas) { this._destroyDetailChart(); return; }

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
            wrap.innerHTML = '<div class="text-[11px] text-base-content/50 px-1 py-2">キャラクターがいません。上の検索バーから追加してください。</div>';
            return;
        }

        const sel = this._selKeys();
        wrap.innerHTML = this.roster.map((r, idx) => {
            const key = this._key(r);
            const c = this.cache[key];
            const info = (c && c.charInfo) || {};
            const selected = sel.includes(key);
            const color = this.PALETTE[idx % this.PALETTE.length];
            const imgUrl = this._fixImgUrl(info.img);
            const img = imgUrl
                ? `<img src="${this._escape(imgUrl)}" alt="" class="w-9 h-9 object-contain object-bottom shrink-0" loading="lazy">`
                : `<div class="w-9 h-9 bg-base-300 flex items-center justify-center shrink-0"><i data-lucide="user" class="w-4 h-4 text-base-content/30"></i></div>`;
            const lvTxt = info.level != null
                ? `Lv.${info.level}${Number.isFinite(info.expPct) ? ` (${info.expPct.toFixed(2)}%)` : ''}`
                : 'データなし';
            return `
                <button type="button" data-key="${this._escape(key)}"
                        class="ranks-trend-item w-full flex items-center gap-2 border px-2 py-1 transition-colors text-left ${selected ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-base-200 border-base-content/10 hover:border-base-content/30 opacity-60 hover:opacity-100'}">
                    <span class="w-1 self-stretch shrink-0" style="background:${selected ? color : '#475569'}"></span>
                    ${img}
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-bold text-white truncate">${this._escape(r.name)}
                            <span class="text-[9px] uppercase tracking-wider text-base-content/40 ml-1">${r.region}</span>
                        </div>
                        <div class="text-[10px] text-base-content/60 font-mono">${lvTxt}</div>
                    </div>
                    ${selected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-indigo-400 shrink-0"></i>' : ''}
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
        el.className = `text-[11px] font-medium ${palette[kind] || palette.info}`;
        el.textContent = text;
    },

    /* ---------- trend chart ---------- */

    // Scriptable y-axis grid: emphasize the "clean" reference lines so the chart
    // reads at a glance. The zero baseline is strongest; in level modes the
    // whole-level lines (integers) stand out over the fractional ticks; in EXP
    // mode every auto-tick is already a round value so they share one weight.
    _yGrid(isLevel) {
        const FAINT  = 'rgba(148,163,184,0.05)';
        const MID    = 'rgba(148,163,184,0.55)';   // clean reference lines
        const STRONG = 'rgba(226,232,240,0.85)';   // zero baseline (near-white)
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
                if (Math.abs(v) < 1e-9) return 2.5;                    // bold baseline
                if (isLevel && isWhole(v)) return 2;
                return isLevel ? 1 : 1.75;                             // exp: all lines bolder
            }
        };
    },

    renderChart() {
        const wrap = document.getElementById('ranks-chart-wrap');
        const empty = document.getElementById('ranks-empty');
        const canvas = document.getElementById('ranks-chart');
        if (!wrap || !empty || !canvas) return;

        const isCum = this.yMode === 'expCum';          // 期間内の累積EXP
        const isExp = this.yMode === 'exp' || isCum;    // Y軸がEXPかどうか
        const sel = this._selKeys();

        const ready = this.roster.filter(r => {
            const key = this._key(r);
            const c = this.cache[key];
            return sel.includes(key) && c && Array.isArray(c.labels) && c.labels.length > 0;
        });

        if (ready.length === 0) {
            wrap.classList.add('hidden');
            empty.classList.remove('hidden');
            const msg = empty.querySelector('[data-empty-msg]');
            if (msg) msg.textContent = '左のリストからキャラクターを選択してください';
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
        const labels = this._visibleIndices(unionLabels).map(i => unionLabels[i]);
        const labelIndex = Object.fromEntries(labels.map((l, i) => [l, i]));

        // 日付を絞りすぎて1日も残らないときは、空グラフではなく理由を出す。
        if (!labels.length) {
            wrap.classList.add('hidden');
            empty.classList.remove('hidden');
            const msg = empty.querySelector('[data-empty-msg]');
            if (msg) msg.textContent = '指定した期間にデータがありません。日付を広げてください。';
            if (this.chart) { this.chart.destroy(); this.chart = null; }
            return;
        }

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
            if (isCum) {
                // 期間の初日を0として足し上げる。欠測日は加算せず、線だけ繋ぐ。
                let sum = 0, started = false;
                display = aligned.map((v) => {
                    if (typeof v !== 'number') return started ? sum : null;
                    sum += v; started = true;
                    return sum;
                });
            } else if (this.yMode === 'delta') {
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
            // 複数キャラを重ねる画面なので、EXPでも棒ではなく線で出す。
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
                                if (isCum) return `${ctx.dataset.label}: 累計 ${fmtExp(v)} EXP`;
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
                        grid: this._yGrid(!isExp)
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
    },

    // MapleHub sometimes returns a malformed image URL where a CDN base is
    // prepended onto an already-absolute S3 URL with no separator, e.g.
    // "https://cdn.maplebot.iohttps://maplebot-storage.s3.../x.png".
    // Keep only the last absolute URL so the <img> resolves correctly.
    _fixImgUrl(url) {
        if (!url || typeof url !== 'string') return null;
        const m = [...url.matchAll(/https?:\/\//g)];
        return (m.length > 1) ? url.slice(m[m.length - 1].index) : url;
    }
};
