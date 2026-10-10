// Scouter のボスカット — MapleScouter の結果ページの「보스컷」と同じ計算。
//
// 先方の API（/scouter 経由）の calculatedData の HEXA込みダメージ（calculatedHexaDamage_300/380）と
// spline_300/380 から、ボスごとに「ボスカット（そのボスに要る換算主ステ）に対して何%か」を出し、
// ソロ・パーティの目安を付ける。表と式は先方のフロントJS（GMS/TMS/MSEA 共通の表）から写した。
// 先方の表が変わったら GMS_BOSSES を直す。
//   bossCut      … ソロの基準の換算主ステ。partyBossCut … パーティ前提のボス。
//   easyRate     … 基準より何倍楽か（下のボスほど大きい）。partyLimit … 最大人数。

const scouterBossCut = (() => {
    'use strict';

    const GMS_BOSSES = [
      {boss:"유피테르",name:"jupiter",difficulty:"Hard",level:295,authenticForce:810,guard:380,partyBossCut:125600,partyLimit:3,easyRate:0.969},
      {boss:"카링",name:"kaling",difficulty:"Extreme",level:285,authenticForce:480,guard:380,partyBossCut:108350,partyLimit:6,easyRate:0.969},
      {boss:"대적자",name:"adversary",difficulty:"Extreme",level:290,authenticForce:460,guard:380,partyBossCut:113000,partyLimit:3,easyRate:0.969},
      {boss:"칼로스",name:"kalos",difficulty:"Extreme",level:285,authenticForce:440,guard:380,partyBossCut:82750,partyLimit:6,easyRate:0.969},
      {boss:"발드릭스",name:"bardrix",difficulty:"Destiny",level:290,authenticForce:700,guard:380,bossCut:132800,partyLimit:1,easyRate:0.969},
      {boss:"발드릭스",name:"bardrix",difficulty:"Hard",level:290,authenticForce:700,guard:380,bossCut:132800,partyLimit:3,easyRate:0.969},
      // 벨로나は先方の GMS 表に無い（KMS 表にだけある）。KMS の難易度補正と GMS の近いボスから推測した値（estimate）。
      {boss:"벨로나",name:"bellona",difficulty:"Hard",level:280,authenticForce:550,guard:380,bossCut:128000,partyLimit:3,easyRate:0.969,estimate:true},
      {boss:"흉성",name:"maleficStar",difficulty:"Hard",level:280,authenticForce:550,guard:380,bossCut:120500,partyLimit:3,easyRate:0.969},
      {boss:"림보",name:"limbo",difficulty:"Destiny",level:285,authenticForce:500,guard:380,bossCut:121400,partyLimit:1,easyRate:0.969},
      {boss:"림보",name:"limbo",difficulty:"Hard",level:285,authenticForce:500,guard:380,bossCut:121400,partyLimit:3,easyRate:0.969},
      {boss:"유피테르",name:"jupiter",difficulty:"Normal",level:295,authenticForce:810,guard:380,bossCut:112800,partyLimit:3,easyRate:0.969},
      {boss:"대적자",name:"adversary",difficulty:"Destiny",level:285,authenticForce:340,guard:380,bossCut:110200,partyLimit:1,easyRate:0.7752},
      {boss:"세렌",name:"seren",difficulty:"Extreme",level:280,authenticForce:200,guard:380,bossCut:112000,partyLimit:6,easyRate:0.969},
      {boss:"대적자",name:"adversary",difficulty:"Hard",level:285,authenticForce:340,guard:380,bossCut:110200,partyLimit:3,easyRate:0.969},
      {boss:"카링",name:"kaling",difficulty:"Hard",level:285,authenticForce:350,guard:380,bossCut:109300,partyLimit:6,easyRate:0.969},
      {boss:"발드릭스",name:"bardrix",difficulty:"Normal",level:290,authenticForce:700,guard:380,bossCut:108400,partyLimit:3,easyRate:0.969},
      {boss:"검은 마법사",name:"blackMage",difficulty:"Extreme",level:280,arcaneForce:1320,guard:300,bossCut:101300,partyLimit:6,easyRate:0.969},
      {boss:"카링",name:"kaling",difficulty:"Destiny",level:285,authenticForce:350,guard:380,bossCut:109300,partyLimit:1,easyRate:1.1627999999999998},
      {boss:"림보",name:"limbo",difficulty:"Normal",level:285,authenticForce:500,guard:380,bossCut:99300,partyLimit:3,easyRate:0.9228571428571428},
      {boss:"칼로스",name:"kalos",difficulty:"Destiny",level:285,authenticForce:330,guard:380,bossCut:95100,partyLimit:1,easyRate:0.969},
      {boss:"칼로스",name:"kalos",difficulty:"Chaos",level:285,authenticForce:330,guard:380,bossCut:95100,partyLimit:6,easyRate:0.969},
      {boss:"세렌",name:"seren",difficulty:"Destiny",level:275,authenticForce:200,guard:380,bossCut:40600,partyLimit:1,easyRate:0.1938},
      {boss:"카링",name:"kaling",difficulty:"Normal",level:285,authenticForce:330,guard:380,bossCut:73300,partyLimit:6,easyRate:0.969},
      {boss:"벨로나",name:"bellona",difficulty:"Normal",level:280,authenticForce:450,guard:380,bossCut:89700,partyLimit:3,easyRate:0.969,estimate:true},
      {boss:"흉성",name:"maleficStar",difficulty:"Normal",level:280,authenticForce:400,guard:380,bossCut:72300,partyLimit:3,easyRate:0.969},
      {boss:"스우",name:"lotus",difficulty:"Extreme",level:285,guard:380,bossCut:66800,partyLimit:2,easyRate:0.969},
      {boss:"칼로스",name:"kalos",difficulty:"Champion",level:280,authenticForce:300,guard:380,bossCut:49800,partyLimit:1,easyRate:0.6682758620689655},
      {boss:"대적자",name:"adversary",difficulty:"Normal",level:280,authenticForce:320,guard:380,bossCut:55550,partyLimit:3,easyRate:0.969},
      {boss:"칼로스",name:"kalos",difficulty:"Normal",level:280,authenticForce:300,guard:380,bossCut:49800,partyLimit:6,easyRate:0.969,newbieCut:200.62},
      {boss:"세렌",name:"seren",difficulty:"Champion",level:275,authenticForce:200,guard:380,bossCut:44300,partyLimit:1,easyRate:0.969},
      {boss:"카링",name:"kaling",difficulty:"Easy",level:275,authenticForce:230,guard:380,bossCut:42000,partyLimit:6,easyRate:0.969,newbieCut:252},
      {boss:"세렌",name:"seren",difficulty:"Hard",level:275,authenticForce:200,guard:380,bossCut:40600,partyLimit:6,easyRate:0.969,newbieCut:233.72},
      {boss:"벨로나",name:"bellona",difficulty:"Easy",level:280,authenticForce:400,guard:380,bossCut:45100,partyLimit:3,easyRate:0.969,estimate:true},
      {boss:"대적자",name:"adversary",difficulty:"Easy",level:270,authenticForce:220,guard:380,bossCut:35250,partyLimit:3,easyRate:0.969},
      {boss:"칼로스",name:"kalos",difficulty:"Easy",level:270,authenticForce:200,guard:380,bossCut:40600,partyLimit:6,easyRate:1.9047619047619049,newbieCut:200.62},
      {boss:"검은 마법사",name:"blackMage",difficulty:"Hard",level:275,arcaneForce:1320,guard:300,bossCut:40600,partyLimit:6,easyRate:1.0659,newbieCut:180},
      {boss:"검은 마법사",name:"blackMage",difficulty:"Champion",level:275,arcaneForce:1320,guard:300,bossCut:40600,partyLimit:1,easyRate:1.332375},
      {boss:"세렌",name:"seren",difficulty:"Normal",level:270,authenticForce:200,guard:380,bossCut:40600,partyLimit:6,easyRate:2.36436,newbieCut:233.72},
      {boss:"진 힐라",name:"verusHilla",difficulty:"Champion",level:250,arcaneForce:900,guard:300,bossCut:40600,partyLimit:1,easyRate:3.040655172413793},
      {boss:"진 힐라",name:"verusHilla",difficulty:"Hard",level:250,arcaneForce:900,guard:300,bossCut:40600,partyLimit:6,easyRate:4.40895,newbieCut:236.41},
      {boss:"듄켈",name:"darknell",difficulty:"Hard",level:265,arcaneForce:850,guard:300,bossCut:40600,partyLimit:6,easyRate:5.048489999999999,newbieCut:216.16},
      {boss:"더스크",name:"gloom",difficulty:"Chaos",level:255,arcaneForce:730,guard:300,bossCut:40600,partyLimit:6,easyRate:5.24229,newbieCut:177.63},
      {boss:"가엔슬",name:"slime",difficulty:"Chaos",level:250,guard:300,bossCut:40600,partyLimit:6,easyRate:4.389991304347826,newbieCut:200.49},
      {boss:"윌",name:"will",difficulty:"Hard",level:250,arcaneForce:760,guard:300,bossCut:40600,partyLimit:6,easyRate:6.17253,newbieCut:241.85},
      {boss:"루시드",name:"lucid",difficulty:"Hard",level:230,arcaneForce:360,guard:300,bossCut:40600,partyLimit:6,easyRate:2.9069999999999996,newbieCut:120},
      {boss:"진 힐라",name:"verusHilla",difficulty:"Normal",level:250,arcaneForce:820,guard:300,bossCut:40600,partyLimit:6,easyRate:8.8179,newbieCut:236.41},
      {boss:"스우",name:"lotus",difficulty:"Champion",level:210,guard:300,bossCut:40600,partyLimit:1,easyRate:11.140158620689656},
      {boss:"데미안",name:"damien",difficulty:"Hard",level:210,guard:300,bossCut:40600,partyLimit:6,easyRate:12.1125,newbieCut:183.81},
      {boss:"스우",name:"lotus",difficulty:"Hard",level:210,guard:300,bossCut:40600,partyLimit:6,easyRate:16.15323,newbieCut:180.35},
      {boss:"듄켈",name:"darknell",difficulty:"Normal",level:265,arcaneForce:850,guard:300,bossCut:40600,partyLimit:6,easyRate:31.805487,newbieCut:216.16},
      {boss:"더스크",name:"gloom",difficulty:"Normal",level:255,arcaneForce:730,guard:300,bossCut:40600,partyLimit:6,easyRate:26.21145,newbieCut:177.63},
      {boss:"루시드",name:"lucid",difficulty:"Normal",level:230,arcaneForce:360,guard:300,bossCut:40600,partyLimit:6,easyRate:33.023035500000006,newbieCut:170},
      {boss:"윌",name:"will",difficulty:"Normal",level:250,arcaneForce:760,guard:300,bossCut:40600,partyLimit:6,easyRate:30.862650000000002,newbieCut:241.85},
      {boss:"윌",name:"will",difficulty:"Easy",level:235,arcaneForce:560,guard:300,bossCut:40600,partyLimit:6,easyRate:46.293974999999996,newbieCut:241.85},
      {boss:"루시드",name:"lucid",difficulty:"Easy",level:230,arcaneForce:360,guard:300,bossCut:40600,partyLimit:6,easyRate:56.94158924999999,newbieCut:170},
      {boss:"가엔슬",name:"slime",difficulty:"Normal",level:220,guard:300,bossCut:40600,partyLimit:6,easyRate:79.01984347826087,newbieCut:200.49},
      {boss:"스우",name:"lotus",difficulty:"Normal",level:210,guard:300,bossCut:40600,partyLimit:6,easyRate:344.67083121019107,newbieCut:180.35},
      {boss:"데미안",name:"damien",difficulty:"Normal",level:210,guard:300,bossCut:40600,partyLimit:6,easyRate:363.375,newbieCut:183.81},
    ];

    // ---- level gap final-damage table (module 59737) : levelDiff (user - boss, clamped [-40,5]) -> %
    const LEVEL_GAP = {5:120,4:118,3:116,2:114,1:112,0:110,"-1":105.3,"-2":100.7,"-3":96.2,"-4":91.8,"-5":87.5,"-6":85,"-7":82.5,"-8":80,"-9":77.5,"-10":75,"-11":72.5,"-12":70,"-13":67.5,"-14":65,"-15":62.5,"-16":60,"-17":57.5,"-18":55,"-19":52.5,"-20":50,"-21":47.5,"-22":45,"-23":42.5,"-24":40,"-25":37.5,"-26":35,"-27":32.5,"-28":30,"-29":27.5,"-30":25,"-31":22.5,"-32":20,"-33":17.5,"-34":15,"-35":12.5,"-36":10,"-37":7.5,"-38":5,"-39":2.5,"-40":0};

    // arcane force multiplier % (97571.Zz): ratio = userAF/bossAF*100
    function arcaneGapPct(bossAF, userAF) {
      if (!bossAF) return 100;
      const i = (userAF / bossAF) * 100;
      return i < 10 ? 10 : i < 30 ? 30 : i < 50 ? 60 : i < 70 ? 70 : i < 100 ? 80 : i < 110 ? 100 : i < 130 ? 110 : i < 150 ? 130 : 150;
    }
    // authentic force multiplier % (97571.Al): diff = userAUT - bossAUT
    function authenticGapPct(bossAUT, userAUT) {
      if (!bossAUT) return 100;
      const i = userAUT - bossAUT;
      if (i < 0) return i < -90 ? 5 : i < -80 ? 10 : i < -70 ? 20 : i < -60 ? 30 : i < -50 ? 40 : i < -40 ? 50 : i < -30 ? 60 : i < -20 ? 70 : i < -10 ? 80 : 90;
      return i < 10 ? 100 : i < 20 ? 105 : i < 30 ? 110 : i < 40 ? 115 : i < 50 ? 120 : 125;
    }

    // Minimum character level to enter (77176.rp / S): result "입장 불가능" if level below.
    const ENTRY_LEVEL = { 유피테르: 295, 발드릭스: 290, 림보: 285, 카링: 275, 대적자: 270, 칼로스: 265, 세렌: 260 };
    const ENTRY_LEVEL_BY_DIFF = { 메이린: { Normal: 270, Hard: 280 } };
    function entryLevel(boss, difficulty) {
      const d = ENTRY_LEVEL_BY_DIFF[boss];
      if (d && d[difficulty] !== undefined) return d[difficulty];
      return ENTRY_LEVEL[boss] ?? 200;
    }

    // ---- monotone cubic Hermite spline (module 62509) ----
    // spline = {x:[boss-stat knots], y:[damage at knot], m:[slopes]}  (API spline_300 / spline_380)
    // M8: stat -> damage
    function splineEval(sp, v) {
      const { x, y, m } = sp, n = x.length;
      if (v < x[0]) return y[0] + (v - x[0]) * m[0];
      if (v <= x[n - 1]) {
        let k = n - 2;
        for (let e = 0; e < n - 1; e++) if (v >= x[e] && v <= x[e + 1]) { k = e; break; }
        const h = x[k + 1] - x[k], r = (v - x[k]) / h, r2 = r * r, r3 = r2 * r;
        return (2 * r3 - 3 * r2 + 1) * y[k] + (r3 - 2 * r2 + r) * h * m[k] + (-2 * r3 + 3 * r2) * y[k + 1] + (r3 - r2) * h * m[k + 1];
      }
      return y[n - 1] + (v - x[n - 1]) * Math.max(m[n - 1], 1e-9);
    }
    // mg: damage -> stat (inverse via 40-step bisection), rounded
    function splineInverse(sp, dmg, iters = 40) {
      const { x, y, m } = sp, n = x.length;
      if (dmg <= y[0]) return Math.round(x[0] + (dmg - y[0]) / Math.max(m[0], 1e-9));
      if (dmg >= y[n - 1]) return Math.round(x[n - 1] + (dmg - y[n - 1]) / Math.max(m[n - 1], 1e-9));
      let lo = x[0], hi = x[n - 1];
      for (let s = 0; s < iters; s++) { const mid = (lo + hi) / 2; splineEval(sp, mid) < dmg ? (lo = mid) : (hi = mid); }
      return Math.round((lo + hi) / 2);
    }

    // ---- legacy polynomial fallback (used only when spline_300/spline_380 missing) ----
    // 34278.x : damage -> stat by Newton on poly(s)=dmg/1e12, s=stat/1e4
    function plotterInverse(dmg, plot1, plot2, changePoint) {
      const c = dmg < changePoint ? plot1 : plot2;
      if (c.length < 5) {
        const [a, b, d, e] = c; let s = 7.15, it = 0;
        for (;;) { it++; const st = -(e * s ** 3 + d * s ** 2 + b * s + a - dmg / 1e12) / (3 * e * s ** 2 + 2 * d * s + b); s += st; if (it > 37) return -1; if (Math.abs(st) < 0.001) break; }
        return Math.floor(1e4 * s);
      }
      const [a, b, d, e, f] = c;
      const newton = (start) => { let s = start, it = 0;
        for (;;) { it++; const fv = f * s ** 4 + e * s ** 3 + d * s ** 2 + b * s + a - dmg / 1e12, dv = 4 * f * s ** 3 + 3 * e * s ** 2 + 2 * d * s + b;
          if (dv === 0) return null; const st = -fv / dv; s += st; if (s < 0) s = Math.max(s, 1e-4); if (it > 37) return null; if (Math.abs(st) < 0.001) break; }
        return s; };
      let s = newton(7.15); if (s === null) return -1;
      if (s > 15) { s = newton(14); if (s === null) return -1; }
      return Math.floor(1e4 * s);
    }
    // 33528 inline / 97571.yb : stat -> damage
    function plotterEval(stat, guard, c) {
      const s = stat / 1e4;
      const p = guard === 380 ? (stat > 71538 ? c.boss380_plotter_2 : c.boss380_plotter_1) : (stat > 71538 ? c.boss300_plotter_2 : c.boss300_plotter_1);
      const [a, b, d, e, f = 0] = p;
      return 1e12 * (f * s ** 4 + e * s ** 3 + d * s ** 2 + b * s + a);
    }

    // ---- verdict label (97571.Rn), newbie branch omitted (result page passes isNewbie=false) ----
    function verdict(rate, isParty, partyLimit) {
      if (isParty) {
        if (partyLimit === 3) return rate >= 2.7 ? "솔플 최소컷" : rate >= 1.35 ? "2인 최소컷" : rate >= 0.9 ? "3인 최소컷" : "불가능";
        if (rate >= 5.1) return "솔플 최소컷";
        if (rate >= 2.55) return "2인 최소컷";
        if (rate >= 1.7) return "3인 최소컷";
        if (rate >= 1.275) return "4인 최소컷";
        if (rate >= 0.9) return "6인 최소컷";
        return "불가능";
      }
      const party = { 6: [0.25, 0.15], 3: [0.36, 0.3], 2: [0.55, 0.45] }[partyLimit];
      if (rate >= 2) return "솔플 여유컷";
      if (rate >= 1.1) return "솔플 가능";
      if (rate >= 0.9) return "솔플 최소컷";
      if (party) { if (rate >= party[0]) return "파티격 가능"; if (rate >= party[1]) return "파티 최소컷"; }
      return "불가능";
    }
    const VERDICT_EN = { "솔플 여유컷": "Solo (comfortable)", "솔플 가능": "Solo possible", "솔플 최소컷": "Solo (bare minimum)", "파티격 가능": "Party possible", "파티 최소컷": "Party (bare minimum)", "2인 최소컷": "2-man minimum", "3인 최소컷": "3-man minimum", "4인 최소컷": "4-man minimum", "6인 최소컷": "6-man minimum", "불가능": "Not possible", "입장 불가능": "Cannot enter (level)" };

    // ---- boss-time / elixir factor (inline IIFE in 82941) ----
    const ARCHERS = ["보우마스터", "신궁", "패스파인더", "윈드브레이커", "와일드헌터"]; // 10554.cL
    function timeFactor(specEff, myClass, elixir, bossMinutes = 20) {
      const n = Math.min(20, Math.max(0.1, bossMinutes));
      const r = ARCHERS.includes(myClass) ? 0 : 8, u = ARCHERS.includes(myClass) ? 0 : 10;
      const o = myClass !== "비숍" ? 30 : 0, c = myClass !== "비숍" ? 10 : 0;
      const d = myClass === "데몬어벤져" ? 1275 : 0, m = myClass !== "와일드헌터" ? 10 : 0;
      const x = (1 + r * specEff.cridmgeff1) * (1 + o * specEff.atkeff1) * (1 + c * specEff.dmgeff1) *
        (1 + d * specEff.mainStateff1) * (1 + 0.235 * u * specEff.cridmgeff1) * (1 + m * specEff.atkPereff1);
      const full = elixir === 1 || elixir === 3 ? x : 1; // elixir 1/3 => both Sayram+Collector used => factor 1
      const seg = (k) => k * Math.min(n, 8) + k * Math.max(0, Math.min(7, n - 8)) + Math.max(0, Math.min(5, n - 15));
      return seg(full) / seg(x) / (full / x);
    }

    // authentic region symbol per boss (78547.jf); maxed = level >= 11
    const BOSS_SYMBOL = { 세렌: "authentic_symbol_1", 칼로스: "authentic_symbol_2", 대적자: "authentic_symbol_3", 카링: "authentic_symbol_4", 흉성: "authentic_symbol_5", 벨로나: "authentic_symbol_5", 림보: "authentic_symbol_6", 발드릭스: "grand_authentic_symbol_1", 유피테르: "grand_authentic_symbol_2" };
    const AUT_SYMBOLS = ["authentic_symbol_1","authentic_symbol_2","authentic_symbol_3","authentic_symbol_4","authentic_symbol_5","authentic_symbol_6","grand_authentic_symbol_1","grand_authentic_symbol_2"];

    /**
     * calc: API response .calculatedData ; userStat: request userStat
     * opts: { levelChange, arcane, authentic, bossMinutes=20, symbols: {authentic_symbol_1: level,...} | null,
     *         showDestinyChampion=false, myStandard=true, table=GMS_BOSSES }
     */
    function computeBossCuts(calc, userStat, opts = {}) {
      const { levelChange = 0, arcane = 0, authentic = 0, bossMinutes = 20, symbols = null,
        showDestinyChampion = false, myStandard = true, table = GMS_BOSSES } = opts;
      const hex300 = calc.calculatedHexaDamage_300, hex380 = calc.calculatedHexaDamage_380;
      if (hex300 === -6 || hex380 === -6) return { error: "CRIT_UNDER_100", rows: [] };
      if (!(hex300 > 0 && hex380 > 0)) return { error: "NO_DATA", rows: [] };

      const level = parseInt(userStat.stat.level) + levelChange;
      const userAF = Math.min((parseInt(userStat.stat.arcaneForce) || 0) + arcane, 1750);
      const userAUT = (parseInt(userStat.stat.authenticForce) || 0) + authentic;
      const useSpline = !!calc.spline_300 && !!calc.spline_380;
      const F = timeFactor(calc.specEfficiency, userStat.stat.myClass, calc.elixir, bossMinutes);
      const ascent = calc.ascent_const === 1 ? 0 : (calc.ascent_const || 0);
      const anySymbolMaxed = !!symbols && AUT_SYMBOLS.some((k) => (symbols[k] || 0) >= 11);
      const eD = ((hex300 / calc.ignoreDefConst_300) * calc.ignoreDefConst_380) / hex380;

      const rows = table.map((b) => {
        // damage input for this boss
        const dmg300 = hex300 * (b.boss === "가엔슬" ? 1 / (calc.genePassConst || 1) : 1);
        let dmg380 = b.boss === "카링" ? (calc.calculatedHexaDamage_kaling || hex380)
          : b.boss === "메이린" ? 0.95 * hex380 + 0.05 * calc.calculatedDamage_380 : hex380;
        if (anySymbolMaxed) { const sym = BOSS_SYMBOL[b.boss]; if (!(sym && (symbols[sym] || 0) >= 11)) dmg380 *= eD; }

        const lvlDiff = Math.max(-40, Math.min(5, level - b.level));
        const levelGap = LEVEL_GAP[lvlDiff] / 100;
        const arcGap = arcaneGapPct(b.arcaneForce, userAF) / 100;
        const autGap = authenticGapPct(b.authenticForce, userAUT) / 100;
        const afMax = b.arcaneForce ? (b.boss === "검은 마법사" ? 1.1 : 1.5) : 1;
        const I = ((b.guard === 300 ? dmg300 : dmg380) * arcGap * autGap * levelGap) /
          (1.2 * afMax * (b.authenticForce ? 1.25 : 1));

        const cut = b.bossCut || b.partyBossCut;
        let bossStat, needDmg;
        if (useSpline) {
          const sp = b.guard === 300 ? calc.spline_300 : calc.spline_380;
          bossStat = splineInverse(sp, I * F);
          needDmg = splineEval(sp, cut);
        } else {
          bossStat = b.guard === 300
            ? plotterInverse(I * F, calc.boss300_plotter_1, calc.boss300_plotter_2, calc.boss300_changePoing)
            : plotterInverse(I * F, calc.boss380_plotter_1, calc.boss380_plotter_2, calc.boss380_changePoing);
          bossStat = bossStat || -2;
          needDmg = plotterEval(cut, b.guard, calc);
        }
        const U = (I / (needDmg < 0 ? 1e4 : needDmg)) * (b.easyRate || 1) * F;
        const G = ((3 * ascent) / (b.boss === "루시드" && b.difficulty === "Hard" ? 0.4 : Math.min(3, Math.ceil(20 / U / 5.667))) - ascent) || 0;
        const clearRate = Math.max(0, U * (1 + G) || 0);
        const isPartyBoss = !!b.partyBossCut;
        const partyLimit = b.partyLimit || 6;
        const cannotEnter = entryLevel(b.boss, b.difficulty) > level;
        const label = cannotEnter ? "입장 불가능" : verdict(clearRate, isPartyBoss, partyLimit);
        const pct = 100 * clearRate;
        return {
          boss: b.boss, name: b.name, difficulty: b.difficulty, guard: b.guard, icon: `${b.difficulty.toLowerCase()}_${b.name}`,
          bossStat, clearRate, percent: pct, estimate: !!b.estimate,
          percentText: isPartyBoss ? `[파티] ${Math.round(pct)}%` : (pct >= 1e3 ? Math.round(pct).toString() : pct >= 100 ? pct.toFixed(1) : pct.toFixed(2)) + "%",
          label, labelEn: VERDICT_EN[label], isPartyBoss, partyLimit,
          levelGapPct: levelGap * 100, arcaneGapPct: arcGap * 100, authenticGapPct: autGap * 100,
          forceLevelFinalDmgPct: (levelGap / 1.2) * (b.arcaneForce ? arcGap / afMax : 1) * (b.authenticForce ? autGap / 1.25 : 1) * 100 - 100,
        };
      });

      let shown = rows;
      if (!showDestinyChampion) shown = shown.filter((r) => r.difficulty !== "Destiny" && r.difficulty !== "Champion");
      if (myStandard) shown = shown.filter((r) => {
        if (r.isPartyBoss ? r.clearRate / r.partyLimit > 10 : r.clearRate > 10) return false;
        if (r.isPartyBoss) { if (r.clearRate < 0.85 / r.partyLimit) return false; } else if (r.clearRate < 0.15) return false;
        return true;
      });
      return { error: null, rows, shown };
    }

    return { GMS_BOSSES, computeBossCuts };
})();
