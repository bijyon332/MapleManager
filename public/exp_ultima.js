// =============================================
// Ultima EXP Plan - ミッション・ウルティマ（GMS 2026-11-11〜2027-02-09）専用のアカウント計画
// =============================================
// EXP Simulator のアカウント計画（exp_plan.js の expPlan）を元に、イベント期間に合わせたもの。
//   - キャラ・持ち物・やることと使い方のルールはアカウント計画と同じ（計算も同じ simulate）。
//     保存は別（mm-exp-ultima::<Planner の「自分」>）で、初めて開いたときだけアカウント計画の中身を写す。
//   - バフはウルティマのアーティファクトと作戦日誌の分（下の BUFFS、早見表の想定どおりに進めた値）を最初から入れる。
//     イベントバフ一覧（expBuffs）の分も足すかはスイッチ（同じものを読み込んでいると二重になるので既定はオフ）。
//   - パス3つ（チャレンジャーズパス・モメンタムパス・モメンタムパス PLUS）は、買うかのチェックと受け取るキャラを選ぶ。
//     無料分はいつも入る。もらった日から、受け取ったキャラが今のルールで使う
//     （農場チケットは入れる Lv になったら、秘薬は上限 Lv から逆算した Lv で、上級EXP交換券はもらった日に）。
// GMS の日付は KMS からの換算: KMS 6/18（1.2.416）を GMS 11/11 として1週ずつ対応させる。
// パスの中身は KMS の実績（早見表「パス報酬：EXP交換券と農園チケット」）。GMS で違ったら PASSES を直す。

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

    // ウルティマのバフ（エテリオン・アーティファクト＋作戦日誌の特殊訓練）。[対象, ％, 開始, 終了, 内訳]
    // 早見表の想定（コアは解放したらすぐ Lv6、日誌は無料チップだけ）どおりに進めた値。
    // /mnt/project-files/exp-plan/ultima-exp-buffs.json（イベントバフ一覧に読み込める形）と同じ中身。
    BUFFS: [
        ['monpa', 45, '2026-11-25', '2026-12-01', '3週 本体30+コア15'],
        ['monpa', 65, '2026-12-02', '2026-12-08', '4週 本体30+コア15+日誌20'],
        ['monpa', 75, '2026-12-09', '2026-12-15', '5週 本体30+コア15+日誌30'],
        ['monpa', 90, '2026-12-16', '2026-12-22', '6週 本体30+コア15+合計5+日誌40'],
        ['monpa', 100, '2026-12-23', '2027-02-09', '7〜13週 本体30+コア15+合計5+日誌50'],
        ['mpe', 45, '2026-11-25', '2026-12-01', '3週 本体30+コア15'],
        ['mpe', 65, '2026-12-02', '2026-12-08', '4週 本体30+コア15+日誌20'],
        ['mpe', 75, '2026-12-09', '2026-12-15', '5週 本体30+コア15+日誌30'],
        ['mpe', 90, '2026-12-16', '2026-12-22', '6週 本体30+コア15+合計5+日誌40'],
        ['mpe', 100, '2026-12-23', '2027-02-09', '7〜13週 本体30+コア15+合計5+日誌50'],
        ['epic', 10, '2026-12-30', '2027-01-05', '8週 合計10'],
        ['epic', 200, '2027-01-06', '2027-02-09', '9〜13週 本体150+コア40+合計10'],
        ['darc', 40, '2026-11-11', '2026-12-15', '1〜5週 本体20+日誌20'],
        ['darc', 50, '2026-12-16', '2026-12-29', '6〜7週 本体20+合計10+日誌20'],
        ['darc', 70, '2026-12-30', '2027-02-09', '8〜13週 本体20+コア20+合計10+日誌20'],
        ['dgrand', 40, '2026-11-11', '2026-11-17', '1週 本体20+日誌20'],
        ['dgrand', 50, '2026-11-18', '2026-11-24', '2週 本体20+日誌30'],
        ['dgrand', 60, '2026-11-25', '2026-12-01', '3週 本体20+日誌40'],
        ['dgrand', 70, '2026-12-02', '2026-12-15', '4〜5週 本体20+日誌50'],
        ['dgrand', 80, '2026-12-16', '2026-12-29', '6〜7週 本体20+合計10+日誌50'],
        ['dgrand', 100, '2026-12-30', '2027-02-09', '8〜13週 本体20+コア20+合計10+日誌50'],
    ].map(([target, pct, start, end, memo]) => ({ target, pct, start, end, memo })),

    // パス。week0 はイベント1週目（11/11）から数えて何週目に始まるか（0 始まり）。
    // weeks[i] はその週にポイントを上限まで貯めたときにもらえるもの。free は無料、ほかは tiers の id ごと。
    // coupon = 上級EXP交換券の枚数、farm = 農場チケット（farm の種類）の枚数、pot = 成長の秘薬（EXP_POTION_TYPES の id）の本数。
    PASSES: [
        {
            id: 'cp', name: 'チャレンジャーズパス', short: 'チャレンジャーズ', world: 'CHALLENGER', minLv: 260, week0: 0, farm: 'blue',
            note: 'Challenger の Lv260 以上',
            tiers: [{ id: 'exp', label: 'EXPパス', price: '19,800NX' }],
            weeks: [
                { free: { farm: 1 }, exp: { coupon: 1000, farm: 3 } },
                { exp: { coupon: 1000, farm: 3 } },
                { exp: { coupon: 1000, farm: 3 } },
                { exp: { coupon: 1000, farm: 3 } },
                { free: { coupon: 100 }, exp: { coupon: 1000, farm: 3 } },
                { free: { coupon: 2100 }, exp: { coupon: 1000, farm: 2, pot: { p279: 1 } } },
            ],
        },
        {
            id: 'mp', name: 'モメンタムパス', short: 'モメンタム', world: null, minLv: 280, week0: 5, farm: 'mecha',
            note: 'Lv280 以上・1アカウント1キャラ',
            tiers: [{ id: 'prime', label: 'プライム', price: '49,800NX' }],
            weeks: [
                { free: { farm: 1 }, prime: { farm: 1 } },
                { free: { coupon: 100 }, prime: { coupon: 3000, farm: 2 } },
                { free: { coupon: 100 }, prime: { coupon: 3000, farm: 3 } },
                { free: { coupon: 300 }, prime: { coupon: 3000, farm: 4 } },
            ],
        },
        {
            id: 'mpp', name: 'モメンタムパス PLUS', short: 'モメンタム PLUS', world: null, minLv: 280, week0: 9, farm: 'crimson',
            note: 'Lv280 以上・1アカウント1キャラ',
            tiers: [{ id: 'premium', label: 'プレミアム', price: '29,800NX' }, { id: 'prime', label: 'プライム', price: '39,800NX' }],
            weeks: [
                { free: { farm: 1 }, premium: { farm: 1 }, prime: { coupon: 3000, farm: 3 } },
                { free: { coupon: 100 }, premium: { coupon: 3000, farm: 2 }, prime: { coupon: 3000, farm: 4 } },
                { free: { coupon: 400 }, premium: { coupon: 1500, farm: 2 }, prime: { coupon: 3000, farm: 4 } },
            ],
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

    // ---------- パス ----------
    passDate(p, i) { return expDate.add(this.START, 7 * (p.week0 + i)); },
    passEnd(p) { return expDate.add(this.passDate(p, p.weeks.length - 1), 6); },
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
        const w = p.weeks[i], buy = (this._buy && this._buy[p.id]) || this.state.pass[p.id].buy;
        const out = { coupon: 0, farm: 0, pot: {} };
        ['free', ...p.tiers.filter(t => buy[t.id]).map(t => t.id)].forEach(k => {
            const r = w[k];
            if (!r) return;
            out.coupon += r.coupon || 0;
            out.farm += r.farm || 0;
            for (const [pk, n] of Object.entries(r.pot || {})) out.pot[pk] = (out.pot[pk] || 0) + n;
        });
        return out;
    },
    passTotal(p) {
        const tot = { coupon: 0, farm: 0, pot: {} };
        p.weeks.forEach((_, i) => {
            const w = this.passWeek(p, i);
            tot.coupon += w.coupon; tot.farm += w.farm;
            for (const [k, n] of Object.entries(w.pot)) tot.pot[k] = (tot.pot[k] || 0) + n;
        });
        return tot;
    },
    farmLabel(id) { return (this.TIX.find(t => t.id === id) || {}).label || id; },
    rewardText(p, r) {
        const parts = [];
        if (r.coupon) parts.push(`交換券 ${r.coupon.toLocaleString()}`);
        if (r.farm) parts.push(`${this.farmLabel(p.farm)} ${r.farm}`);
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
            p.weeks.forEach((_, i) => {
                const key = p.id + i;
                if (memo[key]) return;
                const d = this.passDate(p, i);
                if (d > ymd) return;
                if (d < this.state.start) { memo[key] = true; return; }
                if (lv < p.minLv) return;
                memo[key] = true;
                const r = this.passWeek(p, i);
                out = out || { tix: {}, pot: {}, coupon: 0, from: '' };
                out.from = out.from ? out.from + '・' + p.short : p.short;
                out.coupon += r.coupon;
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
                    <div class="text-[11px] text-slate-500 font-mono">${expDate.short(this.passDate(p, 0))}〜${expDate.short(this.passEnd(p))}</div>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                    ${p.tiers.map(t => this.chipHTML(!!st.pass[p.id].buy[t.id], `${t.label}を買う`, `${this.NS}.togglePassTier('${p.id}','${t.id}')`, t.price)).join('')}
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
                <span class="text-sm font-bold text-white">パス</span>
                <div class="flex-1"></div>
                <button class="btn btn-xs btn-ghost gap-1" onclick="${this.NS}.showNotes=!${this.NS}.showNotes;${this.NS}.render()"><i data-lucide="info" class="w-3 h-3"></i>前提</button>
            </div>
            <div class="divide-y divide-base-content/10">${rows}</div>
            <div class="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-base-content/10">
                <span class="expp-lbl mr-1">バフ</span>
                ${this.chipHTML(st.ultimaBuff !== false, 'ウルティマ（アーティファクト・日誌）', `${this.NS}.toggleBuff('ultimaBuff')`, '早見表の想定どおりに進めた値', '#fbbf24')}
                ${this.chipHTML(!!st.mineBuff, 'イベントバフ一覧の分も足す', `${this.NS}.toggleBuff('mineBuff')`, 'EXP Simulator のイベントバフ一覧。ウルティマの分を読み込んでいると二重になります', '#fbbf24')}
            </div>
            ${this.showNotes ? this.notesHTML() : ''}
        </div>`;
    },

    notesHTML() {
        return `
        <ul class="expu-notes">
            <li>期間は GMS 2026/11/11〜2027/2/9。日付は KMS の 6/18（1.2.416）を GMS の 11/11 として1週ずつ対応させています。GMS は木曜リセットで 11/11 は水曜なので、1週目が1日で終わり、それ以降が1週早まるかもしれません。</li>
            <li>パスの報酬と値段は KMS の実績です。毎週、週の初日にポイントを上限まで貯めた最短の時期で受け取ります。Lv が足りない週の分は、届いた日にまとめて受け取ります。計画の開始日より前の分は、もう持ち物にあるものとして足しません。</li>
            <li>もらったものは受け取ったキャラが使います。農場チケットは入れる Lv になったら、秘薬は上限 Lv から逆算した Lv で（届かなければ期日に）、上級EXP交換券はもらった日に全部使います。</li>
            <li>上級EXP交換券 1枚は、同じ Lv のグランディスの敵 225 体分（千の単位で切り上げ）、Lv260 から使え、Lv291 以上は増えないとしています（KMS の式。GMS に同じものが出るかは未確認）。</li>
            <li>ウルティマのバフは、コアは解放したらすぐ Lv6、作戦日誌は無料チップだけで振った想定です。トレジャーハンターと狩りの増加は入れていません。</li>
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
        return this.onChars().filter(ch => Number(this.cfg(ch.id).target) > 0).sort((a, b) => b.level - a.level).map(ch => {
            const c = this.cfg(ch.id);
            const run = (buy, cc = c) => this.withBuy(buy, () => this.simulate(ch, cc, this.state.start, this.state.end));
            const now = run(null);
            if (!now) return null;
            const target = Math.min(300, Number(c.target) || 0);
            const lvs = [];
            for (let l = Math.floor(now.startLv / 5) * 5 + 5; l <= target; l += 5) lvs.push(l);
            if (target > now.startLv && !lvs.includes(target)) lvs.push(target);
            if (!lvs.length) return null;
            const mine = bought.filter(p => this.passChar(p).id === ch.id);
            const pass = mine.length ? { free: run(none), without: mine.map(p => ({ p, r: run({ [p.id]: {} }) })) } : null;
            const hunt = this.huntCfg(c);
            const cur = Number(hunt.hours) || 0;
            const hours = hunt.kills > 0 ? [...new Set([...this.HUNT_HOURS, cur])].sort((a, b) => a - b) : [];
            const byHour = hours.map(h => {
                const cc = { ...c, hunt: { ...hunt, hours: h } };
                return { h, r: h === cur ? now : run(null, cc), free: pass ? run(none, cc) : null };
            });
            return { ch, target, lvs, now, pass, hunt, cur, byHour };
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
        const blocks = list.map(({ ch, target, lvs, now, pass, hunt, cur, byHour }) => {
            const passTable = pass ? `
            <div class="expu-sub">パス <span>パス名の列は、そのパスだけ買わなかったときに遅れる日数（足し算にはなりません）</span></div>
            <div class="overflow-x-auto"><table class="table table-xs expu-saved">
                <thead><tr><th></th><th>無料だけ</th><th>今の買い方</th><th>短縮</th>${pass.without.map(({ p }) => `<th>${p.short}</th>`).join('')}</tr></thead>
                <tbody>${lvs.map(l => {
                    const a = now.reachAt[l], b = pass.free.reachAt[l];
                    return `<tr><td class="font-bold text-white">Lv ${l}</td><td>${day(b)}</td><td>${day(a)}</td><td>${cut(gap(a, b))}</td>
                        ${pass.without.map(({ r }) => `<td>${cut(gap(a, r.reachAt[l]))}</td>`).join('')}</tr>`;
                }).join('')}</tbody>
            </table></div>` : '';
            const huntTable = byHour.length ? `
            <div class="expu-sub">1日の狩りの時間 <span>${hunt.kills.toLocaleString()} 体/時・EXP +${Number(hunt.pct) || 0}%。日付は今の買い方、横の数字は今の ${cur} 時間との差${pass ? '、右端は目標でのパスの短縮' : ''}</span></div>
            <div class="overflow-x-auto"><table class="table table-xs expu-saved">
                <thead><tr><th>時間/日</th>${lvs.map(l => `<th>Lv ${l}</th>`).join('')}${pass ? `<th>パスの短縮</th>` : ''}</tr></thead>
                <tbody>${byHour.map(({ h, r, free }) => `<tr class="${h === cur ? 'expu-cur' : ''}">
                    <td class="font-bold text-white">${h} 時間</td>
                    ${lvs.map(l => `<td>${day(r.reachAt[l])} ${h === cur ? '' : diff(gap(r.reachAt[l], now.reachAt[l]))}</td>`).join('')}
                    ${pass ? `<td>${cut(gap(r.reachAt[target], free.reachAt[target]))}</td>` : ''}
                </tr>`).join('')}</tbody>
            </table></div>` : `<div class="expu-sub"><span>狩りの「体/時」を入れると、1日の狩りの時間ごとの到達日も出ます</span></div>`;
            return `
            <div class="px-3 pt-3 text-sm font-bold text-white">${expEsc(ch.name)} <span class="text-[11px] font-normal text-slate-500">Lv ${now.startLv} → 目標 Lv ${target}</span></div>
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
                const i = w - p.week0;
                if (i < 0 || i >= p.weeks.length) return '';
                const who = this.passChar(p);
                if (!who) return '';
                const r = this.passWeek(p, i);
                const t = this.rewardText(p, r);
                return t ? `<div><span class="text-slate-500">${p.short}</span> ${t}</div>` : '';
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
                <span class="text-sm font-bold text-white">週ごとのバフ（％）とパスの受け取り</span>
            </div>
            <div class="overflow-x-auto">
                <table class="table table-xs expu-weeks">
                    <thead><tr><th>週</th><th>開始</th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}<th>パス</th></tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        </div>`;
    },
});
