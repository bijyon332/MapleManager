// Scouter Hyper — ハイパーステータスの振り方を、ボス相手のダメージが一番伸びるように決める。
//
// Scouter の入力（ステータス画面の値）には今のハイパー分が入っているので、まずそれを
// 差し引き、ポイントの範囲で全部の振り方から一番伸びるものを探す（動的計画法）。
// ダメージは次の積で見る（最終ダメージ・スキル倍率などハイパーで変わらないものは省く）:
//   主ステ項 × 攻撃力 × (1 + ダメージ + ボス) × クリティカルの期待値 × (1 − 防御率 × (1 − 防御率無視))
// 決まった振り方は scouter.js が MapleScouter に投げて、換算主ステの差も出す。
//
// 数値は GMS のもの。ポイントは Lv140 から1レベルごとに 3pt、10レベルごとに +1pt
// （bi のキャラ Lv294 の画面の合計 1,590pt と一致を確認）。
(function (root) {
    'use strict';

    // そのレベルにするのに要るポイント（Lv1〜15）。
    const COST = [0, 1, 2, 4, 8, 10, 15, 20, 25, 30, 35, 50, 65, 80, 95, 110];
    const CUM = COST.reduce((a, c, i) => { a.push((a[i - 1] || 0) + c); return a; }, []);
    const MAX = 15;

    const lin = (n) => (lv) => n * lv;
    const step = (a, b) => (lv) => lv <= 5 ? a * lv : a * 5 + b * (lv - 5);
    // ゲームの画面の並び。eff はそのレベルの効果（分からないもの・ダメージに関係ないものは null）。
    const ITEMS = [
        { key: 'str', name: 'STR', eff: lin(30), unit: '' },
        { key: 'dex', name: 'DEX', eff: lin(30), unit: '' },
        { key: 'int', name: 'INT', eff: lin(30), unit: '' },
        { key: 'luk', name: 'LUK', eff: lin(30), unit: '' },
        { key: 'hp', name: 'HP', eff: lin(2), unit: '%' },
        { key: 'mp', name: 'MP', eff: lin(2), unit: '%' },
        { key: 'df', name: 'DF/TF', eff: null },
        { key: 'cr', name: 'Critical Rate', eff: step(1, 2), unit: '%' },
        { key: 'cd', name: 'Critical Damage', eff: lin(1), unit: '%' },
        { key: 'ied', name: 'Ignore Defense', eff: lin(3), unit: '%' },
        { key: 'dmg', name: 'Damage', eff: lin(3), unit: '%' },
        { key: 'boss', name: 'Boss Damage', eff: step(3, 4), unit: '%' },
        { key: 'normal', name: 'Normal Damage', eff: null },
        { key: 'status', name: 'Status Resistance', eff: null },
        { key: 'att', name: 'Attack Power & Magic ATT', eff: lin(3), unit: '' },
        { key: 'exp', name: 'EXP Obtained', eff: null },
        { key: 'arcane', name: 'Arcane Power', eff: null },
    ];
    const KEYS = ITEMS.map((x) => x.key);
    const effOf = (key, lv) => { const it = ITEMS.find((x) => x.key === key); return it && it.eff ? it.eff(lv) : 0; };

    const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
    const lvOf = (levels, k) => Math.max(0, Math.min(MAX, Math.floor(num(levels && levels[k]))));
    function pointsAt(level) {
        let t = 0;
        for (let L = 140; L <= Math.min(300, Math.floor(num(level))); L++) t += Math.floor((L - 140) / 10) + 3;
        return t;
    }
    const costOf = (levels) => KEYS.reduce((s, k) => s + CUM[lvOf(levels, k)], 0);

    /* ---------- ステータス ---------- */
    // cls = scouter の CLASSES の1行 [先方の職業名, 主, 副, 第3]。
    // 入力の形のまま、ハイパーを from → to に振り替えたときの値を返す。
    function shift(f, cls, from, to) {
        const d = (k) => lvOf(to, k) - lvOf(from, k);
        const dEff = (k) => effOf(k, lvOf(to, k)) - effOf(k, lvOf(from, k));
        const stat = (slot, label) => {
            const s = f[slot] || {};
            const o = { base: num(s.base), per: num(s.per), abs: num(s.abs) };
            if (!label) return o;
            const k = label.toLowerCase();
            if (k === 'hp') o.per += dEff('hp');            // デーモンアヴェンジャーの HP
            else if (['str', 'dex', 'int', 'luk'].includes(k)) o.abs += 30 * d(k);   // ％の影響を受けない
            return o;
        };
        const atk = stat('atk');
        atk.base += 3 * d('att');
        const ied0 = effOf('ied', lvOf(from, 'ied')) / 100, ied1 = effOf('ied', lvOf(to, 'ied')) / 100;
        const ied = 1 - (1 - num(f.ignoreDef) / 100) / (1 - ied0) * (1 - ied1);
        return {
            main: stat('main', cls[1]), sub: stat('sub', cls[2]), sub2: stat('sub2', cls[3]), atk,
            dmg: num(f.dmg) + dEff('dmg'), bossDmg: num(f.bossDmg) + dEff('boss'),
            criticalDmg: num(f.criticalDmg) + dEff('cd'), critical: num(f.critical) + dEff('cr'),
            ignoreDef: ied * 100,
        };
    }
    const finalOf = (s) => Math.floor(s.base * (1 + s.per / 100)) + s.abs;

    // 主ステ項。職業によって式が違う（倍率は比べるだけなので定数は気にしない）。
    function statTerm(st, cls, classId) {
        const m = finalOf(st.main), s = finalOf(st.sub), s2 = cls[3] ? finalOf(st.sub2) : 0;
        if (cls[1] === 'HP') return m / 3.5 + s;          // デーモンアヴェンジャー
        if (classId === 'xenon') return m + s + s2;        // ゼノンは3つ同じ重み
        return 4 * m + s + s2;
    }
    function value(st, cls, classId, opt) {
        const crit = Math.min(1, Math.max(0, (st.critical + num(opt.critBuff)) / 100));
        const def = Math.max(1e-9, 1 - num(opt.pdr || 300) / 100 * (1 - st.ignoreDef / 100));
        return statTerm(st, cls, classId) * Math.max(1, finalOf(st.atk))
            * (1 + (st.dmg + st.bossDmg) / 100) * (1 - crit + crit * (1.35 + st.criticalDmg / 100)) * def;
    }

    /* ---------- 最適化 ---------- */
    // ダメージにかかる項目のまとまり。中で足し合う／掛け合うものは同じまとまりにして、
    // まとまり同士は掛け算（＝対数で足し算）になるようにしてある。
    function groupsFor(cls) {
        const statKeys = [cls[1], cls[2], cls[3]].filter(Boolean).map((s) => s.toLowerCase()).filter((k) => KEYS.includes(k));
        return [statKeys, ['dmg', 'boss'], ['cr', 'cd'], ['att'], ['ied']];
    }
    function combos(keys, locked, current) {
        let out = [{}];
        for (const k of keys) {
            const lvs = locked[k] ? [lvOf(current, k)] : Array.from({ length: MAX + 1 }, (_, i) => i);
            out = out.flatMap((o) => lvs.map((lv) => ({ ...o, [k]: lv })));
        }
        return out;
    }

    // f: Scouter の入力、cls: CLASSES の行、current: 今のハイパー、
    // opt: { total（所持ポイント）, locked: {key: true}, pdr: 300|380, critBuff }
    function optimize(f, cls, classId, current, opt) {
        const locked = opt.locked || {};
        const groups = groupsFor(cls);
        const inGroup = new Set(groups.flat());
        // まとまりに入らない項目は、固定なら今のまま、そうでなければ 0。
        const fixed = {};
        for (const k of KEYS) if (!inGroup.has(k)) fixed[k] = locked[k] ? lvOf(current, k) : 0;
        const total = Math.max(0, Math.floor(num(opt.total)));
        const B = total - costOf(fixed);
        const zero = Object.fromEntries(KEYS.map((k) => [k, 0]));
        // まとまりごとの対数の値。ほかの項目は 0 にして測る（積なので比は変わらない）。
        const ref = { ...zero };
        const val = (lv) => Math.log(Math.max(1e-300, value(shift(f, cls, current, { ...ref, ...lv }), cls, classId, opt)));
        const base = val({});
        let dp = new Float64Array(Math.max(0, B) + 1);   // dp[b]: b pt 以内で取れる一番の値
        const picks = [];
        if (B < 0) return null;
        for (const keys of groups) {
            const opts = combos(keys, locked, current).map((o) => ({ o, c: costOf(o), v: val(o) - base })).filter((x) => x.c <= B);
            const nd = new Float64Array(B + 1).fill(-Infinity);
            const pick = new Int32Array(B + 1).fill(-1);
            for (let i = 0; i < opts.length; i++) {
                const { c, v } = opts[i];
                for (let b = c; b <= B; b++) {
                    const x = dp[b - c] + v;
                    if (x > nd[b]) { nd[b] = x; pick[b] = i; }
                }
            }
            picks.push({ opts, pick });
            dp = nd;
        }
        // 後ろから戻して振り方を出す。
        const levels = { ...fixed };
        let b = B;
        for (let g = picks.length - 1; g >= 0; g--) {
            const { opts, pick } = picks[g];
            if (pick[b] < 0) return null;
            const x = opts[pick[b]];
            Object.assign(levels, x.o);
            b -= x.c;
        }
        // 固定の項目は今のまま（まとまりに入るものも combos で今のレベルだけにしてある）。
        const gain = (pdr) => {
            const o = { ...opt, pdr };
            return value(shift(f, cls, current, levels), cls, classId, o) / value(shift(f, cls, current, current), cls, classId, o) - 1;
        };
        return { levels, total, used: costOf(levels), gain300: gain(300), gain380: gain(380) };
    }

    const api = { ITEMS, KEYS, COST, CUM, MAX, effOf, pointsAt, costOf, shift, value, optimize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.scouterHyper = api;
})(typeof window !== 'undefined' ? window : globalThis);
