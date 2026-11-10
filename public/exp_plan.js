// =============================================
// EXP Simulator - アカウント計画とイベントバフ
// =============================================
// EXP Simulator の上部ヘッダー（#exp-nav）で 1キャラ／アカウント計画／イベントバフ を切り替える。
//   - イベントバフ（expBuffs）… モンパ+50% などの期間つきの効果を手入力で並べる一覧。
//     期間が重なった日は足し算で効く。1キャラ（exp_sim.js）とアカウント計画の両方が読む。
//   - アカウント計画（expPlan）… ダッシュボードのキャラから選び、キャラごとにやることを決めて、
//     期日の Lv と目標 Lv に届く日を出す。ワールド共有・アカウント共有の上限は選ぶ時点で止める。
// どちらもこのブラウザに保存する（計画は Planner の「自分」ごと、イベントバフは1つ）。
// 日付はすべて 'YYYY-MM-DD' の文字列で扱い、曜日は UTC で数える（GMS のリセットは UTC 0時）。

const expDate = {
    today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    add(ymd, n) {
        const d = new Date(ymd + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
    },
    dow(ymd) { return new Date(ymd + 'T00:00:00Z').getUTCDay(); },
    diff(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); },
    // 週の最終日（Thursday 始まりなら水曜、Monday 始まりなら日曜）
    weekEnd(ymd, startDow) { return this.add(ymd, (startDow + 6 - this.dow(ymd) + 7) % 7); },
    short(ymd) {
        if (!ymd) return '-';
        const [, m, d] = ymd.split('-');
        return `${Number(m)}/${Number(d)}(${'日月火水木金土'[this.dow(ymd)]})`;
    },
};

// 大きな EXP を読みやすく（1.23T など）
function expFmt(n) {
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 1e12) return (n / 1e12).toFixed(n >= 1e14 ? 0 : 1) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    return Math.round(n).toLocaleString();
}

function expEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------
//  イベントバフ一覧
// ---------------------------------------------------------
const expBuffs = {
    KEY: 'mm-exp-buffs',
    TARGETS: [
        { id: 'monpa', label: 'モンパ', color: '#818cf8' },
        { id: 'mpe', label: 'モンパエクストリーム', color: '#c084fc' },
        { id: 'epic', label: 'エピックダンジョン', color: '#fbbf24' },
        { id: 'daily', label: 'デイリー', color: '#34d399' },
        { id: 'weekly', label: '週課（アーケイン）', color: '#22d3ee' },
    ],
    list: [],
    loaded: false,

    load() {
        try {
            const v = JSON.parse(localStorage.getItem(this.KEY) || '[]');
            this.list = Array.isArray(v) ? v : [];
        } catch (e) { this.list = []; }
        this.loaded = true;
    },
    save() {
        try { localStorage.setItem(this.KEY, JSON.stringify(this.list)); } catch (e) { /* 保存できなくても画面はそのまま使える */ }
    },
    ensure() { if (!this.loaded) this.load(); },

    // その日に効いている上乗せ％の合計（重なった分は足し算）
    pct(target, ymd) {
        this.ensure();
        let s = 0;
        for (const b of this.list) {
            if (b.target !== target || !b.start) continue;
            if (ymd < b.start || (b.end && ymd > b.end)) continue;
            s += Number(b.pct) || 0;
        }
        return s;
    },
    target(id) { return this.TARGETS.find(t => t.id === id) || this.TARGETS[0]; },

    add() {
        const t = expDate.today();
        this.list.push({ id: 'b' + Date.now(), target: 'monpa', pct: 50, start: t, end: expDate.add(t, 6), memo: '' });
        this.save(); this.render(); expPlan.onBuffsChanged();
    },
    remove(id) {
        this.list = this.list.filter(b => b.id !== id);
        this.save(); this.render(); expPlan.onBuffsChanged();
    },
    set(id, field, value) {
        const b = this.list.find(x => x.id === id);
        if (!b) return;
        b[field] = field === 'pct' ? Math.max(0, Number(value) || 0) : value;
        if (b.start && b.end && b.end < b.start) b.end = b.start;
        this.save(); this.render(); expPlan.onBuffsChanged();
    },

    render() {
        const root = document.getElementById('exp-tab-buffs');
        if (!root) return;
        this.ensure();
        const rows = [...this.list].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
        const today = expDate.today();

        // 期間の帯（上の一覧と同じ並び）。範囲は全バフの最初の日〜最後の日。
        const starts = rows.map(b => b.start).filter(Boolean);
        const ends = rows.map(b => b.end || b.start).filter(Boolean);
        const lo = starts.length ? starts.reduce((a, b) => a < b ? a : b) : today;
        const hi = ends.length ? ends.reduce((a, b) => a > b ? a : b) : today;
        const span = Math.max(1, expDate.diff(lo, hi) + 1);
        const pos = ymd => (expDate.diff(lo, ymd) / span) * 100;

        const opt = (cur) => this.TARGETS.map(t => `<option value="${t.id}"${t.id === cur ? ' selected' : ''}>${t.label}</option>`).join('');
        const rowHTML = b => {
            const t = this.target(b.target);
            const live = b.start && today >= b.start && (!b.end || today <= b.end);
            const l = b.start ? pos(b.start) : 0;
            const w = b.start ? ((expDate.diff(b.start, b.end || b.start) + 1) / span) * 100 : 0;
            return `
            <tr class="${live ? 'expb-live' : ''}">
                <td><select class="select select-sm w-44" onchange="expBuffs.set('${b.id}','target',this.value)">${opt(b.target)}</select></td>
                <td><label class="input input-sm w-24 font-mono"><span class="text-slate-500">+</span><input type="number" min="0" step="10" value="${Number(b.pct) || 0}" onchange="expBuffs.set('${b.id}','pct',this.value)"><span class="text-slate-500">%</span></label></td>
                <td><input type="date" class="input input-sm w-36 font-mono" value="${b.start || ''}" onchange="expBuffs.set('${b.id}','start',this.value)"></td>
                <td><input type="date" class="input input-sm w-36 font-mono" value="${b.end || ''}" onchange="expBuffs.set('${b.id}','end',this.value)"></td>
                <td><input type="text" class="input input-sm w-full" placeholder="イベント名など" value="${expEsc(b.memo)}" onchange="expBuffs.set('${b.id}','memo',this.value)"></td>
                <td class="w-[30%] min-w-[180px]">
                    <div class="expb-track"><div class="expb-bar" style="left:${l}%;width:${Math.max(w, 1.2)}%;background:${t.color}" title="${t.label} +${b.pct}%"></div></div>
                </td>
                <td><button class="btn btn-ghost btn-sm btn-square" onclick="expBuffs.remove('${b.id}')" title="消す"><i data-lucide="x" class="w-3.5 h-3.5"></i></button></td>
            </tr>`;
        };

        // 今日〜2週間の合計（重なりの確認用）
        const days = Array.from({ length: 14 }, (_, i) => expDate.add(today, i));
        const sumRows = this.TARGETS.map(t => {
            const vals = days.map(d => this.pct(t.id, d));
            if (!vals.some(v => v > 0)) return '';
            return `<tr><td class="text-left font-bold" style="color:${t.color}">${t.label}</td>${vals.map(v => `<td class="font-mono ${v ? 'text-white font-bold' : 'text-slate-600'}">${v ? '+' + v : '·'}</td>`).join('')}</tr>`;
        }).join('');

        root.innerHTML = `
        <div class="space-y-4 max-w-[1400px]">
            <div class="bg-base-100 border border-base-content/10 rounded-box overflow-hidden">
                <div class="flex items-center gap-2 px-3 py-2 bg-base-200 border-b border-base-content/10">
                    <i data-lucide="sparkles" class="w-4 h-4 text-amber-400"></i>
                    <span class="text-sm font-bold text-white flex-1">イベントバフ</span>
                    <span class="text-[11px] text-slate-500">${lo === hi ? '' : `${expDate.short(lo)} 〜 ${expDate.short(hi)}`}</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="table table-sm expb-table">
                        <thead><tr><th>対象</th><th>上乗せ</th><th>開始</th><th>終了</th><th>メモ</th><th>期間</th><th></th></tr></thead>
                        <tbody>${rows.map(rowHTML).join('') || `<tr><td colspan="7" class="text-center text-slate-500 py-6">まだありません</td></tr>`}</tbody>
                    </table>
                </div>
                <div class="p-2 border-t border-base-content/10">
                    <button class="btn btn-sm btn-dash w-full gap-1" onclick="expBuffs.add()"><i data-lucide="plus" class="w-3.5 h-3.5"></i>バフを追加</button>
                </div>
            </div>
            ${sumRows ? `
            <div class="bg-base-100 border border-base-content/10 rounded-box overflow-hidden">
                <div class="flex items-center gap-2 px-3 py-2 bg-base-200 border-b border-base-content/10">
                    <i data-lucide="calendar-range" class="w-4 h-4 text-indigo-400"></i>
                    <span class="text-sm font-bold text-white">今日から2週間の合計（％）</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="table table-xs expb-sum">
                        <thead><tr><th></th>${days.map(d => `<th class="${expDate.dow(d) === 0 ? 'text-red-400' : expDate.dow(d) === 4 ? 'text-cyan-400' : ''}">${expDate.short(d)}</th>`).join('')}</tr></thead>
                        <tbody>${sumRows}</tbody>
                    </table>
                </div>
            </div>` : ''}
        </div>`;
        if (window.lucide) lucide.createIcons();
    },
};

// ---------------------------------------------------------
//  アカウント計画
// ---------------------------------------------------------
const expPlan = {
    tab: 'sim',
    world: 'KRONOS',
    state: null,
    stateKey: null,
    chart: null,
    fetching: {},

    // 共有の上限（GMS パッチノート: v.269 モンパ、v.260 MPE）
    // エピックダンジョンは「ダンジョンごとにアカウントで週1回、1キャラは週1種類」（bi 確認 2026-11-11。
    // v.271 の Express Pass の説明 'once per account' とも合う）。今は3種類なのでアカウントで週3回。
    LIMITS: { monpaPerChar: 7, monpaPerWorld: 14, mpePerWorld: 2 },
    // デイリーの地域（expRegionData の id）の短い名前と、まとめて切り替える区切り
    REGION_SHORT: { r1: 'VJ', r2: 'Chu Chu', r3: 'Lachelein', r4: 'Arcana', r5: 'Morass', r6: 'Esfera', r8: 'Moonbridge', r9: 'Labyrinth', r10: 'Limen',
        r11: 'Cernium', r12: 'Arcus', r13: 'Odium', r14: 'Shangri-La', r15: 'Arteria', r16: 'Carcion', r17: 'Tallahart', r18: 'Geardock' },
    WORLDS: [
        { id: 'KRONOS', name: 'Kronos' },
        { id: 'CHALLENGER', name: 'Challenger' },
    ],
    DAILY_GROUPS: [
        { id: 'arcane', label: 'アーケイン', test: r => r.lv <= 235 },
        { id: 'tenebris', label: 'テネブリス', test: r => r.lv >= 245 && r.lv <= 255 },
        { id: 'grandis', label: 'グランディス', test: r => r.lv >= 260 },
    ],
    TIX: [
        { id: 'straw', label: 'いちご農場', minLv: 200, note: '1回' },
        { id: 'blue', label: 'ブルーベリー', minLv: 260, note: '枚' },
        { id: 'mecha', label: 'メカいちご', minLv: 280, note: '1回' },
        { id: 'crimson', label: 'クリムゾン', minLv: 280, note: '枚' },
    ],
    BURNS: [
        { id: 'none', label: 'なし' },
        { id: 'hyper', label: 'Hyper Burning（〜260）' },
        { id: 'beyond', label: 'Burning Beyond（260〜270）' },
        { id: 'both', label: 'Hyper + Beyond（〜270）' },
        // 次のチャレンジャーサーバーは Burning Beyond が 280 まで（+2/Lv）
        { id: 'beyond280', label: 'Burning Beyond（260〜280）' },
        { id: 'both280', label: 'Hyper + Beyond（〜280）' },
    ],
    SRC: [
        { id: 'daily', label: 'デイリー', color: '#34d399' },
        { id: 'weekly', label: '週課', color: '#22d3ee' },
        { id: 'monpa', label: 'モンパ', color: '#818cf8' },
        { id: 'mpe', label: 'MPE', color: '#c084fc' },
        { id: 'epic', label: 'エピダン', color: '#fbbf24' },
        { id: 'farm', label: '農場', color: '#f472b6' },
        { id: 'potion', label: '秘薬', color: '#f87171' },
    ],

    init() {
        expBuffs.load();
        this.setTab(this.savedTab() || 'sim');
    },

    savedTab() { try { return localStorage.getItem('mm-exp-tab'); } catch (e) { return null; } },

    setTab(tab) {
        if (!['sim', 'plan', 'buffs'].includes(tab)) tab = 'sim';
        this.tab = tab;
        try { localStorage.setItem('mm-exp-tab', tab); } catch (e) { /* 次回は 1キャラ から */ }
        document.querySelectorAll('#exp-nav [data-tab]').forEach(b => b.classList.toggle('tab-active', b.dataset.tab === tab));
        const worldNav = document.getElementById('exp-world-nav');
        if (worldNav) worldNav.classList.toggle('hidden', tab !== 'plan');
        ['sim', 'plan', 'buffs'].forEach(t => {
            const el = document.getElementById(`exp-tab-${t}`);
            if (el) el.classList.toggle('hidden', t !== tab);
        });
        if (tab === 'plan') this.render();
        if (tab === 'buffs') expBuffs.render();
        this.syncWorldNav();
    },

    setWorld(w) {
        this.world = w === 'CHALLENGER' ? 'CHALLENGER' : 'KRONOS';
        if (this.state) { this.state.world = this.world; this.save(); }
        this.syncWorldNav();
        this.render();
    },

    syncWorldNav() {
        document.querySelectorAll('#exp-world-nav [data-world]').forEach(b => b.classList.toggle('tab-active', b.dataset.world === this.world));
    },

    onBuffsChanged() { if (this.tab === 'plan') this.render(); },

    // ---------- 保存 ----------
    key() {
        const k = (window.app && typeof app.plannerKey === 'function') ? app.plannerKey() : 'default';
        return 'mm-exp-plan::' + k;
    },
    load() {
        const key = this.key();
        if (this.state && this.stateKey === key) return;
        let s = null;
        try { s = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { s = null; }
        const t = expDate.today();
        this.state = Object.assign({ start: t, end: expDate.add(t, 27), world: 'KRONOS', chars: {}, pool: {} }, s || {});
        this.WORLDS.forEach(w => { this.state.pool[w.id] = Object.assign({ tix: {}, pot: {} }, this.state.pool[w.id] || {}); });
        this.stateKey = key;
        this.world = this.state.world === 'CHALLENGER' ? 'CHALLENGER' : 'KRONOS';
    },
    save() {
        try { localStorage.setItem(this.stateKey, JSON.stringify(this.state)); } catch (e) { /* 保存できなくても計算は出す */ }
    },

    characters() {
        const list = (window.app && app.data && Array.isArray(app.data.characters)) ? app.data.characters : [];
        return list.filter(c => !c.hidden).map(c => ({ ...c, server: c.server === 'CHALLENGER' ? 'CHALLENGER' : 'KRONOS', level: Number(c.level) || 0 }));
    },

    cfg(id) {
        const c = this.state.chars[id] || (this.state.chars[id] = {});
        const def = {
            on: false, lv: null, pct: 0, fetchedAt: null, target: null,
            dailyOff: null, weekly: true,
            monpa: 0, mpe: false, epic: 'none', epicTier: 1, epicBonus: 0, burn: 'none',
            tix: {}, pot: {},
        };
        for (const k of Object.keys(def)) if (c[k] === undefined) c[k] = def[k];
        // デイリーは地域ごとに外せる（外した地域の id を持つ）。前の版の3区分の選択から引き継ぐ。
        if (!Array.isArray(c.dailyOff)) {
            const old = c.daily || {};
            c.dailyOff = expRegionData.filter(r => r.daily > 0 && this.DAILY_GROUPS.some(g => g.test(r) && old[g.id] === false)).map(r => r.id);
            delete c.daily;
        }
        return c;
    },

    // ---------- 共有の上限 ----------
    onChars(world) { return this.characters().filter(ch => (!world || ch.server === world) && this.cfg(ch.id).on); },
    monpaUsed(world, exceptId) { return this.onChars(world).filter(ch => ch.id !== exceptId).reduce((s, ch) => s + (Number(this.cfg(ch.id).monpa) || 0), 0); },
    mpeUsed(world, exceptId) { return this.onChars(world).filter(ch => ch.id !== exceptId && this.cfg(ch.id).mpe).length; },
    epicDungeons() { return EPIC_DUNGEONS.filter(d => d.gms); },
    epicOwner(dgId, exceptId) { return this.onChars().find(ch => ch.id !== exceptId && this.cfg(ch.id).epic === dgId) || null; },
    tixUsed(world, k, exceptId) { return this.onChars(world).filter(ch => ch.id !== exceptId).reduce((s, ch) => s + (Number(this.cfg(ch.id).tix[k]) || 0), 0); },
    potUsed(world, k, exceptId) { return this.onChars(world).filter(ch => ch.id !== exceptId).reduce((s, ch) => s + (Number(this.cfg(ch.id).pot[k]) || 0), 0); },

    // 持ち物を減らしたときなどに、上限を超えた割り当てを後ろのキャラから削る
    normalize() {
        const L = this.LIMITS;
        this.WORLDS.forEach(w => {
            const pool = this.state.pool[w.id];
            let monpa = 0, mpe = 0;
            const tix = {}, pot = {};
            this.onChars(w.id).forEach(ch => {
                const c = this.cfg(ch.id);
                c.monpa = Math.max(0, Math.min(Number(c.monpa) || 0, L.monpaPerChar, L.monpaPerWorld - monpa));
                monpa += c.monpa;
                if (c.mpe) { if (mpe >= L.mpePerWorld) c.mpe = false; else mpe++; }
                this.TIX.forEach(t => {
                    const have = Number(pool.tix[t.id]) || 0;
                    c.tix[t.id] = Math.max(0, Math.min(Number(c.tix[t.id]) || 0, have - (tix[t.id] || 0)));
                    tix[t.id] = (tix[t.id] || 0) + c.tix[t.id];
                });
                EXP_POTION_TYPES.forEach(p => {
                    const have = Number(pool.pot[p.id]) || 0;
                    c.pot[p.id] = Math.max(0, Math.min(Number(c.pot[p.id]) || 0, have - (pot[p.id] || 0)));
                    pot[p.id] = (pot[p.id] || 0) + c.pot[p.id];
                });
            });
        });
        // エピダンはダンジョンごとにアカウントで1キャラまで。前の版の「自動」は、入れる最上位の空いているものに置き換える。
        const taken = new Set();
        this.onChars().forEach(ch => {
            const c = this.cfg(ch.id);
            if (c.epic === 'auto') {
                const lv = c.lv || ch.level;
                const d = [...this.epicDungeons()].reverse().find(x => lv >= x.lv && !taken.has(x.id));
                c.epic = d ? d.id : 'none';
            }
            if (c.epic !== 'none' && (taken.has(c.epic) || !this.epicDungeons().some(d => d.id === c.epic))) c.epic = 'none';
            if (c.epic !== 'none') taken.add(c.epic);
        });
    },

    // ---------- 入力 ----------
    setDate(field, v) {
        if (!v) return;
        this.state[field] = v;
        if (this.state.end < this.state.start) this.state.end = this.state.start;
        this.commit();
    },
    toggleChar(id) {
        const c = this.cfg(id);
        c.on = !c.on;
        if (c.on) {
            const ch = this.characters().find(x => x.id === id);
            // 入れたときはモンパを残りの回数から埋める
            if (ch && !c.monpa) c.monpa = Math.min(this.LIMITS.monpaPerChar, Math.max(0, this.LIMITS.monpaPerWorld - this.monpaUsed(ch.server, id)));
            if (ch && c.target == null) c.target = Math.min(300, Math.max(ch.level, 200) + 5);
        }
        this.commit();
        if (c.on && !c.fetchedAt) this.fetchLevel(id);
    },
    set(id, field, value) {
        const c = this.cfg(id);
        if (field === 'lv' || field === 'target' || field === 'monpa' || field === 'epicTier') c[field] = Number(value) || 0;
        else if (field === 'pct') c.pct = Math.max(0, Math.min(99.9999, Number(value) || 0));
        else if (field === 'epicBonus') c.epicBonus = Math.max(0, Number(value) || 0);
        else c[field] = value;
        if (field === 'lv' || field === 'pct') c.fetchedAt = null;
        this.commit();
    },
    toggle(id, field, sub) {
        const c = this.cfg(id);
        if (sub) c[field][sub] = !c[field][sub];
        else c[field] = !c[field];
        this.commit();
    },
    toggleDaily(id, rid) {
        const c = this.cfg(id);
        c.dailyOff = c.dailyOff.includes(rid) ? c.dailyOff.filter(x => x !== rid) : [...c.dailyOff, rid];
        this.commit();
    },
    toggleDailyGroup(id, gid) {
        const c = this.cfg(id);
        const g = this.DAILY_GROUPS.find(x => x.id === gid);
        const ids = expRegionData.filter(r => r.daily > 0 && g.test(r)).map(r => r.id);
        const allOn = ids.every(r => !c.dailyOff.includes(r));
        c.dailyOff = allOn ? [...new Set([...c.dailyOff, ...ids])] : c.dailyOff.filter(x => !ids.includes(x));
        this.commit();
    },
    setTix(id, k, v) { this.cfg(id).tix[k] = Number(v) || 0; this.commit(); },
    setPot(id, k, v) { this.cfg(id).pot[k] = Number(v) || 0; this.commit(); },
    setPool(world, kind, k, v) { this.state.pool[world][kind][k] = Math.max(0, Math.floor(Number(v) || 0)); this.commit(); },
    commit() { this.normalize(); this.save(); this.render(); },

    // Nexon ランキングから今の Lv と EXP% を取る（Worker の /api 経由、NA → EU の順）
    async fetchLevel(id) {
        const ch = this.characters().find(x => x.id === id);
        if (!ch || this.fetching[id]) return;
        this.fetching[id] = 'loading';
        this.render();
        try {
            let hit = null;
            for (const region of ['na', 'eu']) {
                const res = await fetch(`/api?name=${encodeURIComponent(ch.name)}&region=${region}`, { cache: 'no-cache' });
                const data = await res.json().catch(() => null);
                const ranks = data && Array.isArray(data.ranks) ? data.ranks : [];
                hit = ranks.find(x => String(x.characterName).toLowerCase() === String(ch.name).toLowerCase());
                if (hit) break;
            }
            if (!hit) throw new Error('not found');
            const lv = Number(hit.level), within = Number(hit.exp);
            const c = this.cfg(id);
            c.lv = lv;
            c.pct = tnlData[lv] ? Math.min(99.9999, within / tnlData[lv] * 100) : 0;
            c.fetchedAt = Date.now();
            delete this.fetching[id];
            this.save();
        } catch (e) {
            this.fetching[id] = 'error';
        }
        this.render();
    },
    fetchAll() { this.onChars(this.world).forEach(ch => this.fetchLevel(ch.id)); },

    // ---------- 計算 ----------
    // キャラ1体を日ごとに進める。共有の上限は入力の時点で守っているので、ここでは1体ずつ独立に計算する。
    simulate(ch, c, start, end) {
        let lv = c.lv || ch.level;
        if (!tnlData[lv]) return null;
        let exp = tnlData[lv] * (Number(c.pct) || 0) / 100;
        const target = Number(c.target) || 0;
        const src = {}; this.SRC.forEach(s => { src[s.id] = 0; });

        const burn = (l) => {
            if (['hyper', 'both', 'both280'].includes(c.burn) && l < 260) return Math.min(260, l + 4);
            const beyondTo = ['beyond280', 'both280'].includes(c.burn) ? 280 : ['beyond', 'both'].includes(c.burn) ? 270 : 0;
            if (beyondTo && l >= 260 && l < beyondTo) return Math.min(beyondTo, l + 1);
            return l;
        };
        const add = (amt, key) => {
            if (!(amt > 0) || lv >= 300) return;
            src[key] += amt;
            exp += amt;
            while (lv < 300 && tnlData[lv] && exp >= tnlData[lv]) {
                exp -= tnlData[lv];
                lv = burn(lv + 1);
            }
            if (lv >= 300) exp = 0;
        };
        // 長いコンテンツは分けて足し、途中のレベルアップで表を引き直す
        const gain = (fn, key, parts = 1) => { for (let i = 0; i < parts; i++) add(fn(lv) / parts, key); };

        const pendTix = this.TIX.map(t => ({ ...t, n: Number(c.tix[t.id]) || 0 })).filter(t => t.n > 0);
        const pendPot = EXP_POTION_TYPES.map(p => ({ ...p, n: Number(c.pot[p.id]) || 0 })).filter(p => p.n > 0);
        const useTix = () => {
            for (const t of pendTix) {
                if (!t.n || lv < t.minLv) continue;
                for (; t.n > 0; t.n--) {
                    if (t.id === 'straw') gain(l => (farmTable[l] || 0) * 1000, 'farm', 10);
                    if (t.id === 'blue') gain(l => blueberryFarmTable[l] || 0, 'farm', 10);
                    if (t.id === 'mecha') gain(l => (mechaFarmTable[l] || 0) * 1000, 'farm', 10);
                    if (t.id === 'crimson') gain(l => crimsonMechaFarmTable[l] || 0, 'farm', 10);
                }
            }
        };
        // 秘薬は全部使い切ってちょうど上限 Lv を越えるように使う（1本で1Lv なので、上限 Lv から本数分さかのぼった Lv で使い始める。
        // 例: 〜259 が3本なら Lv257 で使う）。そこまで届かなくても期日には使い切る。
        const usePot = (ymd) => {
            for (const p of pendPot) {
                if (!p.n || lv < p.minLv) continue;
                if (lv < p.capLv - p.n + 1 && ymd !== end) continue;
                for (; p.n > 0; p.n--) add(tnlData[Math.min(lv, p.capLv)] || 0, 'potion');
            }
        };
        // 週1のコンテンツは、その週の残りの日でいちばんバフが大きい日にやる
        const bestDay = (key, ymd, startDow) => {
            const now = expBuffs.pct(key, ymd);
            const last = expDate.weekEnd(ymd, startDow);
            for (let d = expDate.add(ymd, 1); d <= last; d = expDate.add(d, 1)) if (expBuffs.pct(key, d) > now) return false;
            return true;
        };

        const dailies = expRegionData.filter(r => r.daily > 0 && !c.dailyOff.includes(r.id));
        const done = { mpe: null, epic: null, weekly: new Set() };
        const series = [];
        let endSrc = null;
        let endLv = null, endPct = null, reach = (target && lv >= target) ? start : null;
        const startLv = lv, startPct = exp / tnlData[lv] * 100;
        const limit = expDate.add(start, 3650);

        for (let ymd = start; ymd <= limit; ymd = expDate.add(ymd, 1)) {
            if (ymd > end && (!target || reach || lv >= 300)) break;
            const dow = expDate.dow(ymd);
            const thuWeek = expDate.weekEnd(ymd, 4), monWeek = expDate.weekEnd(ymd, 1);
            if (done.mpe && done.mpe !== thuWeek) done.mpe = null;
            if (done.epic && done.epic !== thuWeek) done.epic = null;
            if (done.weeklyWeek !== monWeek) { done.weekly.clear(); done.weeklyWeek = monWeek; }

            useTix();

            const bDaily = expBuffs.pct('daily', ymd) / 100;
            dailies.forEach(r => { if (lv >= r.lv) add(r.daily * (1 + bDaily), 'daily'); });

            if (c.weekly && bestDay('weekly', ymd, 1)) {
                const bW = expBuffs.pct('weekly', ymd) / 100;
                arcaneWeeklyData.forEach(w => {
                    if (done.weekly.has(w.id) || lv < w.lv) return;
                    add(w.exp * (1 + bW), 'weekly');
                    done.weekly.add(w.id);
                });
            }

            const monpaMult = 1 + (dow === 0 ? 0.5 : 0) + expBuffs.pct('monpa', ymd) / 100;
            for (let i = 0; i < (Number(c.monpa) || 0); i++) {
                const regs = expRegionData.filter(r => r.lv <= lv && r.monpa > 0);
                if (!regs.length) break;
                add(regs[regs.length - 1].monpa * monpaMult, 'monpa');
            }

            if (c.mpe && !done.mpe && lv >= 260 && bestDay('mpe', ymd, 4)) {
                const b = expBuffs.pct('mpe', ymd) / 100;
                gain(l => (mpeTable[l] || 0) * (1 + b), 'mpe');
                done.mpe = thuWeek;
            }

            if (c.epic !== 'none' && !done.epic && bestDay('epic', ymd, 4)) {
                const dg = this.epicDungeons().find(d => d.id === c.epic);
                if (dg && lv >= dg.lv) {
                    const b = (Number(c.epicBonus) || 0) + expBuffs.pct('epic', ymd);
                    gain(l => (epicDungeonBase[l] || 0) * ((Number(c.epicTier) || 1) + b / 100) * dg.mult, 'epic');
                    done.epic = thuWeek;
                }
            }

            usePot(ymd);

            const pct = lv >= 300 ? 0 : exp / tnlData[lv] * 100;
            if (ymd <= end) series.push({ x: ymd, y: lv + pct / 100 });
            // 内訳は期日までの分（目標に届く日を出すために期日より先も回すので、ここで写しておく）
            if (ymd === end) { endLv = lv; endPct = pct; endSrc = { ...src }; }
            if (target && !reach && lv >= target) reach = ymd;
        }
        return { startLv, startPct, endLv, endPct, reach, target, src: endSrc || src, series };
    },

    // ---------- 描画 ----------
    // 秘薬の短い名前（Growth 1 (~Lv.209) → Growth 1 ~209、Growth (Lv.260~284) → Growth 260~284）
    potName(p) { return p.name.replace(/\s*\((?:Lv\.)?(~?)(?:Lv\.)?([^)]*)\)/, (_, t, r) => ` ${t}${r}`).replace('Special Mushroom', 'Special'); },

    color(world) {
        const cfg = (window.app && app.data && app.data.config) || {};
        return world === 'CHALLENGER' ? (cfg.serverCColor || 'purple') : (cfg.serverKColor || 'emerald');
    },

    render() {
        const root = document.getElementById('exp-tab-plan');
        if (!root || this.tab !== 'plan') return;
        this.load();
        this.normalize();
        const st = this.state;
        const L = this.LIMITS;
        const world = this.world;
        const chars = this.characters();
        const mine = chars.filter(ch => ch.server === world).sort((a, b) => (this.cfg(b.id).on - this.cfg(a.id).on) || (b.level - a.level));
        const wName = this.WORLDS.find(w => w.id === world).name;
        const col = this.color(world);

        const results = new Map();
        this.onChars().forEach(ch => results.set(ch.id, this.simulate(ch, this.cfg(ch.id), st.start, st.end)));

        const monpaLeft = L.monpaPerWorld - this.monpaUsed(world);
        const mpeLeft = L.mpePerWorld - this.mpeUsed(world);
        const epicMax = this.epicDungeons().length;
        const epicLeft = epicMax - this.epicDungeons().filter(d => this.epicOwner(d.id)).length;
        const pill = (label, left, max) => `<span class="expp-limit ${left <= 0 ? 'is-full' : ''}">${label}<b>${max - left}/${max}</b></span>`;

        if (!chars.length) {
            root.innerHTML = `<div class="flex flex-col items-center justify-center h-[60vh] text-slate-500 gap-2">
                <i data-lucide="users" class="w-10 h-10 opacity-30"></i><p class="text-sm">ダッシュボードにキャラがいません</p></div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        root.innerHTML = `
        <div class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 pb-6">
            <div class="space-y-3 min-w-0">
                <div class="bg-base-100 border border-base-content/10 rounded-box p-3 flex flex-wrap items-end gap-3">
                    <label class="flex flex-col gap-1"><span class="expp-lbl">開始日</span>
                        <input type="date" class="input input-sm font-mono w-40" value="${st.start}" onchange="expPlan.setDate('start',this.value)"></label>
                    <label class="flex flex-col gap-1"><span class="expp-lbl">期日</span>
                        <input type="date" class="input input-sm font-mono w-40 border-amber-500/40" value="${st.end}" onchange="expPlan.setDate('end',this.value)"></label>
                    <span class="text-xs text-slate-500 pb-2">${expDate.diff(st.start, st.end) + 1}日間</span>
                    <div class="flex-1"></div>
                    <div class="flex flex-wrap gap-1.5 pb-1">
                        ${pill(`${wName} モンパ/日 `, monpaLeft, L.monpaPerWorld)}
                        ${pill(`${wName} MPE/週 `, mpeLeft, L.mpePerWorld)}
                        ${pill('アカウント エピダン/週 ', epicLeft, epicMax)}
                    </div>
                </div>
                ${this.poolHTML(world)}
                <div class="flex items-center gap-2 px-1">
                    <span class="text-sm font-bold text-${col}-400">${wName}</span>
                    <span class="text-xs text-slate-500">${mine.length}キャラ</span>
                    <div class="flex-1"></div>
                    <button class="btn btn-xs btn-ghost gap-1" onclick="expPlan.fetchAll()"><i data-lucide="refresh-cw" class="w-3 h-3"></i>選んだキャラの Lv を取り直す</button>
                </div>
                <div class="space-y-2">${mine.map(ch => this.charHTML(ch, results.get(ch.id))).join('') || `<p class="text-sm text-slate-500 px-1">${wName} のキャラがいません</p>`}</div>
            </div>
            <div class="space-y-3 min-w-0">${this.resultHTML(results, st)}</div>
        </div>`;
        if (window.lucide) lucide.createIcons();
        this.drawChart(results);
    },

    poolHTML(world) {
        const pool = this.state.pool[world];
        const used = (kind, k) => kind === 'tix' ? this.tixUsed(world, k) : this.potUsed(world, k);
        const cell = (kind, id, label) => {
            const have = Number(pool[kind][id]) || 0, u = used(kind, id);
            return `<label class="expp-pool ${have ? 'has' : ''}">
                <span class="truncate">${label}</span>
                <input type="number" min="0" class="input input-xs font-mono w-14 text-right" value="${have}" onchange="expPlan.setPool('${world}','${kind}','${id}',this.value)">
                <span class="font-mono text-[10px] ${have && u >= have ? 'text-amber-400' : 'text-slate-500'} w-9 text-right">${have ? `${u}/${have}` : ''}</span>
            </label>`;
        };
        return `
        <details class="bg-base-100 border border-base-content/10 rounded-box overflow-hidden" ${this.poolOpen ? 'open' : ''} ontoggle="expPlan.poolOpen=this.open">
            <summary class="flex items-center gap-2 px-3 py-2 bg-base-200 cursor-pointer select-none">
                <i data-lucide="backpack" class="w-4 h-4 text-pink-400"></i>
                <span class="text-sm font-bold text-white">持ち物</span>
            </summary>
            <div class="p-3 space-y-3">
                <div class="space-y-1.5">
                    <div class="expp-lbl">農場チケット</div>
                    <div class="grid grid-cols-2 gap-1.5">${this.TIX.map(t => cell('tix', t.id, `${t.label}${t.minLv > 200 ? ` <span class="text-slate-500">${t.minLv}+</span>` : ''}`)).join('')}</div>
                </div>
                <div class="space-y-1.5 pt-3 border-t border-base-content/10">
                    <div class="expp-lbl">成長の秘薬</div>
                    <div class="grid grid-cols-2 gap-1.5">${EXP_POTION_TYPES.map(p => cell('pot', p.id, this.potName(p))).join('')}</div>
                </div>
            </div>
        </details>`;
    },

    charHTML(ch, res) {
        const c = this.cfg(ch.id);
        const L = this.LIMITS;
        const col = this.color(ch.server);
        const img = ch.image || ch.classImage || '';
        const lvNow = c.lv || ch.level;
        const fetching = this.fetching[ch.id];

        const head = `
            <div class="flex items-center gap-3">
                <input type="checkbox" class="toggle toggle-sm toggle-primary" title="計画に入れる" ${c.on ? 'checked' : ''} onchange="expPlan.toggleChar('${ch.id}')">
                <div class="w-9 h-9 shrink-0 rounded bg-base-300 overflow-hidden flex items-center justify-center">${img ? `<img src="${expEsc(img)}" class="w-full h-full object-cover object-top" onerror="this.style.display='none'">` : ''}</div>
                <div class="min-w-0 flex-1">
                    <div class="font-bold text-white truncate">${expEsc(ch.name)}</div>
                    <div class="text-[11px] text-slate-400 truncate">Lv ${ch.level} ${expEsc(ch.job || '')}</div>
                </div>
                ${c.on && res ? `<div class="text-right leading-tight">
                    <div class="text-[10px] text-slate-500">期日</div>
                    <div class="font-bold text-amber-300 font-mono">Lv ${res.endLv ?? '-'} <span class="text-xs text-slate-400">${res.endPct != null ? res.endPct.toFixed(1) + '%' : ''}</span></div>
                </div>` : ''}
            </div>`;
        if (!c.on) return `<div class="expp-char is-off border-l-${col}-400">${head}</div>`;

        const lvOpts = Array.from({ length: 100 }, (_, i) => 200 + i).map(l => `<option value="${l}"${l === lvNow ? ' selected' : ''}>${l}</option>`).join('');
        const tgOpts = Array.from({ length: 300 - Math.max(200, lvNow) }, (_, i) => Math.max(200, lvNow) + 1 + i)
            .map(l => `<option value="${l}"${l === c.target ? ' selected' : ''}>${l}</option>`).join('');
        const chip = (on, label, onclick, disabled, title) =>
            `<button type="button" class="expp-chip ${on ? 'on' : ''}" ${disabled ? 'disabled' : ''} title="${title || ''}" onclick="${onclick}">${label}</button>`;

        const monpaMax = Math.min(L.monpaPerChar, L.monpaPerWorld - this.monpaUsed(ch.server, ch.id));
        const monpaOpts = Array.from({ length: L.monpaPerChar + 1 }, (_, i) => `<option value="${i}"${i === c.monpa ? ' selected' : ''}${i > monpaMax ? ' disabled' : ''}>${i}</option>`).join('');
        const mpeFull = !c.mpe && this.mpeUsed(ch.server, ch.id) >= L.mpePerWorld;
        const epicOpts = `<option value="none"${c.epic === 'none' ? ' selected' : ''}>なし</option>` + this.epicDungeons().map(d => {
            const owner = this.epicOwner(d.id, ch.id);
            return `<option value="${d.id}"${d.id === c.epic ? ' selected' : ''}${owner ? ' disabled' : ''}>${d.name} ${d.lv}+${owner ? `（${expEsc(owner.name)}）` : ''}</option>`;
        }).join('');
        const tierOpts = [1, 5, 9].map(t => `<option value="${t}"${t === c.epicTier ? ' selected' : ''}>x${t}</option>`).join('');
        const burnOpts = this.BURNS.map(b => `<option value="${b.id}"${b.id === c.burn ? ' selected' : ''}>${b.label}</option>`).join('');

        const pool = this.state.pool[ch.server];
        const cntSel = (kind, id, label, cur) => {
            const have = Number(pool[kind][id]) || 0;
            if (!have) return '';
            const max = have - (kind === 'tix' ? this.tixUsed(ch.server, id, ch.id) : this.potUsed(ch.server, id, ch.id));
            const opts = Array.from({ length: have + 1 }, (_, i) => `<option value="${i}"${i === cur ? ' selected' : ''}${i > max ? ' disabled' : ''}>${i}</option>`).join('');
            return `<label class="expp-cnt ${cur ? 'on' : ''}"><span>${label}</span><select class="select select-xs font-mono w-14" onchange="expPlan.${kind === 'tix' ? 'setTix' : 'setPot'}('${ch.id}','${id}',this.value)">${opts}</select></label>`;
        };
        const tixItems = this.TIX.map(t => cntSel('tix', t.id, t.label, Number(c.tix[t.id]) || 0)).join('');
        const potItems = EXP_POTION_TYPES.map(p => cntSel('pot', p.id, this.potName(p), Number(c.pot[p.id]) || 0)).join('');

        // デイリーは地域ごと。区分の名前を押すとその区分をまとめて入れる／外す。
        const dailyHTML = this.DAILY_GROUPS.map(g => {
            const regs = expRegionData.filter(r => r.daily > 0 && g.test(r));
            const allOn = regs.every(r => !c.dailyOff.includes(r.id));
            return `<div class="flex flex-wrap items-center gap-1">
                <button type="button" class="expp-grp ${allOn ? 'on' : ''}" onclick="expPlan.toggleDailyGroup('${ch.id}','${g.id}')">${g.label}</button>
                ${regs.map(r => chip(!c.dailyOff.includes(r.id), this.REGION_SHORT[r.id] || r.name, `expPlan.toggleDaily('${ch.id}','${r.id}')`, false, `${r.name} Lv${r.lv}+`)).join('')}
            </div>`;
        }).join('');

        const fetchNote = fetching === 'loading' ? '<span class="loading loading-spinner loading-xs"></span>'
            : fetching === 'error' ? '<span class="text-[10px] text-red-400">取得できません</span>'
            : c.fetchedAt ? `<span class="text-[10px] text-slate-500">${new Date(c.fetchedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} 取得</span>` : '';

        return `
        <div class="expp-char border-l-${col}-400">
            ${head}
            <div class="expp-grid">
                <span class="expp-lbl">開始</span>
                <div class="flex flex-wrap items-center gap-1.5">
                    <select class="select select-xs font-mono w-16" onchange="expPlan.set('${ch.id}','lv',this.value)">${lvOpts}</select>
                    <label class="input input-xs font-mono w-24"><input type="number" step="0.01" min="0" max="99.99" value="${(Number(c.pct) || 0).toFixed(2)}" onchange="expPlan.set('${ch.id}','pct',this.value)">%</label>
                    <button class="btn btn-xs btn-ghost btn-square" title="Nexon ランキングから取得" onclick="expPlan.fetchLevel('${ch.id}')"><i data-lucide="download" class="w-3 h-3"></i></button>
                    ${fetchNote}
                    <span class="expp-lbl ml-3">目標</span>
                    <select class="select select-xs font-mono w-16" onchange="expPlan.set('${ch.id}','target',this.value)"><option value="0">-</option>${tgOpts}</select>
                </div>
                <span class="expp-lbl">バーニング</span>
                <div><select class="select select-xs w-56" onchange="expPlan.set('${ch.id}','burn',this.value)">${burnOpts}</select></div>
                <span class="expp-lbl self-start pt-1">デイリー</span>
                <div class="space-y-1">${dailyHTML}</div>
                <span class="expp-lbl">モンパ</span>
                <div class="flex flex-wrap items-center gap-1.5">
                    <select class="select select-xs font-mono w-14" onchange="expPlan.set('${ch.id}','monpa',this.value)">${monpaOpts}</select>
                    <span class="text-[11px] text-slate-500">回/日</span>
                </div>
                <span class="expp-lbl">毎週</span>
                <div class="flex flex-wrap items-center gap-1.5">
                    ${chip(c.weekly, 'アーケイン週課', `expPlan.toggle('${ch.id}','weekly')`)}
                    ${chip(c.mpe, 'モンパエクストリーム', `expPlan.toggle('${ch.id}','mpe')`, mpeFull, mpeFull ? `このワールドは週${L.mpePerWorld}キャラまで` : 'Lv260+')}
                </div>
                <span class="expp-lbl">エピダン</span>
                <div class="flex flex-wrap items-center gap-1.5">
                    <select class="select select-xs w-60" onchange="expPlan.set('${ch.id}','epic',this.value)">${epicOpts}</select>
                    ${c.epic !== 'none' ? `<select class="select select-xs font-mono w-14" onchange="expPlan.set('${ch.id}','epicTier',this.value)">${tierOpts}</select>
                    <label class="input input-xs font-mono w-24" title="基本EXPボーナス"><span class="text-slate-500">+</span><input type="number" min="0" step="10" value="${c.epicBonus}" onchange="expPlan.set('${ch.id}','epicBonus',this.value)">%</label>` : ''}
                </div>
                ${tixItems ? `<span class="expp-lbl">農場</span><div class="flex flex-wrap items-center gap-1.5">${tixItems}</div>` : ''}
                ${potItems ? `<span class="expp-lbl">秘薬</span><div class="flex flex-wrap items-center gap-1.5">${potItems}</div>` : ''}
            </div>
        </div>`;
    },

    resultHTML(results, st) {
        const rows = this.onChars().map(ch => ({ ch, r: results.get(ch.id) })).filter(x => x.r);
        if (!rows.length) {
            return `<div class="bg-base-100 border border-base-content/10 rounded-box flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
                <i data-lucide="chart-line" class="w-10 h-10 opacity-30"></i><p class="text-sm">左のキャラをオンにすると計算します</p></div>`;
        }
        rows.sort((a, b) => (a.ch.server === this.world ? 0 : 1) - (b.ch.server === this.world ? 0 : 1) || a.ch.server.localeCompare(b.ch.server) || b.r.endLv - a.r.endLv);
        const pct = v => v == null ? '' : `${v.toFixed(2)}%`;
        const body = rows.map(({ ch, r }) => {
            const col = this.color(ch.server);
            const total = Object.values(r.src).reduce((a, b) => a + b, 0) || 1;
            const bar = this.SRC.filter(s => r.src[s.id] > 0).map(s =>
                `<span style="width:${r.src[s.id] / total * 100}%;background:${s.color}" title="${s.label} ${expFmt(r.src[s.id])}（${(r.src[s.id] / total * 100).toFixed(0)}%）"></span>`).join('');
            const gained = r.endLv != null ? (r.endLv + r.endPct / 100) - (r.startLv + r.startPct / 100) : null;
            return `
            <tr>
                <td class="border-l-[3px] border-l-${col}-400"><div class="font-bold text-white">${expEsc(ch.name)}</div><div class="text-[10px] text-slate-500">${ch.server === 'CHALLENGER' ? 'Challenger' : 'Kronos'}</div></td>
                <td class="font-mono text-slate-300">Lv ${r.startLv}<div class="text-[10px] text-slate-500">${pct(r.startPct)}</div></td>
                <td class="font-mono"><span class="text-amber-300 font-bold text-base">Lv ${r.endLv ?? '-'}</span><div class="text-[10px] text-slate-400">${pct(r.endPct)}${gained != null ? ` <span class="text-emerald-400">+${gained.toFixed(2)}</span>` : ''}</div></td>
                <td class="font-mono">${r.target ? `Lv ${r.target}<div class="text-[10px] ${r.reach && r.reach <= st.end ? 'text-emerald-400' : 'text-slate-400'}">${r.reach ? expDate.short(r.reach) : '10年以上'}</div>` : '<span class="text-slate-600">-</span>'}</td>
                <td class="w-[34%]"><div class="expp-src">${bar}</div><div class="text-[10px] text-slate-500 mt-0.5 font-mono">${expFmt(total)} EXP</div></td>
            </tr>`;
        }).join('');
        const legend = this.SRC.map(s => `<span class="inline-flex items-center gap-1"><i class="w-2 h-2 rounded-sm inline-block" style="background:${s.color}"></i>${s.label}</span>`).join('');
        return `
        <div class="bg-base-100 border border-base-content/10 rounded-box overflow-hidden">
            <div class="flex items-center gap-2 px-3 py-2 bg-base-200 border-b border-base-content/10">
                <i data-lucide="flag" class="w-4 h-4 text-amber-400"></i>
                <span class="text-sm font-bold text-white">${expDate.short(st.end)} 時点</span>
                <div class="flex-1"></div>
                <div class="flex flex-wrap gap-2 text-[10px] text-slate-400">${legend}</div>
            </div>
            <div class="overflow-x-auto">
                <table class="table table-sm expp-result">
                    <thead><tr><th>キャラ</th><th>開始</th><th>期日</th><th>目標</th><th>期間中の EXP の内訳</th></tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        </div>
        <div class="bg-base-100 border border-base-content/10 rounded-box overflow-hidden">
            <div class="flex items-center gap-2 px-3 py-2 bg-base-200 border-b border-base-content/10">
                <i data-lucide="chart-line" class="w-4 h-4 text-indigo-400"></i>
                <span class="text-sm font-bold text-white">Lv の推移</span>
            </div>
            <div class="p-3 h-[340px]"><canvas id="expp-chart"></canvas></div>
        </div>`;
    },

    drawChart(results) {
        const cv = document.getElementById('expp-chart');
        if (this.chart) { this.chart.destroy(); this.chart = null; }
        if (!cv || typeof Chart === 'undefined') return;
        const palette = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#c084fc', '#f87171', '#a3e635', '#fb923c', '#94a3b8'];
        const list = this.onChars().filter(ch => results.get(ch.id));
        const labels = (results.get(list[0]?.id)?.series || []).map(p => p.x);
        const datasets = list.map((ch, i) => ({
            label: ch.name,
            data: results.get(ch.id).series.map(p => p.y),
            borderColor: palette[i % palette.length],
            backgroundColor: palette[i % palette.length],
            borderWidth: ch.server === this.world ? 2 : 1,
            borderDash: ch.server === this.world ? [] : [4, 3],
            pointRadius: 0, tension: 0.15,
        }));
        this.chart = new Chart(cv, {
            type: 'line',
            data: { labels: labels.map(d => expDate.short(d)), datasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 11 } } },
                    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: Lv ${Math.floor(ctx.parsed.y)} ${((ctx.parsed.y % 1) * 100).toFixed(1)}%` } },
                },
                scales: {
                    x: { ticks: { color: '#64748b', maxTicksLimit: 10, font: { size: 10 } }, grid: { color: 'rgba(148,163,184,0.08)' } },
                    y: { ticks: { color: '#94a3b8', precision: 0, font: { size: 10 } }, grid: { color: 'rgba(148,163,184,0.12)' } },
                },
            },
        });
    },
};
