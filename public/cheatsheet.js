/* =========================================================
 *  Cheat Sheet
 *  調べればすぐ出るけど一覧がない数値の早見表（GMS基準）。
 *  入力は無く、表を描くだけ。1画面に収まる密度を優先している。
 *  数値の出典は SOURCES と各注記。2026-09-24 時点で調べた値。
 *  ボス追加やパッチで変わったら、ここのデータだけ直せばよい。
 * ========================================================= */

const cheatsheet = {
    // アーケインシンボルは Lv20 で 220。6地域すべて Lv20 で 1320 がシンボルだけの上限。
    ARC_CAP: 1320,

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
        { boss: 'ルシード', en: 'Lucid', entry: 220, E: { lv: 230, af: 360 }, N: { lv: 230, af: 360 }, H: { lv: 230, af: 360 } },
        { boss: 'ウィル', en: 'Will', entry: 235, E: { lv: 235, af: 560 }, N: { lv: 250, af: 760 }, H: { lv: 250, af: 760 } },
        { boss: 'ダスク', en: 'Gloom', entry: 245, N: { lv: 255, af: 730 }, H: { lv: 255, af: 730 } },
        { boss: '真・ヒルラ', en: 'Verus Hilla', entry: 250, N: { lv: 250, af: 820 }, H: { lv: 250, af: 900 } },
        { boss: 'デュンケル', en: 'Darknell', entry: 255, N: { lv: 265, af: 850 }, H: { lv: 265, af: 850 } },
        { boss: '暗黒の魔法使い', en: 'Black Mage', entry: 255, H: { lv: 275, af: 1320 }, X: { lv: 280, af: 1320 } },
    ],
    ARC_TIERS: [1.5, 1.3, 1.1],

    // ---- オーセンティックボス ------------------------------------------------
    // sub: ボス名の横に出す補足（1段階目だけ要求が低いなど）。note: 注記番号。
    SACRED_BOSSES: [
        { boss: '選ばれし者セレン', en: 'Chosen Seren', entry: 260, sub: '1段階目は150',
          N: { lv: 270, sac: 200 }, H: { lv: 275, sac: 200 }, X: { lv: 280, sac: 200 } },
        { boss: 'カロス', en: 'Kalos the Guardian', entry: 265, sub: 'ノーマル1段階目は250',
          E: { lv: 270, sac: 200 }, N: { lv: 280, sac: 300 }, H: { lv: 285, sac: 330 }, X: { lv: 285, sac: 440 } },
        { boss: '最初の対敵者', en: 'First Adversary', entry: 270, note: 1,
          E: { lv: 270, sac: 220 }, N: { lv: 280, sac: 320 }, H: { lv: 285, sac: 340 }, X: { lv: 290, sac: 460 } },
        { boss: 'カリーン', en: 'Kaling', entry: 275,
          E: { lv: 275, sac: 230 }, N: { lv: 285, sac: 330 }, H: { lv: 285, sac: 350 }, X: { lv: 285, sac: 480 } },
        { boss: '凶星', en: 'Malefic Star', entry: 280, N: { lv: 280, sac: 400 }, H: { lv: 280, sac: 550 } },
        { boss: 'ベローナ', en: 'Bellona', entry: 280, note: 2,
          E: { lv: 280, sac: 400 }, N: { lv: 280, sac: 450 }, H: { lv: 280, sac: 550 } },
        { boss: 'リンボ', en: 'Limbo', entry: 285, N: { lv: 285, sac: 500 }, H: { lv: 285, sac: 500 } },
        { boss: 'バルドリクス', en: 'Baldrix', entry: 290, N: { lv: 290, sac: 700 }, H: { lv: 290, sac: 700 } },
        { boss: 'ユピテル', en: 'Jupiter', entry: 295, N: { lv: 295, sac: 810 }, H: { lv: 295, sac: 810 } },
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
    //  ボスの表（行 = ボス、列 = 難易度 × ボスLv / 必要 / 最大）
    //  数字の位置が揃うよう、1マスには数字1つだけを入れる。
    // ---------------------------------------------------------
    TIER_COLOR: { 1.5: 'text-amber-300', 1.3: 'text-orange-400', 1.1: 'text-rose-300' },

    // 1.5倍がシンボル上限（1320）を超えるときは、届く中で一番上の倍率を出す。
    // どれも届かない（暗黒の魔法使い）ときは 1.1倍 を出す。倍率は色で見分ける。
    arcaneMax(af) {
        const tiers = this.ARC_TIERS.map(m => ({ m, v: Math.ceil(af * m - 1e-9) }));
        return tiers.find(t => t.v <= this.ARC_CAP) || tiers[tiers.length - 1];
    },

    arcaneCells(c) {
        const max = this.arcaneMax(c.af);
        return [
            `<span class="text-slate-500">${c.lv}</span>`,
            `<b class="text-indigo-300">${c.af}</b>`,
            `<b class="${this.TIER_COLOR[max.m]}">${max.v}</b>`,
        ];
    },

    sacredCells(c) {
        return [
            `<span class="text-slate-500">${c.lv}</span>`,
            `<b class="text-cyan-300">${c.sac}</b>`,
            `<b class="text-amber-300">${c.sac + this.SACRED_MAX_OVER}</b>`,
        ];
    },

    // ボスの並びは、ハード（無ければカオス、それも無ければ一番上の難易度）の要求フォースの
    // 多い順（降順）。オーセンティックのボスはアーケインのボスより上に扱う。
    hardReq(b) {
        const c = b.H || b.X || b.N || b.E;
        return c.af != null ? c.af : 10000 + c.sac;
    },
    byHardReq(list) { return [...list].sort((a, b) => this.hardReq(b) - this.hardReq(a)); },

    bossTable(list, cells) {
        list = this.byHardReq(list);
        const cols = this.COLS.filter(col => list.some(b => b[col.key]));
        const sub = ['Lv', '必要', '最大'];
        const head = `<tr>
                <th rowspan="2" class="text-left px-1.5 font-bold align-bottom">ボス</th>
                ${cols.map(c => `<th colspan="3" class="text-center px-1 font-bold text-slate-400 border-l border-slate-800">${c.label}</th>`).join('')}
            </tr>
            <tr>${cols.map(() => sub.map((s, i) =>
                `<th class="text-right px-1.5 pb-1 font-normal ${i === 0 ? 'border-l border-slate-800' : ''}">${s}</th>`).join('')).join('')}</tr>`;
        const rows = list.map(b => `<tr class="border-t border-slate-800">
            <td class="px-1.5 py-1 whitespace-nowrap">
                <span class="text-slate-100 font-bold text-[12px]">${b.boss}</span>${b.note ? `<sup class="text-amber-300">※${b.note}</sup>` : ''}
                <span class="text-slate-500 ml-1">入場${b.entry}</span>${b.sub ? `<span class="text-slate-500 ml-1">・${b.sub}</span>` : ''}
            </td>
            ${cols.map(col => {
                const c = b[col.key];
                if (!c) return `<td colspan="3" class="px-1.5 py-1 text-center text-slate-700 border-l border-slate-800">—</td>`;
                return cells.call(this, c).map((v, i) =>
                    `<td class="px-1.5 py-1 text-right ${i === 0 ? 'border-l border-slate-800' : ''}">${v}</td>`).join('');
            }).join('')}
        </tr>`).join('');
        return `<div class="overflow-x-auto"><table class="w-full text-[12px] tabular-nums">
            <thead class="text-[10px] text-slate-500 border-b border-slate-700">${head}</thead><tbody>${rows}</tbody>
        </table></div>`;
    },

    renderArcane() {
        const legend = Object.entries(this.TIER_COLOR).sort((a, b) => b[0] - a[0])
            .map(([m, cls]) => `<span class="${cls}">■</span>${m}倍`).join(' ');
        return this.card('アーケインボス', `ボスLv / 必要AF / 最大倍率に要るAF（${legend}）`,
            this.bossTable(this.ARCANE_BOSSES, this.arcaneCells)
            + `<p class="text-[10px] text-slate-500 mt-1.5">シンボルだけのAF上限は1320。1.5倍が上限を超えるボスは、届く中で一番上の倍率を出している。暗黒の魔法使いの1.1倍（1452）はシンボル以外で +132 が要る。</p>`);
    },

    renderSacred() {
        return this.card('オーセンティックボス', 'ボスLv / 必要AUT / 最大倍率（要求 +50）に要るAUT',
            this.bossTable(this.SACRED_BOSSES, this.sacredCells));
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

    // シンボル1個のLvとフォースの対応。
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

    // ---------------------------------------------------------
    //  結晶石の価格
    // ---------------------------------------------------------
    // 値は Planner と同じボスマスタ（System で編集したものがあればそれ）を使う。
    // 各難易度にソロ価格と、最大人数で割った1人分（価格 ÷ 最大人数）を並べる。
    // デミアンより安いボスは載せない（最大価格がデミアンの最大価格未満のもの）。
    CRYSTAL_COL: { EASY: 'E', NORMAL: 'N', HARD: 'H', CHAOS: 'H', EXTREME: 'X' },
    CRYSTAL_FLOOR_BOSS: 'Damien',
    // 要求フォースの無いボス（ボスマスタの name）。
    NO_FORCE_BOSSES: ['Lotus', 'Damien', 'Guardian Angel Slime'],
    // 最大人数。boss_data.js（Boss Scheduler）の maxMembers と同じ。ここに無いボスは6人。
    MAX_PARTY: { 'First Adversary': 3, 'Malefic Star': 3, 'Limbo': 3, 'Bellona': 3, 'Baldrix': 3, 'Jupiter': 3 },

    crystalBosses() {
        const master = (window.app && app.data && app.data.masterBosses && app.data.masterBosses.length)
            ? app.data.masterBosses : DEFAULT_BOSSES;
        const byName = new Map();
        master.filter(b => b.type !== 'DAILY' && b.meso > 0).forEach(b => {
            const col = this.CRYSTAL_COL[b.difficulty];
            if (!col) return;
            if (!byName.has(b.name)) byName.set(b.name, {
                name: b.kana || b.name, party: this.MAX_PARTY[b.name] || 6, monthly: false, max: 0, key: b.name });
            const e = byName.get(b.name);
            e[col] = { meso: b.meso, chaos: b.difficulty === 'CHAOS' };
            e.monthly = e.monthly || b.type === 'MONTHLY';
            e.max = Math.max(e.max, b.meso);
        });
        const all = [...byName.values()];
        const floor = all.find(b => b.key === this.CRYSTAL_FLOOR_BOSS);
        // 左がオーセンティック、右がアーケイン。どちらもハードの要求フォースの降順
        // （上のボスの表と同じ並び）。
        // - 要求フォースが上の表（ARCANE_BOSSES / SACRED_BOSSES）にあるボスはその値で並べる。
        // - 要求フォースが無いと分かっているボス（NO_FORCE_BOSSES）はアーケイン側の末尾に、
        //   最大価格の降順で置く。
        // - どちらでもないボス（上の表にまだ入れていない新ボス）は、新しいボスはオーセンティック
        //   だとみなして、オーセンティック側の先頭に最大価格の降順で置く。名前の横に「要求未登録」
        //   と出るので、上の表に要求フォースを足せば正しい位置に移る。
        const req = {};
        [...this.ARCANE_BOSSES, ...this.SACRED_BOSSES].forEach(b => { req[b.en] = this.hardReq(b); });
        const rank = b => req[b.key] != null ? req[b.key]
            : this.NO_FORCE_BOSSES.includes(b.key) ? b.max / 1e12
            : 1e6 + b.max / 1e12;
        return all.filter(b => !floor || b.max >= floor.max).sort((a, b) => rank(b) - rank(a))
            .map(b => ({ ...b, sacred: rank(b) >= 10000, unknown: req[b.key] == null && !this.NO_FORCE_BOSSES.includes(b.key) }));
    },

    fmtM(v) { return Math.round(v / 1e6).toLocaleString(); },

    crystalTable(list) {
        const cols = this.COLS;
        const head = `<tr>
                <th rowspan="2" class="text-left px-1.5 font-bold align-bottom">ボス</th>
                ${cols.map(c => `<th colspan="2" class="text-center px-1 font-bold text-slate-400 border-l border-slate-800">${c.label}</th>`).join('')}
            </tr>
            <tr>${cols.map(() => `<th class="text-right px-1.5 pb-1 font-normal border-l border-slate-800">ソロ</th>
                <th class="text-right px-1.5 pb-1 font-normal">1人分</th>`).join('')}</tr>`;
        const rows = list.map(b => `<tr class="border-t border-slate-800">
            <td class="px-1.5 py-0.5 whitespace-nowrap"><span class="text-slate-100 font-bold">${b.name}</span>
                <span class="text-[10px] text-slate-500 ml-1">${b.party}人</span>${b.monthly ? '<span class="ml-1 text-[10px] text-rose-300">月</span>' : ''}${b.unknown ? '<span class="ml-1 text-[10px] text-amber-400" title="上のボスの表に要求フォースが無いので、オーセンティックの先頭に仮置きしている">要求未登録</span>' : ''}</td>
            ${cols.map(c => {
                const x = b[c.key];
                if (!x) return '<td colspan="2" class="px-1.5 py-0.5 text-center text-slate-700 border-l border-slate-800">—</td>';
                return `<td class="px-1.5 py-0.5 text-right border-l border-slate-800" title="${x.meso.toLocaleString()}">
                        ${x.chaos ? '<span class="text-[10px] text-slate-500 mr-1">C</span>' : ''}<b class="text-amber-300">${this.fmtM(x.meso)}</b></td>
                    <td class="px-1.5 py-0.5 text-right text-slate-300" title="${Math.floor(x.meso / b.party).toLocaleString()}">${this.fmtM(x.meso / b.party)}</td>`;
            }).join('')}
        </tr>`).join('');
        return `<table class="w-full text-[12px] tabular-nums">
            <thead class="text-[10px] text-slate-500 border-b border-slate-700">${head}</thead><tbody>${rows}</tbody></table>`;
    },

    renderCrystal() {
        const list = this.crystalBosses();

        return this.card('結晶石の価格',
            '単位は百万メル（M）。1人分は最大人数で割った額。C はカオス、月 は月ボス。マウスを載せると1メル単位',
            `<div class="grid grid-cols-1 2xl:grid-cols-2 gap-x-6 gap-y-2 overflow-x-auto">
                ${this.crystalTable(list.filter(b => b.sacred))}
                ${this.crystalTable(list.filter(b => !b.sacred))}
            </div>`);
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
                    ${this.renderSacred()}
                    ${this.renderSacredDiff()}
                </div>
                <div class="space-y-3">
                    ${this.renderArcane()}
                    ${this.renderArcaneRatio()}
                    ${this.renderSymbols()}
                </div>
            </div>
            ${this.renderLevel()}
            ${this.renderCrystal()}
            <div class="text-[10px] text-slate-500 leading-relaxed">
                <div>※1 最初の対敵者ハード/エクストリームのボスLv（285/290）は Mapler House が 285/290、MapleStory Wiki が 270 で食い違っている。
                    ※2 ベローナは KMS で 2026-08 に実装。GMS に来ているかは未確認。
                    レベル差の与ダメは JMS 公式ガイドの式による（MapleStory Wiki は −1 を 105.84%、−3 を 96.72% としている）。</div>
                <div class="mt-1"><span class="text-slate-400">出典</span> ${sources}</div>
            </div>
        </div>`;
    },
};
