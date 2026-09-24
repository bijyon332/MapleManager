/* =========================================================
 *  Cheat Sheet
 *  調べればすぐ出るけど一覧がない数値の早見表（GMS基準）。
 *  入力は無く、表を描くだけ。数値の出典は末尾の SOURCES と各表の注記。
 *  2026-09-24 時点で調べた値。ボス追加やパッチで変わったらここを直す。
 * ========================================================= */

const cheatsheet = {
    // ---- アーケインボス（必要アーケインフォース） -------------------------
    // entry: 入場Lv / lv: ボスLv（レベル差補正はこちらで効く）/ af: 必要AF
    ARCANE_BOSSES: [
        { boss: 'ルシード',       diff: 'イージー / ノーマル / ハード', entry: 220, lv: 230, af: 360 },
        { boss: 'ウィル',         diff: 'イージー',                   entry: 235, lv: 235, af: 560 },
        { boss: 'ウィル',         diff: 'ノーマル / ハード',          entry: 235, lv: 250, af: 760 },
        { boss: 'ダスク',         diff: 'ノーマル / カオス',          entry: 245, lv: 255, af: 730 },
        { boss: '真・ヒルラ',     diff: 'ノーマル',                   entry: 250, lv: 250, af: 820 },
        { boss: '真・ヒルラ',     diff: 'ハード',                     entry: 250, lv: 250, af: 900 },
        { boss: 'デュンケル',     diff: 'ノーマル / ハード',          entry: 255, lv: 265, af: 850 },
        { boss: '暗黒の魔法使い', diff: 'ハード',                     entry: 255, lv: 275, af: 1320, bm: true },
        { boss: '暗黒の魔法使い', diff: 'エクストリーム',             entry: 255, lv: 280, af: 1320, bm: true },
    ],
    // シンボル6種を全部Lv20にしたときのAF（220 × 6）。
    ARCANE_SYMBOL_MAX: 1320,

    // ---- オーセンティックボス（必要オーセンティックフォース） ---------------
    // sac1: 1段階目だけ要求が低いボスの、1段階目の値。
    // note: 表の下の注記番号。
    SACRED_BOSSES: [
        { boss: '選ばれし者セレン', diff: 'ノーマル',       entry: 260, lv: 270, sac: 200, sac1: 150 },
        { boss: '選ばれし者セレン', diff: 'ハード',         entry: 260, lv: 275, sac: 200, sac1: 150 },
        { boss: '選ばれし者セレン', diff: 'エクストリーム', entry: 260, lv: 280, sac: 200, sac1: 150 },
        { boss: 'カロス',           diff: 'イージー',       entry: 265, lv: 270, sac: 200 },
        { boss: 'カロス',           diff: 'ノーマル',       entry: 265, lv: 280, sac: 300, sac1: 250 },
        { boss: 'カロス',           diff: 'カオス',         entry: 265, lv: 285, sac: 330 },
        { boss: 'カロス',           diff: 'エクストリーム', entry: 265, lv: 285, sac: 440 },
        { boss: '最初の対敵者',     diff: 'イージー',       entry: 270, lv: 270, sac: 220 },
        { boss: '最初の対敵者',     diff: 'ノーマル',       entry: 270, lv: 280, sac: 320 },
        { boss: '最初の対敵者',     diff: 'ハード',         entry: 270, lv: 285, sac: 340, note: 1 },
        { boss: '最初の対敵者',     diff: 'エクストリーム', entry: 270, lv: 290, sac: 460, note: 1 },
        { boss: 'カリーン',         diff: 'イージー',       entry: 275, lv: 275, sac: 230 },
        { boss: 'カリーン',         diff: 'ノーマル',       entry: 275, lv: 285, sac: 330 },
        { boss: 'カリーン',         diff: 'ハード',         entry: 275, lv: 285, sac: 350 },
        { boss: 'カリーン',         diff: 'エクストリーム', entry: 275, lv: 285, sac: 480 },
        { boss: '凶星',             diff: 'ノーマル',       entry: 280, lv: 280, sac: 400 },
        { boss: '凶星',             diff: 'ハード',         entry: 280, lv: 280, sac: 550 },
        { boss: 'ベローナ',         diff: 'イージー',       entry: 280, lv: 280, sac: 400, note: 2 },
        { boss: 'ベローナ',         diff: 'ノーマル',       entry: 280, lv: 280, sac: 450, note: 2 },
        { boss: 'ベローナ',         diff: 'ハード',         entry: 280, lv: 280, sac: 550, note: 2 },
        { boss: 'リンボ',           diff: 'ノーマル / ハード', entry: 285, lv: 285, sac: 500 },
        { boss: 'バルドリクス',     diff: 'ノーマル / ハード', entry: 290, lv: 290, sac: 700 },
        { boss: 'ユピテル',         diff: 'ノーマル / ハード', entry: 295, lv: 295, sac: 810 },
    ],
    // 必要値からこれだけ上回ると与ダメが最大（125%）になる。
    SACRED_MAX_OVER: 50,

    // ---- アーケインフォースの比率（自分AF ÷ 必要AF）ごとの倍率 --------------
    // 公式ガイド（KMS）の表そのまま。被ダメは狩り場での値。
    ARCANE_RATIO: [
        { range: '150%以上',  dealt: 150, taken: 0 },
        { range: '130〜149%', dealt: 130, taken: 40 },
        { range: '110〜129%', dealt: 110, taken: 80 },
        { range: '100〜109%', dealt: 100, taken: 100 },
        { range: '70〜99%',   dealt: 80,  taken: 140 },
        { range: '50〜69%',   dealt: 70,  taken: 160 },
        { range: '30〜49%',   dealt: 60,  taken: 180 },
        { range: '10〜29%',   dealt: 30,  taken: 240 },
        { range: '0〜9%',     dealt: 10,  taken: 280 },
    ],

    // ---- オーセンティックフォースの差（自分SAC − 必要SAC）ごとの倍率 ---------
    // 与ダメ: 不足は1ポイントにつき −1%（最低5%）、超過は2ポイントにつき +1%（最大125%）。
    // 被ダメ: 公式に載っているのは 0 → 100%、−50 → 150%、最大200% の3点だけ。
    //         −95以下が200%（与ダメ5%と同じ行）。間は1ポイントにつき +1% として補っている（推定）。
    sacredDealt(d) { return d >= 0 ? Math.min(125, 100 + d / 2) : Math.max(5, 100 + d); },
    sacredTaken(d) { return d >= 0 ? 100 : d <= -95 ? 200 : 100 - d; },
    SACRED_DIFFS: [50, 40, 30, 20, 10, 0, -10, -20, -30, -40, -50, -60, -70, -80, -90, -95],
    SACRED_TAKEN_KNOWN: [0, -50, -95],   // 公式値。これ以外の被ダメは推定

    // ---- レベル差（自分Lv − 相手Lv）ごとの補正 ------------------------------
    // 与ダメ: +5以上120%、0で110%、−2で100%、−4以下は1レベルごとに −2.5%、−40で0%。
    //   ※ −3/−4 は MapleStory Wiki（GMS）と MapleWidget（KMS）で値が違う。KMS側を採用。
    levelDamage(d) {
        if (d >= 5) return 120;
        if (d >= 0) return 110 + d * 2;
        if (d >= -4) return 100 + (d + 2) * 5;
        return Math.max(0, 90 + (d + 4) * 2.5);
    },
    // 経験値: 相手と同じくらいが一番多い（±1で120%）。
    levelExp(d) {
        const a = Math.abs(d);
        if (a <= 1) return 120;
        if (a <= 4) return 110;
        if (a <= 9) return 105;
        if (a === 10) return 100;
        if (d > 0) return d <= 20 ? 100 - Math.ceil((d - 10) / 2) : Math.max(70, 110 - d);
        return d >= -20 ? 100 + (d + 10) : Math.max(10, 70 + (d + 21) * 4);
    },
    // メル: ±10までは100%。自分が上すぎても、相手が上すぎても減る。
    //   ※ +28 は MapleStory Wiki（GMS）が17%、MapleWidget（KMS）が16%。GMS側を採用。
    MESO_HIGH: { 29: 3, 28: 17, 27: 24, 26: 35, 25: 45, 24: 54, 23: 62, 22: 69, 21: 75, 20: 80 },
    levelMeso(d) {
        if (d >= 30) return 0;
        if (d >= 20) return this.MESO_HIGH[d];
        if (d > 10) return 100 - (d - 10) * 2;
        if (d >= -10) return 100;
        if (d >= -20) return 100 + (d + 10) * 3;
        return Math.max(0, 70 + (d + 20) * 5);
    },
    LEVEL_RANGE: 40,

    SOURCES: [
        { label: 'MapleStory Wiki: Bosses（各ボスの入場Lv・ボスLv・必要AF/SAC）', url: 'https://maplestorywiki.net/w/Bosses' },
        { label: 'Mapler House: Boss HP, Level & Force Table（GMS）', url: 'https://www.maplerhouse.com/guide/boss/boss-overview' },
        { label: 'メイプルストーリー公式ガイド: アーケインフォース/オーセンティックフォース（KMS）', url: 'https://maplestory.nexon.com/Guide/N23GameInformation/Articles/396' },
        { label: 'MapleStory Wiki: Damage Formula（レベル差の与ダメ）', url: 'https://maplestorywiki.net/w/Damage_Formula' },
        { label: 'MapleStory Wiki: Experience（レベル差の経験値）', url: 'https://maplestorywiki.net/w/Experience' },
        { label: 'MapleStory Wiki: Meso（レベル差のメル）', url: 'https://maplestorywiki.net/w/Meso' },
        { label: 'MapleWidget: レベル差表（KMS）', url: 'https://www.maplewidget.com/tables/level-gap' },
    ],

    init(rootId) {
        const root = document.getElementById(rootId);
        root.innerHTML = this.render();
        // レベル差の表は長いので、差0の行が見えるところまで送っておく。
        const box = root.querySelector('[data-cs="level-scroll"]');
        const zero = root.querySelector('[data-cs="level-zero"]');
        if (box && zero) box.scrollTop = zero.offsetTop - box.clientHeight / 2;
    },

    // ---------------------------------------------------------
    //  描画
    // ---------------------------------------------------------
    fmtPct(v) { return `${Number.isInteger(v) ? v : v.toFixed(1)}%`; },
    fmtDiff(d) { return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0'; },

    // 100% を基準に、上は緑、下は赤、0% は暗く。
    toneDealt(v) {
        if (v > 100) return 'text-emerald-300';
        if (v === 100) return 'text-slate-200';
        if (v === 0) return 'text-slate-600';
        return v >= 70 ? 'text-amber-300' : 'text-rose-400';
    },
    // 被ダメは少ないほど良いので色を逆にする。
    toneTaken(v) {
        if (v < 100) return 'text-emerald-300';
        if (v === 100) return 'text-slate-200';
        return v <= 150 ? 'text-amber-300' : 'text-rose-400';
    },

    card(title, sub, body, extra = '') {
        return `<section class="bg-slate-900/60 border border-slate-800 rounded-xl p-4 ${extra}">
            <h2 class="text-sm font-bold text-white">${title}</h2>
            ${sub ? `<p class="text-[11px] text-slate-400 mt-0.5 mb-3">${sub}</p>` : '<div class="mb-3"></div>'}
            ${body}
        </section>`;
    },

    table(headers, rows, { stickyHead = false } = {}) {
        const th = headers.map(h => `<th class="px-2 py-1.5 font-bold ${h.left ? 'text-left' : 'text-right'}">${h.label}</th>`).join('');
        return `<table class="w-full text-xs tabular-nums">
            <thead class="text-[10px] text-slate-400 border-b border-slate-700 ${stickyHead ? 'sticky top-0 bg-slate-900' : ''}"><tr>${th}</tr></thead>
            <tbody class="divide-y divide-slate-800/70">${rows.join('')}</tbody>
        </table>`;
    },

    // 同じボスが続く行はボス名を空けて、切り替わりに線を入れる。
    bossName(list, i) {
        return i > 0 && list[i - 1].boss === list[i].boss ? '' : list[i].boss;
    },

    renderArcane() {
        const req = (af, m) => Math.ceil(af * m - 1e-9);
        const rows = this.ARCANE_BOSSES.map((b, i) => {
            // シンボルだけでは届かない値は薄く出す。
            const cell = (m, strong) => {
                const v = req(b.af, m);
                const out = v > this.ARCANE_SYMBOL_MAX;
                const cls = strong ? 'text-amber-300 font-bold' : out ? 'text-slate-600' : 'text-slate-200';
                return `<td class="px-2 py-1.5 text-right ${cls}">${v}</td>`;
            };
            return `<tr class="${b.bm ? 'bg-amber-500/5' : ''}">
                <td class="px-2 py-1.5 text-slate-100 font-bold whitespace-nowrap">${this.bossName(this.ARCANE_BOSSES, i)}</td>
                <td class="px-2 py-1.5 text-slate-400 whitespace-nowrap">${b.diff}</td>
                <td class="px-2 py-1.5 text-right text-slate-300">${b.entry}</td>
                <td class="px-2 py-1.5 text-right text-slate-300">${b.lv}</td>
                <td class="px-2 py-1.5 text-right text-indigo-300 font-bold">${b.af}</td>
                ${cell(1.1, b.bm)}${cell(1.3, false)}${cell(1.5, !b.bm)}
            </tr>`;
        });
        const body = this.table([
            { label: 'ボス', left: true }, { label: '難易度', left: true },
            { label: '入場Lv' }, { label: 'ボスLv' }, { label: '必要AF' },
            { label: '1.1倍' }, { label: '1.3倍' }, { label: '1.5倍（最大）' },
        ], rows);
        return this.card('アーケインボスの必要アーケインフォース',
            '倍率の列は、その倍率に届くAF。倍率は「自分AF ÷ 必要AF」で段階的に決まる（下の比率表）。',
            `<div class="overflow-x-auto">${body}</div>
            <p class="text-[11px] text-slate-500 mt-2 leading-relaxed">
                シンボル6種を全部Lv20にして AF ${this.ARCANE_SYMBOL_MAX}。薄い数字はシンボルだけでは届かない値。
                暗黒の魔法使いはシンボルだけだと1.0倍止まりで、1.1倍（1452）にはシンボル以外で +132 が要る。
            </p>`);
    },

    renderSacred() {
        const rows = this.SACRED_BOSSES.map((b, i) => {
            const newBoss = i > 0 && this.SACRED_BOSSES[i - 1].boss !== b.boss;
            return `<tr class="${newBoss ? 'border-t border-slate-700' : ''}">
                <td class="px-2 py-1.5 text-slate-100 font-bold whitespace-nowrap">${this.bossName(this.SACRED_BOSSES, i)}${b.note && this.bossName(this.SACRED_BOSSES, i) ? `<sup class="text-amber-400 ml-0.5">※${b.note}</sup>` : ''}</td>
                <td class="px-2 py-1.5 text-slate-400 whitespace-nowrap">${b.diff}</td>
                <td class="px-2 py-1.5 text-right text-slate-300">${b.entry}</td>
                <td class="px-2 py-1.5 text-right text-slate-300">${b.lv}${b.note === 1 ? '<sup class="text-amber-400 ml-0.5">※1</sup>' : ''}</td>
                <td class="px-2 py-1.5 text-right text-cyan-300 font-bold">${b.sac}${b.sac1 ? `<span class="text-slate-500 font-normal text-[10px] ml-1">(1段階目 ${b.sac1})</span>` : ''}</td>
                <td class="px-2 py-1.5 text-right text-amber-300 font-bold">${b.sac + this.SACRED_MAX_OVER}</td>
            </tr>`;
        });
        const body = this.table([
            { label: 'ボス', left: true }, { label: '難易度', left: true },
            { label: '入場Lv' }, { label: 'ボスLv' }, { label: '必要SAC' }, { label: '最大（+50）' },
        ], rows);
        return this.card('オーセンティックボスの必要オーセンティックフォース',
            '必要値を50上回ると与ダメが最大の1.25倍（下の差の表）。',
            `<div class="overflow-x-auto">${body}</div>
            <p class="text-[11px] text-slate-500 mt-2 leading-relaxed">
                ※1 最初の対敵者ハード/エクストリームのボスLvは、Mapler House が 285/290、MapleStory Wiki が 270 で食い違っている。<br>
                ※2 ベローナは KMS で 2026-08 に実装。GMS に来ているかは未確認。
            </p>`);
    },

    renderArcaneRatio() {
        const rows = this.ARCANE_RATIO.map(r => `<tr>
            <td class="px-2 py-1.5 text-slate-200">${r.range}</td>
            <td class="px-2 py-1.5 text-right font-bold ${this.toneDealt(r.dealt)}">${r.dealt}%</td>
            <td class="px-2 py-1.5 text-right ${this.toneTaken(r.taken)}">${r.taken}%</td>
        </tr>`);
        return this.card('アーケインフォースの比率と倍率', '自分AF ÷ 必要AF',
            this.table([{ label: '比率', left: true }, { label: '与ダメ' }, { label: '被ダメ（狩り場）' }], rows));
    },

    renderSacredDiff() {
        const rows = this.SACRED_DIFFS.map(d => {
            const dealt = this.sacredDealt(d), taken = this.sacredTaken(d);
            const guess = d < 0 && !this.SACRED_TAKEN_KNOWN.includes(d);
            const label = d === 50 ? '+50以上' : d === -95 ? '−95以下' : this.fmtDiff(d);
            return `<tr class="${d === 0 ? 'bg-slate-800/60' : ''}">
                <td class="px-2 py-1.5 text-slate-200">${label}</td>
                <td class="px-2 py-1.5 text-right font-bold ${this.toneDealt(dealt)}">${this.fmtPct(dealt)}</td>
                <td class="px-2 py-1.5 text-right ${this.toneTaken(taken)}">${this.fmtPct(taken)}${guess ? '<sup class="text-amber-400 ml-0.5">※</sup>' : ''}</td>
            </tr>`;
        });
        return this.card('オーセンティックフォースの差と倍率', '自分SAC − 必要SAC',
            `${this.table([{ label: '差', left: true }, { label: '与ダメ' }, { label: '被ダメ（狩り場）' }], rows)}
            <p class="text-[11px] text-slate-500 mt-2 leading-relaxed">
                与ダメは、不足は1ポイントにつき −1%（最低5%）、超過は2ポイントにつき +1%（最大125%）。<br>
                ※ 被ダメは公式に 0 / −50 / 最大 の3点しか載っておらず、間は直線で補った推定値。
            </p>`);
    },

    renderLevel() {
        const rows = [];
        for (let d = this.LEVEL_RANGE; d >= -this.LEVEL_RANGE; d--) {
            const dmg = this.levelDamage(d), exp = this.levelExp(d), meso = this.levelMeso(d);
            const label = d === this.LEVEL_RANGE ? `+${d}以上` : d === -this.LEVEL_RANGE ? `−${-d}以下` : this.fmtDiff(d);
            rows.push(`<tr ${d === 0 ? 'data-cs="level-zero" class="bg-slate-800/60"' : ''}>
                <td class="px-2 py-1 text-slate-200">${label}</td>
                <td class="px-2 py-1 text-right ${this.toneDealt(dmg)}">${this.fmtPct(dmg)}</td>
                <td class="px-2 py-1 text-right ${this.toneDealt(exp)}">${exp}%</td>
                <td class="px-2 py-1 text-right ${this.toneDealt(meso)}">${meso}%</td>
            </tr>`);
        }
        return this.card('レベル差による与ダメ・経験値・メル',
            '自分Lv − 相手Lv（プラスは自分の方が上）。ボスへの与ダメは上の表のボスLvと比べる。',
            `<div data-cs="level-scroll" class="max-h-[34rem] overflow-y-auto custom-scrollbar relative">
                ${this.table([{ label: 'レベル差', left: true }, { label: '与ダメ' }, { label: '経験値' }, { label: 'メル' }], rows, { stickyHead: true })}
            </div>
            <p class="text-[11px] text-slate-500 mt-2 leading-relaxed">
                与ダメの −3 / −4 は MapleStory Wiki（GMS）では 96.72% / 91.8% で、MapleWidget（KMS）の 95% / 90% と食い違う（KMS側を採用）。
                メルの +28 は Wiki が 17%、MapleWidget が 16%（Wiki側を採用）。
            </p>`, 'lg:row-span-2');
    },

    render() {
        const sources = this.SOURCES.map(s =>
            `<li><a href="${s.url}" target="_blank" rel="noopener" class="text-indigo-300 hover:text-indigo-200 underline decoration-slate-600">${s.label}</a></li>`).join('');
        return `<div class="max-w-[1400px] mx-auto space-y-4">
            <div>
                <h1 class="text-lg font-bold text-white">Cheat Sheet</h1>
                <p class="text-xs text-slate-400">GMS基準の早見表（2026-09-24 時点）。</p>
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                ${this.renderArcane()}
                ${this.renderSacred()}
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                ${this.renderArcaneRatio()}
                ${this.renderSacredDiff()}
                ${this.renderLevel()}
            </div>
            <section class="text-[11px] text-slate-500">
                <p class="font-bold text-slate-400 mb-1">出典</p>
                <ul class="list-disc pl-5 space-y-0.5">${sources}</ul>
            </section>
        </div>`;
    },
};
