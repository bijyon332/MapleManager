// Scouter の計算元 — kinokohub（きのこツール、JMS 向け）の「メインステ換算」。
//
// 2026-10 から MapleScouter が Bot 対策で Worker からの計算を受け付けなくなったので、
// MapleScouter 互換の計算をしている kinokohub に送る（Worker の /kinoko が中継）。
// 返ってきた換算値を MapleScouter（GMS）の値に寄せて、先方の calculatedData と同じ形に組み立てる。
// こうしておくと scouter.js の結果表示・ボスカット・ハイパー最適化はそのまま使える。
//
// GMS に寄せる補正（2026-10-25、bi の保存データ4キャラ＝レン・ハヤト・メルセデス・ララで検証。
// 補正後の換算値は MapleScouter と ±0.5% 以内、ボスカットの判定は123マス中120マス一致）:
//   - 全キャラ ダメージ +18%。MapleScouter との差（スペック効率から逆算）。理由は不明（bi 了承）。
//   - Heroic（リブート）は 攻撃力・魔力 +5、最終ダメージ +45%。kinokohub に Heroic の設定がないため。
//   - シンボル最大（ダメージ20%）は kinokohub ではボス別の判定にしか効かないので、ダメージに足して送る。

const scouterKinoko = (() => {
    'use strict';

    const API = '/kinoko';
    const DMG_FIX = 18;
    const HEROIC_ATK = 5, HEROIC_FD = 1.45;

    // GMS の職業 id（scouter.js の CLASSES）→ kinokohub の職業 id。シア・エレルライトは先方に無い。
    const CLASS_ID = {
        hero: 'hero', paladin: 'paladin', darkknight: 'dark_knight', archmagefp: 'arch_mage_fire_poison',
        archmageil: 'arch_mage_ice_lightning', bishop: 'bishop', bowmaster: 'bow_master', marksman: 'marksman',
        pathfinder: 'pathfinder', nightlord: 'night_lord', shadower: 'shadower', dualblade: 'dual_blade',
        buccaneer: 'buccaneer', corsair: 'corsair', cannoneer: 'cannoneer', dawnwarrior: 'dawn_warrior',
        blazewizard: 'blaze_wizard', windarcher: 'wind_archer', nightwalker: 'night_walker', thunderbreaker: 'thunder_breaker',
        mihile: 'mihile', aran: 'aran', evan: 'evan', mercedes: 'mercedes', phantom: 'phantom', luminous: 'luminous',
        shade: 'shade', blaster: 'blaster', battlemage: 'battle_mage', wildhunter: 'wild_hunter', mechanic: 'mechanic',
        xenon: 'xenon', demonslayer: 'demon_slayer', demonavenger: 'demon_avenger', kaiser: 'kaiser',
        angelicbuster: 'angelic_buster', cadena: 'cadena', kain: 'kain', adele: 'adele', illium: 'illium',
        khali: 'khali', ark: 'ark', lara: 'lara', hoyoung: 'hoyoung', zero: 'zero', kinesis: 'kinesis',
        hayato: 'hayato', kanna: 'kanna', ren: 'len', lynn: 'lynn', moxuan: 'mo_xuan', lethe: 'lethe',
    };

    // 換算主ステ → 火力 の曲線（MapleScouter の応答の spline_300/380）。形は全職ほぼ共通で、
    // 職業・スペックで縦の倍率が変わるだけ。最終ダメージの補正とボスカットはこの形で計算する（倍率は打ち消し合う）。
    const SPLINE_300 = {
        x: [0, 24704, 33228, 46826, 57262, 68952, 85358, 99025, 110921, 120444, 131008, 144366, 155498],
        y: [0, 129442381, 235169601, 524090458, 847123921, 1332686488, 2211098626, 3218471249, 4695591061, 6498620412, 9204789760, 13792075224, 17666910440],
        m: [5239.734, 7887.035, 15354.731, 25405.273, 35375.116, 46453.195, 62327.19, 93052.849, 151139.438, 217175.446, 291790.017, 345800.924, 348080.778],
    };
    const SPLINE_380 = {
        x: [0, 24704, 33228, 46826, 57262, 68952, 85358, 99025, 110921, 120444, 131008, 144366, 155498],
        y: [0, 127000371, 231282577, 517563888, 838532816, 1320580875, 2199960328, 3204898676, 4674338210, 6471918121, 9165749978, 13741134793, 17613785804],
        m: [5140.883, 7753.341, 15168.021, 25202.998, 35136.507, 46274.828, 62300.125, 92728.543, 150489.6, 216379.916, 290693.543, 345262.822, 347884.568],
    };

    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const int = (v) => String(Math.round(num(v)));
    const dec = (v) => String(num(v));

    const supported = (classId) => !!CLASS_ID[classId];

    // form（scouter.js の入力）→ kinokohub の { basicStats, buffStats }。
    // cls は scouter.js の CLASSES[classId]（[韓国語名, 主ステ, 副ステ, 第3ステ]）。
    function buildPayload(f, cls, magic) {
        const d = f.doping || {};
        const z = () => ({ pure: '0', percentage: '0', added: '0' });
        const stats = { str: z(), dex: z(), luk: z(), int: z(), hp: z(), att: z(), matt: z() };
        const put = (slot, label) => {
            if (!label) return;
            const s = f[slot] || {};
            stats[label.toLowerCase()] = { pure: int(s.base), percentage: int(s.per), added: int(s.abs) };
        };
        put('main', cls[1]); put('sub', cls[2]); put('sub2', cls[3]);
        // Potion IV（攻撃力・魔力 +8）は先方にないので基礎値に足す。Heroic は +5。
        const a = f.atk || {};
        const atkBase = num(a.base) + (d.potion4 ? 8 : 0) + (f.reboot ? HEROIC_ATK : 0);
        stats[magic ? 'matt' : 'att'] = { pure: String(Math.round(atkBase)), percentage: int(a.per), added: int(a.abs) };

        const screen = f.screen || {};
        const nob = (d.nobless || []).map((v) => Math.max(0, Math.min(15, Math.floor(num(v)))));
        const lv = (v, max) => Math.max(0, Math.min(max, Math.floor(num(v))));
        const food = d.fish || d.apple ? 'common30' : d.tengu ? 'common20' : d.truffle ? 'truffleChoco' : d.medal ? 'medalChoco' : null;
        const hx = f.hexa || {};
        const L = f.link || {};
        return {
            basicStats: {
                level: int(f.level), class: CLASS_ID[f.classId],
                damage: String(Math.round(num(f.dmg) + DMG_FIX + (d.authenticDmg ? 20 : 0))), bossDamage: int(f.bossDmg),
                ignoreDefence: dec(f.ignoreDef), criticalRate: dec(f.critical), criticalDamage: dec(f.criticalDmg),
                cooldown: { absolute: int(f.coolSec), percentage: int(f.coolPer) },
                buffDuration: int(f.buffDuration), cooldownNotApplied: dec(f.resetCool),
                ignoreElementalResistance: int(f.ignoreElem), additionalStatusDamage: int(f.statusDmg),
                summonsDurationIncrease: int(f.summonDur), arcanePower: int(f.arcane), sacredPower: int(f.sacred),
                options: { liberated: !!(f.genesis || f.destiny), destiny2ndSkill: false, soulWeapon: false, soulName: null, useOneHandSword: false, useRuinForceShield: false },
                stats,
                skillRingLevel: { restraint: int((f.seed || {}).restraintRing), weapon: '0', continuous: int((f.seed || {}).continuosRing), sum: '0', riskTaker: '0' },
                statsForSkillRings: { str: screen.str ? String(screen.str) : '', dex: screen.dex ? String(screen.dex) : '', int: screen.int ? String(screen.int) : '', luk: screen.luk ? String(screen.luk) : '' },
                weaponAtt: '',
            },
            buffStats: {
                buffOptions: {
                    common: {
                        noblessBoss: String(nob[0] || 0), noblessBossUse: !!nob[0], noblessDmg: String(nob[1] || 0), noblessDmgUse: !!nob[1],
                        noblessCriDmg: String(nob[2] || 0), noblessCriDmgUse: !!nob[2], noblessIgnore: String(nob[3] || 0), noblessIgnoreUse: !!nob[3],
                        advancedStatPotions: !!d.statPotion && num(d.stat) > 0, sayramsElixir: !!d.sayram, collectorsElixir: !!d.collector,
                        herosEcho: !!d.heroesHawl, unionMight: !!d.unionsPower, masarayusGift: !!d.urus, blessingOfTheGuild: false,
                        monsterParkBuffs: !!d.extreme, moonshine: !!d.moonshine, vip: !!d.additional1, candiedApple: !!d.candy,
                        caretakersSupport: !!d.house, vipSaturday: false, adversarysPower: !!d.genePass,
                        weddingFanfare: !!d.wedding, specialWeddingFanfare: !!d.specialWedding,
                    },
                    profession: {
                        advancedWeaponTempering: !!d.jangBi, shiningRed: !!d.shiningRed, shiningBlue: !!d.shiningBlue,
                        bigHero: !!d.bigHero, legendHero: !!d.legendHero && f.classId !== 'demonavenger', legendHp: !!d.legendHero && f.classId === 'demonavenger',
                    },
                    // MapleScouter の「名誉の霊薬」は、攻撃力が合うのは kinokohub の Lv.250 の祝福（検証で確認）。
                    chairBlessing: d.buff275 ? '250' : null,
                    vipPower: d.superPower ? 'super' : null,
                    meal: { type: food ? 'preset' : null, name: food || 'common20', custom: '' },
                    championBlessing: { all: lv(d.championAll, 5), bossDamage: lv(d.championBoss, 5), criticalDamage: lv(d.championCriDmg, 5), atk: lv(d.championAtk, 5), ignoreDefence: lv(d.championIgnore, 5) },
                },
                linkSkillOptions: {
                    kadena: int(L.kadena), illium: int(L.illium), ark: int(L.ark), kain: int(L.kain), magician: int(L.magician), thief: int(L.thief),
                    angel: int(L.angel), hoyoung: int(L.hoyoung), mukhyun: int(L.mukhyun), kanna: int(L.kanna), hayato: '0',
                    wildHunterLevel: int(f.wildhunterUnion),
                },
                hexaOptions: {
                    skillCore1: int(hx.skillCore1), skillCore2: int(hx.skillCore2), skillCore3: '0',
                    masteryCore1: int(hx.masteryCore1), masteryCore2: int(hx.masteryCore2), masteryCore3: int(hx.masteryCore3), masteryCore4: int(hx.masteryCore4),
                    reinCore1: int(hx.reinCore1), reinCore2: int(hx.reinCore2), reinCore3: int(hx.reinCore3), reinCore4: int(hx.reinCore4),
                    solHecate: int(hx.generalCore2), generalCore3: int(hx.generalCore3),
                },
                unionArtifactOptions: { increaseTarget: true, finalAttack: '30' },
                specialOptions: { passiveSkillLevelUp: false, increaseTarget: false },
            },
        };
    }

    // ---- 曲線（scouter_bosscut.js と同じ単調3次エルミート） ----
    function splineEval(sp, v) {
        const { x, y, m } = sp, n = x.length;
        if (v < x[0]) return y[0] + (v - x[0]) * m[0];
        if (v > x[n - 1]) return y[n - 1] + (v - x[n - 1]) * m[n - 1];
        let k = n - 2;
        for (let e = 0; e < n - 1; e++) if (v >= x[e] && v <= x[e + 1]) { k = e; break; }
        const h = x[k + 1] - x[k], r = (v - x[k]) / h, r2 = r * r, r3 = r2 * r;
        return (2 * r3 - 3 * r2 + 1) * y[k] + (r3 - 2 * r2 + r) * h * m[k] + (-2 * r3 + 3 * r2) * y[k + 1] + (r3 - r2) * h * m[k + 1];
    }
    function splineInverse(sp, dmg) {
        const { x, y, m } = sp, n = x.length;
        if (dmg >= y[n - 1]) return Math.round(x[n - 1] + (dmg - y[n - 1]) / m[n - 1]);
        let lo = x[0], hi = x[n - 1];
        for (let s = 0; s < 50; s++) { const mid = (lo + hi) / 2; splineEval(sp, mid) < dmg ? (lo = mid) : (hi = mid); }
        return Math.round((lo + hi) / 2);
    }

    // kinokohub の応答 → MapleScouter の calculatedData と同じ形。
    function toCalculatedData(p, f) {
        const fd = f.reboot ? HEROIC_FD : 1;
        const s = p.stats || {};
        const conv = (v, sp) => (v > 0 ? splineInverse(sp, splineEval(sp, v) * fd) : v);
        const d = {
            boss300_stat: conv(s.normal300, SPLINE_300), boss380_stat: conv(s.normal380, SPLINE_380),
            boss300_hexaStat: conv(s.hexa300, SPLINE_300), boss380_hexaStat: conv(s.hexa380, SPLINE_380),
            exchangePower: p.power ? p.power.normal * fd : null, exchangePowerHexa: p.power ? p.power.hexa * fd : null,
            combatPower: null,
            specEfficiency: p.specEfficiency || {},
            spline_300: SPLINE_300, spline_380: SPLINE_380,
            // ボスカット（scouter_bosscut.js）に要るもの。先方からは出ないので中立の値にする。
            elixir: f.doping && f.doping.sayram && f.doping.collector ? 3 : 0,
            ascent_const: 0, ignoreDefConst_300: 1, ignoreDefConst_380: 1, genePassConst: 1,
            source: 'kinokohub',
        };
        d.calculatedHexaDamage_300 = splineEval(SPLINE_300, d.boss300_hexaStat);
        d.calculatedHexaDamage_380 = splineEval(SPLINE_380, d.boss380_hexaStat);
        d.calculatedHexaDamage_kaling = d.calculatedHexaDamage_380;
        d.calculatedDamage_300 = splineEval(SPLINE_300, d.boss300_stat);
        d.calculatedDamage_380 = splineEval(SPLINE_380, d.boss380_stat);
        return d;
    }

    async function calculate(f, cls, magic) {
        if (!supported(f.classId)) throw new Error('この職業は計算元（kinokohub）が対応していません');
        const res = await fetch(API, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload(f, cls, magic)),
        });
        const out = await res.json().catch(() => null);
        if (!out) throw new Error(`HTTP ${res.status}`);
        if (out.error && !out.success) throw new Error(typeof out.error === 'string' ? out.error : (out.error.message || '計算できませんでした'));
        if (!out.payload || !out.payload.stats) throw new Error('計算結果を読めませんでした');
        return toCalculatedData(out.payload, f);
    }

    return { calculate, supported, buildPayload, toCalculatedData };
})();
