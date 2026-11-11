/* =========================================================
 *  Symbol Planner（シンボルの進捗予測）
 *  キャラごとに今のシンボルの Lv と経験値を入れると、デイリー・週課・イベントの分を毎日足して、
 *  各シンボルが最大になる日と、指定した日の Lv・フォースを出す（bi 依頼 2026-11-11）。
 *
 *  - サイドバーの Symbol Planner はキャラに紐付かない仮入力（'free'）。登録キャラは Character Manager の
 *    カードの SYMBOL（と Edit Character の Linked）からモーダルで開く（Scouter と同じ分け方）。
 *  - 必要数・メル・初期の獲得量は whackybeanz の Symbols（GMS、2026-02-17 更新）による。
 *      アーケイン Lv20 まで、Lv n→n+1 は n²+11 個（合計 2679）。フォースは Lv1 で 30、1 Lv ごとに +10。
 *      オーセンティック Lv11 まで、9n²+20n 個（合計 4565）。フォースは Lv×10。
 *      1日の量はアーケイン 40、セルニウム 30、ほかのオーセンティック 15。週課はアーケインだけで 240（GMS は月曜リセット）。
 *    量はキャラごと・シンボルごとに変えられる。
 *  - 日付はゲームのリセット（UTC 0:00＝日本 9:00）に合わせて UTC の日付で数える。
 *  - 入力した日（asOf）から1日ずつ積み上げる。デイリーは「今日の分は済み」の日を飛ばし、週課は週の初め（月曜）と
 *    入力した週に1回（「今週の分は済み」なら入力した週は飛ばす）。キャラの Lv が地域の入場 Lv に届かず、
 *    まだ持っていないシンボルには何も足さない（キャラの Lv が上がるのは見込まない）。
 *  - イベントは全キャラ共通の一覧。対象（シンボル1つ／アーケイン全部／オーセンティック全部／グランドオーセンティック全部）に、
 *    期間中「1日ごとに N 個」か「開始日に1回 N 個」を足す。重なったら足し算。入力した日より前の分は足さない（もう入力に入っている）。
 *
 *  保存（localStorage）:
 *    mm-symbol-planner = { 'free': entry, 'char:<id>': entry }
 *      entry = { charLv, asOf, doneDay, doneWeek, pct, syms: { <id>: { lv, exp, d, dAmt, w, wAmt } } }
 *      pct はカードの SYMBOL のバー用（入れる Lv の地域の合計の進み具合）。保存のたびに入れ直す。
 *    mm-symbol-events = [{ id, target, amount, mode: 'day'|'once', start, end, memo }]
 * ========================================================= */

const symbolPlanner = (() => {
    'use strict';

    const STORE_KEY = 'mm-symbol-planner';
    const EVENT_KEY = 'mm-symbol-events';
    const SHARE_APP = 'mm-symbol-events';

    // 1 Lv 上げるのに要る個数（Lv1→2 から）
    const NEED = {
        arc: Array.from({ length: 19 }, (_, i) => (i + 1) ** 2 + 11),
        aut: Array.from({ length: 10 }, (_, i) => 9 * (i + 1) ** 2 + 20 * (i + 1)),
    };
    const MAX = { arc: 20, aut: 11 };
    const force = (kind, lv) => (lv <= 0 ? 0 : kind === 'arc' ? 20 + lv * 10 : lv * 10);
    const GROUPS = [
        { id: 'arc', label: 'アーケイン', color: '#818cf8', forceLabel: 'アーケインフォース' },
        { id: 'aut', label: 'オーセンティック', color: '#fbbf24', forceLabel: 'オーセンティックフォース' },
        { id: 'grand', label: 'グランドオーセンティック', color: '#f97316', forceLabel: '' },
    ];
    const M = 1e6;
    // cost: Lv n→n+1 のメル（whackybeanz の Meso Cost Table、2026-02-17 時点の GMS）
    const SYMBOLS = [
        { id: 'vj', name: 'Vanishing Journey', short: 'VJ', group: 'arc', kind: 'arc', lv: 200, icon: 'assets/exp/sym-r1.png', daily: 40, weekly: 240,
          cost: [0.97, 1.23, 1.66, 2.26, 3.06, 4.04, 5.22, 6.6, 8.18, 9.99, 12.01, 14.26, 16.74, 19.45, 22.42, 25.63, 29.1, 32.83, 36.82] },
        { id: 'chuchu', name: 'Chu Chu Island', short: 'Chu Chu', group: 'arc', kind: 'arc', lv: 210, icon: 'assets/exp/sym-r2.png', daily: 40, weekly: 240,
          cost: [1.21, 1.53, 2.06, 2.8, 3.78, 4.98, 6.42, 8.1, 10.02, 12.21, 14.65, 17.36, 20.34, 23.59, 27.14, 30.97, 35.1, 39.53, 44.26] },
        { id: 'lachelein', name: 'Lachelein', short: 'Lachelein', group: 'arc', kind: 'arc', lv: 220, icon: 'assets/exp/sym-r3.png', daily: 40, weekly: 240,
          cost: [1.45, 1.83, 2.46, 3.34, 4.5, 5.92, 7.62, 9.6, 11.86, 14.43, 17.29, 20.46, 23.94, 27.73, 31.86, 36.31, 41.1, 46.23, 51.7] },
        { id: 'arcana', name: 'Arcana', short: 'Arcana', group: 'arc', kind: 'arc', lv: 225, icon: 'assets/exp/sym-r4.png', daily: 40, weekly: 240,
          cost: [1.69, 2.13, 2.86, 3.88, 5.22, 6.86, 8.82, 11.1, 13.7, 16.65, 19.93, 23.56, 27.54, 31.87, 36.58, 41.65, 47.1, 52.93, 59.14] },
        { id: 'morass', name: 'Morass', short: 'Morass', group: 'arc', kind: 'arc', lv: 230, icon: 'assets/exp/sym-r5.png', daily: 40, weekly: 240,
          cost: [1.93, 2.43, 3.26, 4.42, 5.94, 7.8, 10.02, 12.6, 15.54, 18.87, 22.57, 26.66, 31.14, 36.01, 41.3, 46.99, 53.1, 59.63, 66.58] },
        { id: 'esfera', name: 'Esfera', short: 'Esfera', group: 'arc', kind: 'arc', lv: 235, icon: 'assets/exp/sym-r6.png', daily: 40, weekly: 240,
          cost: [2.17, 2.73, 3.66, 4.96, 6.66, 8.74, 11.22, 14.1, 17.38, 21.09, 25.21, 29.76, 34.74, 40.15, 46.02, 52.33, 59.1, 66.33, 74.02] },
        { id: 'cernium', name: 'Cernium', short: 'Cernium', group: 'aut', kind: 'aut', lv: 260, icon: 'assets/scouter/symbol/cernium.png', daily: 30, weekly: 0,
          cost: [36.5, 91.2, 160.7, 241.9, 331.5, 426.2, 522.9, 618.2, 709, 792] },
        { id: 'arcus', name: 'Hotel Arcus', short: 'Arcus', group: 'aut', kind: 'aut', lv: 265, icon: 'assets/scouter/symbol/arcus.png', daily: 15, weekly: 0,
          cost: [41.7, 104.8, 186.1, 282.2, 390, 506.1, 627.4, 750.7, 872.6, 990] },
        { id: 'odium', name: 'Odium', short: 'Odium', group: 'aut', kind: 'aut', lv: 270, icon: 'assets/scouter/symbol/odium.png', daily: 15, weekly: 0,
          cost: [46.9, 118.5, 211.5, 322.5, 448.5, 586, 732, 883.2, 1036.2, 1188] },
        { id: 'shangrila', name: 'Shangri-La', short: 'Shangri-La', group: 'aut', kind: 'aut', lv: 275, icon: 'assets/scouter/symbol/shangrila.png', daily: 15, weekly: 0,
          cost: [52.2, 132.2, 236.8, 362.8, 507, 666, 836.6, 1015.6, 1199.8, 1386] },
        { id: 'arteria', name: 'Arteria', short: 'Arteria', group: 'aut', kind: 'aut', lv: 280, icon: 'assets/scouter/symbol/arteria.png', daily: 15, weekly: 0,
          cost: [57.4, 145.9, 262.2, 403.2, 565.5, 745.9, 941.2, 1148.1, 1363.5, 1584] },
        { id: 'carcion', name: 'Carcion', short: 'Carcion', group: 'aut', kind: 'aut', lv: 285, icon: 'assets/scouter/symbol/carcion.png', daily: 15, weekly: 0,
          cost: [62.6, 159.6, 287.6, 443.5, 624, 825.8, 1045.8, 1280.6, 1527.1, 1782] },
        { id: 'tallahart', name: 'Tallahart', short: 'Tallahart', group: 'grand', kind: 'aut', lv: 290, icon: 'assets/scouter/symbol/tallahart.png', daily: 15, weekly: 0,
          cost: [113.6, 293.3, 535.8, 837.7, 1196, 1607.2, 2068.3, 2576, 3126.9, 3718] },
        { id: 'geardock', name: 'Geardock', short: 'Geardock', group: 'grand', kind: 'aut', lv: 295, icon: 'assets/scouter/symbol/geardock.png', daily: 15, weekly: 0,
          cost: [139.7, 345.5, 614.1, 942.1, 1326.5, 1763.8, 2251, 2784.8, 3361.8, 3979] },
    ];
    SYMBOLS.forEach((s) => { s.cost = s.cost.map((c) => Math.round(c * M)); s.max = MAX[s.kind]; s.need = NEED[s.kind]; });
    const SYM = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));
    const TOTAL = { arc: NEED.arc.reduce((a, b) => a + b, 0), aut: NEED.aut.reduce((a, b) => a + b, 0) };
    const HORIZON = 3 * 366;   // 予測は3年先まで

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '').replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))); return Number.isFinite(n) ? n : 0; };
    const int = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(num(v))));

    /* ---------- 日付（UTC の日付＝ゲームの1日） ---------- */
    const D = {
        today() { return new Date().toISOString().slice(0, 10); },
        add(ymd, n) { const t = Date.parse(ymd + 'T00:00:00Z') + n * 864e5; return new Date(t).toISOString().slice(0, 10); },
        diff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); },
        dow(ymd) { return new Date(ymd + 'T00:00:00Z').getUTCDay(); },
        // その日を含む週の月曜（アーケインの週課のリセット）
        week(ymd) { return D.add(ymd, -((D.dow(ymd) + 6) % 7)); },
        short(ymd) { const [, m, d] = ymd.split('-'); return `${Number(m)}/${Number(d)}`; },
        full(ymd) { const [y, m, d] = ymd.split('-'); return `${y}/${Number(m)}/${Number(d)}`; },
        ok(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || ''); },
    };
    const fmtMeso = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n > 0 ? Math.round(n).toLocaleString() : '0');

    /* ---------- シンボル1つの計算 ---------- */
    // 今までに貯めた個数（Lv1 の 0 個を起点）
    const accOf = (s, lv, exp) => (lv <= 0 ? 0 : s.need.slice(0, Math.min(lv, s.max) - 1).reduce((a, b) => a + b, 0) + (lv >= s.max ? 0 : exp));
    const totalOf = (s) => TOTAL[s.kind];
    function lvOf(s, acc, owned) {
        if (!owned) return 0;
        let lv = 1, sum = 0;
        while (lv < s.max && sum + s.need[lv - 1] <= acc) { sum += s.need[lv - 1]; lv++; }
        return lv;
    }
    function expOf(s, acc, lv) { return lv >= s.max ? 0 : acc - s.need.slice(0, lv - 1).reduce((a, b) => a + b, 0); }
    const mesoLeft = (s, lv) => s.cost.slice(Math.max(0, lv - 1)).reduce((a, b) => a + b, 0);

    /* ---------- 保存 ---------- */
    let store = {};
    let events = [];
    let loaded = false;
    function load() {
        try { store = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { store = {}; }
        try { const v = JSON.parse(localStorage.getItem(EVENT_KEY) || '[]'); events = Array.isArray(v) ? v : []; } catch (e) { events = []; }
        loaded = true;
    }
    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* 保存できなくても計算はできる */ }
    }
    function saveEvents() {
        try { localStorage.setItem(EVENT_KEY, JSON.stringify(events)); } catch (e) { /* 同上 */ }
    }
    const blankSym = (s) => ({ lv: 0, exp: 0, d: true, dAmt: s.daily, w: s.weekly > 0, wAmt: s.weekly });
    function entry(id) {
        if (!loaded) load();
        let e = store[id];
        if (!e || typeof e !== 'object') e = store[id] = { charLv: 300, asOf: D.today(), doneDay: '', doneWeek: '', syms: {} };
        if (!e.syms) e.syms = {};
        SYMBOLS.forEach((s) => { e.syms[s.id] = { ...blankSym(s), ...(e.syms[s.id] || {}) }; });
        if (!D.ok(e.asOf)) e.asOf = D.today();
        return e;
    }

    function charOf(cid) {
        const list = (window.app && window.app.data && window.app.data.characters) || [];
        return list.find((c) => String(c.id) === String(cid)) || null;
    }
    // キャラの Lv（登録キャラは Character Manager の Lv、仮入力は画面で入れた Lv）
    function charLvOf(id, e) {
        if (id.startsWith('char:')) { const c = charOf(id.slice(5)); if (c && Number(c.level)) return Number(c.level); }
        return int(e.charLv, 0, 300);
    }
    const reachable = (s, st, charLv) => st.lv > 0 || charLv >= s.lv;

    /* ---------- 予測 ---------- */
    // その日・そのシンボルにイベントで足す個数
    function eventGain(s, ymd, asOf) {
        let g = 0;
        for (const ev of events) {
            if (ev.target !== s.id && ev.target !== s.group) continue;
            if (!D.ok(ev.start)) continue;
            const amt = Math.max(0, num(ev.amount));
            if (ev.mode === 'once') { if (ymd === ev.start && ev.start >= asOf) g += amt; continue; }
            const end = D.ok(ev.end) ? ev.end : ev.start;
            if (ymd >= ev.start && ymd <= end) g += amt;
        }
        return g;
    }
    // その日・そのシンボルに足す個数（デイリー・週課・イベント）。i は入力した日から何日目か
    function dayGain(e, s, st, d, i) {
        let g = 0;
        if (st.d && d !== e.doneDay) g += Math.max(0, num(st.dAmt));
        if (s.weekly > 0 && st.w && (D.dow(d) === 1 || i === 0) && !(i === 0 && D.week(d) === e.doneWeek)) g += Math.max(0, num(st.wAmt));
        return g + eventGain(s, d, e.asOf);
    }

    // entry から、シンボルごとの { acc（今）, maxOn（最大になる日）, lvAt（指定日の Lv） } と、日ごとの合計フォースを出す
    function project(id, e, atDate) {
        const charLv = charLvOf(id, e);
        const asOf = e.asOf;
        const rows = SYMBOLS.map((s) => {
            const st = e.syms[s.id];
            const lv = int(st.lv, 0, s.max);
            const acc = accOf(s, lv, int(st.exp, 0, 1e6));
            return { s, st, lv, acc, cur: acc, owned: lv > 0, maxOn: lv >= s.max ? asOf : null, lvAt: lv, reach: reachable(s, { lv }, charLv) };
        });
        const at = D.ok(atDate) ? atDate : null;
        for (let i = 0; i <= HORIZON; i++) {
            const d = D.add(asOf, i);
            for (const r of rows) {
                if (!r.reach || r.maxOn) continue;
                const g = dayGain(e, r.s, r.st, d, i);
                if (g > 0) { r.cur += g; r.owned = true; }
                if (r.cur >= totalOf(r.s)) { r.cur = totalOf(r.s); r.maxOn = d; }
            }
            if (at && d === at) rows.forEach((r) => { r.lvAt = lvOf(r.s, r.cur, r.owned); });
            if ((!at || d >= at) && rows.every((r) => !r.reach || r.maxOn)) break;
        }
        // 予測の範囲（3年）を過ぎた日を選んだときは、そこで止まった値
        if (at && D.diff(asOf, at) > HORIZON) rows.forEach((r) => { r.lvAt = lvOf(r.s, r.cur, r.owned); });
        // 指定日が入力日より前なら今の Lv のまま
        if (at && at < asOf) rows.forEach((r) => { r.lvAt = r.lv; });
        const reachRows = rows.filter((r) => r.reach);
        let lastMax = null;
        if (reachRows.length && reachRows.every((r) => r.maxOn)) lastMax = reachRows.map((r) => r.maxOn).reduce((a, b) => (a > b ? a : b));
        return { rows, charLv, lastMax, allReach: reachRows.length };
    }

    // カードのバー用：入れる地域（持っているか、キャラの Lv が届く地域）の合計の進み具合
    function pctOf(id, e) {
        const charLv = charLvOf(id, e);
        let have = 0, all = 0;
        for (const s of SYMBOLS) {
            const st = e.syms[s.id];
            const lv = int(st.lv, 0, s.max);
            if (!reachable(s, { lv }, charLv)) continue;
            have += accOf(s, lv, int(st.exp, 0, 1e6));
            all += totalOf(s);
        }
        if (!all || !SYMBOLS.some((s) => int(e.syms[s.id].lv, 0, s.max) > 0)) return null;
        return Math.floor((have / all) * 100);
    }

    /* ---------- 画面 ---------- */
    let rootEl = null;
    let cur = null;        // { id, page, tab, at }
    let msg = '';
    let importOpen = false;

    function init(rootId) {
        rootEl = document.getElementById(rootId);
        if (!loaded) load();
        render();
    }
    function render() {
        if (!rootEl) return;
        if (cur && !cur.page) return;   // キャラのモーダルを開いているときはそちらだけ
        rootEl.innerHTML = '<div id="sp-host"></div>';
        open('free', { page: true, tab: cur ? cur.tab : undefined });
    }
    function open(id, opt = {}) {
        if (!loaded) load();
        if (cur && !cur.page) closeModal(true);
        const page = !!opt.page;
        cur = { id, page, tab: opt.tab || (cur && cur.id === id && cur.tab) || 'progress', at: (cur && cur.at) || D.add(D.today(), 30) };
        if (!page) {
            const veil = document.createElement('div');
            veil.id = 'sp-overlay';
            veil.className = 'modal modal-open bg-slate-950/80 z-[200]';
            veil.addEventListener('click', (ev) => { if (ev.target === veil) closeModal(); });
            document.body.appendChild(veil);
            cur.esc = (ev) => { if (ev.key === 'Escape') closeModal(); };
            document.addEventListener('keydown', cur.esc);
        }
        draw();
    }
    function openForCharacter(cid) { open('char:' + cid); }
    function closeModal(silent) {
        if (!cur || cur.page) return;
        document.removeEventListener('keydown', cur.esc);
        const v = document.getElementById('sp-overlay');
        if (v) v.remove();
        const tab = cur.tab;
        cur = null;
        if (window.app && typeof window.app.renderDashboard === 'function') window.app.renderDashboard();
        if (!silent && rootEl) { cur = { id: 'free', page: true, tab }; render(); }
    }
    function setTab(tab) {
        if (!cur) return;
        cur.tab = tab === 'events' ? 'events' : 'progress';
        draw();
    }
    function syncNav() {
        const nav = document.getElementById('symbol-nav');
        if (!nav || !cur || !cur.page) return;
        nav.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('tab-active', b.dataset.tab === cur.tab));
    }

    function draw() {
        const host = cur && !cur.page ? document.getElementById('sp-overlay') : (rootEl && rootEl.querySelector('#sp-host'));
        if (!host || !cur) return;
        syncNav();
        const body = cur.tab === 'events' ? eventsHTML() : progressHTML();
        if (cur.page) {
            host.innerHTML = body;
        } else {
            const char = charOf(cur.id.slice(5));
            const portrait = char ? ((char.image && String(char.image).startsWith('http')) ? char.image : (char.classImage || '')) : '';
            const tab = (t, icon, label) => `<button role="tab" onclick="symbolPlanner.setTab('${t}')" class="tab gap-1.5 ${cur.tab === t ? 'tab-active' : ''}"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i>${label}</button>`;
            host.innerHTML = `<div class="modal-box max-w-[1400px] w-[96vw] max-h-[94vh] p-0 flex flex-col bg-base-200 border border-base-content/15">
                <div class="flex items-center gap-3 h-12 px-3 shrink-0 bg-base-100 border-b border-base-content/10">
                    ${portrait ? `<img src="${esc(portrait)}" alt="" class="w-8 h-8 object-contain bg-base-300 border border-base-content/10">` : ''}
                    <b class="text-white">${esc(char ? char.name : '?')}</b>
                    <span class="text-xs text-base-content/50">の Symbol Planner</span>
                    <nav role="tablist" class="tabs tabs-box tabs-sm ml-2">${tab('progress', 'chart-gantt', '進捗')}${tab('events', 'sparkles', 'イベント')}</nav>
                    <button onclick="symbolPlanner.close()" class="btn btn-sm btn-ghost btn-square ml-auto" title="閉じる"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3">${body}</div>
            </div>`;
        }
        if (window.lucide) lucide.createIcons();
    }

    /* ----- 進捗タブ ----- */
    function progressHTML() {
        const id = cur.id;
        const e = entry(id);
        if (rollToToday(id, e)) save();
        const isChar = id.startsWith('char:');
        const char = isChar ? charOf(id.slice(5)) : null;
        const p = project(id, e, cur.at);
        const today = D.today();
        const at = cur.at;

        // フォース（今 → 指定日）
        const forceSum = (kind, pick) => p.rows.filter((r) => r.s.kind === kind).reduce((a, r) => a + force(kind, pick(r)), 0);
        const arcNow = forceSum('arc', (r) => r.lv), arcAt = forceSum('arc', (r) => r.lvAt);
        const autNow = forceSum('aut', (r) => r.lv), autAt = forceSum('aut', (r) => r.lvAt);
        const forceBox = (label, now, then, color) => `
            <div class="sp-stat">
                <span class="sp-stat-l">${label}</span>
                <span class="sp-stat-v"><b style="color:${color}">${now.toLocaleString()}</b>${then !== now ? `<i data-lucide="arrow-right" class="w-3.5 h-3.5 text-base-content/40"></i><b class="text-white">${then.toLocaleString()}</b>` : ''}</span>
            </div>`;
        const lastMax = p.lastMax;
        const reachN = p.allReach;

        const lvField = isChar
            ? `<span class="sp-stat-v"><b class="text-white">Lv ${p.charLv || '?'}</b></span>`
            : `<span class="sp-stat-v"><label class="input input-sm w-24 font-mono"><span class="text-base-content/40">Lv</span><input type="number" min="0" max="300" value="${int(e.charLv, 0, 300)}" onchange="symbolPlanner.setEntry('charLv', this.value)"></label></span>`;
        const toggle = (key, on, label, title) => `<label class="sp-check ${on ? 'on' : ''}" title="${esc(title)}"><input type="checkbox" class="checkbox checkbox-xs checkbox-primary" ${on ? 'checked' : ''} onchange="symbolPlanner.setDone('${key}', this.checked)"><span>${label}</span></label>`;
        const dayDone = e.doneDay === e.asOf;
        const weekDone = e.doneWeek === D.week(e.asOf);

        const head = `
        <div class="card card-sm bg-base-100 border border-base-content/10">
            <div class="sp-head">
                <div class="sp-stat">
                    <span class="sp-stat-l">${isChar ? esc(char ? char.name : '') : '仮入力のキャラ'}</span>
                    ${lvField}
                </div>
                <div class="sp-stat">
                    <span class="sp-stat-l">入力した日${e.estFrom ? `<span class="text-amber-400 ml-1" title="前に入力した日から、デイリー・週課・イベントをやった前提で今日まで進めた見込みです。違っていたら今の値に直してください">（${D.short(e.estFrom)} の入力から推定）</span>` : ''}</span>
                    <span class="sp-stat-v flex items-center gap-2"><b class="text-white font-mono mr-1">${D.full(e.asOf)}</b>
                        ${toggle('day', dayDone, 'デイリー済み', 'この日のデイリーはもう済ませた（オンにすると、入力した日のデイリーの分を足しません）')}
                        ${toggle('week', weekDone, '週課済み', 'この週の週課はもう済ませた（オンにすると、入力した週の週課の分を足しません）')}
                    </span>
                </div>
                <span class="flex-1"></span>
                <div class="sp-stat">
                    <span class="sp-stat-l">この日の時点</span>
                    <span class="sp-stat-v"><input type="date" class="input input-sm w-36 font-mono" value="${esc(at)}" onchange="symbolPlanner.setAt(this.value)"></span>
                </div>
                ${forceBox('アーケインフォース', arcNow, arcAt, GROUPS[0].color)}
                ${forceBox('オーセンティックフォース', autNow, autAt, GROUPS[1].color)}
                <div class="sp-stat">
                    <span class="sp-stat-l">全部最大</span>
                    <span class="sp-stat-v">${!reachN ? '<span class="text-base-content/40">—</span>' : lastMax ? `<b class="text-emerald-400 font-mono">${D.full(lastMax)}</b><span class="text-xs text-base-content/50">${D.diff(today, lastMax) > 0 ? `あと${D.diff(today, lastMax)}日` : '最大'}</span>` : '<span class="text-base-content/50 text-xs">3年以内には届かない</span>'}</span>
                </div>
            </div>
        </div>`;

        const groupHTML = (g) => {
            const rs = p.rows.filter((r) => r.s.group === g.id);
            const hasWeekly = rs.some((r) => r.s.weekly > 0);   // 週課の列はどの表にも置いて、表どうしの列をそろえる
            const rowHTML = (r) => {
                const { s, st } = r;
                const maxed = r.lv >= s.max;
                const needNow = maxed ? 0 : s.need[Math.max(0, r.lv - 1)];
                const pct = Math.floor((r.acc / totalOf(s)) * 100);
                const left = totalOf(s) - r.acc;
                const lvOpts = Array.from({ length: s.max + 1 }, (_, i) => `<option value="${i}" ${i === r.lv ? 'selected' : ''}>${i === 0 ? '—' : i}</option>`).join('');
                const daysTo = r.maxOn ? D.diff(today, r.maxOn) : null;
                const lock = !r.reach;
                const amt = (key, on, val, title) => `<span class="sp-amt">
                    <input type="checkbox" class="toggle toggle-xs" style="--c:${g.color}" ${on ? 'checked' : ''} ${lock ? 'disabled' : ''} onchange="symbolPlanner.setSym('${s.id}','${key}',this.checked)" title="${title}">
                    <label class="input input-xs w-[4.5rem] font-mono ${on && !lock ? '' : 'opacity-40'}"><input type="number" min="0" value="${num(val)}" ${lock ? 'disabled' : ''} onchange="symbolPlanner.setSym('${s.id}','${key}Amt',this.value)"></label></span>`;
                return `
                <tr class="${lock ? 'sp-lock' : ''} ${maxed ? 'sp-max' : ''}">
                    <td><span class="sp-name"><img src="${s.icon}" alt="" class="sp-ico"><span><b>${esc(s.name)}</b><small>Lv${s.lv}〜${lock ? '<em>キャラ Lv 不足</em>' : ''}</small></span></span></td>
                    <td><select class="select select-xs w-16 font-mono" onchange="symbolPlanner.setSym('${s.id}','lv',this.value)">${lvOpts}</select></td>
                    <td>${maxed ? '<span class="sp-maxtag">MAX</span>' : r.lv === 0 ? '<span class="text-base-content/30">—</span>'
                        : `<span class="flex items-center gap-1"><label class="input input-xs w-[4.5rem] font-mono"><input type="number" min="0" max="${needNow - 1}" value="${int(st.exp, 0, 1e6)}" onchange="symbolPlanner.setSym('${s.id}','exp',this.value)"></label><span class="text-[11px] font-mono text-base-content/45">/ ${needNow}</span></span>`}</td>
                    <td>${maxed ? '' : amt('d', st.d, st.dAmt, 'デイリー（1日の個数）')}</td>
                    <td>${!hasWeekly ? '' : maxed ? '' : amt('w', st.w, st.wAmt, '週課（1週の個数、月曜リセット）')}</td>
                    <td><div class="sp-bar" title="${r.acc.toLocaleString()} / ${totalOf(s).toLocaleString()}"><span style="width:${pct}%;background:${g.color}"></span></div><span class="sp-pct">${pct}%</span></td>
                    <td class="font-mono text-right">${r.lvAt > r.lv ? `<b class="text-white">Lv ${r.lvAt}</b>` : `<span class="text-base-content/45">Lv ${r.lvAt || '—'}</span>`}</td>
                    <td class="font-mono">${maxed ? '<span class="text-base-content/40">—</span>' : r.maxOn ? `<b style="color:${g.color}">${D.full(r.maxOn)}</b> <span class="text-[11px] text-base-content/50">あと${daysTo}日</span>` : `<span class="text-base-content/40">${lock ? '—' : '3年以上'}</span>`}</td>
                    <td class="font-mono text-right">${maxed ? '' : `<span class="sp-left"><span class="text-white">${left.toLocaleString()}<span class="text-[11px] text-base-content/45">個</span></span><span class="text-[11px] text-amber-200/90">${fmtMeso(mesoLeft(s, r.lv))}</span></span>`}</td>
                </tr>`;
            };
            const arcF = rs.reduce((a, r) => a + force(r.s.kind, r.lv), 0);
            const capF = rs.reduce((a, r) => a + force(r.s.kind, r.s.max), 0);
            const mesoSum = rs.reduce((a, r) => a + (r.lv >= r.s.max ? 0 : mesoLeft(r.s, r.lv)), 0);
            return `
            <div class="card card-sm bg-base-100 border border-base-content/10 overflow-hidden">
                <div class="flex items-center gap-2 px-3 py-2 bg-base-200 border-b border-base-content/10">
                    <span class="w-1 h-4 rounded-sm" style="background:${g.color}"></span>
                    <span class="text-sm font-bold text-white">${g.label}</span>
                    <span class="text-[11px] font-mono text-base-content/50">フォース <b style="color:${g.color}">${arcF}</b> / ${capF}</span>
                    <span class="flex-1"></span>
                    ${mesoSum ? `<span class="text-[11px] text-base-content/50">残りのメル <b class="font-mono text-amber-200">${fmtMeso(mesoSum)}</b></span>` : ''}
                </div>
                <div class="overflow-x-auto">
                    <table class="table table-sm sp-table">
                        <colgroup><col style="width:180px"><col style="width:80px"><col style="width:132px"><col style="width:124px"><col style="width:124px"><col style="width:120px"><col style="width:80px"><col style="width:176px"><col></colgroup>
                        <thead><tr><th>シンボル</th><th>Lv</th><th>経験値</th><th>デイリー</th><th>${hasWeekly ? '週課' : ''}</th><th>進み具合</th><th class="text-right">${D.short(at)}の Lv</th><th>最大になる日</th><th class="text-right">残り・メル</th></tr></thead>
                        <tbody>${rs.map(rowHTML).join('')}</tbody>
                    </table>
                </div>
            </div>`;
        };

        const evNow = events.filter((ev) => D.ok(ev.start) && (ev.mode === 'once' ? ev.start >= e.asOf : (D.ok(ev.end) ? ev.end : ev.start) >= e.asOf));
        const evLine = evNow.length ? `<div class="text-[11px] text-base-content/55 flex items-center gap-1.5 px-1"><i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-400"></i>イベント ${evNow.length}件を足しています（${evNow.map((ev) => esc(ev.memo || targetLabel(ev.target))).slice(0, 4).join('、')}${evNow.length > 4 ? ' ほか' : ''}）</div>` : '';

        return `<div class="space-y-3 max-w-[1400px]">${head}${evLine}${GROUPS.map(groupHTML).join('')}</div>`;
    }

    // 入力が変わったら保存して描き直す
    function touch(e) {
        e.asOf = D.today();
        delete e.estFrom;
        e.pct = pctOf(cur.id, e);
        save();
        draw();
    }
    function setEntry(key, value) {
        const e = entry(cur.id);
        if (key === 'charLv') e.charLv = int(value, 0, 300);
        touch(e);
    }
    function setSym(sid, key, value) {
        const e = entry(cur.id);
        const s = SYM[sid];
        const st = e.syms[sid];
        if (!s || !st) return;
        if (key === 'lv') { st.lv = int(value, 0, s.max); st.exp = Math.min(st.exp || 0, st.lv >= s.max || st.lv === 0 ? 0 : s.need[st.lv - 1] - 1); }
        else if (key === 'exp') st.exp = st.lv >= s.max ? 0 : int(value, 0, s.need[Math.max(0, st.lv - 1)] - 1);
        else if (key === 'd' || key === 'w') st[key] = !!value;
        else if (key === 'dAmt' || key === 'wAmt') st[key] = int(value, 0, 9999);
        touch(e);
    }
    // 入力した日から昨日までの分を、予測どおり進めた値に置き換える（開いたときに今日の見込みを出す）。
    // デイリー・週課をやった前提なので、違っていたら直してもらう（estFrom はその目印で、入力を直すと消える）。
    function rollToToday(id, e) {
        const today = D.today();
        const yest = D.add(today, -1);
        if (e.asOf > yest) return false;
        const charLv = charLvOf(id, e);
        const days = D.diff(e.asOf, yest);
        for (const s of SYMBOLS) {
            const st = e.syms[s.id];
            const lv = int(st.lv, 0, s.max);
            if (!reachable(s, { lv }, charLv) || lv >= s.max) continue;
            let acc = accOf(s, lv, int(st.exp, 0, 1e6)), got = false;
            for (let i = 0; i <= days && acc < totalOf(s); i++) {
                const g = dayGain(e, s, st, D.add(e.asOf, i), i);
                if (g > 0) { acc += g; got = true; }
            }
            acc = Math.min(acc, totalOf(s));
            const nlv = lvOf(s, acc, lv > 0 || got);
            st.lv = nlv; st.exp = nlv ? expOf(s, acc, nlv) : 0;
        }
        if (!e.estFrom) e.estFrom = e.asOf;
        // 昨日と同じ週（今日が月曜でない）なら、今週の週課はもう足してあるので済みにする
        e.asOf = today; e.doneDay = ''; e.doneWeek = D.week(today) === D.week(yest) ? D.week(today) : '';
        e.pct = pctOf(id, e);
        return true;
    }
    function setDone(which, on) {
        const e = entry(cur.id);
        if (which === 'day') e.doneDay = on ? e.asOf : '';
        if (which === 'week') e.doneWeek = on ? D.week(e.asOf) : '';
        e.pct = pctOf(cur.id, e);
        save(); draw();
    }
    function setAt(v) { if (D.ok(v)) { cur.at = v; draw(); } }

    /* ----- イベントタブ ----- */
    const TARGETS = [
        ...GROUPS.map((g) => ({ id: g.id, label: `${g.label}（全部）`, color: g.color })),
        ...SYMBOLS.map((s) => ({ id: s.id, label: s.name, color: GROUPS.find((g) => g.id === s.group).color })),
    ];
    const targetOf = (id) => TARGETS.find((t) => t.id === id) || TARGETS[0];
    const targetLabel = (id) => targetOf(id).label;

    function addEvent() {
        const t = D.today();
        events.push({ id: 'e' + Date.now(), target: 'arc', amount: 20, mode: 'day', start: t, end: D.add(t, 6), memo: '' });
        saveEvents(); changedEvents();
    }
    function removeEvent(eid) { events = events.filter((x) => x.id !== eid); saveEvents(); changedEvents(); }
    function setEvent(eid, field, value) {
        const ev = events.find((x) => x.id === eid);
        if (!ev) return;
        if (field === 'amount') ev.amount = int(value, 0, 99999);
        else if (field === 'mode') ev.mode = value === 'once' ? 'once' : 'day';
        else ev[field] = value;
        if (D.ok(ev.start) && D.ok(ev.end) && ev.end < ev.start) ev.end = ev.start;
        saveEvents(); changedEvents();
    }
    // イベントが変わると全キャラの見込みが変わるので、カードも描き直す
    function changedEvents() {
        draw();
    }

    // 共有（EXP Simulator のイベントバフと同じ形）: { app, version: 1, events: [{ target, amount, mode, start, end, memo }] }
    function exportText() {
        const list = [...events].sort((a, b) => (a.start || '').localeCompare(b.start || ''))
            .map((ev) => ({ target: ev.target, amount: num(ev.amount), mode: ev.mode === 'once' ? 'once' : 'day', start: ev.start || '', end: ev.end || '', memo: ev.memo || '' }));
        return JSON.stringify({ app: SHARE_APP, version: 1, events: list });
    }
    function copyExport() {
        if (!events.length) { flash('書き出すイベントがありません'); return; }
        const text = exportText();
        const done = () => flash(`${events.length}件をコピーしました。Discord などに貼って共有できます`);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done(); });
        else { fallbackCopy(text); done(); }
    }
    function fallbackCopy(text) {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* 何もしない */ } ta.remove();
    }
    function downloadExport() {
        if (!events.length) { flash('書き出すイベントがありません'); return; }
        const blob = new Blob([exportText()], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `symbol-events-${D.today()}.json`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    function parseImport(text) {
        const t = String(text || '');
        const i = t.search(/[[{]/);
        if (i < 0) return null;
        const j = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
        let v;
        try { v = JSON.parse(t.slice(i, j + 1)); } catch (e) { return null; }
        const arr = Array.isArray(v) ? v : (v && Array.isArray(v.events) ? v.events : null);
        if (!arr) return null;
        return arr.filter((x) => x && TARGETS.some((tg) => tg.id === x.target) && D.ok(x.start)).map((x) => {
            let end = D.ok(x.end) ? x.end : '';
            if (end && end < x.start) end = x.start;
            return { target: x.target, amount: int(x.amount, 0, 99999), mode: x.mode === 'once' ? 'once' : 'day', start: x.start, end, memo: String(x.memo || '').slice(0, 100) };
        });
    }
    function toggleImport() { importOpen = !importOpen; msg = ''; draw(); if (importOpen) document.getElementById('spe-import-text')?.focus(); }
    function importFile(input) {
        const f = input.files && input.files[0];
        if (!f) return;
        f.text().then((t) => { const ta = document.getElementById('spe-import-text'); if (ta) ta.value = t; flash('ファイルを読み込みました。追加か入れ替えを選んでください', true); });
        input.value = '';
    }
    function doImport(replace) {
        const src = document.getElementById('spe-import-text')?.value;
        const got = parseImport(src);
        if (!got) { flash('読み込めませんでした。書き出した文字をそのまま貼ってください'); return; }
        if (!got.length) { flash('読み込めるイベントがありませんでした'); return; }
        if (replace && events.length && !confirm(`今の一覧（${events.length}件）を消して、${got.length}件に入れ替えます。よろしいですか？`)) return;
        const sig = (x) => [x.target, num(x.amount), x.mode, x.start, x.end || ''].join('|');
        const have = new Set(replace ? [] : events.map(sig));
        const base = replace ? [] : events;
        let added = 0, n = Date.now();
        for (const x of got) {
            if (have.has(sig(x))) continue;
            have.add(sig(x));
            base.push({ id: 'e' + (n++), ...x });
            added++;
        }
        events = base;
        saveEvents();
        importOpen = false;
        const skipped = got.length - added;
        flash(replace ? `${added}件に入れ替えました` : `${added}件を追加しました${skipped ? `（同じもの${skipped}件は飛ばしました）` : ''}`);
    }
    function flash(m, keepText) {
        msg = m;
        const ta = document.getElementById('spe-import-text');
        const kept = keepText && ta ? ta.value : null;
        draw();
        if (kept != null) { const ta2 = document.getElementById('spe-import-text'); if (ta2) ta2.value = kept; }
        clearTimeout(flash._t);
        flash._t = setTimeout(() => { msg = ''; const el = document.getElementById('spe-msg'); if (el) el.textContent = ''; }, 5000);
    }

    function eventsHTML() {
        const rows = [...events].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
        const today = D.today();
        const endOf = (ev) => (ev.mode === 'once' ? ev.start : (D.ok(ev.end) ? ev.end : ev.start));
        const starts = rows.map((ev) => ev.start).filter(D.ok);
        const ends = rows.map(endOf).filter(D.ok);
        const lo = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : today;
        const hi = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : today;
        const span = Math.max(1, D.diff(lo, hi) + 1);
        const pos = (ymd) => (D.diff(lo, ymd) / span) * 100;
        const groupOpt = (cur) => `<optgroup label="まとめて">${GROUPS.map((g) => `<option value="${g.id}" ${g.id === cur ? 'selected' : ''}>${g.label}（全部）</option>`).join('')}</optgroup>`
            + GROUPS.map((g) => `<optgroup label="${g.label}">${SYMBOLS.filter((s) => s.group === g.id).map((s) => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${s.name}</option>`).join('')}</optgroup>`).join('');
        const rowHTML = (ev) => {
            const t = targetOf(ev.target);
            const end = endOf(ev);
            const live = D.ok(ev.start) && today >= ev.start && today <= end;
            const l = D.ok(ev.start) ? pos(ev.start) : 0;
            const w = D.ok(ev.start) ? ((D.diff(ev.start, end) + 1) / span) * 100 : 0;
            const once = ev.mode === 'once';
            const days = D.ok(ev.start) ? D.diff(ev.start, end) + 1 : 0;
            return `
            <tr class="${live ? 'spe-live' : ''}">
                <td><select class="select select-sm w-48" onchange="symbolPlanner.setEvent('${ev.id}','target',this.value)">${groupOpt(ev.target)}</select></td>
                <td><label class="input input-sm w-28 font-mono"><span class="text-base-content/40">+</span><input type="number" min="0" value="${num(ev.amount)}" onchange="symbolPlanner.setEvent('${ev.id}','amount',this.value)"><span class="text-base-content/40">個</span></label></td>
                <td class="min-w-[160px] whitespace-nowrap"><div class="join">
                    <button class="btn btn-sm join-item w-[4.5rem] ${!once ? 'btn-primary' : ''}" onclick="symbolPlanner.setEvent('${ev.id}','mode','day')">1日ごと</button>
                    <button class="btn btn-sm join-item w-[4.5rem] ${once ? 'btn-primary' : ''}" onclick="symbolPlanner.setEvent('${ev.id}','mode','once')">1回</button>
                </div></td>
                <td><input type="date" class="input input-sm w-36 font-mono" value="${esc(ev.start || '')}" onchange="symbolPlanner.setEvent('${ev.id}','start',this.value)"></td>
                <td>${once ? '<span class="text-base-content/30 text-xs px-2">開始日に1回</span>' : `<input type="date" class="input input-sm w-36 font-mono" value="${esc(ev.end || '')}" onchange="symbolPlanner.setEvent('${ev.id}','end',this.value)">`}</td>
                <td class="min-w-[160px]"><input type="text" class="input input-sm w-full" placeholder="イベント名など" value="${esc(ev.memo)}" onchange="symbolPlanner.setEvent('${ev.id}','memo',this.value)"></td>
                <td class="w-[20%] min-w-[110px]">
                    <div class="expb-track"><div class="expb-bar" style="left:${l}%;width:${Math.max(w, 1.2)}%;background:${t.color}" title="${esc(t.label)} +${num(ev.amount)}${once ? '' : '/日'}"></div></div>
                </td>
                <td class="font-mono text-right text-xs text-base-content/60 whitespace-nowrap">${once ? `計 <b class="text-white">${num(ev.amount)}</b>` : `計 <b class="text-white">${(num(ev.amount) * days).toLocaleString()}</b>`}</td>
                <td><button class="btn btn-ghost btn-sm btn-square" onclick="symbolPlanner.removeEvent('${ev.id}')" title="消す"><i data-lucide="x" class="w-3.5 h-3.5"></i></button></td>
            </tr>`;
        };
        return `
        <div class="space-y-3 max-w-[1400px]">
            <div class="card card-sm bg-base-100 border border-base-content/10 overflow-hidden">
                <div class="flex items-center gap-2 px-3 py-2 bg-base-200 border-b border-base-content/10">
                    <i data-lucide="sparkles" class="w-4 h-4 text-amber-400"></i>
                    <span class="text-sm font-bold text-white">イベント</span>
                    <span class="text-[11px] text-base-content/50 flex-1">${lo === hi ? '' : `${D.short(lo)} 〜 ${D.short(hi)}`}</span>
                    <span id="spe-msg" class="text-[11px] text-emerald-400">${esc(msg)}</span>
                    <button class="btn btn-xs gap-1" onclick="symbolPlanner.copyExport()" title="一覧を文字にしてコピーします。Discord などに貼って共有できます"><i data-lucide="copy" class="w-3 h-3"></i>共有用にコピー</button>
                    <button class="btn btn-xs btn-square" onclick="symbolPlanner.downloadExport()" title="JSON ファイルで保存"><i data-lucide="download" class="w-3 h-3"></i></button>
                    <button class="btn btn-xs gap-1 ${importOpen ? 'btn-primary' : ''}" onclick="symbolPlanner.toggleImport()"><i data-lucide="clipboard-paste" class="w-3 h-3"></i>読み込み</button>
                </div>
                ${importOpen ? `
                <div class="p-3 border-b border-base-content/10 bg-base-200/50 space-y-2">
                    <textarea id="spe-import-text" class="textarea textarea-sm w-full font-mono h-20" placeholder="共有されたイベントの文字（{&quot;app&quot;:&quot;${SHARE_APP}&quot;,…}）をここに貼る"></textarea>
                    <div class="flex items-center gap-2">
                        <button class="btn btn-sm btn-primary" onclick="symbolPlanner.doImport(false)">今の一覧に追加</button>
                        <button class="btn btn-sm" onclick="symbolPlanner.doImport(true)">今の一覧と入れ替え</button>
                        <label class="btn btn-sm btn-ghost gap-1"><i data-lucide="file-up" class="w-3.5 h-3.5"></i>ファイルから<input type="file" accept=".json,application/json,text/plain" class="hidden" onchange="symbolPlanner.importFile(this)"></label>
                        <span class="flex-1"></span>
                        <button class="btn btn-sm btn-ghost" onclick="symbolPlanner.toggleImport()">閉じる</button>
                    </div>
                </div>` : ''}
                <div class="overflow-x-auto">
                    <table class="table table-sm expb-table">
                        <thead><tr><th>対象</th><th>量</th><th>受け取り方</th><th>開始</th><th>終了</th><th>メモ</th><th>期間</th><th class="text-right">合計</th><th></th></tr></thead>
                        <tbody>${rows.map(rowHTML).join('') || '<tr><td colspan="9" class="text-center text-base-content/40 py-6">まだありません</td></tr>'}</tbody>
                    </table>
                </div>
                <div class="p-2 border-t border-base-content/10">
                    <button class="btn btn-sm btn-dash w-full gap-1" onclick="symbolPlanner.addEvent()"><i data-lucide="plus" class="w-3.5 h-3.5"></i>イベントを追加</button>
                </div>
            </div>
        </div>`;
    }

    // ダッシュボードのカード用（symbol_planner.js を読まなくても localStorage から読める pct を使う）
    function pctFor(charId) {
        try { const e = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')['char:' + charId]; return e && typeof e.pct === 'number' ? e.pct : null; } catch (e) { return null; }
    }

    return {
        STORE_KEY, init, render, open, openForCharacter, close: () => closeModal(), setTab,
        setEntry, setSym, setDone, setAt,
        addEvent, removeEvent, setEvent, copyExport, downloadExport, toggleImport, importFile, doImport,
        pctFor, SYMBOLS, _project: project, _entry: entry,
    };
})();
