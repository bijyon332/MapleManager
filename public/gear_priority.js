// Gear Priority — orders the next star force / potential steps by meso-per-score
// efficiency. Assumes Reboot + Shining Star Force and legendary-tier potential.
(function () {
    'use strict';


    /* ---------- star force engine ---------- */
    const RATES = {
        0: [.95, .05, 0], 1: [.9, .1, 0], 2: [.85, .15, 0], 3: [.85, .15, 0], 4: [.8, .2, 0], 5: [.75, .25, 0],
        6: [.7, .3, 0], 7: [.65, .35, 0], 8: [.6, .4, 0], 9: [.55, .45, 0], 10: [.5, .5, 0], 11: [.45, .55, 0],
        12: [.4, .6, 0], 13: [.35, .65, 0], 14: [.3, .7, 0], 15: [.3, .679, .021], 16: [.3, .679, .021],
        17: [.15, .782, .068], 18: [.15, .782, .068], 19: [.15, .765, .085], 20: [.3, .595, .105],
        21: [.15, .7225, .1275], 22: [.15, .68, .17], 23: [.1, .72, .18], 24: [.1, .72, .18],
        25: [.1, .72, .18], 26: [.07, .744, .186], 27: [.05, .76, .19], 28: [.03, .776, .194], 29: [.01, .792, .198],
    };
    const COEF = (() => {
        const c = {};
        for (let s = 0; s < 10; s++) c[s] = [2500, 1, 1];
        c[10] = [40000, 2.7, 1]; c[11] = [22000, 2.7, 1]; c[12] = [15000, 2.7, 1];
        c[13] = [11000, 2.7, 1]; c[14] = [7500, 2.7, 1]; c[15] = [20000, 2.7, 1];
        c[16] = [20000, 2.7, 1]; c[17] = [20000, 2.7, 4 / 3]; c[18] = [20000, 2.7, 20 / 7];
        c[19] = [20000, 2.7, 40 / 9]; c[20] = [20000, 2.7, 1]; c[21] = [20000, 2.7, 8 / 5];
        for (let s = 22; s < 30; s++) c[s] = [20000, 2.7, 1];
        return c;
    })();
    const MODE = {
        15: [[1, .3, .021], [1.5, .3, .014], [2.5, .3, .007], [3, .3, 0]],
        16: [[1, .3, .021], [1.5, .3, .014], [2.5, .3, .007], [3, .3, 0]],
        17: [[1, .15, .068], [1.5, .15, .0425], [2.5, .15, .017], [3, .15, 0]],
        18: [[1, .15, .068], [2, .12, .044], [3.5, .10, .018], [6.5, .08, 0]],
        19: [[1, .15, .085], [2, .12, .0616], [3.5, .10, .036], [6.5, .08, 0]],
        20: [[1, .3, .105], [2, .25, .075], [3.5, .20, .04], [6.5, .15, 0]],
        21: [[1, .15, .1275], [2, .12, .088], [3.5, .10, .045], [6.5, .08, 0]],
    };
    const baseCost = (s, L) => {
        const [d, e, m] = COEF[s], tier = Math.floor(L / 10) * 10;
        return 100 * Math.round((m * Math.pow(tier, 3) * Math.pow(s + 1, e)) / d + 10);
    };
    const dropTo = (s) => (s < 20 ? 12 : s === 20 ? 15 : s < 23 ? 17 : s < 26 ? 19 : 20);

    function stepParams(s, L, o) {
        let mult = 1, p, m, b;
        if (s >= 15 && s <= 17 && o.safeguard) {
            p = RATES[s][0]; m = 1 - p; b = 0;
            mult = o.ssf ? 2.7 : 3;
        } else if (s >= 15 && s <= 21) {
            const mode = s <= 17 ? 1 : o.plan[s];
            [mult, p, b] = MODE[s][mode - 1]; m = 1 - p - b;
            if (o.ssf) { m += b * .3; b *= .7; mult *= .7; }
        } else {
            [p, m, b] = RATES[s];
            if (o.ssf) { if (s <= 21) { m += b * .3; b *= .7; } mult = .7; }
        }
        if (o.starCatch) {
            const p2 = Math.min(1, p * 1.05), left = 1 - p2, den = m + b;
            const m2 = den > 0 ? m * left / den : left;
            p = p2; b = left - m2; m = m2;
        }
        return [baseCost(s, L) * mult, p, m, b < 1e-12 ? 0 : b];
    }

    function solve(A, r) {
        const n = r.length;
        for (let i = 0; i < n; i++) {
            let piv = i;
            for (let k = i; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
            [A[i], A[piv]] = [A[piv], A[i]]; [r[i], r[piv]] = [r[piv], r[i]];
            const d = A[i][i];
            for (let j = i; j < n; j++) A[i][j] /= d;
            r[i] /= d;
            for (let k = 0; k < n; k++) {
                if (k === i || A[k][i] === 0) continue;
                const f = A[k][i];
                for (let j = i; j < n; j++) A[k][j] -= f * A[i][j];
                r[k] -= f * r[i];
            }
        }
        return r;
    }

    const CHECKPOINTS = [18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
    const nextCheckpoint = (star, max) => {
        for (const c of CHECKPOINTS) if (c > star && c <= max) return c;
        return null;
    };

    function starRun(cur, target, L, o) {
        const n = target;
        const A = Array.from({ length: n }, () => new Array(n).fill(0));
        const rc = new Array(n).fill(0), rb = new Array(n).fill(0);
        for (let s = 0; s < n; s++) {
            const [c, p, m, b] = stepParams(s, L, o);
            A[s][s] += 1 - m; rc[s] = c; rb[s] = b;
            if (s + 1 < n) A[s][s + 1] -= p;
            if (b > 0) A[s][dropTo(s)] -= b;
        }
        const A2 = A.map((row) => row.slice());
        return { cost: solve(A, rc)[cur], booms: solve(A2, rb)[cur] };
    }

    // The same run is asked for repeatedly while the planner walks the queue.
    // Slots can each pin their own 18*+ mode, so the mode is part of the key
    // rather than something that invalidates the whole cache.
    let runCache = new Map();
    function starRunCached(cur, target, L, o) {
        const k = `${o.ssf}|${o.safeguard}|${o.starCatch}|${o.planName}|${cur}|${target}|${L}`;
        let v = runCache.get(k);
        if (!v) {
            if (runCache.size > 4000) runCache.clear();
            v = starRun(cur, target, L, o);
            runCache.set(k, v);
        }
        return v;
    }

    // Per-star [stat, attack] from 16*. 29* and 30* aren't in any table we could
    // reach yet, so they carry on the +1 attack per star that 26-28* step by (estimate).
    const BRACKETS = [
        [128, 137, { 16: [7, 7], 17: [7, 8], 18: [7, 9], 19: [7, 10], 20: [7, 11] }],
        [138, 149, { 16: [9, 8], 17: [9, 9], 18: [9, 10], 19: [9, 11], 20: [9, 12], 21: [9, 13], 22: [9, 15], 23: [0, 17], 24: [0, 19], 25: [0, 21], 26: [0, 22], 27: [0, 23], 28: [0, 24], 29: [0, 25], 30: [0, 26] }],
        [150, 159, { 16: [11, 9], 17: [11, 10], 18: [11, 11], 19: [11, 12], 20: [11, 13], 21: [11, 14], 22: [11, 16], 23: [0, 18], 24: [0, 20], 25: [0, 22], 26: [0, 23], 27: [0, 24], 28: [0, 25], 29: [0, 26], 30: [0, 27] }],
        [160, 199, { 16: [13, 10], 17: [13, 11], 18: [13, 12], 19: [13, 13], 20: [13, 14], 21: [13, 15], 22: [13, 17], 23: [0, 19], 24: [0, 21], 25: [0, 23], 26: [0, 24], 27: [0, 25], 28: [0, 26], 29: [0, 27], 30: [0, 28] }],
        [200, 249, { 16: [15, 12], 17: [15, 13], 18: [15, 14], 19: [15, 15], 20: [15, 16], 21: [15, 17], 22: [15, 19], 23: [0, 21], 24: [0, 23], 25: [0, 25], 26: [0, 26], 27: [0, 27], 28: [0, 28], 29: [0, 29], 30: [0, 30] }],
        [250, 999, { 16: [17, 14], 17: [17, 15], 18: [17, 16], 19: [17, 17], 20: [17, 18], 21: [17, 19], 22: [17, 21], 23: [0, 23], 24: [0, 25], 25: [0, 27], 26: [0, 28], 27: [0, 29], 28: [0, 30], 29: [0, 31], 30: [0, 32] }],
    ];
    const bracketOf = (L) => (BRACKETS.find(([a, b]) => L >= a && L <= b) || BRACKETS[0])[2];
    const GLOVE_ATT = new Set([5, 7, 9, 11, 13, 14, 15]);
    function starGain(star, L, part) {
        if (star <= 15) return [star <= 5 ? 2 : 3, part === '手袋' && GLOVE_ATT.has(star) ? 1 : 0];
        return bracketOf(L)[star] || null;
    }
    const maxStarOf = (L) => (L < 128 ? 15 : L < 138 ? 20 : 30);

    /* ---------- potential ---------- */
    const CUBE_PRICE = { red: 12e6, black: 22e6 };
    const CUBE_JP = { red: 'グローイング', black: 'ブライト' };
    // GMS item ids for the cube icons (maplestory.io).
    const CUBE_ICON = { red: 5062028, black: 5062029 };
    const revealConst = (L) => (L < 30 ? 0 : L <= 70 ? .5 : L <= 120 ? 2.5 : 20);
    // The Black Friday sale takes a share off the cube itself, not the reveal fee.
    const cubeOff = (o) => (o && o.cubeSale ? Math.max(0, Math.min(100, Number(o.cubeSalePct) || 0)) / 100 : 0);
    const cubeUnit = (cube, L, o) => CUBE_PRICE[cube] * (1 - cubeOff(o)) + revealConst(L) * L * L;

    // Parts whose potential table exists but that take no star force.
    const NO_STAR = new Set(['武器', '補助武器', 'エンブレム']);
    // Cheap per point of score, but each step runs into the tens of billions,
    // so the plan flags them in their own colour rather than burying them.
    const BIG_TICKET = new Set(['武器', '補助武器', 'エンブレム']);
    // Parts whose level never varies. Emblems now come in Lv100 and Lv200.
    const FIXED_LV = {};
    // Levels offered when no item is picked; emblems only come in two.
    const levelsFor = (id) => (id === 'emblem' ? [100, 200] : SLOTS[id].lv ? [SLOTS[id].lv] : LEVELS);
    const defaultLevel = (id) => (id === 'emblem' ? 100 : SLOTS[id].lv || 160);

    // The equip rack, laid out the way the slots sit in the game window.
    // `part` picks the potential/star tables; null means nothing to enhance.
    const SLOTS = {
        weapon: { label: '武器', part: '武器' },
        sub: { label: '補助武器', part: '補助武器' },
        emblem: { label: 'エンブレム', part: 'エンブレム' },
        ring1: { label: '指輪1', part: 'アクセ(指輪等)' },
        ring2: { label: '指輪2', part: 'アクセ(指輪等)' },
        ring3: { label: '指輪3', part: 'アクセ(指輪等)' },
        ring4: { label: '指輪4', part: 'アクセ(指輪等)' },
        belt: { label: 'ベルト', part: 'ベルト' },
        face: { label: '顔飾り', part: 'アクセ(指輪等)' },
        eye: { label: '目飾り', part: 'アクセ(指輪等)' },
        ear: { label: '耳', part: 'アクセ(指輪等)' },
        pendant1: { label: 'ペンダント1', part: 'アクセ(指輪等)' },
        pendant2: { label: 'ペンダント2', part: 'アクセ(指輪等)' },
        hat: { label: '頭', part: '帽子' },
        top: { label: '上', part: '上衣' },
        bottom: { label: '下', part: '下衣' },
        shoulder: { label: '肩', part: '肩装飾' },
        // Pocket items and the title only take bonus stats, always boss-grade.
        pocket: { label: 'ポケットスロット', part: null, noStar: true, bossFlame: true },
        cape: { label: 'マント', part: 'マント' },
        glove: { label: '手', part: '手袋' },
        shoe: { label: '足', part: '靴' },
        heart: { label: '心臓', part: 'ハート' },
        badge: { label: 'バッジ', part: null, noStar: true },
        title: { label: '称号', part: null, noStar: true, bossFlame: true, lv: 250 },
    };
    const GRID = [
        ['weapon', 'ring1', 'face', 'hat', 'cape'],
        ['sub', 'ring2', 'eye', 'top', 'glove'],
        ['emblem', 'ring3', 'ear', 'bottom', 'shoe'],
        [null, 'ring4', 'pendant1', 'shoulder', 'heart'],
        ['title', 'belt', 'pendant2', 'pocket', 'badge'],
    ];
    const hasStar = (id) => !SLOTS[id].noStar && !NO_STAR.has(SLOTS[id].part);
    const hasPot = (id) => !!SLOTS[id].part;
    // Something to plan for: stars, potential, or bonus stats.
    const hasWork = (id) => hasPot(id) || hasStar(id) || !NO_FLAME_SLOT.has(id);

    // 18*+ mode: which MODE row each star uses. 1144 runs 18/19 cheap and
    // safeguards 20/21; 4444 safeguards all four.
    const PLANS = {
        '1144': { 18: 1, 19: 1, 20: 4, 21: 4 },
        '4444': { 18: 4, 19: 4, 20: 4, 21: 4 },
    };
    const PLAN_LABEL = { '1144': '1144（推奨）', '4444': '4444（全て破壊防止）' };

    const LEVELS = [140, 150, 160, 200, 250];
    // 0 stars, then every step from the first checkpoint upward.
    const starChoices = (L) => {
        const out = [0];
        for (let s = CHECKPOINTS[0]; s <= maxStarOf(L); s++) out.push(s);
        return out;
    };


    /* ---------- potential lines (entered per line) ---------- */
    // Grades a line can carry, best first. Line 1 always matches the item's
    // grade; lines 2-3 can be the same grade or one below.
    const GRADES = ['L', 'U', 'E', 'R'];
    const GRADE_EN = { L: 'Legendary', U: 'Unique', E: 'Epic', R: 'Rare' };
    const GRADE_COLOR = { L: '#a3e635', U: '#f4b942', E: '#b18cf7', R: '#48d6c8' };
    const lineGrades = (grade, i) => {
        const g = GRADES.indexOf(grade);
        if (g < 0) return [];
        return i === 0 || g === GRADES.length - 1 ? [grade] : [grade, GRADES[g + 1]];
    };
    // Damage-relevant options and their values per grade, [below Lv160, Lv160+].
    // Values follow the KMS tables; anything else is entered as "その他".
    const POT_OPTS = {
        main: { jp: 'メインステ', unit: '%', w: 'statPct', v: { L: [[12], [13]], U: [[9], [10]], E: [[6], [7]], R: [[3], [4]] } },
        all: { jp: 'オールステ', unit: '%', w: 'allStat', v: { L: [[9], [10]], U: [[6], [7]], E: [[3], [4]] } },
        att: { jp: '攻撃力', unit: '%', w: 'attPct', v: { L: [[12], [13]], U: [[9], [10]], E: [[6], [7]], R: [[3], [4]] } },
        dmg: { jp: 'ダメージ', unit: '%', w: 'dmg', v: { L: [[12], [13]], U: [[9], [10]], E: [[6], [7]], R: [[3], [4]] } },
        boss: { jp: 'ボスダメ', unit: '%', w: 'boss', v: { L: [[40, 35], [40, 35]], U: [[30], [30]] } },
        ied: { jp: '防御無視', unit: '%', w: null, v: { L: [[40, 35], [40, 35]], U: [[30], [30]], E: [[15], [15]] } },
        crit: { jp: 'クリダメ', unit: '%', w: 'crit', v: { L: [[8], [8]] } },
    };
    // Which options each part can roll.
    const POT_KEYS = (part) => {
        if (part === '武器' || part === '補助武器') return ['att', 'boss', 'ied', 'dmg', 'main', 'all'];
        if (part === 'エンブレム') return ['att', 'ied', 'dmg', 'main', 'all'];
        if (part === '手袋') return ['crit', 'main', 'all'];
        return ['main', 'all'];
    };
    const potValues = (key, grade, L) => {
        const t = POT_OPTS[key].v[grade];
        return t ? t[L >= 160 ? 1 : 0] : [];
    };
    // One line: { k: option key or 'etc', g: grade, v: value }.
    const lineScore = (ln, w) => {
        const o = POT_OPTS[ln.k];
        return o && o.w ? (Number(ln.v) || 0) * (w[o.w] || 0) : 0;
    };
    const linesScore = (lines, w) => (lines || []).reduce((a, ln) => a + lineScore(ln, w), 0);
    const lineText = (ln) => {
        const o = POT_OPTS[ln.k];
        return o ? `${o.jp} +${ln.v}${o.unit}` : 'その他';
    };

    /* ---------- potential rolls (cube_rates.js) ---------- */
    const CUBE_RATES = window.CUBE_RATES || {};
    const CUBE_KEY = {
        '武器': 'weapon', '補助武器': 'secondary', 'エンブレム': 'emblem', '帽子': 'hat', '上衣': 'top',
        '下衣': 'bottom', '靴': 'shoes', '手袋': 'gloves', 'マント': 'cape', 'ベルト': 'belt',
        '肩装飾': 'shoulder', 'ハート': 'heart', 'アクセ(指輪等)': 'ring',
    };
    // The table holds Lv120-159 values; Lv160+ items roll these 1% higher.
    const HI_UP = new Set(['main', 'all', 'att', 'dmg']);
    // Score distribution of one reroll of all three lines: [[score, prob], ...].
    // Lines roll independently except that three boss lines can't appear, so
    // those combinations are dropped and the rest renormalised.
    function potDist(key, cube, L, w) {
        const lines = CUBE_RATES[key][cube].map((rows) => {
            const b = new Map();
            let rest = 1;
            const put = (s, boss, p) => {
                const k = `${s.toFixed(4)}|${boss}`;
                const e = b.get(k);
                if (e) e.p += p; else b.set(k, { s, boss, p });
            };
            for (const [k, v, p] of rows) {
                rest -= p;
                const o = POT_OPTS[k];
                const val = v + (L >= 160 && HI_UP.has(k) ? 1 : 0);
                put(o && o.w ? val * (w[o.w] || 0) : 0, k === 'boss' ? 1 : 0, p);
            }
            if (rest > 1e-9) put(0, 0, rest);
            return [...b.values()];
        });
        const out = new Map();
        let kept = 0;
        for (const a of lines[0]) for (const b of lines[1]) for (const c of lines[2]) {
            if (a.boss + b.boss + c.boss > 2) continue;
            const p = a.p * b.p * c.p, k = (a.s + b.s + c.s).toFixed(4);
            kept += p;
            out.set(k, (out.get(k) || 0) + p);
        }
        return [...out.entries()].map(([s, p]) => [Number(s), p / kept]).sort((x, y) => x[0] - y[0]);
    }
    // The same rolls, but kept as line combinations (order ignored) so a plan row
    // can name what to stop on. Lines the weights ignore all read as "その他".
    function potCombos(key, cube, L, w) {
        const lines = CUBE_RATES[key][cube].map((rows) => {
            const b = new Map();
            let rest = 1;
            const put = (label, s, boss, p) => {
                const e = b.get(label);
                if (e) e.p += p; else b.set(label, { label, s, boss, p });
            };
            for (const [k, v, p] of rows) {
                rest -= p;
                const o = POT_OPTS[k];
                const val = v + (L >= 160 && HI_UP.has(k) ? 1 : 0);
                const s = o && o.w ? val * (w[o.w] || 0) : 0;
                put(s > 0 ? `${o.jp}${val}%` : 'その他', s, k === 'boss' ? 1 : 0, p);
            }
            if (rest > 1e-9) put('その他', 0, 0, rest);
            return [...b.values()];
        });
        const out = new Map();
        let kept = 0;
        for (const a of lines[0]) for (const b of lines[1]) for (const c of lines[2]) {
            if (a.boss + b.boss + c.boss > 2) continue;
            const p = a.p * b.p * c.p;
            kept += p;
            // Best line first, so "攻撃力12%・攻撃力9%・その他" reads top-down.
            const three = [a, b, c].sort((x, y) => y.s - x.s);
            const k = three.map((x) => x.label).join('・');
            const e = out.get(k);
            if (e) e.p += p; else out.set(k, { label: k, s: a.s + b.s + c.s, p });
        }
        return [...out.values()].map((e) => ({ ...e, p: e.p / kept }));
    }
    // What to stop on when rolling to beat `thr`: of the combinations that beat
    // it, the cheapest one to aim for (cube price / its chance, so the likeliest),
    // plus the next likeliest others that would also do.
    function potTarget(key, cube, L, w, thr) {
        const ck = `${key}|${cube}|${L >= 160 ? 1 : 0}|${w.statPct}|${w.allStat}|${w.attPct}|${w.dmg}|${w.boss}|${w.crit}`;
        let all = potComboCache.get(ck);
        if (!all) {
            if (potComboCache.size > 200) potComboCache.clear();
            all = potCombos(key, cube, L, w);
            potComboCache.set(ck, all);
        }
        const hits = all.filter((e) => e.s > thr + 1e-9);
        if (!hits.length) return null;
        const pHit = hits.reduce((a, e) => a + e.p, 0);
        const byP = [...hits].sort((a, b) => b.p - a.p || a.s - b.s);
        const others = byP.slice(1, 3).map((e) => ({ label: e.label, share: e.p / pHit }));
        return { min: byP[0].label, rolls: 1 / byP[0].p, others, count: hits.length - 1 };
    }
    let potComboCache = new Map();
    let potCache = new Map();
    function potDistCached(key, cube, L, w) {
        const k = `${key}|${cube}|${L >= 160 ? 1 : 0}|${w.statPct}|${w.allStat}|${w.attPct}|${w.dmg}|${w.boss}|${w.crit}`;
        let v = potCache.get(k);
        if (!v) {
            if (potCache.size > 500) potCache.clear();
            v = potDist(key, cube, L, w);
            potCache.set(k, v);
        }
        return v;
    }

    /* ---------- bonus stats (rebirth flame) ---------- */
    // Black Rebirth Flame: every item, 3M mesos a roll, and the old stats can be
    // kept, so a roll only needs to beat what the item already has.
    // Tables from StrategyWiki "MapleStory/Bonus_Stats".
    const FLAME_TIERS = { normal: { 2: .29, 3: .45, 4: .25, 5: .01 }, boss: { 4: .29, 5: .45, 6: .25, 7: .01 } };
    const FLAME_LINES = { normal: { 1: .4, 2: .4, 3: .16, 4: .04 }, boss: { 4: 1 } };
    // Stat types a roll draws from, without repeats and all equally likely.
    const FLAME_POOL = 19;
    const FLAME_PRICE = 3e6;
    // Parts that never carry bonus stats (the catalog's noFlame covers picked items).
    const NO_FLAME_SLOT = new Set(['ring1', 'ring2', 'ring3', 'ring4', 'shoulder', 'heart', 'badge', 'emblem', 'sub']);
    const singleStat = (L, t) => Math.min(12, Math.floor(L / 20) + 1) * t;
    const dualStat = (L, t) => Math.min(7, Math.floor(L / 40) + 1) * t;
    // Weapon attack is a share of the weapon's own attack, 10% steeper per tier.
    // Fitted to the kiiten table (boss tiers 3-7); only used for weapons it doesn't list.
    const weaponAtt = (base, L, t) => Math.ceil(base * (Math.floor(L / 40) + 1) / 100 * t * Math.pow(1.1, t - 3));
    // `base` is either the weapon's base attack or its table row [tier3..tier7].
    const weaponAttOf = (base, L, t) => Array.isArray(base)
        ? base[Math.max(0, Math.min(4, t - 3))]
        : weaponAtt(base || 0, L, t);
    const choose = (n, k) => {
        if (k < 0 || k > n) return 0;
        let r = 1;
        for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
        return r;
    };

    // Score distribution of one full reroll: [[score, prob], ...] sorted by score.
    // Only lines the weights can see are tracked; the rest just take up slots.
    function flameDist(L, boss, weapon, baseAtt, w) {
        const tiers = Object.entries(FLAME_TIERS[boss ? 'boss' : 'normal']).map(([t, p]) => [Number(t), p]);
        const types = [];
        const add = (f) => types.push(tiers.map(([t, p]) => [f(t), p]));
        const sub = w.sub || 0;
        add((t) => singleStat(L, t) * w.main);                       // main stat
        add((t) => singleStat(L, t) * sub);                          // sub stat
        add((t) => dualStat(L, t) * (w.main + sub));                 // main + sub pair
        for (let i = 0; i < 2; i++) add((t) => dualStat(L, t) * w.main); // main with one of the other two
        for (let i = 0; i < 2; i++) add((t) => dualStat(L, t) * sub);    // sub with one of the other two
        add((t) => (weapon ? weaponAttOf(baseAtt, L, t) : t) * w.att);
        add((t) => t * (w.allStat || 0));
        if (weapon) {
            add((t) => 2 * t * w.boss);
            add((t) => t * (w.dmg || 0));
        }
        const idle = FLAME_POOL - types.length;
        // DP over the tracked types: (lines used, score) -> weight.
        let st = new Map([['0|0', { c: 0, s: 0, p: 1 }]]);
        for (const opts of types) {
            const nx = new Map();
            const put = (c, s, p) => {
                const k = `${c}|${s.toFixed(4)}`;
                const e = nx.get(k);
                if (e) e.p += p; else nx.set(k, { c, s, p });
            };
            for (const e of st.values()) {
                put(e.c, e.s, e.p);
                for (const [v, p] of opts) put(e.c + 1, e.s + v, e.p * p);
            }
            st = nx;
        }
        const out = new Map();
        for (const [n, pn] of Object.entries(FLAME_LINES[boss ? 'boss' : 'normal'])) {
            const all = choose(FLAME_POOL, Number(n));
            for (const e of st.values()) {
                const ways = choose(idle, Number(n) - e.c);
                if (!ways) continue;
                const k = e.s.toFixed(4);
                out.set(k, (out.get(k) || 0) + pn * e.p * ways / all);
            }
        }
        return [...out.entries()].map(([s, p]) => [Number(s), p]).sort((a, b) => a[0] - b[0]);
    }
    let flameCache = new Map();
    function flameDistCached(L, boss, weapon, baseAtt, w) {
        const k = `${L}|${boss}|${weapon}|${baseAtt}|${w.main}|${w.sub}|${w.att}|${w.allStat}|${w.boss}|${w.dmg}`;
        let v = flameCache.get(k);
        if (!v) {
            if (flameCache.size > 500) flameCache.clear();
            v = flameDist(L, boss, weapon, baseAtt, w);
            flameCache.set(k, v);
        }
        return v;
    }
    // Rolling until something beats `cur`: chance per roll, and the average
    // score once it does.
    function flameBeat(dist, cur) {
        let p = 0, m = 0;
        for (const [s, q] of dist) if (s > cur + 1e-9) { p += q; m += s * q; }
        return p > 0 ? { p, mean: m / p } : null;
    }

    /* ---------- planner ---------- */
    function nextActions(item, w, o) {
        const acts = [];
        const L = FIXED_LV[item.part] || item.level;
        if (!item.noStar) {
            // A slot may pin its own 18*+ mode; otherwise it follows the default.
            const planName = PLANS[item.mode] ? item.mode : o.planName;
            const so = { ...o, planName, plan: PLANS[planName] };
            const target = nextCheckpoint(item.star, maxStarOf(L));
            if (target !== null) {
                let sc = 0;
                for (let k = item.star + 1; k <= target; k++) {
                    const g = starGain(k, L, item.part);
                    if (g) sc += g[0] * w.main + g[1] * w.att;
                }
                const { cost, booms } = starRunCached(item.star, target, L, so);
                if (sc > 0) acts.push({
                    kind: 'star', from: item.star, to: target, booms, unit: planName,
                    cost, score: sc, next: { star: target }
                });
            }
        }
        if (item.flameOk) {
            const cur = item.flameCur != null ? item.flameCur : flameScore(item.flame || {}, w);
            const dist = flameDistCached(L, !!item.boss, item.part === '武器', item.wRow || item.baseAtt || 0, w);
            const hit = flameBeat(dist, cur);
            if (hit) {
                const rolls = 1 / hit.p;
                acts.push({
                    kind: 'flame', from: cur, to: hit.mean, rolls, unit: 'flame',
                    cost: (o.flamePrice || FLAME_PRICE) * rolls, score: hit.mean - cur,
                    next: { flameCur: hit.mean },
                });
            }
        }
        if (!item.part) return acts;
        // Potential: cube until all three lines together beat what is there now.
        const key = item.overall ? 'overall' : CUBE_KEY[item.part];
        if (key && CUBE_RATES[key]) {
            const cur = item.potCur != null ? item.potCur : linesScore(item.lines || [], w);
            let best = null;
            for (const cube of ['red', 'black']) {
                const hit = flameBeat(potDistCached(key, cube, L, w), cur);
                if (!hit) continue;
                const rolls = 1 / hit.p, cost = cubeUnit(cube, L, o) * rolls, eff = cost / (hit.mean - cur);
                if (!best || eff < best.eff) best = { eff, cost, rolls, cube, hit };
            }
            if (best) acts.push({
                kind: 'pot', from: cur, to: best.hit.mean, rolls: best.rolls, unit: best.cube,
                cost: best.cost, score: best.hit.mean - cur, next: { potCur: best.hit.mean },
                pot: { key, L, thr: cur },
            });
        }
        return acts;
    }

    function buildPlan(items, w, o, limit) {
        const state = items.map((it) => ({ ...it }));
        const out = [];
        let total = 0;
        for (let n = 0; n < limit; n++) {
            let pick = null;
            state.forEach((it, i) => {
                nextActions(it, w, o).forEach((a) => {
                    const eff = a.cost / a.score;
                    if (!pick || eff < pick.eff) pick = { eff, act: a, idx: i, item: it };
                });
            });
            if (!pick) break;
            total += pick.act.cost;
            Object.assign(state[pick.idx], pick.act.next);
            // The same part picked again for the same kind of step reads as one
            // run: "keep rolling until here", with the costs and counts added up.
            const last = out[out.length - 1], a = pick.act;
            if (last && last.idx === pick.idx && last.kind === a.kind && last.unit === a.unit) {
                last.to = a.to; last.cost += a.cost; last.score += a.score;
                if (a.pot) last.pot = a.pot;
                last.rolls = (last.rolls || 0) + (a.rolls || 0);
                last.booms = (last.booms || 0) + (a.booms || 0);
                last.steps += 1; last.eff = last.cost / last.score; last.cum = total;
                Object.assign(last, labelOf(last));
                continue;
            }
            const row = {
                ...a, idx: pick.idx, steps: 1, eff: pick.eff, name: pick.item.name,
                big: a.kind === 'pot' && BIG_TICKET.has(pick.item.part),
                level: FIXED_LV[pick.item.part] || pick.item.level, cum: total
            };
            out.push(Object.assign(row, labelOf(row)));
        }
        return out;
    }
    const countText = (n) => (n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString());
    function labelOf(a) {
        if (a.kind === 'star') return {
            label: `${a.from}★ → ${a.to}★`,
            detail: a.booms >= 0.01 ? `期待破壊 ${a.booms.toFixed(2)}回` : '破壊なし',
        };
        if (a.kind === 'flame') return {
            label: `転生 ${Math.round(a.from)} → ${Math.round(a.to)}`,
            detail: `黒転生 期待${countText(a.rolls)}回`,
        };
        return {
            label: `潜在 ${Math.round(a.from)} → ${Math.round(a.to)}`,
            detail: `期待${countText(a.rolls)}個`,
        };
    }

    /* ---------- ui ---------- */
    const fmtB = (v) => (v >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : (v / 1e6).toFixed(0) + 'M');
    const pctText = (p) => (p >= 0.1 ? Math.round(p * 100) : (p * 100).toFixed(p >= 0.01 ? 1 : 2)) + '%';
    const fmtM = (v) => (v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : (v / 1e6).toFixed(1) + 'M');
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const WEIGHT_FIELDS = [
        ['main', 'メインステ 1'], ['sub', 'サブステ 1'], ['att', '攻撃力(実数) 1'], ['statPct', 'ステータス% 1%'],
        ['allStat', 'オールステ% 1%'], ['crit', 'クリダメ% 1%'], ['attPct', '攻撃力% 1%'],
        ['boss', 'ボスダメ% 1%'], ['dmg', 'ダメージ% 1%'],
    ];

    // The modal renders into its own host outside .gp so it can escape any
    // ancestor stacking context, so every shared rule has to name .gp-veil too.
    const CSS = `
.gp,.gp-veil{--bg:#020617;--sf:#0f172a;--sf2:#0b1324;--ln:#1e293b;--tx:#e2e8f0;--mu:#8b98ad;--acc:#6366f1;
--gold:#f4b942;--cyan:#48d6c8;--red:#e8615f;--violet:#b18cf7;
color:var(--tx);
font-family:"IBM Plex Sans JP","Hiragino Sans","Yu Gothic UI",system-ui,sans-serif;font-size:13px;line-height:1.5;}
.gp{padding:0 0 24px}
.gp *,.gp-veil *{box-sizing:border-box}
.gp .wrap{max-width:1480px}
.gp .head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0 0 10px}
.gp .cols{display:grid;grid-template-columns:minmax(0,11fr) minmax(0,12fr);gap:12px;align-items:start}
@media(max-width:1100px){.gp .cols{grid-template-columns:1fr}}
.gp h1{font-size:18px;font-weight:700;margin:0;color:#fff}
.gp .sub{color:var(--mu);margin:0;font-size:11.5px}
.gp .eyebrow{font-size:11px;font-weight:600;letter-spacing:.06em;
color:var(--mu);margin:0 0 4px;display:flex;align-items:center;gap:8px}
.gp .eyebrow::after{content:"";flex:1;height:1px;background:var(--ln)}
.gp section{margin-bottom:12px}
.gp .card{background:var(--sf);border:1px solid var(--ln);border-radius:0;padding:8px 10px}
.gp .wcard{display:flex;flex-wrap:wrap;align-items:end;gap:6px 20px}
.gp .grid6{display:grid;grid-template-columns:repeat(9,92px);gap:6px}
.gp label,.gp-veil label{display:block;font-size:10.5px;color:var(--mu);margin-bottom:2px}
.gp input,.gp select,.gp-veil input,.gp-veil select{width:100%;background:var(--bg);color:var(--tx);
border:1px solid #334155;border-radius:0;padding:3px 6px;font-size:13px;
font-variant-numeric:tabular-nums;font-family:"IBM Plex Mono",ui-monospace,monospace;color-scheme:dark}
.gp select option,.gp-veil select option{background:var(--sf);color:var(--tx)}
.gp input:focus,.gp select:focus,.gp-veil input:focus,.gp-veil select:focus{outline:1px solid var(--acc);
outline-offset:0;border-color:var(--acc)}
.gp .opts{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:end;padding-left:20px;border-left:1px solid var(--ln)}
.gp .chk{display:flex;align-items:center;gap:7px;color:var(--tx);font-size:12.5px;cursor:pointer;
letter-spacing:normal;text-transform:none;margin-bottom:0}
.gp .chk input,.gp-veil .chk input{width:14px;height:14px;accent-color:var(--acc)}
.gp-veil .chk{display:flex;align-items:center;gap:7px;color:var(--tx);font-size:12.5px;cursor:pointer;
letter-spacing:normal;text-transform:none}
.gp-veil .chk.mb{margin-bottom:14px}
.gp .btn,.gp-veil .btn{background:transparent;color:var(--mu);border:1px solid #334155;border-radius:0;
padding:2px 10px;font-size:11.5px;cursor:pointer;font-family:inherit}
.gp .btn:hover,.gp-veil .btn:hover{border-color:var(--acc);color:#c7d2fe}
.gp .step{display:grid;grid-template-columns:40px 1fr 84px 62px;gap:10px;align-items:center;
padding:4px 10px 4px 6px;border-bottom:1px solid var(--ln)}
.gp .step:nth-child(even){background:#0c1428}
.gp .step:last-child{border-bottom:none}
.gp .fold{background:transparent;color:var(--mu);border:1px solid #334155;border-radius:0;
padding:1px 6px;margin-left:6px;font-size:11px;font-family:ui-monospace,monospace;cursor:pointer;
vertical-align:1px;white-space:nowrap}
.gp .fold:hover{border-color:var(--acc);color:#c7d2fe}
.gp .step.grp .rk{font-size:12.5px}
.gp .step.child{background:rgba(0,0,0,.18);border-bottom-style:dashed;padding-left:26px}
.gp .step.child .rk,.gp .step.child .who,.gp .step.child .what{font-size:11.5px}
.gp .step.child .num,.gp .step.child .eff{font-size:12px;color:var(--mu)}
.gp .step.child .meter{display:none}
.gp .rk{font-family:"IBM Plex Mono",monospace;font-size:13px;font-weight:600;color:var(--mu);text-align:right;font-variant-numeric:tabular-nums}
.gp .who{font-size:11px;color:var(--mu)}
.gp .what{font-size:13.5px;line-height:1.35}
.gp .what b{font-weight:600}
.gp .cube{font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:3px;vertical-align:-2px}
.gp .cube img{width:16px;height:16px;image-rendering:pixelated}
.gp .cube.red{color:#7dd3fc}
.gp .cube.black{color:#c4b5fd}
.gp .sale .salerow{display:flex;align-items:center;gap:6px;height:30px}
.gp .sale .salerow input[type=number]{width:52px}
.gp .sale .pct{font-size:12px;color:var(--mu)}
.gp .tgt{font-size:12px;line-height:1.4;margin-top:2px}
.gp .tgt .tl{font-size:10.5px;color:var(--mu);border:1px solid var(--ln);padding:0 4px;margin-right:6px}
.gp .tgt b{font-weight:600}
.gp .tgt summary{list-style:none;cursor:pointer}
.gp .tgt summary::-webkit-details-marker{display:none}
.gp .tgt .more{font-size:11px;color:var(--mu);margin-left:8px;text-decoration:underline dotted}
.gp .tgt .more::after{content:" ▾"}
.gp .tgt[open] .more::after{content:" ▴"}
.gp .tgt summary:focus-visible{outline:1px solid var(--ln)}
.gp .tgt .alt{font-size:11px;color:var(--mu)}
.gp .star b{color:var(--gold)} .gp .pot b{color:var(--cyan)} .gp .flame b{color:#4ade80}
.gp .step.big b{color:var(--violet)}
.gp .num{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;text-align:right;font-size:14px;font-weight:600;color:#fff;line-height:1.25}
.gp .eff{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;text-align:right;font-size:12px;color:#cbd5e1;line-height:1.25}
.gp .sm{font-size:10.5px}
.gp .meter{height:2px;margin-top:3px;background:var(--ln);overflow:hidden}
.gp .meter i{display:block;height:100%}
.gp .star .meter i{background:var(--gold)} .gp .pot .meter i{background:var(--cyan)} .gp .flame .meter i{background:#4ade80}
.gp .step.big .meter i{background:var(--violet)}
.gp .legend{display:flex;gap:4px 14px;font-size:11px;color:var(--mu);margin-bottom:4px;flex-wrap:wrap}
.gp .dot{display:inline-block;width:8px;height:8px;margin-right:5px}
.gp .empty{color:var(--mu);padding:14px 10px;text-align:center}
.gp .rackbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between;
color:var(--mu);font-size:11px;margin-bottom:6px}
.gp .rackbtns{display:flex;gap:6px}
.gp .gridwrap{overflow-x:auto}
.gp .slots{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;min-width:440px}
.gp .slot{position:relative}
.gp .slot-btn{width:100%;height:100%;display:flex;flex-direction:column;align-items:flex-start;gap:1px;
background:var(--sf2);border:1px solid var(--ln);border-radius:0;padding:4px 18px 4px 6px;
cursor:pointer;text-align:left;font-family:inherit;color:var(--tx)}
.gp .slot-btn:hover{border-color:var(--acc)}
.gp .slot-btn:focus-visible{outline:1px solid var(--acc);outline-offset:1px}
.gp .slot.off .slot-btn{opacity:.38}
.gp .slot.inert .slot-btn{opacity:.38;border-style:dashed}
.gp .slot .nm{font-size:12px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.gp .slot .st{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;line-height:1.35;color:var(--mu);
font-variant-numeric:tabular-nums;white-space:nowrap}
.gp .slot .st em{font-style:normal;color:var(--gold)}
.gp .slot .st i{font-style:normal;color:var(--cyan)}
.gp .slot .pin{font-weight:400;color:var(--bg);background:var(--mu);padding:0 3px;margin-left:2px}
.gp .sw{position:absolute;top:5px;right:4px;margin:0;line-height:0}
.gp .sw input{width:13px;height:13px;accent-color:var(--acc);cursor:pointer}
.gp-veil{position:fixed;inset:0;background:rgba(8,9,16,.72);display:flex;align-items:center;
justify-content:center;padding:20px;z-index:50}
.gp-veil .modal{background:var(--sf);border:1px solid #334155;border-top:2px solid var(--acc);border-radius:0;width:100%;
max-width:420px;padding:14px 16px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
.gp-veil .modal h2{font-size:15px;margin:0 0 10px;font-weight:700}
.gp-veil .fld{margin-bottom:12px}
.gp-veil .pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.gp-veil .foot{display:flex;gap:8px;margin-top:18px}
.gp-veil .foot .grow{flex:1}
.gp .primary,.gp-veil .primary{background:#4f46e5;color:#fff;border-color:#6366f1;font-weight:700}
.gp .primary:hover,.gp-veil .primary:hover{background:#6366f1;color:#fff;border-color:#818cf8}
.gp .danger:hover,.gp-veil .danger:hover{border-color:var(--red);color:var(--red)}
.gp input:disabled,.gp select:disabled,.gp-veil input:disabled,.gp-veil select:disabled{opacity:.5;cursor:not-allowed}
@media(prefers-reduced-motion:no-preference){.gp-veil .modal{animation:gp-pop .16s ease-out}}
@keyframes gp-pop{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}
.gp .note,.gp-veil .note{color:#64748b;font-size:11px;margin-top:6px}
.gp .slot-btn{flex-direction:row;align-items:center;gap:5px;padding-left:4px}
.gp .tile-ico{flex:0 0 26px;height:26px;display:flex;align-items:center;justify-content:center}
.gp .tile-body{display:flex;flex-direction:column;min-width:0;gap:1px}
.gp .slot .st u{text-decoration:none;color:#4ade80}
.gp .ico,.gp-veil .ico{image-rendering:pixelated;object-fit:contain;display:block}
.gp .ico.none,.gp-veil .ico.none{display:block;border:1px dashed #334155;background:transparent}
.gp-veil .modal.eq{max-width:440px;padding:12px 14px;max-height:calc(100vh - 40px);overflow:auto}
.gp-veil .eq-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.gp-veil .eq-head h2{margin:0;font-size:15px}
.gp-veil .eq-head > h2{flex:1}
.gp-veil .eq-ico{flex:0 0 52px;height:52px;display:flex;align-items:center;justify-content:center;
background:var(--bg);border:1px solid #334155;cursor:pointer;padding:0}
.gp-veil .eq-ico:hover{border-color:var(--acc)}
.gp-veil .eq-name{flex:1;min-width:0}
.gp-veil .eq-name p{margin:2px 0 0;color:var(--mu);font-size:11.5px}
.gp-veil .eq-name select.lv{width:auto;padding:0 4px;font-size:11.5px}
.gp-veil .stars{display:flex;align-items:center;gap:8px;padding:6px 0 8px;border-bottom:1px solid var(--ln)}
.gp-veil .srun{display:flex;flex-wrap:wrap;align-items:center;flex:1}
.gp-veil .srun .brk{flex-basis:100%;height:0}
.gp-veil .sside{display:flex;flex-direction:column;align-items:flex-end;gap:3px}
.gp-veil .stars .st{background:none;border:0;padding:0 1px;font-size:15px;line-height:1.1;color:#334155;cursor:pointer}
.gp-veil .stars .st.on{color:var(--gold)}
.gp-veil .stars .st:hover{color:#fde68a}
.gp-veil .stars .gap{width:6px}
.gp-veil .stars .st0{background:none;border:1px solid #334155;color:var(--mu);font-size:10.5px;
padding:0 5px;cursor:pointer;font-family:"IBM Plex Mono",monospace}
.gp-veil .stars .snum{font-family:"IBM Plex Mono",monospace;color:var(--gold);font-size:12px;
width:40px;text-align:right;font-variant-numeric:tabular-nums;font-size:14px;font-weight:600}
.gp-veil .eq-sec{display:flex;align-items:center;gap:8px;margin:10px 0 4px;font-size:11.5px;color:var(--mu)}
.gp-veil .eq-sec b{color:var(--gold);font-size:12.5px}
.gp-veil .eq-sec em{font-style:normal;color:#4ade80}
.gp-veil .eq-sec select.grade{width:auto;padding:1px 6px;font-size:12px}
.gp-veil .srows{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;font-size:12.5px}
.gp-veil .srow{display:grid;grid-template-columns:92px 56px 10px 48px 12px 64px 10px;align-items:center;
column-gap:2px;padding:1px 0}
.gp-veil .srow.hd{font-size:10px;color:var(--mu);font-family:inherit}
.gp-veil .srow .sk{font-family:"IBM Plex Sans JP",sans-serif;color:var(--tx);font-size:12px}
.gp-veil .srow .stot{text-align:right;color:#fff;font-weight:600}
.gp-veil .srow .sp{color:var(--mu);text-align:center}
.gp-veil .srow .ssf{text-align:right;color:var(--gold)}
.gp-veil .srow .sflh{text-align:right;color:#4ade80}
.gp-veil .srow input.sfl{padding:1px 4px;text-align:right;color:#4ade80;border-color:#166534;font-size:12.5px}
.gp-veil .srow.base{grid-template-columns:92px 88px 1fr;column-gap:8px;margin-top:4px}
.gp-veil .srow.base input{padding:1px 4px;text-align:right;font-size:12.5px}
.gp-veil .srow.wjob{grid-template-columns:92px 1fr}
.gp-veil .srow .wsel{display:flex;gap:6px}
.gp-veil .srow .wsel select{max-width:180px}
.gp-veil .srow .sbase.ro{white-space:nowrap;text-align:right;font-size:12.5px;padding:1px 4px}
.gp-veil .srow .bnote{font-family:"IBM Plex Sans JP",sans-serif;font-size:10.5px;color:var(--mu);line-height:1.35}
.gp-veil .eq-score{margin:4px 0 0;font-size:11px;color:var(--mu);text-align:right}
.gp-veil .eq-score b{font-family:"IBM Plex Mono",monospace;color:#fff;font-variant-numeric:tabular-nums;display:inline-block;min-width:48px}
.gp-veil .plines{display:flex;flex-direction:column;gap:3px}
.gp-veil .pline{display:grid;grid-template-columns:8px 1fr 112px;gap:6px;align-items:center}
.gp-veil .gdot{width:8px;height:8px;display:block}
.gp-veil .eq-opts{display:flex;align-items:center;gap:12px;margin-top:12px;padding-top:8px;border-top:1px solid var(--ln)}
.gp-veil .eq-opts select{width:auto;flex:1;font-size:12px}
.gp-veil .foot{margin-top:10px}
.gp-veil .picks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px}
.gp-veil .pset{grid-column:1/-1;margin:8px 0 0;font-size:11px;color:var(--mu);border-bottom:1px solid var(--ln)}
.gp-veil .pick{display:grid;grid-template-columns:32px 1fr;grid-template-rows:auto auto;column-gap:6px;align-items:center;
text-align:left;background:var(--sf2);border:1px solid var(--ln);padding:3px 6px;cursor:pointer;color:var(--tx);font-family:inherit}
.gp-veil .pick .ico{grid-row:1/3}
.gp-veil .pick:hover{border-color:var(--acc)}
.gp-veil .pick.on{border-color:var(--acc);background:#1e1b4b}
.gp-veil .pick .pn{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gp-veil .pick .pl{font-size:10.5px;color:var(--mu);font-family:"IBM Plex Mono",monospace}
.gp .rd{margin-top:8px;padding-top:6px;border-top:1px solid var(--ln)}
.gp .rdbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.gp .rdbar .btn.live{border-color:var(--red);color:var(--red);font-weight:700}
.gp .rdstat{display:flex;align-items:center;gap:6px;margin-left:auto;font-size:11px;color:var(--mu)}
.gp .rdstat select{width:auto;padding:1px 4px;font-size:12px}
.gp .rdmsg{margin:4px 0 0;font-size:11px;color:var(--mu)}
.gp .rdmsg.err{color:var(--red)}
.gp .rdmsg.ok{color:#4ade80}
.gp .reads{margin-top:6px;border:1px solid var(--ln)}
.gp .read{display:grid;grid-template-columns:104px 26px minmax(0,1fr) 22px;gap:6px;align-items:center;
padding:3px 6px;border-bottom:1px solid var(--ln);font-size:12px}
.gp .read:nth-child(even){background:#0c1428}
.gp .read select{padding:1px 4px;font-size:12px}
.gp .read .rn{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gp .read .rv{display:block;font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;font-size:11px;color:var(--mu);line-height:1.4}
.gp .read .rv em{font-style:normal;color:var(--gold)}
.gp .read .rv i{font-style:normal;color:var(--cyan)}
.gp .read .rv u{text-decoration:none;color:#4ade80}
.gp .read .rx{background:none;border:0;color:var(--mu);cursor:pointer;font-size:14px;padding:0}
.gp .read .rx:hover{color:var(--red)}
.gp .readfoot{display:flex;gap:6px;justify-content:flex-end;padding:5px 6px}
.gp.drop .rd{outline:1px dashed var(--acc);outline-offset:2px}
@media(max-width:640px){.gp .step{grid-template-columns:26px 1fr;row-gap:2px}
.gp .num,.gp .eff{text-align:left;grid-column:2}}
`;

    const STORAGE_KEY = 'gms-gear-priority';
    const FLAME_FIELDS = [
        ['main', 'メインステ', ''], ['sub', 'サブステ', ''], ['att', '攻撃力', ''], ['boss', 'ボスダメ', '%'],
        ['dmg', 'ダメージ', '%'], ['allStat', 'オールステ', '%'],
    ];
    const blankFlame = () => ({ main: 0, sub: 0, att: 0, boss: 0, dmg: 0, allStat: 0 });
    // Line 1 carries the item's grade, lines 2-3 default to one grade below.
    const defaultLineGrade = (grade, i) => lineGrades(grade, i)[i === 0 ? 0 : lineGrades(grade, i).length - 1] || '';
    const blankLines = (grade = 'L') => [0, 1, 2].map((i) => ({ k: '', g: defaultLineGrade(grade, i), v: 0 }));
    const blankSlot = (on) => ({
        on, level: 160, star: 0, mode: '',
        item: null, grade: 'L', lines: blankLines(), flame: blankFlame(), baseAtt: 0, job: '', wtype: '',
    });
    // Flame score on the same weights as everything else.
    const flameScore = (f, w) => (f.main || 0) * w.main + (f.sub || 0) * (w.sub || 0) + (f.att || 0) * w.att + (f.boss || 0) * w.boss
        + (f.dmg || 0) * (w.dmg || 0) + (f.allStat || 0) * (w.allStat || 0);
    function cleanSlot(v) {
        const d = blankSlot(!!v.on);
        const num = (x, lo, hi) => Math.max(lo, Math.min(hi, Number(x) || 0));
        d.level = Number(v.level) || 160;
        d.star = num(v.star, 0, 30);
        d.mode = PLANS[v.mode] ? v.mode : '';
        d.item = Number(v.item) || null;
        d.grade = GRADES.includes(v.grade) ? v.grade : 'L';
        if (Array.isArray(v.lines)) d.lines = d.lines.map((_, i) => {
            const ln = v.lines[i] || {};
            return { k: POT_OPTS[ln.k] || ln.k === 'etc' ? ln.k : '', g: GRADES.includes(ln.g) ? ln.g : defaultLineGrade(d.grade, i), v: Number(ln.v) || 0 };
        });
        if (v.flame) for (const [k] of FLAME_FIELDS) d.flame[k] = num(v.flame[k], 0, 9999);
        d.baseAtt = num(v.baseAtt, 0, 9999);
        d.job = CLASS_WEAPON[v.job] ? v.job : '';
        d.wtype = d.job && CLASS_WEAPON[d.job].includes(v.wtype) ? v.wtype : '';
        return d;
    }

    /* ---------- equipment catalog (gear_items.js) ---------- */
    // Only name, level and icon matter here: the item's own stats are left to
    // the score weights, so the catalog is just a picker.
    const ITEMS = Array.isArray(window.GEAR_ITEMS) ? window.GEAR_ITEMS : [];
    const ITEM_BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
    const SLOT_KINDS = {
        weapon: ['weapon'], sub: ['sub'], emblem: ['emblem'],
        ring1: ['ring'], ring2: ['ring'], ring3: ['ring'], ring4: ['ring'],
        belt: ['belt'], face: ['face'], eye: ['eye'], ear: ['ear'],
        pendant1: ['pendant'], pendant2: ['pendant'],
        hat: ['hat'], top: ['top', 'overall'], bottom: ['bottom'], shoulder: ['shoulder'],
        pocket: ['pocket'], cape: ['cape'], glove: ['glove'], shoe: ['shoe'],
        heart: ['heart'], badge: ['badge'], title: [],
    };
    // Weapon flame attack by class: class -> weapon type -> the picked weapon's tier.
    const WEAPON_FLAME = window.WEAPON_FLAME || {};
    const CLASS_WEAPON = window.CLASS_WEAPON || {};
    const WEAPON_TIER_JP = { absolab: 'アブソラブ', arcane: 'アーケインシェード', genesis: 'ジェネシス', destiny: 'デスティニー' };
    const WTYPE_JP = { '杖': 'ワンド', '棒': 'スタッフ' };
    const weaponTypeOf = (v) => v.wtype || (CLASS_WEAPON[v.job] || [])[0] || '';
    function weaponRow(v) {
        const it = ITEM_BY_ID.get(v.item);
        const row = it && WEAPON_FLAME[weaponTypeOf(v)];
        return row && row[it.set] ? row[it.set] : null;
    }
    const itemsFor = (slotId) => ITEMS.filter((it) => (SLOT_KINDS[slotId] || []).includes(it.slot));
    const SET_JP = {
        genesis: 'ジェネシス', destiny: 'デスティニー', eternal: 'エターナル', arcane: 'アーケインシェード', absolab: 'アブソラブ',
        cra: 'ルートアビス', pitched: '漆黒のボス', dawn: '黎明のボス',
        boss_acc: 'ボスアクセサリー', meister: 'マイスター', gollux: 'ゴルロックス', sweetwater: 'スウィートウォーター', other: 'その他',
    };
    const iconUrl = (id) => `https://maplestory.io/api/GMS/${(ITEM_BY_ID.get(id) || {}).ver || 255}/item/${id}/icon`;
    const iconImg = (id, size) => id
        ? `<img class="ico" src="${iconUrl(id)}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.style.visibility='hidden'">`
        : `<span class="ico none" style="width:${size}px;height:${size}px"></span>`;
    const defaultSlots = () => {
        const out = {};
        for (const id of Object.keys(SLOTS)) {
            out[id] = { ...blankSlot(hasWork(id)), level: defaultLevel(id) };
        }
        return out;
    };
    const DEFAULT_STATE = () => ({
        w: { main: 1, sub: 0.1, att: 3, statPct: 11, allStat: 12, crit: 40, attPct: 45, boss: 10, dmg: 10 },
        o: { ssf: true, safeguard: true, starCatch: true, planName: '1144', flamePrice: 3e6, cubeSale: false, cubeSalePct: 25 },
        slots: defaultSlots(),
        limit: 40,
    });

    /* ---------- screenshot reader (gear_reader.js) ---------- */
    // Main / sub stat and attack type per class, for turning "STR +114" into
    // main/sub stat. Classes left out (Xenon, Demon Avenger, newer ones) are picked by hand.
    const JOB_STAT = (() => {
        const t = {};
        const put = (ids, main, sub, att) => ids.split(' ').forEach((id) => { t[id] = { main, sub, att }; });
        put('hero paladin darkknight dawnwarrior mihile aran blaster demonslayer kaiser adele zero hayato ark shade buccaneer cannoneer thunderbreaker ren', 'str', 'dex', 'att');
        put('bowmaster marksman pathfinder windarcher mercedes wildhunter kain corsair angelicbuster mechanic', 'dex', 'str', 'att');
        put('archmagefp archmageil bishop blazewizard evan luminous battlemage kinesis illium lara kanna lynn sia', 'int', 'luk', 'matt');
        put('nightlord shadower dualblade nightwalker phantom cadena khali hoyoung', 'luk', 'dex', 'att');
        return t;
    })();
    const STAT_JP = { str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK' };
    // Tooltip item type -> slot(s) on the rack, in fill order.
    const KIND_SLOTS = {
        weapon: ['weapon'], sub: ['sub'], emblem: ['emblem'], ring: ['ring1', 'ring2', 'ring3', 'ring4'],
        belt: ['belt'], face: ['face'], eye: ['eye'], ear: ['ear'], pendant: ['pendant1', 'pendant2'],
        hat: ['hat'], top: ['top'], overall: ['top'], bottom: ['bottom'], shoulder: ['shoulder'],
        pocket: ['pocket'], cape: ['cape'], glove: ['glove'], shoe: ['shoe'], heart: ['heart'], badge: ['badge'],
    };
    const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
    function editDist(a, b) {
        const d = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            let prev = d[0];
            d[0] = i;
            for (let j = 1; j <= b.length; j++) {
                const t = d[j];
                d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
                prev = t;
            }
        }
        return d[b.length];
    }
    // The catalog entry the read name is closest to, allowing a few misread letters.
    function matchItem(slotId, name) {
        const n = normName(name);
        if (!n) return null;
        let best = null;
        for (const it of itemsFor(slotId)) {
            const dist = editDist(n, normName(it.name));
            if (!best || dist < best.dist) best = { it, dist };
        }
        return best && best.dist <= Math.max(2, Math.round(n.length * 0.2)) ? best.it : null;
    }
    // Weapons and secondaries differ by class, so the weapon goes by tier, read from its level.
    // Lv200 is either Arcane or Genesis: "Genesis" anywhere in the tooltip text decides,
    // since the name line itself doesn't always survive the OCR.
    function weaponByLevel(L, text) {
        const set = L >= 250 ? 'destiny' : L >= 200 ? (/gen[ec]s[il1]s/i.test(text) ? 'genesis' : 'arcane')
            : L >= 160 ? (/sweet\s*water/i.test(text) ? 'sweetwater' : 'absolab') : '';
        return ITEMS.find((it) => it.slot === 'weapon' && it.set === set) || null;
    }
    const snapLevel = (id, L) => {
        const opts = levelsFor(id);
        const below = opts.filter((x) => x <= L);
        return below.length ? below[below.length - 1] : opts[0];
    };
    let audioCtx = null;
    function beep() {
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = 'sine'; o.frequency.value = 880;
            g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
            o.connect(g).connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + 0.2);
        } catch (e) { /* no audio */ }
    }

    const gearPriority = {
        state: DEFAULT_STATE(),
        draft: null,
        expanded: new Set(),

        init(rootId) {
            this.root = document.getElementById(rootId || 'gear-priority-root');
            if (!this.root) return;
            this.load();
            this.root.innerHTML = this.buildHTML();
            this.bind();
            this.renderRack();
            this.renderPlan();
        },

        load() {
            try {
                const raw = localStorage.getItem(this.storageKey || STORAGE_KEY);
                if (!raw) return;
                const s = JSON.parse(raw);
                const d = DEFAULT_STATE();
                // Slots added later, or a save from the old free-form item list,
                // fall back to the default entry for that slot.
                const slots = d.slots;
                if (s.slots) {
                    for (const id of Object.keys(slots)) {
                        const v = s.slots[id];
                        if (v) slots[id] = cleanSlot(v);
                        // A slot can lose its tables between versions; don't leave it checked.
                        if (!hasWork(id)) slots[id].on = false;
                        // Saves from when the emblem was pinned to Lv100 carry a stray level.
                        if (v && !slots[id].item && !levelsFor(id).includes(slots[id].level)) slots[id].level = defaultLevel(id);
                    }
                }
                this.state = {
                    w: { ...d.w, ...(s.w || {}) },
                    o: { ...d.o, ...(s.o || {}) },
                    slots,
                    limit: Number(s.limit) || d.limit,
                };
            } catch (e) { /* keep defaults on corrupted storage */ }
        },

        // Enabled slots, shaped the way the planner wants them.
        entries() {
            return Object.keys(SLOTS)
                .filter((id) => this.state.slots[id].on && hasWork(id))
                .filter((id) => !(id === 'bottom' && this.bottomTaken()))
                .map((id) => {
                    const v = this.state.slots[id];
                    return {
                        id, name: SLOTS[id].label, part: SLOTS[id].part,
                        level: v.level, star: v.star, mode: v.mode,
                        lines: v.lines, overall: id === 'top' && this.bottomTaken(),
                        noStar: !hasStar(id),
                        flame: v.flame, flameOk: this.flameOk(id, v), baseAtt: v.baseAtt || 0,
                        wRow: id === 'weapon' ? weaponRow(v) : null,
                        boss: !!(ITEM_BY_ID.get(v.item) || {}).bossReward || !!SLOTS[id].bossFlame,
                    };
                });
        },
        save() {
            try { localStorage.setItem(this.storageKey || STORAGE_KEY, JSON.stringify(this.state)); } catch (e) { /* quota */ }
        },

        // The 18★+ mode here is only the default; each slot may pin its own.
        opts() { return { ...this.state.o }; },

        buildHTML() {
            const { w, o, limit } = this.state;
            const weights = WEIGHT_FIELDS.map(([k, lb]) => `
                <div>
                    <label for="gp-w-${k}">${esc(lb)}</label>
                    <input id="gp-w-${k}" type="number" min="0" step="any" value="${w[k]}" data-gp="weight" data-key="${k}">
                </div>`).join('');

            return `<style>${CSS}</style>
<div class="gp"><div class="wrap">
    <div class="head"><h1>Upgrade Priority</h1>
    <p class="sub">いま持っている装備を入れると、次に伸ばすべき順番をメソ効率順に並べます。リブート／シャイニングスターフォース前提、潜在はレジェンダリー基準。${this.storageKey ? '' : '<br>ここはキャラに紐づかない仮の入力です。キャラごとの入力は Character Manager のカードの「UPGRADE」から開きます。'}</p></div>

    <section>
        <p class="eyebrow">スコア重み</p>
        <div class="card wcard">
            <div class="grid6">${weights}</div>
            <div class="opts">
                <label class="chk"><input type="checkbox" data-gp="opt" data-key="ssf" ${o.ssf ? 'checked' : ''}>シャイニングスターフォース</label>
                <label class="chk"><input type="checkbox" data-gp="opt" data-key="safeguard" ${o.safeguard ? 'checked' : ''}>15-17★で破壊防止</label>
                <label class="chk"><input type="checkbox" data-gp="opt" data-key="starCatch" ${o.starCatch ? 'checked' : ''}>スターキャッチ</label>
                <div style="width:170px">
                    <label for="gp-plan">18★以降のモード（既定）</label>
                    <select id="gp-plan" data-gp="planName">
                        ${Object.keys(PLANS).map((k) => `<option value="${k}" ${o.planName === k ? 'selected' : ''}>${esc(PLAN_LABEL[k])}</option>`).join('')}
                    </select>
                </div>
                <div style="width:96px">
                    <label for="gp-flame-price">黒転生 1回（M）</label>
                    <input id="gp-flame-price" type="number" min="0" step="0.1" value="${(o.flamePrice || 3e6) / 1e6}" data-gp="flamePrice">
                </div>
                <div class="sale">
                    <label for="gp-sale-pct">キューブの割引</label>
                    <span class="salerow">
                        <label class="chk"><input type="checkbox" data-gp="opt" data-key="cubeSale" ${o.cubeSale ? 'checked' : ''}>ブラックフライデー</label>
                        <input id="gp-sale-pct" type="number" min="0" max="100" step="1" value="${o.cubeSalePct ?? 25}" data-gp="cubeSalePct" aria-label="割引率（%）" ${o.cubeSale ? '' : 'disabled'}><span class="pct">%引き</span>
                    </span>
                </div>
                <div style="width:70px">
                    <label for="gp-limit">読む手数</label>
                    <input id="gp-limit" type="number" min="1" max="80" value="${limit}" data-gp="limit">
                </div>
            </div>
        </div>
    </section>

    <div class="cols">
    <section>
        <p class="eyebrow">装備</p>
        <div class="card">
            <div class="rackbar">
                <span>クリックで詳細を入力。チェックを外した部位は計算から除外します。</span>
                <span class="rackbtns">
                    <button type="button" class="btn" data-gp="all-on">すべて有効</button>
                    <button type="button" class="btn" data-gp="all-off">すべて無効</button>
                </span>
            </div>
            <div class="gridwrap"><div id="gp-rack" class="slots"></div></div>
            <div class="rd">
                <div class="rdbar">
                    <button type="button" class="btn" data-gp="rd-file">スクショから読み取る</button>
                    <button type="button" class="btn" data-gp="rd-live">ライブ読み取り</button>
                    <input type="file" accept="image/*" multiple hidden data-gp="rd-input">
                    <span class="rdstat">${this.statPicks()}</span>
                </div>
                <p class="rdmsg" data-rd="msg">ゲームで装備にカーソルを合わせたスクショを、Ctrl+V かドラッグでも渡せます。</p>
                <div id="gp-reads"></div>
            </div>
        </div>
    </section>

    <section>
        <p class="eyebrow">この順で伸ばす</p>
        <div class="legend">
            <span><i class="dot" style="background:#f4b942"></i>スターフォース</span>
            <span><i class="dot" style="background:#48d6c8"></i>潜在</span>
            <span><i class="dot" style="background:#4ade80"></i>転生</span>
            <span><i class="dot" style="background:#b18cf7"></i>武器・補助武器・エンブレムの潜在</span>
            <span>バーは1スコアあたりの単価（対数）。長いほど割高。</span>
        </div>
        <div class="card" style="padding:0"><div id="gp-plan-list"></div></div>
        <p class="note">スターフォースは破壊で★が戻るため、0→18・18→20・20→21・21→22、以降は1★ずつをひとまとまりとして扱い、その区切りまで到達する期待額を出しています（再登坂込み、予備装備は0メソ扱い）。潜在はKMSの行ごとの確率（Lv160以上は値+1%）で3行の組み合わせを全部数え、今の3行の合計スコアを上回るまで回す期待個数と、上回ったときの平均スコアで見ています。転生は黒転生（結果を選べる）で同じように、今を上回るまでの期待回数で見ています。</p>
    </section>
    </div>
</div></div>
<div id="gp-modal-host"></div>`;
        },

        bind() {
            const root = this.root;
            root.addEventListener('input', (e) => {
                const t = e.target.closest('[data-gp]');
                if (!t) return;
                const kind = t.dataset.gp;
                if (kind === 'weight') {
                    this.state.w[t.dataset.key] = Number(t.value) || 0;
                    this.save(); this.renderPlan();
                } else if (kind === 'limit') {
                    this.state.limit = Math.max(1, Math.min(80, Number(t.value) || 1));
                    this.save(); this.renderPlan();
                } else if (kind === 'flamePrice') {
                    this.state.o.flamePrice = Math.max(0, Number(t.value) || 0) * 1e6;
                    this.save(); this.renderPlan();
                } else if (kind === 'cubeSalePct') {
                    this.state.o.cubeSalePct = Math.max(0, Math.min(100, Number(t.value) || 0));
                    this.save(); this.renderPlan();
                }
            });
            root.addEventListener('change', (e) => {
                const t = e.target.closest('[data-gp]');
                if (!t) return;
                const kind = t.dataset.gp;
                if (kind === 'opt') {
                    this.state.o[t.dataset.key] = t.checked;
                    if (t.dataset.key === 'cubeSale') this.root.querySelector('#gp-sale-pct').disabled = !t.checked;
                    this.save(); this.renderPlan();
                } else if (kind === 'planName') {
                    this.state.o.planName = t.value;
                    this.save(); this.renderPlan();
                } else if (kind === 'limit') {
                    t.value = this.state.limit;
                } else if (kind === 'toggle') {
                    this.state.slots[t.dataset.id].on = t.checked;
                    this.save(); this.renderRack(); this.renderPlan();
                }
            });
            root.addEventListener('click', (e) => {
                const t = e.target.closest('[data-gp]');
                if (!t) return;
                const kind = t.dataset.gp;
                if (kind === 'edit') {
                    const id = t.dataset.id;
                    this.openDraft(id);
                } else if (kind === 'fold') {
                    const sig = t.dataset.sig;
                    if (this.expanded.has(sig)) this.expanded.delete(sig);
                    else this.expanded.add(sig);
                    this.renderPlan();
                    // The row is rebuilt, so put the caret back on the same toggle.
                    // Match on the dataset rather than a selector -- the signature
                    // carries quotes and brackets that would need escaping.
                    const again = [...root.querySelectorAll('[data-gp="fold"]')].find((b) => b.dataset.sig === sig);
                    if (again) again.focus();
                } else if (kind === 'all-on' || kind === 'all-off') {
                    const on = kind === 'all-on';
                    for (const id of Object.keys(SLOTS)) {
                        if (hasWork(id)) this.state.slots[id].on = on;
                    }
                    this.save(); this.renderRack(); this.renderPlan();
                }
            });
            this.bindReader();
            this.onKey = (e) => { if (e.key === 'Escape' && this.draft) this.closeDraft(); };
            window.addEventListener('keydown', this.onKey);
            // The modal host outlives every modal, so delegate from it once.
            this.bindModal(root.querySelector('#gp-modal-host'));
        },

        /* ---------- screenshot reader ---------- */
        // Main / sub stat and attack type the reads are sorted into. A pick made
        // here wins; otherwise the character's class (or the weapon's) decides.
        rdStats() {
            const o = this.state.o;
            const job = JOB_STAT[this.charJob || this.state.slots.weapon.job] || { main: 'str', sub: 'dex', att: 'att' };
            return { main: o.rdMain || job.main, sub: o.rdSub || job.sub, att: o.rdAtt || job.att };
        },
        statPicks() {
            const st = this.rdStats();
            const sel = (key, val, opts) => `<select data-gp="rd-stat" data-key="${key}">${opts.map(([v, lb]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${lb}</option>`).join('')}</select>`;
            const stats = Object.entries(STAT_JP);
            return `メイン${sel('rdMain', st.main, stats)}サブ${sel('rdSub', st.sub, stats)}${sel('rdAtt', st.att, [['att', '攻撃力'], ['matt', '魔力']])}`;
        },
        msg(text, kind) {
            const el = this.root.querySelector('[data-rd="msg"]');
            if (!el) return;
            el.textContent = text;
            el.className = 'rdmsg' + (kind ? ' ' + kind : '');
        },

        // Potential lines as the planner stores them: the read stat becomes
        // "main" or "その他", and the grade of lines 2-3 comes from the value.
        readLines(id, res, L, st) {
            const allowed = POT_KEYS(SLOTS[id].part);
            const grade = res.grade;
            return [0, 1, 2].map((i) => {
                const p = res.pot[i], gs = lineGrades(grade, i);
                if (!p) return { k: '', g: defaultLineGrade(grade, i), v: 0 };
                let k = p.k === st.main ? 'main' : p.k === st.att ? 'att' : p.k;
                if (!p.pct || !allowed.includes(k)) k = 'etc';
                if (k === 'etc') return { k, g: gs[gs.length - 1] || grade, v: p.v };
                let v = p.v, g = gs.find((x) => potValues(k, x, L).includes(v));
                if (!g) {
                    g = gs.find((x) => potValues(k, x, L).length) || gs[0];
                    const vals = potValues(k, g, L);
                    if (vals.length) v = vals.reduce((a, b) => (Math.abs(b - p.v) < Math.abs(a - p.v) ? b : a));
                }
                return { k, g, v };
            });
        },
        readToValue(id, res) {
            const cur = this.state.slots[id], st = this.rdStats();
            const it = id === 'weapon' ? weaponByLevel(res.level, `${res.name}\n${res.raw || ''}`) : matchItem(id, res.name);
            const L = FIXED_LV[SLOTS[id].part] || (it ? it.level : snapLevel(id, res.level || defaultLevel(id)));
            const v = {
                ...cur, on: true, item: it ? it.id : null, level: L,
                star: hasStar(id) ? Math.min(maxStarOf(L), res.stars || 0) : 0,
                grade: 'L', lines: blankLines(), flame: blankFlame(),
            };
            if (hasPot(id) && res.grade) { v.grade = res.grade; v.lines = this.readLines(id, res, L, st); }
            if (this.flameOk(id, v)) {
                const f = res.flame;
                v.flame = { main: f[st.main] || 0, sub: f[st.sub] || 0, att: f[st.att] || 0, boss: f.boss || 0, dmg: f.dmg || 0, allStat: f.allStat || 0 };
            }
            return v;
        },
        // Queue a read for review. Rings and pendants fill their slots in order;
        // a second read of a one-slot part replaces the first.
        stage(res) {
            const slots = KIND_SLOTS[res.kind];
            if (!slots) return false;
            const key = [res.kind, res.name, res.level, res.stars, res.grade, res.pot.map((p) => p.k + p.v).join(','), JSON.stringify(res.flame)].join('|');
            if (this.reads.some((r) => r.key === key)) return false;
            let id = slots[0];
            if (slots.length > 1) {
                const used = this.reads.map((r) => r.id);
                id = slots.find((x) => !used.includes(x)) || slots[slots.length - 1];
            }
            this.reads = this.reads.filter((r) => r.id !== id);
            this.reads.push({ id, key, res, v: this.readToValue(id, res) });
            this.renderReads();
            return true;
        },
        renderReads() {
            const el = this.root.querySelector('#gp-reads');
            if (!el) return;
            if (!this.reads.length) { el.innerHTML = ''; return; }
            const opts = Object.keys(SLOTS).filter(hasWork);
            const potText = (ln) => (POT_OPTS[ln.k] ? `${POT_OPTS[ln.k].jp}+${ln.v}%` : ln.k === 'etc' ? 'その他' : '');
            const rows = this.reads.map((r, i) => {
                const v = r.v, it = ITEM_BY_ID.get(v.item);
                const pot = hasPot(r.id) && r.res.grade ? `<i>潜在${v.grade} ${v.lines.map(potText).filter(Boolean).join(' / ')}</i>` : '';
                const f = v.flame, fl = [['メイン', f.main], ['サブ', f.sub], [this.rdStats().att === 'matt' ? '魔力' : '攻撃', f.att], ['ボス', f.boss, '%'], ['ダメ', f.dmg, '%'], ['オール', f.allStat, '%']]
                    .filter((x) => x[1]).map(([lb, n, u]) => `${lb}${n}${u || ''}`).join(' ');
                const parts = [`Lv${v.level}`, hasStar(r.id) ? `<em>${v.star}★</em>` : '', pot, fl ? `<u>転生 ${fl}</u>` : ''].filter(Boolean);
                return `<div class="read">
                    <select data-gp="rd-slot" data-i="${i}" aria-label="入れる部位">${opts.map((id) => `<option value="${id}" ${id === r.id ? 'selected' : ''}>${esc(SLOTS[id].label)}</option>`).join('')}</select>
                    <span class="tile-ico">${iconImg(v.item, 26)}</span>
                    <span style="min-width:0"><span class="rn" title="${esc(r.res.name)}">${esc(it ? it.name : r.res.name || '（名前を読めず）')}</span>
                        <span class="rv">${parts.join(' · ')}</span></span>
                    <button type="button" class="rx" data-gp="rd-x" data-i="${i}" title="この読み取りを捨てる">×</button>
                </div>`;
            }).join('');
            el.innerHTML = `<div class="reads">${rows}
                <div class="readfoot"><button type="button" class="btn danger" data-gp="rd-clear">すべて捨てる</button>
                <button type="button" class="btn primary" data-gp="rd-apply">${this.reads.length}件を反映して保存</button></div></div>`;
        },
        applyReads() {
            for (const r of this.reads) {
                const clean = cleanSlot(r.v);
                const L = FIXED_LV[SLOTS[r.id].part] || clean.level;
                clean.star = hasStar(r.id) ? Math.min(maxStarOf(L), clean.star) : 0;
                if (!this.flameOk(r.id, clean)) clean.flame = blankFlame();
                this.state.slots[r.id] = clean;
            }
            const n = this.reads.length;
            this.reads = [];
            this.save();
            this.renderRack(); this.renderPlan(); this.renderReads();
            this.msg(`${n}件を反映しました。`, 'ok');
        },
        async readImage(blob) {
            if (!window.gearReader) { this.msg('読み取りの部品が読み込まれていません。', 'err'); return; }
            this.msg('読み取り中…（初回は文字認識の読み込みに少し時間がかかります）');
            try {
                const img = await gearReader.pixelsOf(blob);
                const res = await gearReader.readTooltip(img);
                if (!res.length) { this.msg('装備のツールチップが見つかりませんでした。カーソルを装備に合わせた状態のスクショを使ってください。', 'err'); return; }
                const added = res.filter((r) => this.stage(r)).length;
                const unknown = res.filter((r) => !KIND_SLOTS[r.kind]).length;
                this.msg(added ? '読み取りました。内容を確かめて「反映して保存」を押してください。'
                    : unknown ? '部位を判定できませんでした。' : 'すでに読み取った装備です。', added ? 'ok' : 'err');
            } catch (e) {
                console.error(e);
                this.msg('読み取りに失敗しました: ' + (e && e.message || e), 'err');
            }
        },

        // Live: share the game window, and each time a tooltip settles somewhere
        // new, read it and beep. Star rows are looked for on every tick; tooltips
        // without stars need the slower text search, so that runs every few seconds.
        async toggleLive() {
            if (this.live) { this.stopLive('ライブ読み取りを止めました。'); return; }
            if (!window.gearReader) { this.msg('読み取りの部品が読み込まれていません。', 'err'); return; }
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { this.msg('このブラウザは画面共有に対応していません。', 'err'); return; }
            try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
            let stream;
            try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false }); } catch (e) {
                this.msg('画面共有がキャンセルされました。', 'err'); return;
            }
            const video = document.createElement('video');
            video.muted = true; video.playsInline = true; video.srcObject = stream;
            try { await video.play(); } catch (e) { /* plays once frames arrive */ }
            const L = { stream, video, busy: false, count: 0, spot: null, done: null, lastText: 0 };
            this.live = L;
            stream.getVideoTracks()[0].addEventListener('ended', () => { if (this.live === L) this.stopLive('画面共有が終わりました。'); });
            L.timer = setInterval(() => this.liveTick(), 350);
            this.liveButton();
            this.msg('文字認識を準備しています…');
            gearReader.getWorker().then(() => { if (this.live === L) this.msg('ライブ読み取り中。ゲームで装備にカーソルを合わせてください。読めたら音が鳴ります。'); })
                .catch((e) => { this.stopLive(); this.msg('文字認識の読み込みに失敗しました: ' + (e && e.message || e), 'err'); });
        },
        stopLive(text) {
            const L = this.live;
            if (!L) return;
            clearInterval(L.timer);
            L.stream.getTracks().forEach((t) => t.stop());
            this.live = null;
            this.liveButton();
            if (text) this.msg(text);
        },
        liveButton() {
            const b = this.root.querySelector('[data-gp="rd-live"]');
            if (!b) return;
            b.textContent = this.live ? 'ライブ読み取りを止める' : 'ライブ読み取り';
            b.classList.toggle('live', !!this.live);
        },
        async liveTick() {
            const L = this.live;
            if (!L || L.busy || !L.video.videoWidth) return;
            L.busy = true;
            try {
                const img = await gearReader.pixelsOf(L.video);
                const spots = gearReader.findStarRows(img);
                let res = null;
                if (spots.length) {
                    // Wait for the tooltip to stop moving, then read it once.
                    const t = spots[0], sig = this.spotSig(img, t);
                    const same = L.spot && Math.abs(L.spot.x0 - t.x0) < 3 && Math.abs(L.spot.y - t.y) < 3;
                    L.spot = t;
                    if (!same) return;
                    if (!L.done || this.sigDiff(L.done, sig) >= 6) {
                        L.done = sig;
                        res = await gearReader.readTooltip(img, { starsOnly: true });
                        L.spotOk = res.length > 0;
                    }
                } else {
                    L.spot = null;
                }
                // No stars on screen, or the "stars" were other yellow UI that read as nothing:
                // look for a starless tooltip (secondary, emblem) by its text now and then.
                if (!(res && res.length) && !(spots.length && L.spotOk)) {
                    if (Date.now() - L.lastText < 5000) return;
                    L.lastText = Date.now();
                    res = await gearReader.readTooltip(img);
                }
                const added = (res || []).filter((r) => this.stage(r)).length;
                if (added) {
                    beep();
                    L.count += added;
                    this.msg(`読み取りました（${L.count}件）。次の装備にカーソルを合わせてください。`, 'ok');
                }
            } catch (e) {
                console.error(e);
            } finally {
                L.busy = false;
            }
        },
        // A coarse picture of the tooltip, to tell a new item from the same one.
        spotSig(img, t) {
            const r = gearReader.cropRect(img, t), out = new Uint8Array(24 * 48);
            for (let y = 0; y < 48; y++) for (let x = 0; x < 24; x++) {
                const px = Math.min(img.width - 1, Math.round(r.x0 + (x + 0.5) * r.w / 24));
                const py = Math.min(img.height - 1, Math.round(r.y0 + (y + 0.5) * Math.min(r.h, 520 * t.s) / 48));
                const i = (py * img.width + px) * 4;
                out[y * 24 + x] = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
            }
            return out;
        },
        sigDiff(a, b) {
            let s = 0;
            for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
            return s / a.length;
        },

        bindReader() {
            const root = this.root, gp = root.querySelector('.gp');
            this.reads = [];
            root.addEventListener('click', (e) => {
                const t = e.target.closest('[data-gp]');
                if (!t) return;
                const kind = t.dataset.gp;
                if (kind === 'rd-file') root.querySelector('[data-gp="rd-input"]').click();
                else if (kind === 'rd-live') this.toggleLive();
                else if (kind === 'rd-x') { this.reads.splice(Number(t.dataset.i), 1); this.renderReads(); }
                else if (kind === 'rd-clear') { this.reads = []; this.renderReads(); this.msg('読み取りを捨てました。'); }
                else if (kind === 'rd-apply') this.applyReads();
            });
            root.addEventListener('change', async (e) => {
                const t = e.target.closest('[data-gp]');
                if (!t) return;
                const kind = t.dataset.gp;
                if (kind === 'rd-input') {
                    const files = [...t.files];
                    t.value = '';
                    for (const f of files) await this.readImage(f);
                } else if (kind === 'rd-slot') {
                    const r = this.reads[Number(t.dataset.i)];
                    this.reads = this.reads.filter((x) => x === r || x.id !== t.value);
                    r.id = t.value; r.v = this.readToValue(r.id, r.res);
                    this.renderReads();
                } else if (kind === 'rd-stat') {
                    this.state.o[t.dataset.key] = t.value;
                    this.save();
                    this.reads.forEach((r) => { r.v = this.readToValue(r.id, r.res); });
                    this.renderReads();
                }
            });
            gp.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); gp.classList.add('drop'); } });
            gp.addEventListener('dragleave', (e) => { if (e.target === gp || !gp.contains(e.relatedTarget)) gp.classList.remove('drop'); });
            gp.addEventListener('drop', async (e) => {
                const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
                if (!files.length) return;
                e.preventDefault();
                gp.classList.remove('drop');
                for (const f of files) await this.readImage(f);
            });
            // Ctrl+V anywhere while this page (and no item dialog) is in front.
            this.onPaste = (e) => {
                if (!root.isConnected || root.offsetParent === null || this.draft) return;
                const overlay = document.getElementById('gp-char-overlay');
                if (overlay && !overlay.contains(root)) return;
                const item = [...((e.clipboardData && e.clipboardData.items) || [])].find((x) => x.type.startsWith('image/'));
                if (!item) return;
                e.preventDefault();
                this.readImage(item.getAsFile());
            };
            document.addEventListener('paste', this.onPaste);
        },
        teardown() {
            if (this.onPaste) document.removeEventListener('paste', this.onPaste);
            this.stopLive();
        },

        // Bonus stats: off for parts that never roll them and for picked items marked noFlame.
        flameOk(id, v) {
            const it = ITEM_BY_ID.get(v.item);
            return !NO_FLAME_SLOT.has(id) && !(it && it.noFlame);
        },

        // The top slot holding a one-piece overall leaves the bottom slot empty.
        bottomTaken() {
            const it = ITEM_BY_ID.get(this.state.slots.top.item);
            return !!(it && it.slot === 'overall');
        },

        renderRack() {
            const el = this.root.querySelector('#gp-rack');
            const taken = this.bottomTaken();
            el.innerHTML = GRID.map((row) => row.map((id) => {
                if (!id) return '<div></div>';
                const s = SLOTS[id], v = this.state.slots[id];
                const covered = id === 'bottom' && taken;
                const inert = !hasWork(id) || covered;
                const it = ITEM_BY_ID.get(v.item);
                const L = FIXED_LV[s.part] || v.level;
                const scored = v.grade ? v.lines.filter((ln) => POT_OPTS[ln.k]).length : 0;
                const pot = v.grade && scored
                    ? `<i style="color:${GRADE_COLOR[v.grade]}" title="${GRADE_EN[v.grade]} ${scored}行">潜在${v.grade}</i>`
                    : '<i>潜在なし</i>';
                const lit = flameScore(v.flame, this.state.w) > 0;
                const flame = hasPot(id) ? (lit ? ' <u>転生</u>' : '') : (lit ? '<u>転生</u>' : '<i>転生なし</i>');
                const line1 = `Lv${L}` + (hasStar(id) ? ` · <em>${v.star}★</em>` : '');
                const line2 = (hasPot(id) ? pot : '') + flame + (hasStar(id) && v.mode ? ` <b class="pin">${esc(v.mode)}</b>` : '');
                const name = it ? it.name : s.label;
                return `<div class="slot ${v.on && !covered ? '' : 'off'} ${inert ? 'inert' : ''}">
                    <button type="button" class="slot-btn" data-gp="edit" data-id="${id}" title="${esc(name)}" ${covered ? 'disabled' : ''}>
                        <span class="tile-ico">${iconImg(v.item, 26)}</span>
                        <span class="tile-body">
                            <span class="nm">${esc(s.label)}</span>
                            ${covered ? '<span class="st">上が一体型</span>'
                            : inert ? '<span class="st">計算対象外</span>'
                            : `<span class="st">${line1}</span><span class="st">${line2}</span>`}
                        </span>
                    </button>
                    <label class="sw" title="${esc(s.label)}を計算に含める">
                        <input type="checkbox" data-gp="toggle" data-id="${id}" ${v.on && !covered ? 'checked' : ''} ${inert ? 'disabled' : ''}>
                    </label>
                </div>`;
            }).join('')).join('');
        },

        // Potential rows name the lines to stop on, since a score alone doesn't say.
        targetHTML(s) {
            if (s.kind !== 'pot' || !s.pot) return '';
            const t = potTarget(s.pot.key, s.unit, s.pot.L, this.state.w, s.pot.thr);
            if (!t) return '';
            const head = `<span class="tl">目標</span><b>${esc(t.min)}</b> <span class="who">狙うと期待${countText(t.rolls)}個</span>`;
            if (!t.count) return `<div class="tgt">${head}</div>`;
            // The other combinations stay folded until asked for.
            const list = t.others.map((o) => `${esc(o.label)} ${pctText(o.share)}`).join('、');
            return `<details class="tgt"><summary>${head}<span class="more">ほか${t.count}通り</span></summary>
                <div class="alt">ほか${t.count}通りでも可。${list ? '多いのは ' + list + '（止まったときの割合）' : ''}</div></details>`;
        },

        renderPlan() {
            const el = this.root.querySelector('#gp-plan-list');
            const plan = buildPlan(this.entries(), this.state.w, this.opts(), this.state.limit);
            if (!plan.length) {
                el.innerHTML = '<p class="empty">伸ばせる先がありません。装備を有効にするか、進捗を下げてみてください。</p>';
                return;
            }
            const effs = plan.map((s) => Math.log10(s.eff));
            const lo = Math.min(...effs, 0), hi = Math.max(...effs, 1);
            const frac = (s) => (hi > lo ? (Math.log10(s.eff) - lo) / (hi - lo) : .5);

            // Identical slots produce an identical action at an identical price,
            // so the greedy pass emits them back to back. Fold each run into one
            // row and keep the individual steps behind a toggle.
            const groups = [];
            plan.forEach((s, i) => {
                // Same cost is not enough: two parts can price alike but score
                // differently, and the folded row shows only one efficiency.
                const sig = `${s.kind}|${s.unit}|${s.big}|${s.label}|${s.detail}|${s.level}|${Math.round(s.cost)}|${Math.round(s.eff)}`;
                const last = groups[groups.length - 1];
                if (last && last.sig === sig) last.steps.push({ ...s, rank: i + 1 });
                else groups.push({ sig, steps: [{ ...s, rank: i + 1 }] });
            });

            const row = (s, cls, rank, cost, cum, extra) => `<div class="step ${s.kind} ${s.big ? 'big' : ''} ${cls}">
                <div class="rk">${rank}</div>
                <div>
                    <div class="who">${esc(s.name)}・Lv${s.level}</div>
                    <div class="what"><b>${esc(s.label)}</b> ${s.kind === 'pot' ? `<span class="cube ${s.unit}"><img src="https://maplestory.io/api/GMS/270/item/${CUBE_ICON[s.unit]}/icon" alt="" width="16" height="16" loading="lazy" onerror="this.style.display='none'">${esc(CUBE_JP[s.unit])}</span> ` : ''}<span class="who">${esc(s.detail)}</span>${extra || ''}</div>
                    ${this.targetHTML(s)}
                    <div class="meter"><i style="width:${(8 + frac(s) * 92).toFixed(1)}%"></i></div>
                </div>
                <div class="num">${cost}<div class="who sm">累計 ${cum}</div></div>
                <div class="eff">${fmtM(s.eff)}<div class="who sm">/スコア</div></div>
            </div>`;

            el.innerHTML = groups.map((g) => {
                const n = g.steps.length, head = g.steps[0], tail = g.steps[n - 1];
                if (n === 1) return row(head, '', head.rank, fmtB(head.cost), fmtB(head.cum));

                const open = this.expanded.has(g.sig);
                const names = g.steps.map((s) => s.name);
                const who = n <= 3 ? names.join('・') : `${names[0]} ほか${n - 1}件`;
                const total = g.steps.reduce((a, s) => a + s.cost, 0);
                const fold = `<button type="button" class="fold" data-gp="fold" data-sig="${esc(g.sig)}"
                    aria-expanded="${open}">×${n} ${open ? '▴' : '▾'}</button>`;
                const summary = row({ ...head, name: who }, 'grp', `${head.rank}-${tail.rank}`,
                    fmtB(total), fmtB(tail.cum), fold);
                if (!open) return summary;
                return summary + g.steps.map((s) => row(s, 'child', s.rank, fmtB(s.cost), fmtB(s.cum))).join('');
            }).join('');
        },

        /* ---------- equip modal ---------- */
        // The draft is a deep copy so cancelling leaves the saved slot alone.
        openDraft(id) {
            const v = this.state.slots[id];
            this.draft = { id, ...v, lines: v.lines.map((ln) => ({ ...ln })), flame: { ...v.flame }, picking: false };
            this.renderModal();
        },
        closeDraft() { this.draft = null; this.renderModal(); },

        saveDraft() {
            const { id, picking, ...v } = this.draft;
            const L = FIXED_LV[SLOTS[id].part] || v.level;
            const clean = cleanSlot(v);
            const it = ITEM_BY_ID.get(clean.item);
            if (it && it.noFlame) clean.flame = blankFlame();
            clean.star = hasStar(id) ? Math.min(maxStarOf(L), clean.star) : 0;
            if (!hasPot(id)) { clean.grade = ''; clean.lines = blankLines(); }
            if (!hasStar(id)) clean.mode = '';
            this.state.slots[id] = clean;
            this.draft = null;
            this.save();
            this.renderModal();
            this.renderRack();
            this.renderPlan();
        },

        // Star force stats up to the current star: [main stat, attack].
        sfStats(id, L, star) {
            let st = 0, at = 0;
            if (!hasStar(id)) return [0, 0];
            for (let k = 1; k <= star; k++) {
                const g = starGain(k, L, SLOTS[id].part);
                if (g) { st += g[0]; at += g[1]; }
            }
            return [st, at];
        },

        renderModal() {
            const host = this.root.querySelector('#gp-modal-host');
            const d = this.draft;
            if (!d) { host.innerHTML = ''; return; }
            host.innerHTML = `<div class="gp-veil" data-gp="veil">
                <div class="modal eq" role="dialog" aria-modal="true" aria-label="装備の詳細">
                    ${d.picking ? this.pickerHTML(d) : this.detailHTML(d)}
                </div>
            </div>`;
        },

        pickerHTML(d) {
            const list = itemsFor(d.id);
            const bySet = new Map();
            list.forEach((it) => {
                const k = it.set || 'other';
                if (!bySet.has(k)) bySet.set(k, []);
                bySet.get(k).push(it);
            });
            const cell = (it) => `<button type="button" class="pick ${d.item === it.id ? 'on' : ''}" data-gp="m-pick" data-item="${it.id}" title="${esc(it.name)}">
                ${iconImg(it.id, 32)}<span class="pn">${esc(it.name)}</span><span class="pl">Lv${it.level}</span></button>`;
            return `<div class="eq-head"><h2>${esc(SLOTS[d.id].label)}の装備を選ぶ</h2>
                    <button type="button" class="btn" data-gp="m-unpick">戻る</button></div>
                <div class="picks">
                    <button type="button" class="pick ${d.item ? '' : 'on'}" data-gp="m-pick" data-item="">
                        ${iconImg(null, 32)}<span class="pn">指定なし</span><span class="pl">Lvは手で選ぶ</span></button>
                    ${[...bySet.entries()].map(([set, items]) => `<p class="pset">${esc(SET_JP[set] || set)}</p>${items.map(cell).join('')}`).join('')}
                </div>
                ${list.length ? '' : '<p class="note">この部位の一覧はまだありません。</p>'}`;
        },

        // Class and weapon type pick the weapon's flame attack from the table;
        // anything the table doesn't cover falls back to a typed base attack.
        weaponHTML(d) {
            const groups = typeof CLASS_DATA !== 'undefined' ? CLASS_DATA : {};
            const jobs = Object.entries(groups).map(([g, list]) => {
                const opts = list.filter((c) => CLASS_WEAPON[c.id])
                    .map((c) => `<option value="${c.id}" ${d.job === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
                return opts ? `<optgroup label="${esc(g)}">${opts}</optgroup>` : '';
            }).join('');
            const types = CLASS_WEAPON[d.job] || [];
            const wt = weaponTypeOf(d);
            const it = ITEM_BY_ID.get(d.item);
            const row = weaponRow(d);
            const pick = `<select data-gp="m-job" aria-label="職業"><option value="">職業を選ぶ</option>${jobs}</select>
                ${types.length > 1 ? `<select data-gp="m-wtype" aria-label="武器種">${types.map((x) => `<option value="${esc(x)}" ${x === wt ? 'selected' : ''}>${esc(WTYPE_JP[x] || x)}</option>`).join('')}</select>` : ''}`;
            const tier = it && WEAPON_TIER_JP[it.set];
            const body = row
                ? `<span class="sbase ro">+${row[1]}〜${row[4]}</span><span class="bnote">${esc(tier)}・${esc(WTYPE_JP[wt] || wt)}の表の値（4段階〜7段階）で計算します</span>`
                : `<input class="sbase" type="number" min="0" max="9999" step="1" value="${d.baseAtt || ''}" placeholder="0" data-gp="m-base" aria-label="武器の基本攻撃力"><span class="bnote">${!d.job ? '職業を選ぶと基本攻撃力が自動で入ります。' : !tier ? 'この武器は表に無いので、' : ''}基本攻撃力を入れると転生の攻撃力を割合で出します</span>`;
            return `<div class="srow base wjob"><span class="sk">職業</span><span class="wsel">${pick}</span></div>
                <div class="srow base"><span class="sk">${row ? '転生の攻撃力' : '基本攻撃力'}</span>${body}</div>`;
        },

        detailHTML(d) {
            const s = SLOTS[d.id];
            const it = ITEM_BY_ID.get(d.item);
            const lvFixed = !!FIXED_LV[s.part] || !!it || levelsFor(d.id).length === 1;
            const L = FIXED_LV[s.part] || d.level;
            const star = hasStar(d.id), pot = hasPot(d.id), pickable = itemsFor(d.id).length > 0;
            const max = maxStarOf(L);
            const w = this.state.w;

            const stars = star ? Array.from({ length: max }, (_, i) => {
                const k = i + 1;
                const brk = k % 15 === 0 && k < max ? '<span class="brk"></span>' : k % 5 === 0 && k < max ? '<span class="gap"></span>' : '';
                return `<button type="button" class="st ${k <= d.star ? 'on' : ''}" data-gp="m-star" data-star="${k}" aria-label="${k}★">★</button>${brk}`;
            }).join('') : '';

            const [sfMain, sfAtt] = this.sfStats(d.id, L, d.star);
            const sfOf = { main: sfMain, sub: sfMain, att: sfAtt };
            const noFlame = !!(it && it.noFlame);
            const rows = FLAME_FIELDS.map(([k, jp, unit]) => {
                const sf = sfOf[k] || 0, fl = noFlame ? 0 : d.flame[k] || 0;
                return `<div class="srow">
                    <span class="sk">${esc(jp)}${unit}</span>
                    <span class="stot" data-tot="${k}">+${sf + fl}</span>
                    <span class="sp">(</span>
                    <span class="ssf">${sf ? '+' + sf : ''}</span>
                    <span class="sp">+</span>
                    <input class="sfl" type="number" min="0" max="9999" step="1" value="${fl || ''}" placeholder="${noFlame ? '—' : '0'}" ${noFlame ? 'disabled' : ''} data-gp="m-flame" data-key="${k}" aria-label="${esc(jp)}の転生">
                    <span class="sp">)</span>
                </div>`;
            }).join('');

            const grades = GRADES.map((g) => `<option value="${g}" ${d.grade === g ? 'selected' : ''}>${GRADE_EN[g]}</option>`).join('');
            const keys = pot ? POT_KEYS(s.part) : [];
            const lines = d.grade ? d.lines.map((ln, i) => {
                const gs = lineGrades(d.grade, i);
                const g = gs.includes(ln.g) ? ln.g : gs[0];
                const opts = [];
                keys.forEach((k) => potValues(k, g, L).forEach((v) => {
                    const on = ln.k === k && Number(ln.v) === v;
                    opts.push(`<option value="${k}:${v}" ${on ? 'selected' : ''}>${esc(lineText({ k, v }))}</option>`);
                }));
                const etc = !POT_OPTS[ln.k] || !potValues(ln.k, g, L).includes(Number(ln.v));
                return `<div class="pline">
                    <i class="gdot" style="background:${GRADE_COLOR[g]}"></i>
                    <select data-gp="m-line" data-i="${i}" aria-label="${i + 1}行目">
                        <option value="etc" ${etc ? 'selected' : ''}>その他</option>${opts.join('')}
                    </select>
                    <select data-gp="m-lgrade" data-i="${i}" aria-label="${i + 1}行目の等級" ${gs.length > 1 ? '' : 'disabled'}>
                        ${gs.map((x) => `<option value="${x}" ${x === g ? 'selected' : ''}>${GRADE_EN[x]}</option>`).join('')}
                    </select>
                </div>`;
            }).join('') : '';
            const potScoreNow = d.grade ? linesScore(d.lines.map((ln, i) => ({ ...ln, g: lineGrades(d.grade, i).includes(ln.g) ? ln.g : lineGrades(d.grade, i)[0] })), w) : 0;

            const levels = levelsFor(d.id).map((v) => `<option value="${v}" ${v === L ? 'selected' : ''}>Lv${v}</option>`).join('');

            return `<div class="eq-head">
                    ${pickable ? `<button type="button" class="eq-ico" data-gp="m-picker" title="装備を選ぶ">${iconImg(d.item, 40)}</button>` : `<span class="eq-ico">${iconImg(null, 40)}</span>`}
                    <div class="eq-name">
                        <h2>${esc(it ? it.name : s.label)}</h2>
                        <p>${esc(s.label)} · ${lvFixed ? `Lv${L}` : `<select class="lv" data-gp="m-level" aria-label="装備Lv">${levels}</select>`}${star ? '' : ' · スタフォ不可'}</p>
                    </div>
                    ${pickable ? '<button type="button" class="btn" data-gp="m-picker">装備を選ぶ</button>' : ''}
                </div>
                ${star ? `<div class="stars"><div class="srun">${stars}</div><div class="sside"><span class="snum">${d.star}★</span><button type="button" class="st0" data-gp="m-star" data-star="0" title="0★に戻す">0★に戻す</button></div></div>` : ''}

                <p class="eq-sec"><b>ステータス</b><span>${noFlame ? 'この装備は転生が付きません' : star ? 'スタフォは★から自動、<em>転生</em>だけ入力します' : '<em>転生</em>を入力します'}</span></p>
                <div class="srows"><div class="srow hd"><span></span><span>合計</span><span></span><span class="ssf">スタフォ</span><span></span><span class="sflh">転生</span><span></span></div>${rows}</div>
                ${s.part === '武器' && !noFlame ? this.weaponHTML(d) : ''}
                <p class="eq-score">転生スコア <b data-flame-score>${Math.round(flameScore(d.flame, w)).toLocaleString()}</b></p>

                ${pot ? `<p class="eq-sec"><b>潜在能力</b>
                    <select class="grade" data-gp="m-grade" aria-label="潜在の等級">
${grades}
                    </select></p>
                <div class="plines">${lines || '<p class="note" style="margin:0">等級を選ぶと3行を入力できます。</p>'}</div>
                ${d.grade ? `<p class="eq-score">潜在スコア <b>${Math.round(potScoreNow).toLocaleString()}</b></p>` : ''}` : ''}

                <div class="eq-opts">
                    <label class="chk"><input type="checkbox" data-gp="m-on" ${d.on ? 'checked' : ''} ${hasWork(d.id) ? '' : 'disabled'}>計算に含める</label>
                    ${star ? `<select data-gp="m-mode" aria-label="18★以降のモード">
                        <option value="" ${d.mode ? '' : 'selected'}>18★以降: 既定（${esc(PLAN_LABEL[this.state.o.planName])}）</option>
                        ${Object.keys(PLANS).map((k) => `<option value="${k}" ${d.mode === k ? 'selected' : ''}>18★以降: ${esc(PLAN_LABEL[k])}</option>`).join('')}
                    </select>` : ''}
                </div>
                <div class="foot">
                    <span class="grow"></span>
                    <button type="button" class="btn" data-gp="m-cancel">キャンセル</button>
                    <button type="button" class="btn primary" data-gp="m-save">保存</button>
                </div>`;
        },

        bindModal(host) {
            host.addEventListener('mousedown', (e) => {
                if (e.target.dataset.gp === 'veil') this.closeDraft();
            });
            host.addEventListener('change', (e) => {
                const t = e.target.closest('[data-gp]');
                if (!t || !this.draft) return;
                const d = this.draft, kind = t.dataset.gp;
                if (kind === 'm-level') {
                    // A lower level can cap the star ceiling.
                    d.level = Number(t.value) || 160;
                    d.star = Math.min(d.star, maxStarOf(d.level));
                } else if (kind === 'm-grade') {
                    d.grade = t.value;
                    d.lines.forEach((ln, i) => {
                        ln.g = defaultLineGrade(d.grade, i);
                        const vs = POT_OPTS[ln.k] ? potValues(ln.k, ln.g, FIXED_LV[SLOTS[d.id].part] || d.level) : [];
                        if (!vs.length) { ln.k = 'etc'; ln.v = 0; } else if (!vs.includes(ln.v)) ln.v = vs[0];
                    });
                } else if (kind === 'm-line') {
                    const ln = d.lines[Number(t.dataset.i)];
                    const [k, v] = t.value.split(':');
                    ln.k = k; ln.v = Number(v) || 0;
                    ln.g = lineGrades(d.grade, Number(t.dataset.i)).includes(ln.g) ? ln.g : lineGrades(d.grade, Number(t.dataset.i))[0];
                } else if (kind === 'm-lgrade') {
                    const ln = d.lines[Number(t.dataset.i)];
                    ln.g = t.value;
                    // Keep the option if the new grade has a value for it, else the nearest.
                    const vs = POT_OPTS[ln.k] ? potValues(ln.k, ln.g, FIXED_LV[SLOTS[d.id].part] || d.level) : [];
                    if (!vs.length) { ln.k = 'etc'; ln.v = 0; } else if (!vs.includes(ln.v)) ln.v = vs[0];
                } else if (kind === 'm-job') {
                    d.job = t.value; d.wtype = '';
                } else if (kind === 'm-wtype') {
                    d.wtype = t.value;
                } else if (kind === 'm-mode') {
                    d.mode = t.value; return;
                } else if (kind === 'm-on') {
                    d.on = t.checked; return;
                } else return;
                this.renderModal();
            });
            host.addEventListener('input', (e) => {
                const b = e.target.closest('[data-gp="m-base"]');
                if (b && this.draft) { this.draft.baseAtt = Math.max(0, Math.min(9999, Math.floor(Number(b.value) || 0))); return; }
                const t = e.target.closest('[data-gp="m-flame"]');
                if (!t || !this.draft) return;
                // Typing must not rebuild the modal (it would drop focus), so only
                // the totals next to the field are patched.
                const d = this.draft, k = t.dataset.key;
                d.flame[k] = Math.max(0, Math.min(9999, Math.floor(Number(t.value) || 0)));
                const L = FIXED_LV[SLOTS[d.id].part] || d.level;
                const [sfMain, sfAtt] = this.sfStats(d.id, L, d.star);
                const sf = ({ main: sfMain, sub: sfMain, att: sfAtt })[k] || 0;
                const tot = host.querySelector(`[data-tot="${k}"]`);
                if (tot) tot.textContent = '+' + (sf + d.flame[k]);
                const fs = host.querySelector('[data-flame-score]');
                if (fs) fs.textContent = Math.round(flameScore(d.flame, this.state.w)).toLocaleString();
            });
            host.addEventListener('click', (e) => {
                const t = e.target.closest('[data-gp]');
                if (!t || !this.draft) return;
                const d = this.draft, kind = t.dataset.gp;
                if (kind === 'm-save') this.saveDraft();
                else if (kind === 'm-cancel') this.closeDraft();
                else if (kind === 'm-picker') { d.picking = true; this.renderModal(); }
                else if (kind === 'm-unpick') { d.picking = false; this.renderModal(); }
                else if (kind === 'm-pick') {
                    const it = ITEM_BY_ID.get(Number(t.dataset.item));
                    d.item = it ? it.id : null;
                    if (it) {
                        d.level = it.level;
                        d.star = Math.min(d.star, maxStarOf(it.level));
                    }
                    d.picking = false;
                    this.renderModal();
                } else if (kind === 'm-star') {
                    const k = Number(t.dataset.star) || 0;
                    // Clicking the top lit star again clears it, as a toggle.
                    d.star = k === d.star && k > 0 ? k - 1 : k;
                    this.renderModal();
                }
            });
        },
    };

    /* ---------- キャラごとの Upgrade Priority（Character Manager から開く） ---------- */
    // サイドバーの Upgrade Priority はキャラに紐づかない仮の入力のまま残し、
    // キャラごとの入力は Character Manager のカードから開くモーダルに持つ（HEXA と同じ形）。
    // 保存先は 'gms-gear-priority::char:<キャラid>'。初めて開いたキャラは、スコア重みと設定を
    // サイドバー側の入力から引き継ぎ、武器の職業はキャラの職業から埋める。
    const charKey = (charId) => `${STORAGE_KEY}::char:${charId}`;
    gearPriority.hasCharData = (charId) => {
        try { return !!localStorage.getItem(charKey(charId)); } catch (e) { return false; }
    };
    gearPriority.openForCharacter = function (charId) {
        const app = window.app;
        const char = app && app.data.characters.find((c) => c.id === charId);
        if (!char) return;
        this.closeCharacter();

        const inst = Object.create(gearPriority);
        inst.state = DEFAULT_STATE();
        inst.expanded = new Set();
        inst.draft = null;
        inst.storageKey = charKey(charId);
        const jobCls = app.classByJobName && app.classByJobName(char.job);
        inst.charJob = jobCls ? jobCls.id : '';
        if (!this.hasCharData(charId)) {
            const base = Object.create(gearPriority);
            base.state = DEFAULT_STATE();
            base.storageKey = STORAGE_KEY;
            base.load();
            inst.state.w = { ...base.state.w };
            inst.state.o = { ...base.state.o };
            inst.state.limit = base.state.limit;
            const cls = app.classByJobName && app.classByJobName(char.job);
            if (cls && CLASS_WEAPON[cls.id]) inst.state.slots.weapon.job = cls.id;
            inst.save();
        }

        const veil = document.createElement('div');
        veil.id = 'gp-char-overlay';
        // 上の余白は枠の外側（mt-4）に持つ。スクロール側に上の余白があると、固定したヘッダーの上に中身が透けて見える。
        veil.className = 'fixed inset-0 z-[45] bg-black/70 flex items-start justify-center px-4 pb-4 overflow-y-auto';
        const portrait = (char.image && char.image.startsWith('http')) ? char.image : (char.classImage || '');
        veil.innerHTML = `
<div class="w-full max-w-[1400px] mt-4 bg-slate-950 border border-slate-700 shadow-2xl">
    <div class="sticky top-0 z-10 flex items-center gap-3 h-11 pl-3 border-b border-slate-800 bg-slate-900">
        ${portrait ? `<img src="${esc(portrait)}" alt="" class="w-8 h-8 object-cover bg-slate-950">` : ''}
        <span class="text-sm font-bold text-white">${esc(char.name)}</span>
        <span class="text-[11px] font-mono text-slate-400">${char.level ? `Lv.${esc(char.level)}` : ''}</span>
        <span class="text-[11px] text-indigo-300">${esc(char.job || '')}</span>
        <span class="text-[11px] text-slate-500">のUpgrade Priority</span>
        <div class="flex-1"></div>
        <button type="button" data-x="close" title="閉じる（Esc）" class="w-11 h-full border-l border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center">
            <i data-lucide="x" class="w-5 h-5"></i></button>
    </div>
    <div data-x="root" class="px-4 pt-3"></div>
</div>`;
        document.body.appendChild(veil);
        const root = veil.querySelector('[data-x="root"]');
        root.id = 'gp-char-root';
        inst.init('gp-char-root');
        root.removeAttribute('id');

        const close = () => this.closeCharacter();
        veil.querySelector('[data-x="close"]').addEventListener('click', close);
        veil.addEventListener('click', (e) => { if (e.target === veil) close(); });
        // 装備の詳細モーダルが開いているときの Esc はそちらに任せる。
        this._charEsc = (e) => { if (e.key === 'Escape' && !inst.draft) close(); };
        // capture で先に受け、詳細モーダルが閉じる前の状態で判断する。
        document.addEventListener('keydown', this._charEsc, true);
        this._charInst = inst;
        if (window.lucide) lucide.createIcons();
    };
    gearPriority.closeCharacter = function () {
        const veil = document.getElementById('gp-char-overlay');
        if (veil) veil.remove();
        if (this._charEsc) { document.removeEventListener('keydown', this._charEsc, true); this._charEsc = null; }
        if (this._charInst && this._charInst.onKey) window.removeEventListener('keydown', this._charInst.onKey);
        if (this._charInst) this._charInst.teardown();
        this._charInst = null;
        if (window.app && app.currentApp === 'planner') app.renderDashboard();
    };

    window.gearPriority = gearPriority;
})();
