// Scouter HEXA Stat — HEXAステータスの各枠（メイン・追加1・追加2）に何の種類を入れると
// ボス相手のダメージが一番伸びるかを出す。Lv は今のまま、種類だけ選び直す前提（bi 指定 2026-11-01）。
//
// Scouter の入力（ステータス画面の値）には今のHEXAステ分が入っているので、まずそれを差し引き、
// 置き方を全部当てはめて一番伸びるものを探す。伸びは計算元のスペック効率から出す（無ければハイパー最適化と同じ手元の式）。
// 探索はこのファイルの中だけで行い、計算元（kinokohub）には送らない。
//
// 数値・ルールは gms-upgrade-tracker（gms-upgrade-tracker.vercel.app）の表に合わせた（2026-11-01）:
//   - 種類は 主ステ・攻撃力/魔力・ダメージ・ボスダメージ・防御率無視・クリティカルダメージ の6つ。
//   - 主ステは固定値（% が乗らない「% Value Not Applied」）。攻撃力は Base Value 側で、攻撃力%が乗る（bi 確認 2026-11-02）。ゼノンは STR・DEX・LUK に 0.48 倍ずつ、
//     デーモンアヴェンジャーは HP に 21 倍。防御率無視は枠ごとに掛け算で重なる。
//   - 1コアの中の3枠は別々の種類。メインはコア同士で重ならない。追加の同じ種類は全体で2回まで。
(function (root) {
    'use strict';

    const TYPES = ['mainStat', 'attack', 'damage', 'bossDmg', 'ied', 'critDmg'];
    const NAME = { mainStat: '主ステ', attack: '攻撃力', damage: 'ダメージ', bossDmg: 'ボスダメージ', ied: '防御率無視', critDmg: 'クリティカルダメージ' };
    const UNIT = { mainStat: '', attack: '', damage: '%', bossDmg: '%', ied: '%', critDmg: '%' };
    // メインの各Lvの値（Lv0〜10、累計）。
    const MAIN = {
        mainStat: [0, 100, 200, 300, 400, 600, 800, 1000, 1300, 1600, 2000],
        attack: [0, 5, 10, 15, 20, 30, 40, 50, 65, 80, 100],
        damage: [0, 0.75, 1.5, 2.25, 3, 4.5, 6, 7.5, 9.75, 12, 15],
        bossDmg: [0, 1, 2, 3, 4, 6, 8, 10, 13, 16, 20],
        ied: [0, 1, 2, 3, 4, 6, 8, 10, 13, 16, 20],
        critDmg: [0, 0.35, 0.7, 1.05, 1.4, 2.1, 2.8, 3.5, 4.55, 5.6, 7],
    };
    // 追加は1Lvごとに同じだけ増える。
    const ADD = { mainStat: 100, attack: 5, damage: 0.75, bossDmg: 1, ied: 1, critDmg: 0.35 };
    const MAX_LV = 10, NODE_CAP = 20, NODES = 3;

    const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
    const lvOf = (v) => Math.max(0, Math.min(MAX_LV, Math.floor(num(v))));
    const mainVal = (t, lv) => (MAIN[t] ? MAIN[t][lvOf(lv)] : 0);
    const addVal = (t, lv) => (ADD[t] ? ADD[t] * lvOf(lv) : 0);
    const round = (x) => Math.round(x * 100) / 100;
    // 枠の値の表示（「+2,000」「+20%」）。
    const valText = (t, v) => (t && v ? `+${UNIT[t] ? round(v) : Math.round(v).toLocaleString()}${UNIT[t]}` : '');

    // node = { main, mainLv, a1, a1Lv, a2, a2Lv }（種類は TYPES のどれか。main が空ならそのコアはまだ無い）。
    const created = (n) => !!(n && TYPES.includes(n.main));

    // 入力のおかしなところ。無ければ ''。
    function check(nodes) {
        const list = (nodes || []).slice(0, NODES);
        const mains = new Set(), adds = {};
        for (let i = 0; i < list.length; i++) {
            const n = list[i];
            if (!created(n)) continue;
            const k = ['I', 'II', 'III'][i];
            if (!TYPES.includes(n.a1) || !TYPES.includes(n.a2)) return `コア${k}の追加の種類を選んでください。`;
            if (new Set([n.main, n.a1, n.a2]).size !== 3) return `コア${k}の3枠は別々の種類にしてください。`;
            if (lvOf(n.mainLv) + lvOf(n.a1Lv) + lvOf(n.a2Lv) > NODE_CAP) return `コア${k}の Lv の合計が ${NODE_CAP} を超えています。`;
            if (mains.has(n.main)) return 'メインの種類がコア同士で重なっています。';
            mains.add(n.main);
            for (const t of [n.a1, n.a2]) if ((adds[t] = (adds[t] || 0) + 1) > 2) return `追加の「${NAME[t]}」が3回以上あります（2回まで）。`;
        }
        return '';
    }

    // コアの並び → 種類ごとの合計（防御率無視は (1 − x) の積）。
    function sumOf(nodes) {
        const s = { mainStat: 0, attack: 0, damage: 0, bossDmg: 0, critDmg: 0, iedMul: 1 };
        const put = (t, v) => { if (t === 'ied') s.iedMul *= 1 - v / 100; else if (t in s) s[t] += v; };
        for (const n of nodes || []) {
            if (!created(n)) continue;
            put(n.main, mainVal(n.main, n.mainLv));
            put(n.a1, addVal(n.a1, n.a1Lv));
            put(n.a2, addVal(n.a2, n.a2Lv));
        }
        return s;
    }

    // 入力（f）から今のHEXAステ（from の合計）を抜き、to の合計を足したステータス（scouter_hyper.js の shift と同じ形）。
    function shift(f, cls, classId, from, to) {
        const stat = (slot) => { const s = f[slot] || {}; return { base: num(s.base), per: num(s.per), abs: num(s.abs) }; };
        const st = { main: stat('main'), sub: stat('sub'), sub2: stat('sub2'), atk: stat('atk') };
        const d = (k) => to[k] - from[k];
        if (cls[1] === 'HP') st.main.abs += 21 * d('mainStat');
        else if (classId === 'xenon') for (const k of ['main', 'sub', 'sub2']) st[k].abs += 0.48 * d('mainStat');
        else st.main.abs += d('mainStat');
        st.atk.base += d('attack');   // 攻撃力は Base 側（攻撃力%が乗る）
        const ied = 1 - (1 - num(f.ignoreDef) / 100) / Math.max(1e-9, from.iedMul) * to.iedMul;
        return {
            ...st,
            dmg: num(f.dmg) + d('damage'), bossDmg: num(f.bossDmg) + d('bossDmg'),
            criticalDmg: num(f.criticalDmg) + d('critDmg'), critical: num(f.critical),
            ignoreDef: ied * 100,
        };
    }

    // 1コアの置き方の候補（Lv は今のまま）。追加1・追加2の Lv が同じなら入れ替えは同じものなので1つにする。
    function choicesOf(n) {
        const out = [];
        for (const m of TYPES) for (const a of TYPES) for (const b of TYPES) {
            if (m === a || m === b || a === b) continue;
            if (lvOf(n.a1Lv) === lvOf(n.a2Lv) && TYPES.indexOf(a) > TYPES.indexOf(b)) continue;
            out.push({ main: m, mainLv: n.mainLv, a1: a, a1Lv: n.a1Lv, a2: b, a2Lv: n.a2Lv });
        }
        return out;
    }
    const sameNode = (x, n) => x.main === n.main && ((x.a1 === n.a1 && x.a2 === n.a2) || (lvOf(n.a1Lv) === lvOf(n.a2Lv) && x.a1 === n.a2 && x.a2 === n.a1));

    // 計算元のスペック効率（Scouter の結果の eff）から、各まとまりの伸びを出す。
    // HEXAステの種類はどれも「足し算で効く量」なので、今の状態での効率から正確に出せる:
    //   主ステ・攻撃力・ダメージ+ボス・クリダメ は 1 + 効率 × 増えた量（それぞれのまとまりの中で比例）。
    //   防御率無視は (1 − P×残り×m) / (1 − P×残り)。P×残り（ボス防御率×防御率の残る割合）は効率から逆算する。
    // 手元の式（scouter_hyper.js）はスキルやバフの防御率無視・ダメージを知らないので、防御率無視とダメージを
    // 高く見積もりすぎる（アデルの例で 防御率無視 1% の伸びが計算元の約1.6倍）。効率があればこちらを使う。
    const EFF_KEYS = ['mainStatAbseff1', 'atkeff1', 'dmgeff1', 'cridmgeff1', 'igreff1', 'igreff1_380'];
    const hasEff = (e) => !!e && EFF_KEYS.every((k) => typeof e[k] === 'number' && e[k] > 0);
    function effScore(f, cls, classId, from, eff, pdr) {
        const eS = cls[1] === 'HP' ? 21 * eff.mainStatAbseff1
            : classId === 'xenon' ? 0.48 * (eff.mainStatAbseff1 + (eff.subStatAbseff1 || 0) + (eff.ssubStatAbseff1 || 0))
            : eff.mainStatAbseff1;
        // 計算元の攻撃力の効率は「基礎値 1」あたり。HEXAステの攻撃力も Base 側なのでそのまま使う。
        const eA = eff.atkeff1;
        const eI = pdr === 380 ? eff.igreff1_380 : eff.igreff1;
        const PR = eI / (0.01 + eI);
        return (s) => (1 + eS * (s.mainStat - from.mainStat)) * (1 + eA * (s.attack - from.attack))
            * (1 + eff.dmgeff1 * (s.damage + s.bossDmg - from.damage - from.bossDmg))
            * (1 + eff.cridmgeff1 * (s.critDmg - from.critDmg))
            * Math.max(1e-9, 1 - PR * s.iedMul / from.iedMul) / (1 - PR);
    }
    // 効率が無いとき（まだ「計算する」をしていない）の手元の式。HEXAステを抜いた状態の項目を先に出しておく。
    function localScore(f, cls, classId, from, opt, pdr) {
        const base = shift(f, cls, classId, from, sumOf([]));
        const fin = (s) => Math.floor(s.base * (1 + s.per / 100)) + s.abs;
        const m0 = fin(base.main), s0 = fin(base.sub), t0 = cls[3] ? fin(base.sub2) : 0;
        const atkOf = (add) => fin({ ...base.atk, base: base.atk.base + add });
        const crit = Math.min(1, Math.max(0, (base.critical + num(opt.critBuff)) / 100));
        const ied0 = 1 - base.ignoreDef / 100;   // 防御率のうち残る割合
        const hp = cls[1] === 'HP', xenon = classId === 'xenon';
        return (s) => {
            const st = hp ? (m0 + 21 * s.mainStat) / 3.5 + s0
                : xenon ? m0 + s0 + t0 + 3 * 0.48 * s.mainStat
                : 4 * (m0 + s.mainStat) + s0 + t0;
            const def = Math.max(1e-9, 1 - pdr / 100 * ied0 * s.iedMul);
            return st * Math.max(1, atkOf(s.attack)) * (1 + (base.dmg + base.bossDmg + s.damage + s.bossDmg) / 100)
                * (1 - crit + crit * (1.35 + (base.criticalDmg + s.critDmg) / 100)) * def;
        };
    }

    // f: Scouter の入力、cls: CLASSES の行、nodes: 今のコア、opt: { pdr, critBuff, eff（計算元のスペック効率） }。
    // 戻り: { nodes（おすすめ、無いコアは null）, changed（選び直すコアの数）, gain300, gain380, byEff } か { error }。
    // 全部の置き方を試す（1コア最大120通り、3コアで最大170万通り。値は種類ごとの合計だけで決まるので軽い）。
    function optimize(f, cls, classId, nodes, opt) {
        const err = check(nodes);
        if (err) return { error: err };
        const list = (nodes || []).slice(0, NODES);
        const idx = list.map((n, i) => (created(n) ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) return { error: 'HEXAステータスのコアを入れてください。' };
        const from = sumOf(list);
        const byEff = hasEff(opt.eff);
        const scoreAt = (p) => (byEff ? effScore(f, cls, classId, from, opt.eff, p) : localScore(f, cls, classId, from, opt, p));
        const pdr = num(opt.pdr) === 380 ? 380 : 300;
        const score = scoreAt(pdr);
        const opts = idx.map((i) => choicesOf(list[i]));
        let best = null, bestV = -Infinity, bestChg = Infinity;
        const pick = new Array(idx.length);
        const mains = new Set(), adds = {};
        const acc = [{ mainStat: 0, attack: 0, damage: 0, bossDmg: 0, critDmg: 0, iedMul: 1 }];
        const add = (s, t, v) => { const o = { ...s }; if (t === 'ied') o.iedMul *= 1 - v / 100; else o[t] += v; return o; };
        const walk = (k, chg) => {
            if (k === idx.length) {
                const v = score(acc[k]);
                // ほぼ同じなら、選び直すコアが少ない方。
                if (v > bestV * (1 + 1e-12) || (v > bestV * (1 - 1e-12) && chg < bestChg)) { bestV = v; bestChg = chg; best = pick.slice(); }
                return;
            }
            for (const x of opts[k]) {
                if (mains.has(x.main) || (adds[x.a1] || 0) >= 2 || (adds[x.a2] || 0) >= 2) continue;
                mains.add(x.main); adds[x.a1] = (adds[x.a1] || 0) + 1; adds[x.a2] = (adds[x.a2] || 0) + 1;
                let s = add(acc[k], x.main, mainVal(x.main, x.mainLv));
                s = add(s, x.a1, addVal(x.a1, x.a1Lv));
                acc[k + 1] = add(s, x.a2, addVal(x.a2, x.a2Lv));
                pick[k] = x;
                walk(k + 1, chg + (sameNode(x, list[idx[k]]) ? 0 : 1));
                mains.delete(x.main); adds[x.a1]--; adds[x.a2]--;
            }
        };
        walk(0, 0);
        if (!best) return { error: '置き方が見つかりませんでした。' };
        // 種類が変わらないコアは今の並び（追加1・追加2の入れ替えだけのものも今のまま）。
        const out = list.map(() => null);
        idx.forEach((i, k) => { out[i] = sameNode(best[k], list[i]) ? { ...list[i] } : best[k]; });
        const to = sumOf(out);
        const gain = (p) => { const sc = scoreAt(p); return sc(to) / sc(from) - 1; };
        return { nodes: out, changed: bestChg, gain300: gain(300), gain380: gain(380), byEff };
    }

    const api = { TYPES, NAME, UNIT, MAIN, ADD, MAX_LV, NODE_CAP, NODES, mainVal, addVal, valText, created, check, sumOf, shift, optimize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.scouterHexaStat = api;
})(typeof window !== 'undefined' ? window : globalThis);
