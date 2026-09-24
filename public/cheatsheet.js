/* =========================================================
 *  Cheat Sheet
 *  調べればすぐ出るけど一覧がない数値の早見表（GMS基準）。
 *  入力は無く、表を描くだけ。1画面に収まる密度を優先している。
 *  数値の出典は SOURCES と各注記。2026-09-24 時点で調べた値。
 *  ボス追加やパッチで変わったら、ここのデータだけ直せばよい。
 * ========================================================= */

const cheatsheet = {
    // ---- シンボル合計Lv とフォースの換算 ------------------------------------
    // アーケイン: Lv1で30、1Lvごとに+10、Lv20で220。6地域すべて装備して
    //             ARC = 120 + 10 × 合計Lv（最大 Lv120 = 1320）。
    // オーセンティック: Lv1で10、1Lvごとに+10、Lv11で110。AUT = 10 × 合計Lv。
    ARC_CAP: 1320,
    arcLevel(f) { return f > this.ARC_CAP ? null : Math.max(0, Math.ceil((f - 120) / 10)); },
    autLevel(f) { return Math.ceil(f / 10); },

    // 難易度の列。カオスはハードの列に入れる（同じボスに両方あることはない）。
    COLS: [
        { key: 'E', label: 'イージー' },
        { key: 'N', label: 'ノーマル' },
        { key: 'H', label: 'ハード / カオス' },
        { key: 'X', label: 'エクストリーム' },
    ],

    // ---- アーケインボス ------------------------------------------------------
    // entry: 入場Lv / 各難易度: lv = ボスLv（レベル差補正はこちらで効く）、af = 必要AF
    ARCANE_BOSSES: [
        { boss: 'ルシード', entry: 220, E: { lv: 230, af: 360 }, N: { lv: 230, af: 360 }, H: { lv: 230, af: 360 } },
        { boss: 'ウィル', entry: 235, E: { lv: 235, af: 560 }, N: { lv: 250, af: 760 }, H: { lv: 250, af: 760 } },
        { boss: 'ダスク', entry: 245, N: { lv: 255, af: 730 }, H: { lv: 255, af: 730, chaos: true } },
        { boss: '真・ヒルラ', entry: 250, N: { lv: 250, af: 820 }, H: { lv: 250, af: 900 } },
        { boss: 'デュンケル', entry: 255, N: { lv: 265, af: 850 }, H: { lv: 265, af: 850 } },
        { boss: '暗黒の魔法使い', entry: 255, H: { lv: 275, af: 1320 }, X: { lv: 280, af: 1320 } },
    ],
    ARC_TIERS: [1.5, 1.3, 1.1],

    // ---- オーセンティックボス ------------------------------------------------
    // sac1: 1段階目だけ要求が低いボスの、1段階目の値。note: 注記番号。
    SACRED_BOSSES: [
        { boss: '選ばれし者セレン', entry: 260,
          N: { lv: 270, sac: 200, sac1: 150 }, H: { lv: 275, sac: 200, sac1: 150 }, X: { lv: 280, sac: 200, sac1: 150 } },
        { boss: 'カロス', entry: 265,
          E: { lv: 270, sac: 200 }, N: { lv: 280, sac: 300, sac1: 250 }, H: { lv: 285, sac: 330, chaos: true }, X: { lv: 285, sac: 440 } },
        { boss: '最初の対敵者', entry: 270,
          E: { lv: 270, sac: 220 }, N: { lv: 280, sac: 320 }, H: { lv: 285, sac: 340, note: 1 }, X: { lv: 290, sac: 460, note: 1 } },
        { boss: 'カリーン', entry: 275,
          E: { lv: 275, sac: 230 }, N: { lv: 285, sac: 330 }, H: { lv: 285, sac: 350 }, X: { lv: 285, sac: 480 } },
        { boss: '凶星', entry: 280, N: { lv: 280, sac: 400 }, H: { lv: 280, sac: 550 } },
        { boss: 'ベローナ', entry: 280, note: 2,
          E: { lv: 280, sac: 400 }, N: { lv: 280, sac: 450 }, H: { lv: 280, sac: 550 } },
        { boss: 'リンボ', entry: 285, N: { lv: 285, sac: 500 }, H: { lv: 285, sac: 500 } },
        { boss: 'バルドリクス', entry: 290, N: { lv: 290, sac: 700 }, H: { lv: 290, sac: 700 } },
        { boss: 'ユピテル', entry: 295, N: { lv: 295, sac: 810 }, H: { lv: 295, sac: 810 } },
    ],
    SACRED_MAX_OVER: 50,   // 必要値 +50 で与ダメが最大（125%）

    // ---- アーケインフォースの比率（自分AF ÷ 必要AF）ごとの倍率 --------------
    // 公式ガイド（KMS）の表そのまま。被ダメは狩り場での値。
    ARCANE_RATIO: [
        { range: '〜9%',    dealt: 10,  taken: 280 },
        { range: '10%〜',   dealt: 30,  taken: 240 },
        { range: '30%〜',   dealt: 60,  taken: 180 },
        { range: '50%〜',   dealt: 70,  taken: 160 },
        { range: '70%〜',   dealt: 80,  taken: 140 },
        { range: '100%〜',  dealt: 100, taken: 100 },
        { range: '110%〜',  dealt: 110, taken: 80 },
        { range: '130%〜',  dealt: 130, taken: 40 },
        { range: '150%〜',  dealt: 150, taken: 0 },
    ],

    // ---- オーセンティックフォースの差（自分AUT − 必要AUT）ごとの倍率 ---------
    // 与ダメ: 不足は1ポイントにつき −1%（最低5%）、超過は2ポイントにつき +1%（最大125%）。
    // 被ダメ: 公式に載っているのは 0 → 100%、−50 → 150%、−95以下 → 200% の3点だけ。
    //         間は1ポイントにつき +1% として補っている（推定）。超過しても100%未満にはならない。
    sacredDealt(d) { return d >= 0 ? Math.min(125, 100 + d / 2) : Math.max(5, 100 + d); },
    sacredTaken(d) { return d >= 0 ? 100 : d <= -95 ? 200 : 100 - d; },
    SACRED_DIFFS: [-95, -90, -80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50],
    SACRED_TAKEN_KNOWN: [0, -50, -95],

    // ---- レベル差（自分Lv − 相手Lv）ごとの補正 ------------------------------
    // 与ダメ: (100 − 2.5 × 格上レベル差) × (1 + ボーナス)。ボーナスは差0で+10%、
    //   1Lvごとに ±2%p、0%〜+20% の範囲（JMS公式ゲームガイド「レベル別ダメージ量」）。
    //   −1 は 97.5×1.08 = 105.3%、−5 でボーナスが0になり以降は −2.5%p ずつ、−40 で 0%。
    levelDamage(d) {
        const bonus = Math.min(0.2, Math.max(0, 0.1 + 0.02 * d));
        return Math.max(0, (100 - 2.5 * Math.max(0, -d)) * (1 + bonus));
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
    LEVEL_NEAR: 10,   // 数字を出す範囲（±）
    LEVEL_FAR: 40,    // 色の帯で出す範囲（±）

    SOURCES: [
        { label: 'MapleStory Wiki: Bosses（入場Lv・ボスLv・必要AF/AUT）', url: 'https://maplestorywiki.net/w/Bosses' },
        { label: 'Mapler House: Boss HP, Level & Force Table（GMS）', url: 'https://www.maplerhouse.com/guide/boss/boss-overview' },
        { label: '公式ガイド: アーケインフォース/オーセンティックフォース（KMS）', url: 'https://maplestory.nexon.com/Guide/N23GameInformation/Articles/396' },
        { label: 'MapleStory Wiki: Damage Formula', url: 'https://maplestorywiki.net/w/Damage_Formula' },
        { label: 'MapleStory Wiki: Experience', url: 'https://maplestorywiki.net/w/Experience' },
        { label: 'MapleStory Wiki: Meso', url: 'https://maplestorywiki.net/w/Meso' },
        { label: 'MapleWidget: レベル差表（KMS）', url: 'https://www.maplewidget.com/tables/level-gap' },
    ],

    init(rootId) {
        document.getElementById(rootId).innerHTML = this.render();
    },

    // ---------------------------------------------------------
    //  描画の部品
    // ---------------------------------------------------------
    fmtNum(v) { return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, ''); },
    fmtDiff(d) { return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0'; },

    // 100% を基準に、良い方へ離れるほど緑、悪い方へ離れるほど赤を濃くする。
    // up: 良い側でいちばん濃くなる差、invert: 被ダメのように小さい方が良いもの。
    heat(v, { up = 50, invert = false } = {}) {
        let t = invert ? 100 - v : v - 100;
        if (t === 0) return 'background:rgba(148,163,184,0.10)';
        const good = t > 0;
        t = Math.min(1, Math.abs(t) / (good ? up : 100));
        const a = (0.10 + 0.50 * t).toFixed(3);
        return good ? `background:rgba(16,185,129,${a})` : `background:rgba(244,63,94,${a})`;
    },

    card(title, sub, body) {
        return `<section class="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
            <div class="flex items-baseline gap-2 mb-2 flex-wrap">
                <h2 class="text-xs font-bold text-white">${title}</h2>
                ${sub ? `<span class="text-[10px] text-slate-500">${sub}</span>` : ''}
            </div>
            ${body}
        </section>`;
    },

    // 数字入りの色つきの帯。cols が横、rows が行（与ダメ・被ダメなど）。
    heatGrid(cols, rows, { labelWidth = '3.5rem', mark = null } = {}) {
        const tmpl = `grid-template-columns:${labelWidth} repeat(${cols.length},minmax(0,1fr))`;
        const head = `<div></div>` + cols.map((c, i) =>
            `<div class="text-center text-[10px] leading-4 ${mark === i ? 'text-white font-bold' : 'text-slate-500'} whitespace-nowrap overflow-hidden">${c}</div>`).join('');
        const body = rows.map(r => `<div class="text-[10px] text-slate-400 self-center pr-1 whitespace-nowrap">${r.label}</div>` +
            r.values.map((v, i) => `<div class="text-center text-[11px] leading-5 tabular-nums text-slate-100 ${mark === i ? 'font-bold ring-1 ring-inset ring-slate-400/60' : ''}"
                style="${this.heat(v, r.opts)}" ${r.titles ? `title="${r.titles[i]}"` : ''}>${this.fmtNum(v)}${r.star && r.star(i) ? '<sup class="text-amber-300">※</sup>' : ''}</div>`).join('')).join('');
        return `<div class="grid gap-px" style="${tmpl}">${head}${body}</div>`;
    },

    // ---------------------------------------------------------
    //  ボスの表（行 = ボス、列 = 難易度）
    // ---------------------------------------------------------
    arcaneCell(c) {
        if (!c) return '<td class="px-1.5 py-1 text-center text-slate-700">—</td>';
        const lv = this.arcLevel(c.af);
        // 1.5倍がシンボル上限（1320）を超えるときは、届く中で一番上の倍率を出す。
        // どれも届かない（暗黒の魔法使い）ときは 1.1倍 を出して、足りない分を添える。
        const tiers = this.ARC_TIERS.map(m => ({ m, v: Math.ceil(c.af * m - 1e-9) }));
        const reach = tiers.find(t => t.v <= this.ARC_CAP);
        const top = tiers[0];
        let max;
        if (reach === top) {
            max = `<span class="text-slate-500">×1.5</span> <b class="text-amber-300">${top.v}</b> <span class="text-slate-500">Σ${this.arcLevel(top.v)}</span>`;
        } else if (reach) {
            max = `<span class="text-slate-600 line-through" title="シンボルだけでは届かない">×1.5 ${top.v}</span>
                <span class="text-slate-500">×${reach.m}</span> <b class="text-amber-300">${reach.v}</b> <span class="text-slate-500">Σ${this.arcLevel(reach.v)}</span>`;
        } else {
            const t = tiers[tiers.length - 1];
            max = `<span class="text-slate-500">×1.1</span> <b class="text-amber-300">${t.v}</b>
                <span class="text-rose-300" title="シンボルだけだと ${this.ARC_CAP} で止まる">+${t.v - this.ARC_CAP}</span>`;
        }
        return `<td class="px-1.5 py-1 align-top">
            <div class="flex items-baseline gap-1"><b class="text-indigo-300 text-[13px]">${c.af}</b>
                <span class="text-slate-500">Σ${lv}</span>
                <span class="ml-auto text-slate-500">${c.chaos ? 'カオス ' : ''}Lv${c.lv}</span></div>
            <div class="whitespace-nowrap">${max}</div>
        </td>`;
    },

    sacredCell(c) {
        if (!c) return '<td class="px-1.5 py-1 text-center text-slate-700">—</td>';
        const max = c.sac + this.SACRED_MAX_OVER;
        return `<td class="px-1.5 py-1 align-top">
            <div class="flex items-baseline gap-1"><b class="text-cyan-300 text-[13px]">${c.sac}</b>
                <span class="text-slate-500">Σ${this.autLevel(c.sac)}</span>
                <span class="ml-auto text-slate-500 whitespace-nowrap">${c.chaos ? 'カオス ' : ''}Lv${c.lv}${c.note ? `<sup class="text-amber-300">※${c.note}</sup>` : ''}</span></div>
            <div class="whitespace-nowrap"><span class="text-slate-500">最大</span> <b class="text-amber-300">${max}</b>
                <span class="text-slate-500">Σ${this.autLevel(max)}</span>
                ${c.sac1 ? `<span class="text-slate-500 text-[10px]" title="1段階目だけ要求 ${c.sac1}">1段目${c.sac1}</span>` : ''}</div>
        </td>`;
    },

    bossTable(list, cell) {
        const cols = this.COLS.filter(col => list.some(b => b[col.key]));
        const head = `<tr><th class="text-left px-1.5 pb-1 font-bold">ボス</th>${cols.map(c => `<th class="text-left px-1.5 pb-1 font-bold">${c.label}</th>`).join('')}</tr>`;
        const rows = list.map(b => `<tr class="border-t border-slate-800">
            <td class="px-1.5 py-1 align-top whitespace-nowrap">
                <div class="text-slate-100 font-bold text-[12px]">${b.boss}${b.note ? `<sup class="text-amber-300">※${b.note}</sup>` : ''}</div>
                <div class="text-slate-500">入場 ${b.entry}</div>
            </td>
            ${cols.map(c => cell.call(this, b[c.key])).join('')}
        </tr>`).join('');
        return `<div class="overflow-x-auto"><table class="w-full text-[11px] tabular-nums">
            <thead class="text-[10px] text-slate-500 border-b border-slate-700">${head}</thead><tbody>${rows}</tbody>
        </table></div>`;
    },

    renderArcane() {
        return this.card('アーケインボス', '必要AF・Σ シンボル合計Lv（6地域装備）・ボスLv / 下段は最大倍率に要るAF',
            this.bossTable(this.ARCANE_BOSSES, this.arcaneCell)
            + `<p class="text-[10px] text-slate-500 mt-1.5">ARC = 120 + 10 × Σ（上限 Σ120 = 1320）。1.5倍が上限を超えるボスは、届く中で一番上の倍率を出している。</p>`);
    },

    renderSacred() {
        return this.card('オーセンティックボス', '必要AUT・Σ シンボル合計Lv・ボスLv / 下段は最大倍率（+50）に要るAUT',
            this.bossTable(this.SACRED_BOSSES, this.sacredCell)
            + `<p class="text-[10px] text-slate-500 mt-1.5">AUT = 10 × Σ。最大倍率は常に要求 +50（Σ で +5）。</p>`);
    },

    // ---------------------------------------------------------
    //  倍率の帯
    // ---------------------------------------------------------
    renderArcaneRatio() {
        const r = this.ARCANE_RATIO;
        return this.card('アーケインフォース比率', '自分AF ÷ 必要AF',
            this.heatGrid(r.map(x => x.range), [
                { label: '与ダメ%', values: r.map(x => x.dealt), opts: { up: 50 } },
                { label: '被ダメ%', values: r.map(x => x.taken), opts: { invert: true } },
            ], { mark: 5 }));
    },

    // シンボル1個のLvとフォース。ボス表の Σ（合計Lv）を読み替えるときの手がかり。
    renderSymbols() {
        const row = (label, n, fn, cls) => `<div class="text-[10px] text-slate-400 self-center pr-1 whitespace-nowrap">${label}</div>`
            + Array.from({ length: 20 }, (_, i) => i < n
                ? `<div class="text-center text-[11px] leading-5 tabular-nums ${cls} bg-slate-800/60">${fn(i + 1)}</div>`
                : '<div></div>').join('');
        const head = `<div class="text-[10px] text-slate-500">Lv</div>` + Array.from({ length: 20 }, (_, i) =>
            `<div class="text-center text-[10px] leading-4 text-slate-500">${i + 1}</div>`).join('');
        return this.card('シンボル1個のLvとフォース', 'アーケインは Lv20 で 220、オーセンティックは Lv11 で 110',
            `<div class="grid gap-px" style="grid-template-columns:3.5rem repeat(20,minmax(0,1fr))">
                ${head}${row('アーケイン', 20, lv => 20 + 10 * lv, 'text-indigo-300')}${row('オーセン', 11, lv => 10 * lv, 'text-cyan-300')}
            </div>`);
    },

    renderSacredDiff() {
        const ds = this.SACRED_DIFFS;
        return this.card('オーセンティックフォース差', '自分AUT − 必要AUT',
            this.heatGrid(ds.map(d => d === -95 ? '≤−95' : d === 50 ? '+50≤' : this.fmtDiff(d)), [
                { label: '与ダメ%', values: ds.map(d => this.sacredDealt(d)), opts: { up: 25 } },
                { label: '被ダメ%', values: ds.map(d => this.sacredTaken(d)), opts: { invert: true },
                  star: i => ds[i] < 0 && !this.SACRED_TAKEN_KNOWN.includes(ds[i]) },
            ], { mark: ds.indexOf(0) })
            + `<p class="text-[10px] text-slate-500 mt-1.5">不足は1につき −1%（最低5%）、超過は2につき +1%（最大125%）。※被ダメは公式が 0 / −50 / −95 の3点だけで、間は推定。</p>`);
    },

    renderLevel() {
        const near = [];
        for (let d = -this.LEVEL_NEAR; d <= this.LEVEL_NEAR; d++) near.push(d);
        const far = [];
        for (let d = -this.LEVEL_FAR; d <= this.LEVEL_FAR; d++) far.push(d);

        const kinds = [
            { label: '与ダメ%', fn: d => this.levelDamage(d), opts: { up: 20 } },
            { label: '経験値%', fn: d => this.levelExp(d), opts: { up: 20 } },
            { label: 'メル%', fn: d => this.levelMeso(d), opts: { up: 20 } },
        ];
        const nearGrid = this.heatGrid(near.map(d => this.fmtDiff(d)),
            kinds.map(k => ({ label: k.label, values: near.map(k.fn), opts: k.opts })),
            { mark: near.indexOf(0) });

        // ±40 は色だけの帯。数字はマウスを載せると出る。
        const tmpl = `grid-template-columns:3.5rem repeat(${far.length},minmax(0,1fr))`;
        const bars = kinds.map(k => `<div class="text-[10px] text-slate-400 self-center pr-1">${k.label}</div>` +
            far.map(d => {
                const v = k.fn(d);
                return `<div class="h-3" style="${this.heat(v, k.opts)}" title="${this.fmtDiff(d)}: ${this.fmtNum(v)}%"></div>`;
            }).join('')).join('');
        const ticks = `<div></div>` + far.map(d => `<div class="relative h-3">${d % 10 === 0
            ? `<span class="absolute left-1/2 -translate-x-1/2 text-[10px] ${d === 0 ? 'text-white' : 'text-slate-500'} whitespace-nowrap">${this.fmtDiff(d)}</span>` : ''}</div>`).join('');
        const farGrid = `<div class="grid gap-y-px mt-2" style="${tmpl}">${bars}${ticks}</div>`;

        const outside = [
            ['与ダメ', '−5 以降は 1Lv ごとに −2.5%p（−10 で 75%、−20 で 50%）、−40 で 0%。+5 以上は 120% 固定'],
            ['経験値', '+11〜+20 は 99→95%、+21〜+39 は 89→71%、+40 以上 70%。−11〜−20 は 99→90%、−21〜−35 は 70→14%、−36 以下 10%'],
            ['メル', '+11〜+19 は 98→82%、+20〜+29 は 80→3%、+30 以上 0%。−11〜−20 は 97→70%、−21〜−33 は 65→5%、−34 以下 0%'],
        ].map(([k, v]) => `<div><span class="text-slate-400">${k}</span> ${v}</div>`).join('');

        return this.card('レベル差', '自分Lv − 相手Lv（左ほど相手が格上）。ボスはボスLvと比べる',
            nearGrid + farGrid
            + `<div class="text-[10px] text-slate-500 mt-2 space-y-0.5">${outside}</div>`);
    },

    render() {
        const sources = this.SOURCES.map(s =>
            `<a href="${s.url}" target="_blank" rel="noopener" class="text-indigo-300 hover:text-indigo-200 underline decoration-slate-700">${s.label}</a>`).join('<span class="text-slate-700"> / </span>');
        return `<div class="max-w-[1500px] mx-auto space-y-3">
            <div class="flex items-baseline gap-3 flex-wrap">
                <h1 class="text-base font-bold text-white">Cheat Sheet</h1>
                <span class="text-[11px] text-slate-500">GMS基準（2026-09-24 時点）。色は100%より良いほど緑、悪いほど赤。</span>
            </div>
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
                <div class="space-y-3">
                    ${this.renderArcane()}
                    ${this.renderArcaneRatio()}
                    ${this.renderSymbols()}
                </div>
                <div class="space-y-3">
                    ${this.renderSacred()}
                    ${this.renderSacredDiff()}
                </div>
            </div>
            ${this.renderLevel()}
            <div class="text-[10px] text-slate-500 leading-relaxed">
                <div>※1 最初の対敵者ハード/エクストリームのボスLvは Mapler House が 285/290、MapleStory Wiki が 270 で食い違っている。
                    ※2 ベローナは KMS で 2026-08 に実装。GMS に来ているかは未確認。
                    レベル差の与ダメは JMS 公式ガイドの式による（MapleStory Wiki は −1 を 105.84%、−3 を 96.72% としている）。</div>
                <div class="mt-1"><span class="text-slate-400">出典</span> ${sources}</div>
            </div>
        </div>`;
    },
};
