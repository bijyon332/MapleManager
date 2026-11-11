// =============================================
// Ultima EXP Plan - ミッション・ウルティマ（GMS 2026-11-11〜2027-02-09）専用のアカウント計画
// =============================================
// EXP Simulator のアカウント計画（exp_plan.js の expPlan）を元に、イベント期間に合わせたもの。
//   - キャラ・持ち物・やることと使い方のルールはアカウント計画と同じ（計算も同じ simulate）。
//     保存は別（mm-exp-ultima::<Planner の「自分」>）で、初めて開いたときだけアカウント計画の中身を写す。
//   - バフはエテリオン・レリックと補給報告の特殊訓練、Sunny Sunday の分（下の BUFFS）を最初から入れる。
//     イベントバフ一覧（expBuffs）の分も足すかはスイッチ（同じものを読み込んでいると二重になるので既定はオフ）。
//   - パス（チャレンジャーパス・モメンタムパス・PLUS）は買うかのチェックと受け取るキャラを選ぶ。補給報告（毎日のログイン）は無料で、受け取るキャラだけ選ぶ。
//     もらった日から、受け取ったキャラが今のルールで使う
//     （農場チケットは入れる Lv になったら、秘薬は上限 Lv から逆算した Lv で、上級EXP交換券とサウナ券はもらった日に）。
// 中身と日付は GMS v.272 のパッチノート（2026-11-11、nexon.com news 47132）による。
// モメンタムパス・PLUS は v.272 にはまだなく、KMS の実績からの見込み（後のパッチノートで分かったら直す）。

// 補給報告の日付。1日1回、週5回まで（イベントの週は水曜から）。毎週はじめの5日で受け取る最短の日
const ULTIMA_SUPPLY_DATE = n => expDate.add('2026-11-11', 7 * Math.floor((n - 1) / 5) + (n - 1) % 5);
// 補給報告の EXP に関係する報酬（回数 → もの）。sauna = サウナ券の時間（1枚30分）
const ULTIMA_SUPPLY = {
    2: { sauna: 0.5 }, 7: { sauna: 0.5 }, 12: { sauna: 0.5 }, 17: { sauna: 0.5 }, 22: { sauna: 0.5 }, 25: { pot: { p269: 1 } },
    27: { sauna: 0.5 }, 32: { sauna: 0.5 }, 37: { sauna: 0.5 }, 42: { sauna: 0.5 }, 45: { pot: { p269: 1 } }, 47: { coupon: 2000 },
    51: { sauna: 0.5 }, 52: { coupon: 2000 }, 56: { sauna: 0.5 }, 57: { coupon: 2000 }, 60: { pot: { p279: 1 } },
};

const expUltima = Object.assign(Object.create(expPlan), {
    NS: 'expUltima',
    ID: 'expu',
    ROOT: 'view-ultima',
    WORLD_NAV: 'ultima-nav',
    KEY_PREFIX: 'mm-exp-ultima::',
    START: '2026-11-11',
    END: '2027-02-09',
    WEEKS: 13,
    tab: 'plan',
    picking: null,
    state: null,
    stateKey: null,
    chart: null,
    fetching: {},
    showNotes: false,

    SRC: [...expPlan.SRC, { id: 'coupon', label: 'EXP交換券', color: '#e2e8f0' }],

    // バフ。[対象, ％, 開始, 終了, 内訳]
    // エテリオン・レリック: 週の任務（1万体）を毎週終えて、レリックは決まった順（1週 デイリー、3週 モンパ、9週 エピダン）、
    //   コアは解放したらすぐ Lv6（モンパ 2週、エピダン 4週、デイリー 8週に選ぶ想定。効果はレリックが有効になってから）。
    //   KMS にあったコア合計レベルのボーナスは GMS にはない（合計30はメダルだけ）。
    // 特殊訓練（補給報告の訓練報告）: 無料カードだけ（週25枚）で「アーケイン Lv3 → グランディス Lv6 → モンパ Lv6」の順。
    //   必要カード数は GMS のノートにないので KMS と同じ（1・2・5・12・25・30枚）とした。
    // Sunny Sunday: モンスターパーククリア EXP +250%（エクストリームには乗らない）。
    // /mnt/project-files/exp-plan/ultima-exp-buffs.json（イベントバフ一覧に読み込める形）と同じ中身。
    BUFFS: [
        ['monpa', 45, '2026-11-25', '2026-12-01', '3週 レリック30+コア15'],
        ['monpa', 65, '2026-12-02', '2026-12-08', '4週 レリック30+コア15+訓練20'],
        ['monpa', 75, '2026-12-09', '2026-12-15', '5週 レリック30+コア15+訓練30'],
        ['monpa', 85, '2026-12-16', '2026-12-22', '6週 レリック30+コア15+訓練40'],
        ['monpa', 95, '2026-12-23', '2027-02-09', '7〜13週 レリック30+コア15+訓練50'],
        ['monpa', 250, '2026-11-15', '2026-11-15', 'Sunny Sunday'],
        ['monpa', 250, '2026-11-29', '2026-11-29', 'Sunny Sunday'],
        ['monpa', 250, '2026-12-06', '2026-12-06', 'Sunny Sunday'],
        ['monpa', 250, '2026-12-13', '2026-12-13', 'Sunny Sunday'],
        ['mpe', 45, '2026-11-25', '2026-12-01', '3週 レリック30+コア15'],
        ['mpe', 65, '2026-12-02', '2026-12-08', '4週 レリック30+コア15+訓練20'],
        ['mpe', 75, '2026-12-09', '2026-12-15', '5週 レリック30+コア15+訓練30'],
        ['mpe', 85, '2026-12-16', '2026-12-22', '6週 レリック30+コア15+訓練40'],
        ['mpe', 95, '2026-12-23', '2027-02-09', '7〜13週 レリック30+コア15+訓練50'],
        ['epic', 190, '2027-01-06', '2027-02-09', '9〜13週 レリック150+コア40'],
        ['darc', 40, '2026-11-11', '2026-12-29', '1〜7週 レリック20+訓練20'],
        ['darc', 60, '2026-12-30', '2027-02-09', '8〜13週 レリック20+コア20+訓練20'],
        ['dgrand', 40, '2026-11-11', '2026-11-17', '1週 レリック20+訓練20'],
        ['dgrand', 50, '2026-11-18', '2026-11-24', '2週 レリック20+訓練30'],
        ['dgrand', 60, '2026-11-25', '2026-12-01', '3週 レリック20+訓練40'],
        ['dgrand', 70, '2026-12-02', '2026-12-29', '4〜7週 レリック20+訓練50'],
        ['dgrand', 90, '2026-12-30', '2027-02-09', '8〜13週 レリック20+コア20+訓練50'],
    ].map(([target, pct, start, end, memo]) => ({ target, pct, start, end, memo })),

    // パス。steps[i] はその日にもらえるもの（date）。free は無料、ほかは tiers の id ごと。
    // coupon = 上級EXP交換券の枚数、farm = 農場チケット（farm の種類）の枚数、pot = 成長の秘薬（EXP_POTION_TYPES の id）の本数、
    // sauna = サウナ券の時間（1枚30分）。tiers が空のものは無料だけ（買う・買わないの比較には入れない）。
    PASSES: [
        {
            // 1Lv 100pt・週500pt（5Lv）まで、Lv30 まで。ポイントの週は木曜 0時 UTC に切り替わるので、1週目は 11/11 の1日だけ。
            // 毎週はじめに上限まで貯める最短の日（取りこぼしたポイントはメイプルポイントで買える）。
            id: 'cp', name: 'チャレンジャーパス', short: 'チャレンジャー', abbr: 'チャレ', world: 'CHALLENGER', minLv: 260, farm: 'blue',
            note: 'Challenger の Lv260 以上',
            tiers: [{ id: 'exp', label: 'EXPパス', price: '19,800NX' }],
            steps: [
                { date: '2026-11-11', free: { farm: 1 }, exp: { coupon: 1000, farm: 3, sauna: 1 } },
                { date: '2026-11-12', free: { sauna: 0.5 }, exp: { coupon: 1000, farm: 3, sauna: 1 } },
                { date: '2026-11-19', exp: { coupon: 1000, farm: 3, sauna: 1 } },
                { date: '2026-11-26', free: { sauna: 0.5 }, exp: { coupon: 1000, farm: 3, sauna: 1 } },
                { date: '2026-12-03', free: { coupon: 100 }, exp: { coupon: 1000, farm: 3, sauna: 1 } },
                { date: '2026-12-10', free: { coupon: 2100 }, exp: { coupon: 1000, farm: 2, sauna: 1, pot: { p279: 1 } } },
            ],
        },
        // モメンタムパス・PLUS は v.272 のノートにはまだない。後のアップデートで出る見込みなので、KMS の実績（KMS 7/23・8/20 →
        // GMS は 11/11 から1週ずつ対応させて 12/16・1/13）で入れておく（kms: true は画面に「KMS の見込み」と出す）。
        {
            id: 'mp', name: 'モメンタムパス', short: 'モメンタム', abbr: 'モメ', world: null, minLv: 280, farm: 'mecha', kms: true,
            note: 'Lv280 以上・1アカウント1キャラ',
            tiers: [{ id: 'prime', label: 'プライム', price: '49,800NX' }],
            steps: [
                { date: '2026-12-16', free: { farm: 1 }, prime: { farm: 1 } },
                { date: '2026-12-23', free: { coupon: 100 }, prime: { coupon: 3000, farm: 2 } },
                { date: '2026-12-30', free: { coupon: 100 }, prime: { coupon: 3000, farm: 3 } },
                { date: '2027-01-06', free: { coupon: 300 }, prime: { coupon: 3000, farm: 4 } },
            ],
        },
        {
            id: 'mpp', name: 'モメンタムパス PLUS', short: 'モメンタム PLUS', abbr: 'PLUS', world: null, minLv: 280, farm: 'crimson', kms: true,
            note: 'Lv280 以上・1アカウント1キャラ',
            tiers: [{ id: 'premium', label: 'プレミアム', price: '29,800NX' }, { id: 'prime', label: 'プライム', price: '39,800NX' }],
            steps: [
                { date: '2027-01-13', free: { farm: 1 }, premium: { farm: 1 }, prime: { coupon: 3000, farm: 3 } },
                { date: '2027-01-20', free: { coupon: 100 }, premium: { coupon: 3000, farm: 2 }, prime: { coupon: 3000, farm: 4 } },
                { date: '2027-01-27', free: { coupon: 400 }, premium: { coupon: 1500, farm: 2 }, prime: { coupon: 3000, farm: 4 } },
            ],
        },
        {
            // 補給報告（ウルティマ報告の毎日のログイン）。アカウントで1回、ワールド内で受け渡しできる
            id: 'sr', name: '補給報告', short: '補給報告', abbr: '補給', world: null, minLv: 0,
            note: 'アカウントで1キャラ',
            tiers: [],
            steps: Object.entries(ULTIMA_SUPPLY).reduce((a, [n, r]) => {
                const date = ULTIMA_SUPPLY_DATE(Number(n));
                const s = a.find(x => x.date === date) || (a.push({ date, free: {} }), a[a.length - 1]);
                for (const [k, v] of Object.entries(r)) {
                    if (k === 'pot') { s.free.pot = s.free.pot || {}; for (const [pk, pn] of Object.entries(v)) s.free.pot[pk] = (s.free.pot[pk] || 0) + pn; }
                    else s.free[k] = (s.free[k] || 0) + v;
                }
                return a;
            }, []),
        },
    ],

    init() {
        expBuffs.ensure();
        this.render();
        this.syncWorldNav();
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.picking && this.visible()) this.closePicker(); });
    },
    visible() { return !!(window.app && app.currentApp === 'ultima'); },

    // ---------- 保存 ----------
    // 初めて開いたときはアカウント計画の中身（キャラ・持ち物・サウナ）を写す。期間はイベントに合わせる
    seed() {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(expPlan.KEY_PREFIX + this.key().slice(this.KEY_PREFIX.length)) || 'null'); } catch (e) { s = null; }
        const t = expDate.today();
        return Object.assign({}, s || {}, { start: t > this.START ? (t > this.END ? this.END : t) : this.START, end: this.END });
    },
    afterLoad() {
        const st = this.state;
        st.pass = st.pass || {};
        this.PASSES.forEach(p => { st.pass[p.id] = Object.assign({ buy: {}, char: null }, st.pass[p.id] || {}); });
        if (st.ultimaBuff == null) st.ultimaBuff = true;
        st.quanah = Object.assign({ char: null, mode: 'lv', lv: 270, date: this.START }, st.quanah || {});
        st.quanah.heir = Object.assign({ name: '後継キャラ', lv: 260, pct: 0, burn: 'none', target: 270, hunt: { kills: 0, hours: 0, pct: 0 } }, st.quanah.heir || {});
        if (st.mineBuff == null) st.mineBuff = false;
        st.start = this.clampDate(st.start);
        st.end = this.clampDate(st.end);
        if (st.end < st.start) st.end = st.start;
    },
    clampDate(d) { return !d || d < this.START ? this.START : d > this.END ? this.END : d; },
    setDate(field, v) {
        if (!v) return;
        this.state[field] = this.clampDate(v);
        if (this.state.end < this.state.start) this.state.end = this.state.start;
        this.commit();
    },

    // ---------- バフ ----------
    buffPct(target, ymd) {
        const st = this.state || {};
        return (st.ultimaBuff !== false ? expBuffs.sum(this.BUFFS, target, ymd) : 0) + (st.mineBuff ? expBuffs.pct(target, ymd) : 0);
    },
    toggleBuff(field) { this.state[field] = !this.state[field]; this.commit(); },

    // ---------- クアナに移すキャラと後を継ぐキャラ（Challenger だけ） ----------
    // 移すキャラは、デイリー・週課をやる上限（Lv か日付）に届いた日で計算を止める（クアナに移ったあとは数えない）。
    // その次の日から、後を継ぐキャラ（この計画の中だけの仮のキャラ）が、移すキャラのデイリーの地域・モンパ・MPE・
    // エピダン・週課をそのまま引き継いでやる。後を継ぐキャラの Lv・バーニング・狩り・目標は自分で入れる。
    HEIR_ID: 'heir',
    quanahChar() {
        const q = this.state.quanah;
        return q.char ? this.onChars('CHALLENGER').find(ch => ch.id === q.char) || null : null;
    },
    stopAfter(ch, ymd, lv) {
        const q = this.state.quanah;
        if (!q.char || ch.id !== q.char) return false;
        return q.mode === 'date' ? ymd >= q.date : lv >= Number(q.lv);
    },
    heirChar() {
        const h = this.state.quanah.heir;
        return { id: this.HEIR_ID, name: h.name || '後継キャラ', job: '', level: Number(h.lv) || 260, server: 'CHALLENGER', image: '', heir: true };
    },
    // 後を継ぐキャラの設定。やることは移すキャラのもの、Lv・バーニング・狩り・目標は自分のもの
    heirCfg() {
        const m = this.quanahChar(), mc = m ? this.cfg(m.id) : {}, h = this.state.quanah.heir;
        return {
            on: true, lv: Number(h.lv) || 260, pct: Number(h.pct) || 0, target: Number(h.target) || 0, burn: h.burn || 'none',
            dailyOn: mc.dailyOn || [], weekly: !!mc.weekly, monpa: Number(mc.monpa) || 0, mpe: !!mc.mpe, epic: mc.epic || 'none',
            tix: {}, pot: {}, sauna: 0, hunt: { ...h.hunt },
        };
    },
    extraResults(results, st) {
        this._heirStart = null;
        const m = this.quanahChar();
        const r = m && results.get(m.id);
        if (!r || !r.stopped) return;
        this._heirStart = expDate.add(r.stopped, 1);
        const res = this.simulate(this.heirChar(), this.heirCfg(), this._heirStart, st.end);
        if (res) results.set(this.HEIR_ID, res);
    },
    planChars(world) {
        const list = this.onChars(world);
        if (this._heirStart && (!world || world === 'CHALLENGER')) list.push(this.heirChar());
        return list;
    },
    rowNote(ch, r) {
        if (ch.heir) return `<div class="text-[10px] text-amber-300">${expDate.short(this._heirStart)} から</div>`;
        if (r && r.stopped && this.state.quanah.char === ch.id) return `<div class="text-[10px] text-amber-300">${expDate.short(r.stopped)} クアナへ</div>`;
        return '';
    },
    setQuanah(field, v) {
        const q = this.state.quanah;
        q[field] = field === 'lv' ? Number(v) || 0 : field === 'date' ? this.clampDate(v) : (v === '' ? null : v);
        this.commit();
    },
    setHeir(field, v) {
        const h = this.state.quanah.heir;
        if (field === 'name' || field === 'burn') h[field] = String(v).slice(0, 30);
        else if (field === 'pct') h.pct = Math.max(0, Math.min(99.9999, Number(v) || 0));
        else h[field] = Number(v) || 0;
        this.commit();
    },
    setHeirHunt(k, v) { this.state.quanah.heir.hunt[k] = Math.max(0, Number(v) || 0); this.commit(); },

    worldExtraHTML(world, results) {
        if (world !== 'CHALLENGER') return '';
        const q = this.state.quanah, h = q.heir;
        const cand = this.onChars('CHALLENGER').sort((a, b) => b.level - a.level);
        const m = this.quanahChar();
        const r = m && results.get(m.id);
        const sel = `<select class="select select-xs w-48" onchange="${this.NS}.setQuanah('char',this.value)"><option value="">移さない</option>${cand.map(ch => `<option value="${ch.id}"${m && m.id === ch.id ? ' selected' : ''}>${expEsc(ch.name)}（Lv ${this.cfg(ch.id).lv || ch.level}）</option>`).join('')}</select>`;
        const lvOpts = Array.from({ length: 100 }, (_, i) => 201 + i).map(l => `<option value="${l}"${l === Number(q.lv) ? ' selected' : ''}>${l}</option>`).join('');
        const chip = (on, label, onclick) => `<button type="button" class="expp-chip ${on ? 'on' : ''}" style="--c:#fbbf24" onclick="${onclick}">${this.stableText(label)}</button>`;
        const when = !m ? '' : r && r.stopped ? `<span class="text-[11px] text-amber-300">${expDate.short(r.stopped)}（Lv ${r.endLv} ${r.endPct.toFixed(1)}%）にクアナへ</span>`
            : '<span class="text-[11px] text-slate-500">上限に届かないので移しません</span>';
        let heirHTML = '';
        if (m) {
            const hr = results.get(this.HEIR_ID);
            const burnOpts = this.BURNS.map(b => `<option value="${b.id}"${b.id === h.burn ? ' selected' : ''}>${b.label}</option>`).join('');
            const hLv = Array.from({ length: 100 }, (_, i) => 200 + i).map(l => `<option value="${l}"${l === Number(h.lv) ? ' selected' : ''}>${l}</option>`).join('');
            const tg = Array.from({ length: 300 - Number(h.lv) }, (_, i) => Number(h.lv) + 1 + i).map(l => `<option value="${l}"${l === Number(h.target) ? ' selected' : ''}>${l}</option>`).join('');
            const hourOpts = Array.from({ length: 49 }, (_, i) => i / 2).map(v => `<option value="${v}"${v === Number(h.hunt.hours) ? ' selected' : ''}>${v}</option>`).join('');
            const mc = this.cfg(m.id);
            const inherit = [mc.dailyOn.length ? `デイリー ${mc.dailyOn.length}地域` : '', mc.monpa ? `モンパ ${mc.monpa}回/日` : '', mc.weekly ? 'アーケイン週課' : '', mc.mpe ? 'MPE' : '',
                mc.epic !== 'none' ? (this.epicDungeons().find(d => d.id === mc.epic) || {}).name : ''].filter(Boolean).join('・') || 'なし';
            heirHTML = `
            <div class="expp-grid">
                <div class="expp-sec">後を継ぐキャラ ${this._heirStart ? `<span class="font-normal text-amber-300">${expDate.short(this._heirStart)} から</span>` : ''}</div>
                ${this.rowLbl('name', '名前')}
                <div class="flex flex-wrap items-center gap-1.5">
                    <input type="text" class="input input-xs w-40" value="${expEsc(h.name)}" onchange="${this.NS}.setHeir('name',this.value)">
                    ${hr ? `<span class="text-[11px] text-slate-400">期日 <b class="text-amber-300 font-mono">${hr.endLv != null ? `Lv ${hr.endLv} ${hr.endPct.toFixed(1)}%` : '-'}</b></span>` : ''}
                </div>
                ${this.rowLbl('start', '開始')}
                <div class="flex flex-wrap items-center gap-1.5">
                    <select class="select select-xs font-mono w-16" onchange="${this.NS}.setHeir('lv',this.value)">${hLv}</select>
                    <label class="input input-xs font-mono w-24"><input type="number" step="0.01" min="0" max="99.99" value="${(Number(h.pct) || 0).toFixed(2)}" onchange="${this.NS}.setHeir('pct',this.value)">%</label>
                    <span class="expp-lbl ml-3">目標</span>
                    <select class="select select-xs font-mono w-16" onchange="${this.NS}.setHeir('target',this.value)"><option value="0">-</option>${tg}</select>
                </div>
                ${this.rowLbl('burn', 'バーニング')}
                <div><select class="select select-xs w-56" onchange="${this.NS}.setHeir('burn',this.value)">${burnOpts}</select></div>
                ${this.rowLbl('daily', '引き継ぎ')}
                <div class="text-[11px] text-slate-300">${expEsc(m.name)} の ${inherit}</div>
                ${this.rowLbl('hunt', '狩り')}
                <div class="flex flex-wrap items-center gap-1.5">
                    <label class="input input-xs font-mono w-28"><input type="number" min="0" step="1000" value="${h.hunt.kills}" onchange="${this.NS}.setHeirHunt('kills',this.value)"><span class="text-slate-500">体/時</span></label>
                    <label class="input input-xs font-mono w-28 expp-insel"><select onchange="${this.NS}.setHeirHunt('hours',this.value)">${hourOpts}</select><i data-lucide="chevron-down" class="w-3 h-3 text-slate-500 shrink-0"></i><span class="text-slate-500">時間/日</span></label>
                    <label class="input input-xs font-mono w-32"><span class="text-slate-500">EXP +</span><input type="number" min="0" step="10" value="${h.hunt.pct}" onchange="${this.NS}.setHeirHunt('pct',this.value)"><span class="text-slate-500">%</span></label>
                </div>
            </div>`;
        }
        return `
        <div class="expp-char border-l-amber-400">
            <div class="flex flex-wrap items-center gap-2">
                <i data-lucide="plane" class="w-4 h-4 text-amber-400"></i>
                <span class="font-bold text-white text-sm">クアナに移すキャラ</span>
                ${sel}
                ${m ? `${chip(q.mode === 'lv', 'Lv まで', `${this.NS}.setQuanah('mode','lv')`)}${chip(q.mode === 'date', '日付まで', `${this.NS}.setQuanah('mode','date')`)}
                    ${q.mode === 'lv' ? `<select class="select select-xs font-mono w-16" onchange="${this.NS}.setQuanah('lv',this.value)">${lvOpts}</select>`
                        : `<input type="date" class="input input-xs font-mono w-36" min="${this.START}" max="${this.END}" value="${q.date}" onchange="${this.NS}.setQuanah('date',this.value)">`}
                    ${when}` : ''}
            </div>
            ${heirHTML}
        </div>`;
    },

    // ---------- パス ----------
    passDate(p, i) { return p.steps[i].date; },
    passEnd(p) { return this.passDate(p, p.steps.length - 1); },
    // 受け取れるキャラ（計画に入れたキャラのうち、ワールドが合うもの）
    passCandidates(p) {
        return this.onChars(p.world || null).sort((a, b) => (this.cfg(b.id).lv || b.level) - (this.cfg(a.id).lv || a.level));
    },
    // 受け取るキャラ。選んだキャラが計画から外れていたら、入れられるいちばん Lv の高いキャラ
    passChar(p) {
        const cand = this.passCandidates(p);
        const id = this.state.pass[p.id].char;
        if (id === 'none') return null;
        return cand.find(ch => ch.id === id) || cand[0] || null;
    },
    setPassChar(pid, v) { this.state.pass[pid].char = v; this.commit(); },
    togglePassTier(pid, tid) { const b = this.state.pass[pid].buy; b[tid] = !b[tid]; this.commit(); },
    // その週にもらえるもの（無料＋買った分）
    passWeek(p, i) {
        const w = p.steps[i], buy = (this._buy && this._buy[p.id]) || this.state.pass[p.id].buy;
        const out = { coupon: 0, farm: 0, sauna: 0, pot: {} };
        ['free', ...p.tiers.filter(t => buy[t.id]).map(t => t.id)].forEach(k => {
            const r = w[k];
            if (!r) return;
            out.coupon += r.coupon || 0;
            out.farm += r.farm || 0;
            out.sauna += r.sauna || 0;
            for (const [pk, n] of Object.entries(r.pot || {})) out.pot[pk] = (out.pot[pk] || 0) + n;
        });
        return out;
    },
    passTotal(p) {
        const tot = { coupon: 0, farm: 0, sauna: 0, pot: {} };
        p.steps.forEach((_, i) => {
            const w = this.passWeek(p, i);
            tot.coupon += w.coupon; tot.farm += w.farm; tot.sauna += w.sauna;
            for (const [k, n] of Object.entries(w.pot)) tot.pot[k] = (tot.pot[k] || 0) + n;
        });
        return tot;
    },
    farmLabel(id) { return (this.TIX.find(t => t.id === id) || {}).label || id; },
    rewardText(p, r) {
        const parts = [];
        if (r.coupon) parts.push(`交換券 ${r.coupon.toLocaleString()}`);
        if (r.farm) parts.push(`${this.farmLabel(p.farm)} ${r.farm}`);
        if (r.sauna) parts.push(`サウナ ${r.sauna}時間`);
        for (const [k, n] of Object.entries(r.pot || {})) {
            const pt = EXP_POTION_TYPES.find(x => x.id === k);
            parts.push(`秘薬 ${pt ? this.potName(pt) : k} ${n}`);
        }
        return parts.join('・');
    },

    // シミュレーションの1日ごとに呼ばれる。そのキャラが受け取るパスの報酬のうち、日付が来ていて Lv も足りている週の分を返す。
    // Lv が足りない週の分は、届いた日にまとめて受け取る（取りこぼしたポイントはメイプルポイントで買える）。
    // 計画の開始日より前の分は、もう持ち物にあるものとして足さない。
    arrivals(ch, ymd, lv, memo) {
        let out = null;
        this.PASSES.forEach(p => {
            const who = this.passChar(p);
            if (!who || who.id !== ch.id) return;
            p.steps.forEach((_, i) => {
                const key = p.id + i;
                if (memo[key]) return;
                const d = this.passDate(p, i);
                if (d > ymd) return;
                if (d < this.state.start) { memo[key] = true; return; }
                if (lv < p.minLv) return;
                memo[key] = true;
                const r = this.passWeek(p, i);
                out = out || { tix: {}, pot: {}, coupon: 0, sauna: 0, from: '' };
                out.from = out.from ? out.from + '・' + p.short : p.short;
                out.coupon += r.coupon;
                out.sauna += r.sauna;
                if (r.farm) out.tix[p.farm] = (out.tix[p.farm] || 0) + r.farm;
                for (const [k, n] of Object.entries(r.pot)) out.pot[k] = (out.pot[k] || 0) + n;
            });
        });
        return out;
    },

    // ---------- 描画 ----------
    chipHTML(on, label, onclick, title = '', color = this.srcColor('coupon')) {
        return `<button type="button" class="expp-chip ${on ? 'on' : ''}" style="--c:${color}" title="${expEsc(title)}" onclick="${onclick}">${this.stableText(label)}</button>`;
    },

    extraTopHTML() {
        const st = this.state;
        const rows = this.PASSES.map(p => {
            const cand = this.passCandidates(p);
            const who = this.passChar(p);
            const sel = st.pass[p.id].char;
            const opts = [`<option value="none"${sel === 'none' ? ' selected' : ''}>受け取らない</option>`]
                .concat(cand.map(ch => `<option value="${ch.id}"${who && who.id === ch.id ? ' selected' : ''}>${expEsc(ch.name)}（Lv ${this.cfg(ch.id).lv || ch.level}）</option>`)).join('');
            const low = who && (this.cfg(who.id).lv || who.level) < p.minLv;
            const tot = this.passTotal(p);
            return `
            <div class="expu-pass">
                <div class="min-w-0">
                    <div class="font-bold text-white text-sm truncate">${p.name}</div>
                    <div class="text-[11px] text-slate-500 font-mono">${expDate.short(this.passDate(p, 0))}〜${expDate.short(this.passEnd(p))}</div>${p.kms ? '<div class="text-[11px] text-amber-400/80">KMS の見込み</div>' : ''}
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                    ${p.tiers.length ? p.tiers.map(t => this.chipHTML(!!st.pass[p.id].buy[t.id], `${t.label}を買う`, `${this.NS}.togglePassTier('${p.id}','${t.id}')`, t.price)).join('') : '<span class="text-[11px] text-slate-500">無料・毎日ログイン</span>'}
                </div>
                <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                    <select class="select select-xs w-48" onchange="${this.NS}.setPassChar('${p.id}',this.value)" title="${p.note}">${cand.length ? opts : '<option>対象のキャラがいません</option>'}</select>
                    ${low ? `<span class="text-[11px] text-amber-400">Lv${p.minLv} から</span>` : ''}
                </div>
                <div class="text-[11px] text-slate-400 font-mono expu-pass-tot">${who ? this.rewardText(p, tot) : '<span class="text-slate-600">—</span>'}</div>
            </div>`;
        }).join('');
        return `
        <div class="bg-base-100 border border-base-content/10 rounded-box overflow-hidden">
            <div class="flex items-center gap-2 px-3 py-2 bg-base-200 border-b border-base-content/10">
                <i data-lucide="ticket" class="w-4 h-4 text-slate-200"></i>
                <span class="text-sm font-bold text-white">パスと補給報告</span>
                <div class="flex-1"></div>
                <button class="btn btn-xs btn-ghost gap-1" onclick="${this.NS}.showNotes=!${this.NS}.showNotes;${this.NS}.render()"><i data-lucide="info" class="w-3 h-3"></i>前提</button>
            </div>
            <div class="divide-y divide-base-content/10">${rows}</div>
            <div class="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-base-content/10">
                <span class="expp-lbl mr-1">バフ</span>
                ${this.chipHTML(st.ultimaBuff !== false, 'ウルティマ（レリック・特殊訓練）・Sunny Sunday', `${this.NS}.toggleBuff('ultimaBuff')`, 'レリックとコアは最短、特殊訓練は無料カードだけで進めた値', '#fbbf24')}
                ${this.chipHTML(!!st.mineBuff, 'イベントバフ一覧の分も足す', `${this.NS}.toggleBuff('mineBuff')`, 'EXP Simulator のイベントバフ一覧。ウルティマの分を読み込んでいると二重になります', '#fbbf24')}
            </div>
            ${this.showNotes ? this.notesHTML() : ''}
        </div>`;
    },

    notesHTML() {
        return `
        <ul class="expu-notes">
            <li>期間は GMS 2026/11/11〜2027/2/9。チャレンジャーパス・補給報告・バフは GMS v.272 のパッチノートによります。モメンタムパス・PLUS は v.272 にはまだないので、KMS の実績（KMS 6/18 を GMS 11/11 として1週ずつ対応、12/16・1/13 開始）の見込みです。後のパッチノートで分かったら直します。</li>
            <li>チャレンジャーパスは週 500 ポイント（5Lv）まで、ポイントの週は木曜 9時（日本時間）に切り替わるので、1週目は 11/11 の1日だけです。毎週はじめに上限まで貯めた最短の日で受け取ります（取りこぼしたポイントはメイプルポイントで買えます）。Lv が足りない間の分は、届いた日にまとめて受け取ります。計画の開始日より前の分は、もう持ち物にあるものとして足しません。</li>
            <li>補給報告は毎日のログインで1回、週5回まで（アカウントで1回）。毎週はじめの5日で受け取る最短の日です。サウナ券・秘薬・上級EXP交換券だけ数えています。</li>
            <li>もらったものは受け取ったキャラが使います。農場チケットは入れる Lv になったら、秘薬は上限 Lv から逆算した Lv で（届かなければ期日に）、上級EXP交換券はもらった日に全部使います。サウナ券（1枚30分）はもらった日から、アカウントの1日のサウナ時間の空きで使います。</li>
            <li>上級EXP交換券 1枚は、同じ Lv のグランディスの敵 225 体分（千の単位で切り上げ）、Lv260 から使え、Lv291 以上は増えないとしています（KMS の式）。</li>
            <li>バフは、エテリオン・レリックの任務を毎週終え、コアは解放したらすぐ Lv6（モンパ・エピダン・デイリーの順）、特殊訓練は無料カードだけで振った想定です。KMS にあったコア合計レベルのボーナスは GMS にはありません。Sunny Sunday（11/15・11/29・12/6・12/13）のモンパ +250% も入れています（エクストリームには乗りません）。</li>
            <li>狩りの EXP に乗るもの（チャレンジャー EXPパスの +20%、戦闘訓練の EXP 最大 +15%、補給報告の 3倍クーポン）は入れていません。狩りの「EXP +%」に足してください。</li>
        </ul>`;
    },

    // ---------- パス・狩りの時間で変わる到達日 ----------
    // 目標 Lv を入れたキャラごとに、同じ条件で計算し直して、今の Lv より上で目標までの 5 の倍数の Lv（と目標）に届く日を比べる。
    //   パス: 「無料分だけ」「今の買い方」「1つのパスだけ買わない」（パスを受け取るキャラだけ）
    //   狩り: 1日の狩りの時間を HUNT_HOURS に変えたとき（体/時と EXP +% はそのキャラの値）
    // 期日を過ぎても目標までは日を進める（イベントのバフは 2/9 まで）。
    HUNT_HOURS: [0, 1, 2, 3, 4, 6, 8],
    withBuy(buy, fn) { this._buy = buy; try { return fn(); } finally { this._buy = null; } },
    reachStudy() {
        const none = Object.fromEntries(this.PASSES.map(p => [p.id, {}]));
        const bought = this.PASSES.filter(p => p.tiers.some(t => this.state.pass[p.id].buy[t.id]) && this.passChar(p));
        // 受け取るパス（買えるもの）の組み合わせ。買うパスは有料分を全部
        const combos = list => {
            const out = [];
            for (let mask = 1; mask < (1 << list.length); mask++) out.push(list.filter((_, i) => mask & (1 << i)));
            return out.sort((a, b) => a.length - b.length);
        };
        const buyOf = set => Object.fromEntries(this.PASSES.map(p => [p.id, set.includes(p) ? Object.fromEntries(p.tiers.map(t => [t.id, true])) : {}]));
        return this.onChars().filter(ch => Number(this.cfg(ch.id).target) > 0).sort((a, b) => b.level - a.level).map(ch => {
            const c = this.cfg(ch.id);
            const run = (buy, cc = c) => this.withBuy(buy, () => this.simulate(ch, cc, this.state.start, this.state.end));
            const now = run(null);
            if (!now) return null;
            const target = Math.min(300, Number(c.target) || 0);
            const lvs = [];
            for (let l = Math.floor(now.startLv / 5) * 5 + 5; l <= target; l += 5) lvs.push(l);
            if (target > now.startLv && !lvs.includes(target)) lvs.push(target);
            // クアナに移すキャラは、移した日の Lv までを比べる（その先は数えない）
            if (now.stopped) lvs.splice(0, lvs.length, ...lvs.filter(l => l <= now.endLv));
            if (!lvs.length) return null;
            const mine = this.PASSES.filter(p => p.tiers.length && this.passChar(p) && this.passChar(p).id === ch.id);
            const pass = mine.length ? { free: run(none), combos: combos(mine).map(set => ({ set, r: run(buyOf(set)) })) } : null;
            const curFree = bought.some(p => this.passChar(p).id === ch.id);
            const hunt = this.huntCfg(c);
            const cur = Number(hunt.hours) || 0;
            const hours = hunt.kills > 0 ? [...new Set([...this.HUNT_HOURS, cur])].sort((a, b) => a - b) : [];
            const byHour = hours.map(h => {
                const cc = { ...c, hunt: { ...hunt, hours: h } };
                return { h, r: h === cur ? now : run(null, cc), free: curFree ? run(none, cc) : null };
            });
            return { ch, target, lvs, now, pass, hunt, cur, byHour, curFree };
        }).filter(Boolean);
    },
    studyOpen: true,
    studyHTML() {
        const list = this.reachStudy();
        if (!list.length) return '';
        const day = d => d ? expDate.short(d) : '<span class="text-slate-600">10年以上</span>';
        const gap = (a, b) => (a && b) ? expDate.diff(a, b) : null;
        const cut = n => n == null ? '<span class="text-slate-600">—</span>' : n > 0 ? `<span class="text-emerald-400 font-bold">${n}日</span>` : '<span class="text-slate-500">0日</span>';
        // 今の設定より早い・遅い日数
        const diff = n => n == null || n === 0 ? '' : `<span class="${n > 0 ? 'text-emerald-400' : 'text-red-400'}">${n > 0 ? '−' : '+'}${Math.abs(n)}</span>`;
        const blocks = list.map(({ ch, target, lvs, now, pass, hunt, cur, byHour, curFree }) => {
            const passTable = pass ? `
            <div class="expu-sub">${pass.combos.length > 1 ? 'パスの組み合わせ' : 'パスを買ったとき'} <span>無料だけのときより何日早く届くか${pass.combos.length > 1 ? '。買うパスは有料分を全部（PLUS はプレミアムとプライムの両方）' : ''}</span></div>
            <div class="overflow-x-auto"><table class="table table-xs expu-saved">
                <thead><tr><th></th><th>無料だけ</th>${pass.combos.map(({ set }) => `<th>${set.map(p => p.abbr).join('＋')}</th>`).join('')}</tr></thead>
                <tbody>${lvs.map(l => {
                    const b = pass.free.reachAt[l];
                    return `<tr><td class="font-bold text-white">Lv ${l}</td><td>${day(b)}</td>
                        ${pass.combos.map(({ r }) => `<td>${cut(gap(r.reachAt[l], b))}</td>`).join('')}</tr>`;
                }).join('')}</tbody>
            </table></div>` : '';
            const huntTable = byHour.length ? `
            <div class="expu-sub">1日の狩りの時間 <span>${hunt.kills.toLocaleString()} 体/時・EXP +${Number(hunt.pct) || 0}%。日付は今の買い方、横の数字は今の ${cur} 時間との差${curFree ? '、右端は今の買い方で目標に何日早く届くか' : ''}</span></div>
            <div class="overflow-x-auto"><table class="table table-xs expu-saved">
                <thead><tr><th>時間/日</th>${lvs.map(l => `<th>Lv ${l}</th>`).join('')}${curFree ? `<th>パスの短縮</th>` : ''}</tr></thead>
                <tbody>${byHour.map(({ h, r, free }) => `<tr class="${h === cur ? 'expu-cur' : ''}">
                    <td class="font-bold text-white">${h} 時間</td>
                    ${lvs.map(l => `<td>${day(r.reachAt[l])} ${h === cur ? '' : diff(gap(r.reachAt[l], now.reachAt[l]))}</td>`).join('')}
                    ${curFree ? `<td>${cut(gap(r.reachAt[target], free.reachAt[target]))}</td>` : ''}
                </tr>`).join('')}</tbody>
            </table></div>` : `<div class="expu-sub"><span>狩りの「体/時」を入れると、1日の狩りの時間ごとの到達日も出ます</span></div>`;
            return `
            <div class="px-3 pt-3 text-sm font-bold text-white">${expEsc(ch.name)} <span class="text-[11px] font-normal text-slate-500">Lv ${now.startLv} → 目標 Lv ${target}${now.stopped ? `（${expDate.short(now.stopped)} にクアナへ移すので Lv ${now.endLv} まで）` : ''}</span></div>
            ${passTable}${huntTable}`;
        }).join('');
        return `
        <div class="bg-base-100 border border-base-content/10 rounded-box overflow-hidden pb-2">
            <div class="flex items-center gap-2 px-3 py-2 bg-base-200 border-b border-base-content/10">
                <i data-lucide="timer-reset" class="w-4 h-4 text-emerald-400"></i>
                <span class="text-sm font-bold text-white">パスと狩りの時間で変わる到達日</span>
            </div>
            ${blocks}
        </div>`;
    },

    // 結果の下に、パスで短縮できた日数と、週ごとのバフとパスの受け取り
    extraResultHTML(results, st) {
        const today = expDate.today();
        const cols = [['monpa', 'モンパ'], ['epic', 'エピダン'], ['darc', 'アーケイン日課'], ['dgrand', 'グランディス日課']];
        const body = Array.from({ length: this.WEEKS }, (_, w) => {
            const d = expDate.add(this.START, 7 * w);
            const now = today >= d && today <= expDate.add(d, 6);
            const pass = this.PASSES.map(p => {
                const who = this.passChar(p);
                if (!who) return '';
                return p.steps.map((s, i) => {
                    if (s.date < d || s.date > expDate.add(d, 6)) return '';
                    const t = this.rewardText(p, this.passWeek(p, i));
                    return t ? `<div><span class="text-slate-500">${expDate.short(s.date)} ${p.short}</span> ${t}</div>` : '';
                }).join('');
            }).join('');
            const cell = k => { const v = this.buffPct(k, d); return `<td class="font-mono ${v ? 'text-white font-bold' : 'text-slate-600'}">${v ? '+' + v : '·'}</td>`; };
            return `<tr class="${now ? 'expb-live' : ''}${d < st.start || d > st.end ? ' opacity-50' : ''}">
                <td class="font-mono text-slate-400">${w + 1}</td>
                <td class="font-mono text-slate-300">${expDate.short(d)}</td>
                ${cols.map(([k]) => cell(k)).join('')}
                <td class="text-[11px] text-slate-300">${pass}</td>
            </tr>`;
        }).join('');
        return `${this.studyHTML()}
        <div class="bg-base-100 border border-base-content/10 rounded-box overflow-hidden">
            <div class="flex items-center gap-2 px-3 py-2 bg-base-200 border-b border-base-content/10">
                <i data-lucide="calendar-range" class="w-4 h-4 text-indigo-400"></i>
                <span class="text-sm font-bold text-white">週ごとのバフ（％）と受け取り</span>
            </div>
            <div class="overflow-x-auto">
                <table class="table table-xs expu-weeks">
                    <thead><tr><th>週</th><th>開始</th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}<th>受け取り</th></tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        </div>`;
    },
});
