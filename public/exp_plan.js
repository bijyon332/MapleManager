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
        { id: 'daily', label: 'デイリー（全地域）', color: '#34d399' },
        { id: 'darc', label: 'デイリー（アーケイン）', color: '#6ee7b7' },
        { id: 'dgrand', label: 'デイリー（グランディス）', color: '#10b981' },
        { id: 'weekly', label: '週課（アーケイン）', color: '#22d3ee' },
        { id: 'th', label: 'トレジャーハンター', color: '#e879f9' },
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
        return this.sum(this.list, target, ymd);
    },
    // バフの並び（list）から、その日・その対象の％の合計（ウルティマの計画も同じ形の並びを使う）
    sum(list, target, ymd) {
        let s = 0;
        for (const b of list) {
            if (b.target !== target || !b.start) continue;
            if (ymd < b.start || (b.end && ymd > b.end)) continue;
            s += Number(b.pct) || 0;
        }
        return s;
    },
    // デイリーは「全地域」に、地域の側（アーケインリバー＝Lv255 以下の地域／グランディス＝セルニウム以降）の分を足す
    dailyPct(region, ymd) { return this.pct('daily', ymd) + this.pct(region.lv <= 255 ? 'darc' : 'dgrand', ymd); },
    target(id) { return this.TARGETS.find(t => t.id === id) || this.TARGETS[0]; },
    // 一覧が変わったら、それを読んでいる計画（アカウント計画・ウルティマ）を描き直す
    changed() {
        expPlan.onBuffsChanged();
        if (typeof expUltima !== 'undefined') expUltima.onBuffsChanged();
    },

    add() {
        const t = expDate.today();
        this.list.push({ id: 'b' + Date.now(), target: 'monpa', pct: 50, start: t, end: expDate.add(t, 6), memo: '' });
        this.save(); this.render(); expBuffs.changed();
    },
    remove(id) {
        this.list = this.list.filter(b => b.id !== id);
        this.save(); this.render(); expBuffs.changed();
    },
    set(id, field, value) {
        const b = this.list.find(x => x.id === id);
        if (!b) return;
        b[field] = field === 'pct' ? Math.max(0, Number(value) || 0) : value;
        if (b.start && b.end && b.end < b.start) b.end = b.start;
        this.save(); this.render(); expBuffs.changed();
    },

    // ---- 共有（書き出し・読み込み） ----
    // 形式: { app: 'mm-exp-buffs', version: 1, buffs: [{ target, pct, start, end, memo }] }。
    // id は受け取った側で振り直すので書き出さない。Discord などにそのまま貼れるよう1行の JSON にする。
    importOpen: false,
    msg: '',
    exportText() {
        this.ensure();
        const buffs = [...this.list].sort((a, b) => (a.start || '').localeCompare(b.start || ''))
            .map(b => ({ target: b.target, pct: Number(b.pct) || 0, start: b.start || '', end: b.end || '', memo: b.memo || '' }));
        return JSON.stringify({ app: 'mm-exp-buffs', version: 1, buffs });
    },
    copyExport() {
        if (!this.list.length) { this.flash('書き出すバフがありません'); return; }
        const text = this.exportText();
        const done = () => this.flash(`${this.list.length}件をコピーしました。Discord などに貼って共有できます`);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => { this.fallbackCopy(text); done(); });
        else { this.fallbackCopy(text); done(); }
    },
    fallbackCopy(text) {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* 何もしない */ } ta.remove();
    },
    downloadExport() {
        if (!this.list.length) { this.flash('書き出すバフがありません'); return; }
        const blob = new Blob([this.exportText()], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `exp-buffs-${expDate.today()}.json`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    // 貼られた文字から読める分だけ取り出す（前後の文や ``` で囲まれていても JSON 部分を拾う）
    parseImport(text) {
        const t = String(text || '');
        const i = t.search(/[\[{]/);
        if (i < 0) return null;
        const j = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
        let v;
        try { v = JSON.parse(t.slice(i, j + 1)); } catch (e) { return null; }
        const arr = Array.isArray(v) ? v : (v && Array.isArray(v.buffs) ? v.buffs : null);
        if (!arr) return null;
        const ok = this.TARGETS.map(x => x.id);
        const ymd = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '';
        return arr.filter(b => b && ok.includes(b.target) && ymd(b.start)).map(b => {
            const start = ymd(b.start); let end = ymd(b.end);
            if (end && end < start) end = start;
            return { target: b.target, pct: Math.max(0, Number(b.pct) || 0), start, end, memo: String(b.memo || '').slice(0, 100) };
        });
    },
    toggleImport() { this.importOpen = !this.importOpen; this.msg = ''; this.render(); if (this.importOpen) document.getElementById('expb-import-text')?.focus(); },
    importFile(input) {
        const f = input.files && input.files[0];
        if (!f) return;
        f.text().then(t => { const ta = document.getElementById('expb-import-text'); if (ta) ta.value = t; this.flash('ファイルを読み込みました。追加か入れ替えを選んでください'); const ta2 = document.getElementById('expb-import-text'); if (ta2) ta2.value = t; });
        input.value = '';
    },
    // replace=false は今の一覧に足す（対象・％・期間が同じものは足さない）。true は今の一覧と入れ替える。
    doImport(replace, text) {
        const src = text ?? document.getElementById('expb-import-text')?.value;
        const got = this.parseImport(src);
        if (!got) { this.flash('読み込めませんでした。書き出した文字をそのまま貼ってください'); return; }
        if (!got.length) { this.flash('読み込めるバフがありませんでした'); return; }
        this.ensure();
        if (replace && this.list.length && !confirm(`今の一覧（${this.list.length}件）を消して、${got.length}件に入れ替えます。よろしいですか？`)) return;
        const sig = b => [b.target, Number(b.pct) || 0, b.start, b.end || ''].join('|');
        const have = new Set(replace ? [] : this.list.map(sig));
        const base = replace ? [] : this.list;
        let added = 0, n = Date.now();
        for (const b of got) {
            if (have.has(sig(b))) continue;
            have.add(sig(b));
            base.push({ id: 'b' + (n++), ...b });
            added++;
        }
        this.list = base;
        this.save();
        this.importOpen = false;
        const skipped = got.length - added;
        this.flash(replace ? `${added}件に入れ替えました` : `${added}件を追加しました${skipped ? `（同じもの${skipped}件は飛ばしました）` : ''}`);
        expBuffs.changed();
    },
    flash(m) {
        this.msg = m;
        this.render();
        clearTimeout(this._msgT);
        this._msgT = setTimeout(() => { this.msg = ''; const el = document.getElementById('expb-msg'); if (el) el.textContent = ''; }, 5000);
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
                <td><select class="select select-sm w-52" onchange="expBuffs.set('${b.id}','target',this.value)">${opt(b.target)}</select></td>
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
                    <span class="text-sm font-bold text-white">イベントバフ</span>
                    <span class="text-[11px] text-slate-500 flex-1">${lo === hi ? '' : `${expDate.short(lo)} 〜 ${expDate.short(hi)}`}</span>
                    <span id="expb-msg" class="text-[11px] text-emerald-400">${expEsc(this.msg)}</span>
                    <button class="btn btn-xs gap-1" onclick="expBuffs.copyExport()" title="一覧を文字にしてコピーします。Discord などに貼って共有できます"><i data-lucide="copy" class="w-3 h-3"></i>共有用にコピー</button>
                    <button class="btn btn-xs btn-square" onclick="expBuffs.downloadExport()" title="JSON ファイルで保存"><i data-lucide="download" class="w-3 h-3"></i></button>
                    <button class="btn btn-xs gap-1 ${this.importOpen ? 'btn-primary' : ''}" onclick="expBuffs.toggleImport()"><i data-lucide="clipboard-paste" class="w-3 h-3"></i>読み込み</button>
                </div>
                ${this.importOpen ? `
                <div class="p-3 border-b border-base-content/10 bg-base-200/50 space-y-2">
                    <textarea id="expb-import-text" class="textarea textarea-sm w-full font-mono h-20" placeholder="共有されたバフの文字（{&quot;app&quot;:&quot;mm-exp-buffs&quot;,…}）をここに貼る"></textarea>
                    <div class="flex items-center gap-2">
                        <button class="btn btn-sm btn-primary" onclick="expBuffs.doImport(false)">今の一覧に追加</button>
                        <button class="btn btn-sm" onclick="expBuffs.doImport(true)">今の一覧と入れ替え</button>
                        <label class="btn btn-sm btn-ghost gap-1"><i data-lucide="file-up" class="w-3.5 h-3.5"></i>ファイルから<input type="file" accept=".json,application/json,text/plain" class="hidden" onchange="expBuffs.importFile(this)"></label>
                        <span class="flex-1"></span>
                        <button class="btn btn-sm btn-ghost" onclick="expBuffs.toggleImport()">閉じる</button>
                    </div>
                </div>` : ''}
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
    // 同じ仕組みでウルティマ専用の計画（exp_ultima.js の expUltima）も作るので、
    // 画面の onclick の呼び先・要素の id・保存キーはここで持つ
    NS: 'expPlan',
    ID: 'expp',
    ROOT: 'exp-tab-plan',
    WORLD_NAV: 'exp-world-nav',
    KEY_PREFIX: 'mm-exp-plan::',
    tab: 'sim',
    picking: null, // キャラ選択の画面を開いているワールド（null で閉じている）
    world: 'ALL', // 'ALL'（両方）／'KRONOS'／'CHALLENGER'。入力欄に出すワールド
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
        { id: 'authentic', label: 'オーセンティック', test: r => r.lv >= 260 && r.lv <= 285 },
        { id: 'grand', label: 'グランドオーセンティック', test: r => r.lv >= 290 },
    ],
    TIX: [
        { id: 'straw', icon: 'assets/exp/farm-straw.png', label: 'いちご農場', minLv: 200, note: '1回' },
        { id: 'blue', icon: 'assets/exp/farm-blue.png', label: 'ブルーベリー', minLv: 260, note: '枚' },
        { id: 'mecha', icon: 'assets/exp/farm-mecha.png', label: 'メカいちご', minLv: 280, note: '1回' },
        { id: 'crimson', icon: 'assets/exp/farm-crimson.png', label: 'クリムゾン', minLv: 280, note: '枚' },
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
        { id: 'hunt', label: '狩り', color: '#fb923c' },
        { id: 'th', label: 'トレハン', color: '#e879f9' },
        { id: 'sauna', label: 'サウナ', color: '#a3e635' },
    ],
    TH_PER_DAY: 10, // トレジャーハンターの箱は1キャラ1日10箱まで
    SAUNA_PER_DAY: 8, // 放置マップは1日8時間まで（bi 指定）。実際に1日何時間使うかは state.saunaDay（アカウント共有、既定は上限）
    // 入力欄の見出しのアイコン（GMS のアイテム画像。public/assets/exp/）。画像がないものは lucide
    ICON: {
        daily: { img: 'assets/exp/sym-r1.png' }, weekly: { img: 'assets/exp/sym-r4.png' },
        monpa: { img: 'assets/exp/monpa.png' }, mpe: { img: 'assets/exp/mpe.png' },
        epic: { lucide: 'castle' }, farm: { img: 'assets/exp/farm.png' }, potion: { img: 'assets/exp/potion.png' },
        hunt: { lucide: 'swords' }, th: { lucide: 'gem' }, sauna: { img: 'assets/exp/sauna.png' },
        start: { lucide: 'flag' }, burn: { lucide: 'flame' },
    },
    // デイリーの地域のシンボル（テネブリスはシンボルがないので出さない）
    REGION_ICON: {
        r1: 'assets/exp/sym-r1.png', r2: 'assets/exp/sym-r2.png', r3: 'assets/exp/sym-r3.png', r4: 'assets/exp/sym-r4.png', r5: 'assets/exp/sym-r5.png', r6: 'assets/exp/sym-r6.png',
        r11: 'assets/scouter/symbol/cernium.png', r12: 'assets/scouter/symbol/arcus.png', r13: 'assets/scouter/symbol/odium.png', r14: 'assets/scouter/symbol/shangrila.png',
        r15: 'assets/scouter/symbol/arteria.png', r16: 'assets/scouter/symbol/carcion.png', r17: 'assets/scouter/symbol/tallahart.png', r18: 'assets/scouter/symbol/geardock.png',
    },
    srcColor(id) { const s = this.SRC.find(x => x.id === id); return s ? s.color : '#818cf8'; },
    iconHTML(key, cls = 'expp-ico') {
        const ic = this.ICON[key];
        if (!ic) return '';
        return ic.img ? `<img src="${ic.img}" class="${cls}" alt="">` : `<i data-lucide="${ic.lucide}" class="${cls}"></i>`;
    },
    // 行の見出し（内訳と同じ色＋アイコン）
    rowLbl(key, text, extra = '') {
        const col = this.SRC.some(x => x.id === key) ? this.srcColor(key) : '#94a3b8';
        return `<span class="expp-lbl expp-row ${extra}" style="--c:${col}">${this.iconHTML(key)}<span>${text}</span></span>`;
    },
    // 太字にしても幅が変わらないラベル（太字の幅を先に取っておく）
    stableText(html, plain) {
        const t = (plain != null ? plain : String(html).replace(/<[^>]*>/g, '')).replace(/"/g, '&quot;');
        return `<span class="expp-t" data-t="${t}"><span>${html}</span></span>`;
    },

    init() {
        expBuffs.load();
        this.setTab(this.savedTab() || 'sim');
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.picking) this.closePicker(); });
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

    normWorld(w) { return w === 'KRONOS' || w === 'CHALLENGER' ? w : 'ALL'; },
    shownWorlds() { return this.WORLDS.map(w => w.id).filter(id => this.world === 'ALL' || this.world === id); },
    setWorld(w) {
        this.world = this.normWorld(w);
        if (this.state) { this.state.view = this.world; this.save(); }
        this.syncWorldNav();
        this.render();
    },

    syncWorldNav() {
        document.querySelectorAll(`#${this.WORLD_NAV} [data-world]`).forEach(b => b.classList.toggle('tab-active', b.dataset.world === this.world));
    },

    visible() { return this.tab === 'plan'; },
    onBuffsChanged() { if (this.visible()) this.render(); },
    // その日のイベントバフ（％）。アカウント計画はイベントバフ一覧をそのまま使う
    buffPct(target, ymd) { return expBuffs.pct(target, ymd); },
    buffDaily(region, ymd) { return this.buffPct('daily', ymd) + this.buffPct(region.lv <= 255 ? 'darc' : 'dgrand', ymd); },
    // その日に手に入るもの（ウルティマのパスなど）。アカウント計画にはない
    arrivals(ch, ymd, lv, memo) { return null; },
    // 入力欄の上・結果の下に足す欄（ウルティマのパスなど）。アカウント計画にはない
    extraTopHTML() { return ''; },
    extraResultHTML() { return ''; },
    // ウルティマで足すもの（クアナに移すキャラと後を継ぐキャラ）。アカウント計画にはない
    stopAfter(ch, ymd, lv) { return false; },
    extraResults(results, st) {},
    planChars(world) { return this.onChars(world); },
    worldExtraHTML(world, results) { return ''; },
    rowNote(ch, r) { return ''; },

    // ---------- 保存 ----------
    key() {
        const k = (window.app && typeof app.plannerKey === 'function') ? app.plannerKey() : 'default';
        return this.KEY_PREFIX + k;
    },
    load() {
        const key = this.key();
        if (this.state && this.stateKey === key) return;
        let s = null;
        try { s = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { s = null; }
        if (!s) s = this.seed();
        const t = expDate.today();
        this.state = Object.assign({ start: t, end: expDate.add(t, 27), world: 'KRONOS', chars: {}, pool: {} }, s || {});
        this.WORLDS.forEach(w => { this.state.pool[w.id] = Object.assign({ tix: {}, pot: {} }, this.state.pool[w.id] || {}); });
        // VIP サウナの時間はアカウント共有。前の版のワールドごとの時間は合計して引き継ぐ
        if (this.state.sauna == null) this.state.sauna = this.WORLDS.reduce((a, w) => a + (Number(this.state.pool[w.id].sauna) || 0), 0);
        this.WORLDS.forEach(w => { delete this.state.pool[w.id].sauna; });
        this.stateKey = key;
        // 表示は view（既定は両方）。以前の world（Kronos／Challenger の二択）は引き継がない
        this.world = this.normWorld(this.state.view);
        this.afterLoad();
    },
    // 保存がないときの最初の中身（ウルティマはアカウント計画から写す）と、読み込んだあとの調整
    seed() { return null; },
    afterLoad() {},
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
            dailyOn: null, weekly: true,
            monpa: 0, mpe: false, epic: 'none', burn: 'none',
            tix: {}, pot: {},
            hunt: null, sauna: 0, th: 0,
        };
        for (const k of Object.keys(def)) if (c[k] === undefined) c[k] = def[k];
        // デイリーは地域ごとに選ぶ（選んだ地域の id を持つ）。デイリーの EXP はワールド内で1日1回しか
        // 受け取れないので、同じ地域はワールドで1キャラまで（normalize で重複を外す）。
        // 前の版（外した地域を持つ dailyOff／3区分の daily）から引き継ぐ。
        if (!Array.isArray(c.dailyOn)) {
            const off = Array.isArray(c.dailyOff) ? c.dailyOff : null, old = c.daily || {};
            c.dailyOn = (off || c.daily) ? expRegionData.filter(r => r.daily > 0 && (off ? !off.includes(r.id) : !(old.arcane === false && r.lv <= 235) && !(old.tenebris === false && r.lv >= 245 && r.lv <= 255) && !(old.grandis === false && r.lv >= 260))).map(r => r.id) : [];
            delete c.dailyOff; delete c.daily;
        }
        return c;
    },

    // ---------- 共有の上限 ----------
    onChars(world) { return this.characters().filter(ch => (!world || ch.server === world) && this.cfg(ch.id).on); },
    monpaUsed(world, exceptId) { return this.onChars(world).filter(ch => ch.id !== exceptId).reduce((s, ch) => s + (Number(this.cfg(ch.id).monpa) || 0), 0); },
    mpeUsed(world, exceptId) { return this.onChars(world).filter(ch => ch.id !== exceptId && this.cfg(ch.id).mpe).length; },
    // そのワールドでほかのキャラが選んでいるデイリーの地域
    dailyTaken(world, exceptId) {
        const set = new Set();
        this.onChars(world).forEach(ch => { if (ch.id !== exceptId) this.cfg(ch.id).dailyOn.forEach(r => set.add(r)); });
        return set;
    },
    epicDungeons() { return EPIC_DUNGEONS.filter(d => d.gms); },
    epicOwner(dgId, exceptId) { return this.onChars().find(ch => ch.id !== exceptId && this.cfg(ch.id).epic === dgId) || null; },
    tixUsed(world, k, exceptId) { return this.onChars(world).filter(ch => ch.id !== exceptId).reduce((s, ch) => s + (Number(this.cfg(ch.id).tix[k]) || 0), 0); },
    saunaUsed(exceptId) { return this.onChars().filter(ch => ch.id !== exceptId).reduce((s, ch) => s + (Number(this.cfg(ch.id).sauna) || 0), 0); },
    potUsed(world, k, exceptId) { return this.onChars(world).filter(ch => ch.id !== exceptId).reduce((s, ch) => s + (Number(this.cfg(ch.id).pot[k]) || 0), 0); },

    // 持ち物を減らしたときなどに、上限を超えた割り当てを後ろのキャラから削る
    normalize() {
        const L = this.LIMITS;
        this.WORLDS.forEach(w => {
            const pool = this.state.pool[w.id];
            let monpa = 0, mpe = 0;
            const tix = {}, pot = {}, daily = new Set();
            this.onChars(w.id).forEach(ch => {
                const c = this.cfg(ch.id);
                c.dailyOn = c.dailyOn.filter(r => !daily.has(r));
                c.dailyOn.forEach(r => daily.add(r));
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
        // VIP サウナはアカウントの時間から割り当てる（多すぎる分は後ろのキャラから削る）
        let sauna = 0;
        this.onChars().forEach(ch => {
            const c = this.cfg(ch.id);
            c.sauna = Math.max(0, Math.min(Number(c.sauna) || 0, (Number(this.state.sauna) || 0) - sauna));
            sauna += c.sauna;
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
    openPicker(world) { this.picking = world; this.render(); },
    closePicker() { this.picking = null; this.render(); },
    toggleChar(id) {
        const c = this.cfg(id);
        c.on = !c.on;
        if (c.on) {
            const ch = this.characters().find(x => x.id === id);
            // 入れ直したキャラの古い選択が、ほかのキャラの選択を押しのけないようにする
            if (ch) {
                const taken = this.dailyTaken(ch.server, id);
                c.dailyOn = c.dailyOn.filter(r => !taken.has(r));
                if (c.epic !== 'none' && this.epicOwner(c.epic, id)) c.epic = 'none';
            }
            // 入れたときはモンパを残りの回数から埋める
            if (ch && !c.monpa) c.monpa = Math.min(this.LIMITS.monpaPerChar, Math.max(0, this.LIMITS.monpaPerWorld - this.monpaUsed(ch.server, id)));
            if (ch && c.target == null) c.target = Math.min(300, Math.max(ch.level, 200) + 5);
        }
        this.commit();
        if (c.on && !c.fetchedAt) this.fetchLevel(id);
    },
    set(id, field, value) {
        const c = this.cfg(id);
        if (field === 'lv' || field === 'target' || field === 'monpa') c[field] = Number(value) || 0;
        else if (field === 'pct') c.pct = Math.max(0, Math.min(99.9999, Number(value) || 0));
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
        c.dailyOn = c.dailyOn.includes(rid) ? c.dailyOn.filter(x => x !== rid) : [...c.dailyOn, rid];
        this.commit();
    },
    // 区分の名前を押すと、ほかのキャラが取っていない地域をまとめて入れる／外す
    toggleDailyGroup(id, gid) {
        const c = this.cfg(id);
        const ch = this.characters().find(x => x.id === id);
        const taken = this.dailyTaken(ch.server, id);
        const g = this.DAILY_GROUPS.find(x => x.id === gid);
        const ids = expRegionData.filter(r => r.daily > 0 && g.test(r) && !taken.has(r.id)).map(r => r.id);
        const allOn = ids.length && ids.every(r => c.dailyOn.includes(r));
        c.dailyOn = allOn ? c.dailyOn.filter(x => !ids.includes(x)) : [...new Set([...c.dailyOn, ...ids])];
        this.commit();
    },
    setTix(id, k, v) { this.cfg(id).tix[k] = Number(v) || 0; this.commit(); },
    setPot(id, k, v) { this.cfg(id).pot[k] = Number(v) || 0; this.commit(); },
    setHunt(id, k, v) {
        const c = this.cfg(id);
        c.hunt = this.huntCfg(c);
        c.hunt[k] = Math.max(0, Number(v) || 0);
        this.commit();
    },
    // 狩りの設定。経験値はステータス画面の「+N%」で持つ（倍率 = (100 + N) ÷ 100）。前の版の倍率（mult）から引き継ぐ
    huntCfg(c) {
        const h = Object.assign({ kills: 0, hours: 0, pct: 0 }, c.hunt || {});
        if (h.mult != null) { if (!c.hunt || c.hunt.pct == null) h.pct = Math.max(0, Math.round((Number(h.mult) - 1) * 100)); delete h.mult; }
        return h;
    },
    // トレジャーハンター: 1日に開ける箱の数（10箱まで）
    setTh(id, v) { this.cfg(id).th = Math.max(0, Math.min(this.TH_PER_DAY, Math.floor(Number(v) || 0))); this.commit(); },
    setSauna(id, v) { this.cfg(id).sauna = Math.max(0, Number(v) || 0); this.commit(); },
    setPoolSauna(v) { this.state.sauna = Math.max(0, Math.round((Number(v) || 0) * 2) / 2); this.commit(); },
    // 1日に使うサウナの時間（アカウント全体、0.5 時間単位、上限 8 時間）
    saunaPerDay() { const v = Number(this.state.saunaDay); return v > 0 ? Math.min(this.SAUNA_PER_DAY, Math.round(v * 2) / 2) : this.SAUNA_PER_DAY; },
    setSaunaDay(v) { this.state.saunaDay = Math.max(0.5, Math.min(this.SAUNA_PER_DAY, Math.round((Number(v) || 0) * 2) / 2)); this.commit(); },
    // サウナの日ごとの割り当て。時間はアカウントで共有し、同時に入れるのは1キャラなので、1日の時間（saunaPerDay）をアカウントで分け合う。
    // キャラの並び順（Kronos → Challenger、各ワールドは Lv の高い順）に、開始日から空いている時間を前から埋める。
    // 戻り値: キャラ id → 開始日からの日ごとの時間の配列
    saunaSchedule() {
        const used = [], out = {}, perDay = this.saunaPerDay();
        const order = this.WORLDS.flatMap(w => this.onChars(w.id).sort((a, b) => b.level - a.level));
        order.forEach(ch => {
            let left = Number(this.cfg(ch.id).sauna) || 0;
            const days = [];
            for (let d = 0; left > 0 && d < 3650; d++) {
                const free = perDay - (used[d] || 0);
                const h = Math.min(free, left);
                days[d] = h > 0 ? h : 0;
                if (h > 0) { used[d] = (used[d] || 0) + h; left -= h; }
            }
            out[ch.id] = days;
        });
        this._saunaUsedDays = used; // 日ごとにアカウントで使う時間（途中でもらうサウナ券は、この空きで使う）
        return out;
    },
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
    fetchAll(world) { this.onChars(world || null).filter(ch => this.shownWorlds().includes(ch.server)).forEach(ch => this.fetchLevel(ch.id)); },

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
            src[key] = (src[key] || 0) + amt;
            total += amt;
            exp += amt;
            while (lv < 300 && tnlData[lv] && exp >= tnlData[lv]) {
                exp -= tnlData[lv];
                lv = burn(lv + 1);
            }
            if (lv >= 300) exp = 0;
        };
        // 長いコンテンツは分けて足し、途中のレベルアップで表を引き直す
        const gain = (fn, key, parts = 1) => { for (let i = 0; i < parts; i++) add(fn(lv) / parts, key); };

        // 持ち物（農場・秘薬・交換券）を使った記録。日付・何を何個・増えた EXP・使う前後の Lv（小数で EXP% を表す）
        let total = 0, day = start;
        const log = [];
        const lvNow = () => lv >= 300 ? 300 : lv + exp / tnlData[lv];
        const record = (kind, label, n, fn) => {
            const from = lvNow(), t0 = total;
            fn();
            if (total > t0) log.push({ ymd: day, kind, label, n, exp: total - t0, from, to: lvNow() });
        };
        const pendTix = this.TIX.map(t => ({ ...t, n: Number(c.tix[t.id]) || 0 }));
        const pendPot = EXP_POTION_TYPES.map(p => ({ ...p, n: Number(c.pot[p.id]) || 0 }));
        let pendCoupon = 0, pendSauna = 0;
        const got0 = {}; // arrivals がもらい済みを覚えておく場所（このシミュレーションの間だけ）
        // 途中で手に入るもの（ウルティマのパスの報酬）を、もらった日に持ち物に足す
        const receive = (ymd) => {
            const got = this.arrivals(ch, ymd, lv, got0);
            if (!got) return;
            const parts = [];
            if (got.coupon) parts.push(`交換券 ${got.coupon.toLocaleString()}`);
            if (got.sauna) parts.push(`サウナ ${got.sauna}時間`);
            for (const [k, n] of Object.entries(got.tix || {})) if (n) parts.push(`${(this.TIX.find(x => x.id === k) || {}).label || k} ${n}`);
            for (const [k, n] of Object.entries(got.pot || {})) { const pt = EXP_POTION_TYPES.find(x => x.id === k); if (n) parts.push(`秘薬 ${pt ? this.potName(pt) : k} ${n}`); }
            if (parts.length) log.push({ ymd, kind: 'recv', label: (got.from ? got.from + ': ' : '') + parts.join('・'), n: 0, exp: 0, from: lvNow(), to: lvNow() });
            for (const [k, n] of Object.entries(got.tix || {})) { const t = pendTix.find(x => x.id === k); if (t) t.n += n; }
            for (const [k, n] of Object.entries(got.pot || {})) { const p = pendPot.find(x => x.id === k); if (p) p.n += n; }
            pendCoupon += got.coupon || 0;
            pendSauna += got.sauna || 0;
        };
        // 上級EXP交換券は、使える Lv（260）になっていればもらった日に全部使う。100枚ずつ足して途中のレベルアップで量を引き直す
        const useCoupon = () => {
            if (!(pendCoupon > 0 && lv >= 260 && lv < 300)) return;
            const n = pendCoupon;
            record('coupon', '上級EXP交換券', n, () => {
                while (pendCoupon > 0 && lv >= 260 && lv < 300) {
                    const k = Math.min(100, pendCoupon);
                    add(expCouponExp(lv) * k, 'coupon');
                    pendCoupon -= k;
                }
            });
        };
        const useTix = () => {
            for (const t of pendTix) {
                if (!t.n || lv < t.minLv) continue;
                record('farm', `農場 ${t.label}`, t.n, () => {
                    for (; t.n > 0; t.n--) {
                        if (t.id === 'straw') gain(l => (farmTable[l] || 0) * 1000, 'farm', 10);
                        if (t.id === 'blue') gain(l => blueberryFarmTable[l] || 0, 'farm', 10);
                        if (t.id === 'mecha') gain(l => (mechaFarmTable[l] || 0) * 1000, 'farm', 10);
                        if (t.id === 'crimson') gain(l => crimsonMechaFarmTable[l] || 0, 'farm', 10);
                    }
                });
            }
        };
        // 秘薬は全部使い切ってちょうど上限 Lv を越えるように使う（1本で1Lv なので、上限 Lv から本数分さかのぼった Lv で使い始める。
        // 例: 〜259 が3本なら Lv257 で使う）。そこまで届かなくても期日には使い切る。
        const usePot = (ymd) => {
            for (const p of pendPot) {
                if (!p.n || lv < p.minLv) continue;
                if (lv < p.capLv - p.n + 1 && ymd !== end) continue;
                record('potion', `秘薬 ${this.potName(p)}`, p.n, () => { for (; p.n > 0; p.n--) add(tnlData[Math.min(lv, p.capLv)] || 0, 'potion'); });
            }
        };
        // 週1のコンテンツは、その週の残りの日でいちばんバフが大きい日にやる
        const bestDay = (key, ymd, startDow) => {
            const now = this.buffPct(key, ymd);
            const last = expDate.weekEnd(ymd, startDow);
            for (let d = expDate.add(ymd, 1); d <= last; d = expDate.add(d, 1)) if (this.buffPct(key, d) > now) return false;
            return true;
        };

        const dailies = expRegionData.filter(r => r.daily > 0 && c.dailyOn.includes(r.id));
        const hunt = this.huntCfg(c), huntMult = 1 + (Number(hunt.pct) || 0) / 100;
        const huntH = Number(hunt.hours) || 0;
        const thN = Number(c.th) || 0;
        const saunaDays = (this._saunaSched && this._saunaSched[ch.id]) || [];
        let dayIdx = -1;
        const done = { mpe: null, epic: null, weekly: new Set() };
        const series = [];
        let endSrc = null;
        let endLv = null, endPct = null, reach = (target && lv >= target) ? start : null;
        const reachAt = {};
        let reachLv = lv, stopped = null;
        const startLv = lv, startPct = exp / tnlData[lv] * 100;
        const limit = expDate.add(start, 3650);

        for (let ymd = start; ymd <= limit; ymd = expDate.add(ymd, 1)) {
            if (ymd > end && (!target || reach || lv >= 300)) break;
            day = ymd;
            const dow = expDate.dow(ymd);
            const thuWeek = expDate.weekEnd(ymd, 4), monWeek = expDate.weekEnd(ymd, 1);
            if (done.mpe && done.mpe !== thuWeek) done.mpe = null;
            if (done.epic && done.epic !== thuWeek) done.epic = null;
            if (done.weeklyWeek !== monWeek) { done.weekly.clear(); done.weeklyWeek = monWeek; }

            receive(ymd);
            useTix();
            useCoupon();

            dailies.forEach(r => { if (lv >= r.lv) add(r.daily * (1 + this.buffDaily(r, ymd) / 100), 'daily'); });

            if (c.weekly && bestDay('weekly', ymd, 1)) {
                const bW = this.buffPct('weekly', ymd) / 100;
                arcaneWeeklyData.forEach(w => {
                    if (done.weekly.has(w.id) || lv < w.lv) return;
                    add(w.exp * (1 + bW), 'weekly');
                    done.weekly.add(w.id);
                });
            }

            const monpaMult = 1 + (dow === 0 ? 0.5 : 0) + this.buffPct('monpa', ymd) / 100;
            for (let i = 0; i < (Number(c.monpa) || 0); i++) {
                const regs = expRegionData.filter(r => r.lv <= lv && r.monpa > 0);
                if (!regs.length) break;
                add(regs[regs.length - 1].monpa * monpaMult, 'monpa');
            }

            if (c.mpe && !done.mpe && lv >= 260 && bestDay('mpe', ymd, 4)) {
                const b = this.buffPct('mpe', ymd) / 100;
                gain(l => (mpeTable[l] || 0) * (1 + b), 'mpe');
                done.mpe = thuWeek;
            }

            if (c.epic !== 'none' && !done.epic && bestDay('epic', ymd, 4)) {
                const dg = this.epicDungeons().find(d => d.id === c.epic);
                if (dg && lv >= dg.lv) {
                    gain(l => (epicDungeonBase[l] || 0) * (1 + this.buffPct('epic', ymd) / 100) * dg.mult, 'epic');
                    done.epic = thuWeek;
                }
            }

            // 狩りは、その日のデイリー・週課のコンテンツを全部やったあと。自分の Lv の敵を倒す想定で、
            // 1時間ずつ足して途中のレベルアップで敵の EXP を引き直す
            if (huntH > 0 && hunt.kills > 0) {
                const parts = Math.ceil(huntH);
                for (let i = 0; i < parts; i++) add(mobExpAt(lv) * hunt.kills * huntMult * Math.min(1, huntH - i), 'hunt');
            }
            // トレジャーハンターの箱。自分の Lv の狩り場で開ける想定。EXP のバフは乗らず、トレジャーハンター EXP の増加（th）だけ乗る
            if (thN > 0 && lv >= TREASURE_MIN_LV) {
                const bTh = 1 + this.buffPct('th', ymd) / 100;
                for (let i = 0; i < thN; i++) add(treasureBoxExp(lv) * bTh, 'th');
            }
            // 放置マップ（サウナ）は狩りのあと。割り当てた時間をアカウントの1日の時間の中で使う
            dayIdx++;
            for (let h = saunaDays[dayIdx] || 0; h > 0; h -= 1) add(saunaExpPerHour(lv) * Math.min(1, h), 'sauna');
            // 途中でもらったサウナ券は、その日のアカウントの空き時間で使う
            if (pendSauna > 0) {
                const free = this.saunaPerDay() - ((this._saunaUsedDays || [])[dayIdx] || 0);
                const use = Math.min(pendSauna, Math.max(0, free));
                if (use > 0) {
                    record('sauna', 'サウナ券', use * 2, () => { for (let h = use; h > 0; h -= 1) add(saunaExpPerHour(lv) * Math.min(1, h), 'sauna'); });
                    pendSauna -= use;
                }
            }

            usePot(ymd);

            const pct = lv >= 300 ? 0 : exp / tnlData[lv] * 100;
            if (ymd <= end) series.push({ x: ymd, y: lv + pct / 100 });
            // 内訳は期日までの分（目標に届く日を出すために期日より先も回すので、ここで写しておく）
            if (ymd === end) { endLv = lv; endPct = pct; endSrc = { ...src }; }
            if (target && !reach && lv >= target) reach = ymd;
            // Lv ごとに初めて届いた日（パスで何日縮んだかの比較に使う）
            for (let l = reachLv + 1; l <= lv; l++) reachAt[l] = ymd;
            if (lv > reachLv) reachLv = lv;
            // 途中で計算を止めるキャラ（ウルティマのクアナに移すキャラ）。止めた日の Lv を期日の Lv にする
            if (this.stopAfter(ch, ymd, lv)) {
                stopped = ymd;
                if (!endSrc) { endLv = lv; endPct = pct; endSrc = { ...src }; }
                break;
            }
        }
        return { startLv, startPct, endLv, endPct, reach, target, src: endSrc || src, series, log: log.filter(e => e.ymd <= end), reachAt, stopped };
    },

    // ---------- 描画 ----------
    // 秘薬の短い名前（Growth 1 (~Lv.209) → Growth 1 ~209、Growth (Lv.260~284) → Growth 260~284）
    potName(p) { return p.name.replace(/\s*\((?:Lv\.)?(~?)(?:Lv\.)?([^)]*)\)/, (_, t, r) => ` ${t}${r}`).replace('Special Mushroom', 'Special'); },

    color(world) {
        const cfg = (window.app && app.data && app.data.config) || {};
        return world === 'CHALLENGER' ? (cfg.serverCColor || 'purple') : (cfg.serverKColor || 'emerald');
    },

    render() {
        const root = document.getElementById(this.ROOT);
        if (!root || !this.visible()) return;
        this.load();
        this.normalize();
        const st = this.state;
        const L = this.LIMITS;
        const chars = this.characters();

        const results = new Map();
        this._saunaSched = this.saunaSchedule();
        this.onChars().forEach(ch => results.set(ch.id, this.simulate(ch, this.cfg(ch.id), st.start, st.end)));
        this.extraResults(results, st);
        // 入力欄を変えるたびに描き直すので、入力側・結果側のスクロール位置を引き継ぐ
        const keep = [`${this.ID}-inputs`, `${this.ID}-results`].map(id => [id, document.getElementById(id)?.scrollTop || 0]);

        const saunaHave = Number(st.sauna) || 0, saunaU = this.saunaUsed();
        const saunaDay = this.saunaPerDay();
        const saunaDayOpts = Array.from({ length: this.SAUNA_PER_DAY * 2 }, (_, i) => (i + 1) / 2)
            .map(v => `<option value="${v}"${v === saunaDay ? ' selected' : ''}>${v}</option>`).join('');
        const epicMax = this.epicDungeons().length;
        const epicLeft = epicMax - this.epicDungeons().filter(d => this.epicOwner(d.id)).length;
        const pill = (label, left, max) => `<span class="expp-limit ${left <= 0 ? 'is-full' : ''}">${label}<b>${max - left}/${max}</b></span>`;

        // ワールドごとの入力（持ち物・上限・キャラ）。「両方」のときは Kronos → Challenger の順に並べる
        const worldHTML = (world) => {
            const all = chars.filter(ch => ch.server === world);
            // 一覧に出すのは計画に入れたキャラだけ。入れる・外すは「キャラを選ぶ」の画面で
            const mine = all.filter(ch => this.cfg(ch.id).on).sort((a, b) => b.level - a.level);
            const wName = this.WORLDS.find(w => w.id === world).name;
            const col = this.color(world);
            const monpaLeft = L.monpaPerWorld - this.monpaUsed(world);
            const mpeLeft = L.mpePerWorld - this.mpeUsed(world);
            return `
                <div class="flex flex-wrap items-center gap-2 px-1 pt-2">
                    <span class="text-base font-bold text-${col}-400">${wName}</span>
                    <button class="btn btn-xs gap-1" onclick="${this.NS}.openPicker('${world}')"><i data-lucide="user-check" class="w-3.5 h-3.5"></i>キャラを選ぶ<span class="font-mono text-slate-400">${mine.length}/${all.length}</span></button>
                    ${pill('モンパ/日 ', monpaLeft, L.monpaPerWorld)}
                    ${pill('MPE/週 ', mpeLeft, L.mpePerWorld)}
                    <div class="flex-1"></div>
                    <button class="btn btn-xs btn-ghost gap-1" onclick="${this.NS}.fetchAll('${world}')"><i data-lucide="refresh-cw" class="w-3 h-3"></i>選んだキャラの Lv を取り直す</button>
                </div>
                ${this.poolHTML(world)}
                <div class="space-y-2">${mine.map(ch => this.charHTML(ch, results.get(ch.id))).join('') || `<p class="text-sm text-slate-500 px-1 py-2">${all.length ? '「キャラを選ぶ」から計画に入れるキャラを選んでください' : `${wName} のキャラがいません`}</p>`}</div>
                ${this.worldExtraHTML(world, results)}`;
        };

        if (!chars.length) {
            root.innerHTML = `<div class="flex flex-col items-center justify-center h-[60vh] text-slate-500 gap-2">
                <i data-lucide="users" class="w-10 h-10 opacity-30"></i><p class="text-sm">ダッシュボードにキャラがいません</p></div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        root.innerHTML = `
        <div class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 2xl:h-[calc(100vh-7rem)]">
            <div id="${this.ID}-inputs" class="space-y-3 min-w-0 2xl:overflow-y-auto custom-scrollbar 2xl:pr-2 pb-6">
                <div class="bg-base-100 border border-base-content/10 rounded-box p-3 flex flex-wrap items-end gap-3">
                    <label class="flex flex-col gap-1"><span class="expp-lbl">開始日</span>
                        <input type="date" class="input input-sm font-mono w-40" value="${st.start}" onchange="${this.NS}.setDate('start',this.value)"></label>
                    <label class="flex flex-col gap-1"><span class="expp-lbl">期日</span>
                        <input type="date" class="input input-sm font-mono w-40 border-amber-500/40" value="${st.end}" onchange="${this.NS}.setDate('end',this.value)"></label>
                    <span class="text-xs text-slate-500 pb-2">${expDate.diff(st.start, st.end) + 1}日間</span>
                    <div class="flex-1"></div>
                    <div class="flex flex-wrap gap-1.5 pb-1">
                        ${pill('アカウント エピダン/週 ', epicLeft, epicMax)}
                    </div>
                    <div class="expp-pool ${saunaHave ? 'has' : ''} w-full" title="VIP サウナの時間はアカウントで共有。1日に使う時間（最大8時間）をアカウントで分け合います">
                        <span class="truncate flex items-center gap-1.5">${this.iconHTML('sauna', 'expp-ico-s')}アカウント VIP サウナ <span class="text-slate-500">時間</span></span>
                        <input type="number" min="0" step="0.5" class="input input-xs font-mono w-16 text-right" value="${saunaHave}" onchange="${this.NS}.setPoolSauna(this.value)">
                        <span class="font-mono text-[10px] ${saunaHave && saunaU >= saunaHave ? 'text-amber-400' : 'text-slate-500'} w-12 text-right">${saunaHave ? `${saunaU}/${saunaHave}` : ''}</span>
                        <span class="text-slate-500 ml-2">1日</span>
                        <select class="select select-xs font-mono w-16" onchange="${this.NS}.setSaunaDay(this.value)">${saunaDayOpts}</select>
                        <span class="text-slate-500">時間</span>
                    </div>
                </div>
                ${this.extraTopHTML()}
                ${this.shownWorlds().map(w => worldHTML(w)).join('')}
            </div>
            <div id="${this.ID}-results" class="space-y-3 min-w-0 order-first 2xl:order-none 2xl:overflow-y-auto custom-scrollbar 2xl:pr-1 2xl:pb-6">${this.resultHTML(results, st)}${this.extraResultHTML(results, st)}</div>
        </div>${this.pickerHTML(chars)}`;
        if (window.lucide) lucide.createIcons();
        this.drawChart(results);
        keep.forEach(([id, top]) => { const el = document.getElementById(id); if (el) el.scrollTop = top; });
    },

    // 計画に入れるキャラを選ぶ画面（ワールドごと）。押すたびに入れる・外すが切り替わる
    pickerHTML(chars) {
        const world = this.picking;
        if (!world) return '';
        const w = this.WORLDS.find(x => x.id === world);
        if (!w) return '';
        const col = this.color(world);
        const list = chars.filter(ch => ch.server === world).sort((a, b) => b.level - a.level);
        const n = list.filter(ch => this.cfg(ch.id).on).length;
        const rows = list.map(ch => {
            const on = this.cfg(ch.id).on;
            const img = ch.image || ch.classImage || '';
            return `
                <button class="expp-pick ${on ? 'is-on' : ''}" onclick="${this.NS}.toggleChar('${ch.id}')">
                    <span class="expp-pick-box">${on ? '<i data-lucide="check" class="w-3.5 h-3.5"></i>' : ''}</span>
                    <span class="w-8 h-8 shrink-0 rounded bg-base-300 overflow-hidden flex items-center justify-center">${img ? `<img src="${expEsc(img)}" class="w-full h-full object-cover object-top" onerror="this.style.display='none'">` : ''}</span>
                    <span class="min-w-0 flex-1 text-left">
                        <span class="block font-bold text-white truncate">${expEsc(ch.name)}</span>
                        <span class="block text-[11px] text-slate-400 truncate">Lv ${ch.level} ${expEsc(ch.job || '')}</span>
                    </span>
                </button>`;
        }).join('');
        return `
        <div class="modal modal-open" role="dialog">
            <div class="modal-box max-w-xl p-0 overflow-hidden">
                <div class="flex items-center gap-2 px-4 py-3 bg-base-200 border-b border-base-content/10">
                    <span class="font-bold text-${col}-400">${w.name}</span>
                    <span class="text-sm text-white font-bold">計画に入れるキャラ</span>
                    <span class="text-xs text-slate-500 font-mono">${n}/${list.length}</span>
                    <div class="flex-1"></div>
                    <button class="btn btn-ghost btn-sm btn-square" onclick="${this.NS}.closePicker()" title="閉じる"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>
                <div class="p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    ${rows || '<p class="text-sm text-slate-500 p-2">このワールドのキャラがいません</p>'}
                </div>
                <div class="flex justify-end px-4 py-3 border-t border-base-content/10">
                    <button class="btn btn-primary btn-sm" onclick="${this.NS}.closePicker()">決定</button>
                </div>
            </div>
            <div class="modal-backdrop" onclick="${this.NS}.closePicker()"></div>
        </div>`;
    },

    poolHTML(world) {
        const pool = this.state.pool[world];
        const used = (kind, k) => kind === 'tix' ? this.tixUsed(world, k) : this.potUsed(world, k);
        const cell = (kind, id, label, icon) => {
            const have = Number(pool[kind][id]) || 0, u = used(kind, id);
            return `<label class="expp-pool ${have ? 'has' : ''}">
                <span class="truncate flex items-center gap-1.5">${icon ? `<img src="${icon}" class="expp-ico-t" alt="">` : this.iconHTML(kind === 'tix' ? 'farm' : 'potion', 'expp-ico-s')}${label}</span>
                <input type="number" min="0" class="input input-xs font-mono w-14 text-right" value="${have}" onchange="${this.NS}.setPool('${world}','${kind}','${id}',this.value)">
                <span class="font-mono text-[10px] ${have && u >= have ? 'text-amber-400' : 'text-slate-500'} w-9 text-right">${have ? `${u}/${have}` : ''}</span>
            </label>`;
        };
        return `
        <details class="bg-base-100 border border-base-content/10 rounded-box overflow-hidden" ${this.poolOpen ? 'open' : ''} ontoggle="${this.NS}.poolOpen=this.open">
            <summary class="flex items-center gap-2 px-3 py-2 bg-base-200 cursor-pointer select-none">
                <i data-lucide="backpack" class="w-4 h-4 text-pink-400"></i>
                <span class="text-sm font-bold text-white">持ち物</span>
            </summary>
            <div class="p-3 space-y-3">
                <div class="space-y-1.5">
                    <div class="expp-lbl">農場チケット</div>
                    <div class="grid grid-cols-2 gap-1.5">${this.TIX.map(t => cell('tix', t.id, `${t.label}${t.minLv > 200 ? ` <span class="text-slate-500">${t.minLv}+</span>` : ''}`, t.icon)).join('')}</div>
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
                <div class="w-9 h-9 shrink-0 rounded bg-base-300 overflow-hidden flex items-center justify-center">${img ? `<img src="${expEsc(img)}" class="w-full h-full object-cover object-top" onerror="this.style.display='none'">` : ''}</div>
                <div class="min-w-0 flex-1">
                    <div class="font-bold text-white truncate">${expEsc(ch.name)}</div>
                    <div class="text-[11px] text-slate-400 truncate">Lv ${ch.level} ${expEsc(ch.job || '')}</div>
                </div>
                ${c.on && res ? `<div class="text-right leading-tight">
                    <div class="text-[10px] text-slate-500">期日</div>
                    <div class="font-bold text-amber-300 font-mono">Lv ${res.endLv ?? '-'} <span class="text-xs text-slate-400">${res.endPct != null ? res.endPct.toFixed(1) + '%' : ''}</span></div>
                </div>` : ''}
                <button class="btn btn-ghost btn-xs btn-square text-slate-500 hover:text-white" title="計画から外す" onclick="${this.NS}.toggleChar('${ch.id}')"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
            </div>`;
        if (!c.on) return `<div class="expp-char is-off border-l-${col}-400">${head}</div>`;

        const lvOpts = Array.from({ length: 100 }, (_, i) => 200 + i).map(l => `<option value="${l}"${l === lvNow ? ' selected' : ''}>${l}</option>`).join('');
        const tgOpts = Array.from({ length: 300 - Math.max(200, lvNow) }, (_, i) => Math.max(200, lvNow) + 1 + i)
            .map(l => `<option value="${l}"${l === c.target ? ' selected' : ''}>${l}</option>`).join('');
        // src: 内訳の色（SRC の id）、icon: 左に出す画像
        const chip = (on, label, onclick, disabled, title, src = 'daily', icon = '') =>
            `<button type="button" class="expp-chip ${on ? 'on' : ''}" style="--c:${this.srcColor(src)}" ${disabled ? 'disabled' : ''} title="${title || ''}" onclick="${onclick}">${icon ? `<img src="${icon}" class="expp-ico-s" alt="">` : ''}${this.stableText(label)}</button>`;

        const monpaMax = Math.min(L.monpaPerChar, L.monpaPerWorld - this.monpaUsed(ch.server, ch.id));
        const monpaOpts = Array.from({ length: L.monpaPerChar + 1 }, (_, i) => `<option value="${i}"${i === c.monpa ? ' selected' : ''}${i > monpaMax ? ' disabled' : ''}>${i}</option>`).join('');
        const mpeFull = !c.mpe && this.mpeUsed(ch.server, ch.id) >= L.mpePerWorld;
        // エピダンはボタンで選ぶ。ほかのキャラが選んだダンジョンは押せない（名前を添える）。
        const epicChips = chip(c.epic === 'none', 'なし', `${this.NS}.set('${ch.id}','epic','none')`, false, '', 'epic') + this.epicDungeons().map(d => {
            const owner = this.epicOwner(d.id, ch.id);
            return chip(c.epic === d.id, `${d.name}${owner ? ` <span class="font-normal">（${expEsc(owner.name)}）</span>` : ''}`, `${this.NS}.set('${ch.id}','epic','${d.id}')`, !!owner, owner ? `${owner.name} が選んでいます` : `Lv${d.lv}+`, 'epic');
        }).join('');
        const burnOpts = this.BURNS.map(b => `<option value="${b.id}"${b.id === c.burn ? ' selected' : ''}>${b.label}</option>`).join('');

        const pool = this.state.pool[ch.server];
        const cntSel = (kind, id, label, cur, icon = '') => {
            const have = Number(pool[kind][id]) || 0;
            if (!have) return '';
            const max = have - (kind === 'tix' ? this.tixUsed(ch.server, id, ch.id) : this.potUsed(ch.server, id, ch.id));
            const opts = Array.from({ length: have + 1 }, (_, i) => `<option value="${i}"${i === cur ? ' selected' : ''}${i > max ? ' disabled' : ''}>${i}</option>`).join('');
            return `<label class="expp-cnt ${cur ? 'on' : ''}" style="--c:${this.srcColor(kind === 'tix' ? 'farm' : 'potion')}">${icon ? `<img src="${icon}" class="expp-ico-t" alt="">` : ''}${this.stableText(label)}<select class="select select-xs font-mono w-14" onchange="${this.NS}.${kind === 'tix' ? 'setTix' : 'setPot'}('${ch.id}','${id}',this.value)">${opts}</select></label>`;
        };
        const tixItems = this.TIX.map(t => cntSel('tix', t.id, t.label, Number(c.tix[t.id]) || 0, t.icon)).join('');
        const potItems = EXP_POTION_TYPES.map(p => cntSel('pot', p.id, this.potName(p), Number(c.pot[p.id]) || 0)).join('');
        // 放置マップ: 持ち物の時間から 0.5 時間単位で割り当てる（ほかのキャラに割り当てた分は選べない）
        const saunaHave = Number(this.state.sauna) || 0;
        const saunaItem = saunaHave ? (() => {
            const max = saunaHave - this.saunaUsed(ch.id), cur = Number(c.sauna) || 0;
            const opts = Array.from({ length: Math.floor(saunaHave * 2) + 1 }, (_, i) => i / 2)
                .map(v => `<option value="${v}"${v === cur ? ' selected' : ''}${v > max ? ' disabled' : ''}>${v}</option>`).join('');
            // いつ使うか（アカウントで1日の時間を分け合うので、前のキャラが使い終わってから）
            const sch = (this._saunaSched && this._saunaSched[ch.id]) || [];
            const first = sch.findIndex(h => h > 0), last = sch.length - 1;
            const when = cur && first >= 0 ? `${expDate.short(expDate.add(this.state.start, first))}${last > first ? `〜${expDate.short(expDate.add(this.state.start, last))}` : ''}` : '';
            return `<label class="expp-cnt ${cur ? 'on' : ''}" style="--c:${this.srcColor('sauna')}">${this.stableText('VIP サウナ')}<select class="select select-xs font-mono w-16" onchange="${this.NS}.setSauna('${ch.id}',this.value)">${opts}</select></label>
                <span class="text-[11px] text-slate-500">時間${when ? `（${when}）` : ''}</span>`;
        })() : '';
        const hunt = this.huntCfg(c);
        const hourOpts = Array.from({ length: 49 }, (_, i) => i / 2).map(v => `<option value="${v}"${v === Number(hunt.hours) ? ' selected' : ''}>${v}</option>`).join('');
        const huntDay = mobExpAt(lvNow) * hunt.kills * hunt.hours * (1 + (Number(hunt.pct) || 0) / 100);
        const thN = Number(c.th) || 0;
        const thOpts = Array.from({ length: this.TH_PER_DAY + 1 }, (_, i) => i).map(v => `<option value="${v}"${v === thN ? ' selected' : ''}>${v}</option>`).join('');
        const thDay = thN * treasureBoxExp(lvNow);

        // デイリーは地域ごと。ワールドで1日1回なので、ほかのキャラが選んだ地域は出さない。
        // 区分の名前を押すと、その区分の残りをまとめて入れる／外す。
        const takenDaily = this.dailyTaken(ch.server, ch.id);
        const dailyHTML = this.DAILY_GROUPS.map(g => {
            const regs = expRegionData.filter(r => r.daily > 0 && g.test(r) && !takenDaily.has(r.id));
            const allOn = regs.length && regs.every(r => c.dailyOn.includes(r.id));
            return `<div class="expp-dgrp">
                <button type="button" class="expp-grp ${allOn ? 'on' : ''}" style="--c:${this.srcColor('daily')}" ${regs.length ? '' : 'disabled'} onclick="${this.NS}.toggleDailyGroup('${ch.id}','${g.id}')">${g.label}</button>
                <div class="flex flex-wrap items-center gap-1">                ${regs.map(r => chip(c.dailyOn.includes(r.id), this.REGION_SHORT[r.id] || r.name, `${this.NS}.toggleDaily('${ch.id}','${r.id}')`, false, `${r.name} Lv${r.lv}+`, 'daily', this.REGION_ICON[r.id] || '')).join('') || '<span class="text-[11px] text-slate-600">—</span>'}</div>
            </div>`;
        }).join('');

        const fetchNote = fetching === 'loading' ? '<span class="loading loading-spinner loading-xs"></span>'
            : fetching === 'error' ? '<span class="text-[10px] text-red-400">取得できません</span>'
            : c.fetchedAt ? `<span class="text-[10px] text-slate-500">${new Date(c.fetchedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} 取得</span>` : '';

        return `
        <div class="expp-char border-l-${col}-400">
            ${head}
            <div class="expp-grid">
                ${this.rowLbl('start', '開始')}
                <div class="flex flex-wrap items-center gap-1.5">
                    <select class="select select-xs font-mono w-16" onchange="${this.NS}.set('${ch.id}','lv',this.value)">${lvOpts}</select>
                    <label class="input input-xs font-mono w-24"><input type="number" step="0.01" min="0" max="99.99" value="${(Number(c.pct) || 0).toFixed(2)}" onchange="${this.NS}.set('${ch.id}','pct',this.value)">%</label>
                    <button class="btn btn-xs btn-ghost btn-square" title="Nexon ランキングから取得" onclick="${this.NS}.fetchLevel('${ch.id}')"><i data-lucide="download" class="w-3 h-3"></i></button>
                    ${fetchNote}
                    <span class="expp-lbl ml-3">目標</span>
                    <select class="select select-xs font-mono w-16" onchange="${this.NS}.set('${ch.id}','target',this.value)"><option value="0">-</option>${tgOpts}</select>
                </div>
                ${this.rowLbl('burn', 'バーニング')}
                <div><select class="select select-xs w-56" onchange="${this.NS}.set('${ch.id}','burn',this.value)">${burnOpts}</select></div>
                <div class="expp-sec">毎日・毎週のコンテンツ</div>
                ${this.rowLbl('daily', 'デイリー', 'self-start pt-1')}
                <div class="space-y-1">${dailyHTML}</div>
                ${this.rowLbl('monpa', 'モンパ')}
                <div class="flex flex-wrap items-center gap-1.5">
                    <select class="select select-xs font-mono w-14" onchange="${this.NS}.set('${ch.id}','monpa',this.value)">${monpaOpts}</select>
                    <span class="text-[11px] text-slate-500">回/日</span>
                </div>
                ${this.rowLbl('weekly', '毎週')}
                <div class="flex flex-wrap items-center gap-1.5">
                    ${chip(c.weekly, 'アーケイン週課', `${this.NS}.toggle('${ch.id}','weekly')`, false, '', 'weekly', this.ICON.weekly.img)}
                    ${chip(c.mpe, 'モンパエクストリーム', `${this.NS}.toggle('${ch.id}','mpe')`, mpeFull, mpeFull ? `このワールドは週${L.mpePerWorld}キャラまで` : 'Lv260+', 'mpe', this.ICON.mpe.img)}
                </div>
                ${this.rowLbl('epic', 'エピダン')}
                <div class="flex flex-wrap items-center gap-1.5">
                    ${epicChips}
                </div>
                ${tixItems || potItems ? '<div class="expp-sec">持ち物</div>' : ''}
                ${tixItems ? `${this.rowLbl('farm', '農場')}<div class="flex flex-wrap items-center gap-1.5">${tixItems}</div>` : ''}
                ${potItems ? `${this.rowLbl('potion', '秘薬')}<div class="flex flex-wrap items-center gap-1.5">${potItems}</div>` : ''}
                <div class="expp-sec">狩り・放置</div>
                ${this.rowLbl('hunt', '狩り')}
                <div class="flex flex-wrap items-center gap-1.5">
                    <label class="input input-xs font-mono w-28" title="1時間あたりの討伐数（自分の Lv の敵）"><input type="number" min="0" step="1000" value="${hunt.kills}" onchange="${this.NS}.setHunt('${ch.id}','kills',this.value)"><span class="text-slate-500">体/時</span></label>
                    <label class="input input-xs font-mono w-28 expp-insel" title="1日に狩る時間"><select onchange="${this.NS}.setHunt('${ch.id}','hours',this.value)">${hourOpts}</select><i data-lucide="chevron-down" class="w-3 h-3 text-slate-500 shrink-0"></i><span class="text-slate-500">時間/日</span></label>
                    <label class="input input-xs font-mono w-32" title="ステータス画面の経験値（+N%）。基礎の100%に足して計算します"><span class="text-slate-500">EXP +</span><input type="number" min="0" step="10" value="${hunt.pct}" onchange="${this.NS}.setHunt('${ch.id}','pct',this.value)"><span class="text-slate-500">%</span></label>
                    ${huntDay > 0 ? `<span class="text-[11px] text-slate-500">1日 ${expFmt(huntDay)}</span>` : ''}
                </div>
                ${this.rowLbl('th', 'トレハン')}
                <div class="flex flex-wrap items-center gap-1.5">
                    <label class="input input-xs font-mono w-28 expp-insel" title="1日に開ける箱の数（1キャラ1日10箱まで）"><select onchange="${this.NS}.setTh('${ch.id}',this.value)"${lvNow < TREASURE_MIN_LV ? ' disabled' : ''}>${thOpts}</select><i data-lucide="chevron-down" class="w-3 h-3 text-slate-500 shrink-0"></i><span class="text-slate-500">箱/日</span></label>
                    <span class="text-[11px] text-slate-500">${lvNow < TREASURE_MIN_LV ? `Lv${TREASURE_MIN_LV} から` : `${thDay > 0 ? `1日 ${expFmt(thDay)}・` : ''}1箱は敵 ${TREASURE_EXPECTED_MULT.toLocaleString()} 体分（期待値）`}</span>
                </div>
                ${saunaItem ? `${this.rowLbl('sauna', '放置')}<div class="flex flex-wrap items-center gap-1.5">${saunaItem}</div>` : ''}
            </div>
        </div>`;
    },

    // 持ち物（農場・秘薬・交換券）をいつ何個使ったか。受け取り（パスの報酬）も同じ並びに出す
    logOpen: {},
    toggleLog(id) { this.logOpen[id] = !this.logOpen[id]; this.render(); },
    lvText(v) { const l = Math.floor(v); return l >= 300 ? 'Lv 300' : `Lv ${l} <span class="text-slate-500">${((v - l) * 100).toFixed(1)}%</span>`; },
    logHTML(log) {
        const rows = (log || []).map(e => {
            if (e.kind === 'recv') return `<tr class="text-slate-500"><td>${expDate.short(e.ymd)}</td><td colspan="4"><i data-lucide="gift" class="w-3 h-3 inline -mt-0.5"></i> 受け取り ${expEsc(e.label)}</td></tr>`;
            const dl = e.to - e.from;
            return `<tr>
                <td>${expDate.short(e.ymd)}</td>
                <td><span class="font-bold" style="color:${this.srcColor(e.kind)}">${expEsc(e.label)}</span> <span class="text-slate-400">×${e.n.toLocaleString()}</span></td>
                <td class="text-right">${expFmt(e.exp)}</td>
                <td class="whitespace-nowrap">${this.lvText(e.from)} → ${this.lvText(e.to)}</td>
                <td class="text-right ${dl >= 1 ? 'text-amber-300 font-bold' : 'text-emerald-400'}">+${dl.toFixed(2)}</td>
            </tr>`;
        }).join('');
        return rows ? `<table class="expp-log"><thead><tr><th>日付</th><th>使ったもの</th><th class="text-right">EXP</th><th>Lv</th><th class="text-right">Lv の増え</th></tr></thead><tbody>${rows}</tbody></table>`
            : '<p class="text-[11px] text-slate-500 py-1">期間中に使う持ち物はありません</p>';
    },

    resultHTML(results, st) {
        const rows = this.planChars().map(ch => ({ ch, r: results.get(ch.id) })).filter(x => x.r);
        if (!rows.length) {
            return `<div class="bg-base-100 border border-base-content/10 rounded-box flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
                <i data-lucide="chart-line" class="w-10 h-10 opacity-30"></i><p class="text-sm">左のキャラをオンにすると計算します</p></div>`;
        }
        const focus = ch => this.world === 'ALL' || ch.server === this.world ? 0 : 1;
        rows.sort((a, b) => focus(a.ch) - focus(b.ch) || b.ch.server.localeCompare(a.ch.server) || b.r.endLv - a.r.endLv);
        const pct = v => v == null ? '' : `${v.toFixed(2)}%`;
        const body = rows.map(({ ch, r }) => {
            const col = this.color(ch.server);
            const total = Object.values(r.src).reduce((a, b) => a + b, 0) || 1;
            const bar = this.SRC.filter(s => r.src[s.id] > 0).map(s =>
                `<span style="width:${r.src[s.id] / total * 100}%;background:${s.color}" title="${s.label} ${expFmt(r.src[s.id])}（${(r.src[s.id] / total * 100).toFixed(0)}%）"></span>`).join('');
            const gained = r.endLv != null ? (r.endLv + r.endPct / 100) - (r.startLv + r.startPct / 100) : null;
            const used = (r.log || []).filter(e => e.kind !== 'recv').length;
            const open = !!this.logOpen[ch.id];
            return `
            <tr>
                <td class="border-l-[3px] border-l-${col}-400"><div class="font-bold text-white">${expEsc(ch.name)}</div><div class="text-[10px] text-slate-500">${ch.server === 'CHALLENGER' ? 'Challenger' : 'Kronos'}</div>${this.rowNote(ch, r)}
                    ${(r.log || []).length ? `<button class="expp-logbtn ${open ? 'on' : ''}" onclick="${this.NS}.toggleLog('${ch.id}')"><i data-lucide="${open ? 'chevron-up' : 'chevron-down'}" class="w-3 h-3"></i>持ち物 ${used}回</button>` : ''}</td>
                <td class="font-mono text-slate-300">Lv ${r.startLv}<div class="text-[10px] text-slate-500">${pct(r.startPct)}</div></td>
                <td class="font-mono"><span class="text-amber-300 font-bold text-base">Lv ${r.endLv ?? '-'}</span><div class="text-[10px] text-slate-400">${pct(r.endPct)}${gained != null ? ` <span class="text-emerald-400">+${gained.toFixed(2)}</span>` : ''}</div></td>
                <td class="font-mono">${r.target ? `Lv ${r.target}<div class="text-[10px] ${r.reach && r.reach <= st.end ? 'text-emerald-400' : 'text-slate-400'}">${r.reach ? expDate.short(r.reach) : '10年以上'}</div>` : '<span class="text-slate-600">-</span>'}</td>
                <td class="w-[34%]"><div class="expp-src">${bar}</div><div class="text-[10px] text-slate-500 mt-0.5 font-mono">${expFmt(total)} EXP</div></td>
            </tr>${open ? `<tr class="expp-logrow"><td colspan="5" class="border-l-[3px] border-l-${col}-400">${this.logHTML(r.log)}</td></tr>` : ''}`;
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
            <div class="p-3 h-[340px]"><canvas id="${this.ID}-chart"></canvas></div>
        </div>`;
    },

    drawChart(results) {
        const cv = document.getElementById(`${this.ID}-chart`);
        if (this.chart) { this.chart.destroy(); this.chart = null; }
        if (!cv || typeof Chart === 'undefined') return;
        const palette = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#c084fc', '#f87171', '#a3e635', '#fb923c', '#94a3b8'];
        const list = this.planChars().filter(ch => results.get(ch.id));
        // 横軸は開始日〜期日。途中から始まる（後を継ぐ）・途中で止まる（クアナに移す）キャラは、その日だけ線を引く
        const labels = [];
        for (let d = this.state.start; d <= this.state.end; d = expDate.add(d, 1)) labels.push(d);
        const datasets = list.map((ch, i) => ({
            label: ch.name,
            data: (m => labels.map(d => m.has(d) ? m.get(d) : null))(new Map(results.get(ch.id).series.map(p => [p.x, p.y]))),
            borderColor: palette[i % palette.length],
            backgroundColor: palette[i % palette.length],
            borderWidth: this.world === 'ALL' || ch.server === this.world ? 2 : 1,
            borderDash: this.world === 'ALL' || ch.server === this.world ? [] : [4, 3],
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
                    tooltip: { callbacks: {
                        label: ctx => `${ctx.dataset.label}: Lv ${Math.floor(ctx.parsed.y)} ${((ctx.parsed.y % 1) * 100).toFixed(1)}%`,
                        // その日に使った持ち物
                        afterBody: items => {
                            const ymd = labels[items[0]?.dataIndex];
                            return list.flatMap(ch => (results.get(ch.id).log || []).filter(e => e.ymd === ymd && e.kind !== 'recv')
                                .map(e => `${ch.name}: ${e.label} ×${e.n.toLocaleString()}（+${(e.to - e.from).toFixed(2)} Lv）`));
                        },
                    } },
                },
                scales: {
                    x: { ticks: { color: '#64748b', maxTicksLimit: 10, font: { size: 10 } }, grid: { color: 'rgba(148,163,184,0.08)' } },
                    y: { ticks: { color: '#94a3b8', precision: 0, font: { size: 10 } }, grid: { color: 'rgba(148,163,184,0.12)' } },
                },
            },
        });
    },
};
