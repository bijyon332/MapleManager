// Scouter — MapleScouter（maplescouter.com）の換算主ステを、キャラごとに入力・保存して出す。
//
// 計算は先方のサーバー（POST /api/calc/dmg、本文 {userStat}）で行う。ブラウザからは
// 直接呼べないので Worker の /scouter が中継する（worker.js）。
// 2026-10 から MapleScouter が Bot 対策で中継を弾くので、今は MapleScouter 互換の kinokohub で計算し、
// 結果を MapleScouter と同じ形に組み立てて使っている（scouter_kinoko.js、ENGINE で切り替え）。GMS は先方のキャラ検索に
// 対応していないので、ステータス画面の値を手入力するか、スクショ／画面共有から読み取る
// （scouter_reader.js）。
//
// 保存（localStorage）:
//   { 'char:<id>': entry, 'free': entry }   — 'free' はキャラに紐付けない仮入力
//   entry = { form: {...}, result: {...} | null, history: [{at, b300, b300h}],
//             hyperOpt: { locked, crLv }, hyperRun: {...} | null,   — hyperRun は「ハイパーを計算する」の結果
//             hstatRun: {...} | null,   — hstatRun は「HEXAステを計算する」の結果
//             calib: { min, scale, at, on, m20 } | undefined,   — ボスカットの実測補正（EXスウのソロ実測タイムと火力の倍率、on はトグル）
//             quick: { min, at, m20 } | undefined }   — 簡易換算の EXスウ ソロタイム
//   m20 は「20分化前に測った時間を 3分の2 に換算した」印（LIMIT_SWITCH を参照）。
//   form.hexaStat = [{ main, mainLv, a1, a1Lv, a2, a2Lv } ×3]   — HEXAステータスのコア I〜III（種類は scouter_hexastat.js の TYPES）
//   form.symbol = { cernium: true, ... }   — Lv11 以上のオーセンティックシンボル（その地域のボスだけダメージ +20%）
// form は画面の項目そのまま。送るときに buildUserStat() で先方の形に組み立てる。

const scouter = (() => {
    'use strict';

    const STORAGE_KEY = 'mapleManager_scouter_v1';
    const API = '/scouter';
    // 計算元。MapleScouter が復旧したら 'maplescouter' に戻す。
    const ENGINE = 'kinoko';
    const ENGINE_NAME = ENGINE === 'kinoko' ? 'kinokohub' : 'MapleScouter';

    // GMS の職業 id（class_data.js）→ 先方の職業名（韓国語）と主ステ・副ステ。
    // 主・副・第3ステは先方の職業表（maplescouter のフロントJS）の GMS 用のものに合わせた。
    const CLASSES = {
        hero: ['히어로', 'STR', 'DEX'], paladin: ['팔라딘', 'STR', 'DEX'], darkknight: ['다크나이트', 'STR', 'DEX'],
        archmagefp: ['아크메이지(불,독)', 'INT', 'LUK'], archmageil: ['아크메이지(썬,콜)', 'INT', 'LUK'], bishop: ['비숍', 'INT', 'LUK'],
        bowmaster: ['보우마스터', 'DEX', 'STR'], marksman: ['신궁', 'DEX', 'STR'], pathfinder: ['패스파인더', 'DEX', 'STR'],
        nightlord: ['나이트로드', 'LUK', 'DEX'], shadower: ['섀도어', 'LUK', 'DEX', 'STR'], dualblade: ['듀얼블레이드', 'LUK', 'DEX', 'STR'],
        buccaneer: ['바이퍼', 'STR', 'DEX'], corsair: ['캡틴', 'DEX', 'STR'], cannoneer: ['캐논슈터', 'STR', 'DEX'],
        dawnwarrior: ['소울마스터', 'STR', 'DEX'], blazewizard: ['플레임위자드', 'INT', 'LUK'], windarcher: ['윈드브레이커', 'DEX', 'STR'],
        nightwalker: ['나이트워커', 'LUK', 'DEX'], thunderbreaker: ['스트라이커', 'STR', 'DEX'], mihile: ['미하일', 'STR', 'DEX'],
        aran: ['아란', 'STR', 'DEX'], evan: ['에반', 'INT', 'LUK'], mercedes: ['메르세데스', 'DEX', 'STR'],
        phantom: ['팬텀', 'LUK', 'DEX'], luminous: ['루미너스', 'INT', 'LUK'], shade: ['은월', 'STR', 'DEX'],
        blaster: ['블래스터', 'STR', 'DEX'], battlemage: ['배틀메이지', 'INT', 'LUK'], wildhunter: ['와일드헌터', 'DEX', 'STR'],
        mechanic: ['메카닉', 'DEX', 'STR'], xenon: ['제논', 'STR', 'DEX', 'LUK'], demonslayer: ['데몬슬레이어', 'STR', 'DEX'],
        demonavenger: ['데몬어벤져', 'HP', 'STR'], kaiser: ['카이저', 'STR', 'DEX'], angelicbuster: ['엔젤릭버스터', 'DEX', 'STR'],
        cadena: ['카데나', 'LUK', 'DEX', 'STR'], kain: ['카인', 'DEX', 'STR'], adele: ['아델', 'STR', 'DEX'],
        illium: ['일리움', 'INT', 'LUK'], khali: ['칼리', 'LUK', 'DEX'], ark: ['아크', 'STR', 'DEX'],
        lara: ['라라', 'INT', 'LUK'], hoyoung: ['호영', 'LUK', 'DEX'], zero: ['제로', 'STR', 'DEX'],
        kinesis: ['키네시스', 'INT', 'LUK'], hayato: ['하야토', 'STR', 'DEX'], kanna: ['칸나', 'INT', 'LUK'],
        ren: ['렌', 'STR', 'DEX'], lynn: ['린', 'INT', 'LUK'], moxuan: ['묵현', 'DEX', 'STR'],
        sia: ['시아', 'INT', 'LUK'], erellight: ['에렐', 'STR', 'DEX'], lethe: ['레테', 'INT', 'LUK'],
    };
    const isMagic = (cid) => CLASSES[cid] && CLASSES[cid][1] === 'INT';
    const statsOf = (cid) => {
        const c = CLASSES[cid];
        if (!c) return [];
        return [['main', c[1]], ['sub', c[2]], ...(c[3] ? [['sub2', c[3]]] : [])];
    };

    // 先方へ送る userStat の土台。先方の手入力ページの初期値（GMS 用）から、
    // 入力欄にしないもの（秘薬などの「換算の前提」の設定）だけを持ってきている。
    const DOPING = {
        bigHero: false, greatIgnoreGuard: false, dragonsMeal: false, extreme: true, fish: true, guildBlessing: true,
        jangBi: true, legendHero: false, legendHp: false, rebootAtkPotion: false, shiningRed: true, shiningBlue: false,
        statPotion: true, stat: '30', superPower: true, unionsPower: true, urus: true, heroesHawl: true,
        noblessBoss: true, noblessDmg: true, noblessCriDmg: true, noblessIgnore: true, nobless: ['15', '15', '15', '15'],
        sayram: true, collector: true, buff275: false, additional1: true, additional2: false,
        championAll: '0', championAtk: '0', championBoss: '0', championIgnore: '0', championCriDmg: '0',
        moonshine: false, cake: false, apple: false, tengu: false, candy: false, house: false, potion4: false,
        wedding: false, specialWedding: false, whiteBear: false, ultraVip: false, superVip: false, truffle: false,
        medal: false, hyperRainbow: false, rainbow: false, thanks: false, genePass: false, criDmgRing: '0',
    };

    // 入力欄。key は form のキー。
    const DETAIL = [
        ['dmg', 'ダメージ', '%'], ['bossDmg', 'ボスダメージ', '%'],
        ['ignoreDef', '防御率無視', '%'], ['normalDmg', '一般モンスターダメージ', '%'],
        ['critical', 'クリティカル率', '%'], ['criticalDmg', 'クリティカルダメージ', '%'],
        ['coolSec', 'クールタイム減少', '秒'], ['coolPer', 'クールタイム減少', '%'],
        ['buffDuration', 'バフ持続時間', '%'], ['resetCool', 'クールタイム無視', '%'],
        ['ignoreElem', '属性耐性無視', '%'], ['statusDmg', '状態異常追加ダメージ', '%'],
        ['summonDur', '召喚獣持続時間増加', '%'], ['arcane', 'アーケインフォース', ''],
        ['sacred', 'オーセンティックフォース', ''],
    ];
    const ICON = 'assets/scouter/';
    // リンクスキル。only は、その職業のときだけ出すもの（自分の職業のリンク）。
    const LINKS = [
        ['ark', 'Ark', 'link/ark.png'], ['illium', 'Illium', 'link/illium.png'], ['kadena', 'Cadena', 'link/kadena.png'],
        ['kain', 'Kain', 'link/kain.png'], ['magician', 'Explorer 魔法使い', 'link/magician.png'],
        ['thief', 'Explorer 盗賊', 'link/thief.png'], ['angel', 'Angelic Buster', 'link/angel.png'],
        ['hoyoung', 'Hoyoung', 'link/hoyoung.png'], ['mukhyun', 'Mo Xuan', 'link/mukhyun.png'], ['kanna', 'Kanna', 'link/kanna.png'],
        ['mihile', 'Mihile', 'link/mihile.png', 'mihile'], ['kaiser', 'Kaiser', 'link/kaiser.png', 'kaiser'],
    ];
    // オーセンティックシンボル。Lv11 以上にすると、その地域のボスを攻撃するときだけダメージ +20%（Nexon 公式ガイド）。
    // HEXA換算などの全体の値には入れず、ボスカットの該当ボスだけに掛ける（symbolCuts）。
    // アイコンは assets/scouter/symbol/<key>.png（GMS のアイテム 1713000〜1713005・1714000〜1714001、maplestory.io から）。
    // 凶星・ベローナはアルテリア扱い（MapleScouter の対応表 78547 と同じ。公式ガイドの一覧には無い）。
    const SYMBOL_DMG = 20;
    const SYMBOLS = [
        ['cernium', 'Cernium', ['세렌']], ['arcus', 'Hotel Arcus', ['칼로스']], ['odium', 'Odium', ['대적자']],
        ['shangrila', 'Shangri-La', ['카링']], ['arteria', 'Arteria', ['흉성', '벨로나']], ['carcion', 'Carcion', ['림보']],
        ['tallahart', 'Tallahart', ['발드릭스']], ['geardock', 'Geardock', ['유피테르']],
    ];
    const SEEDS = [
        ['restraintRing', 'Restraint Ring', 'seed/restraint.png'], ['continuosRing', 'Continuous Ring', 'seed/continuos.png'],
    ];
    // バフアイテム（ボス戦で使う前提のもの）。先方の手入力ページで GMS のときに出る項目と同じ。
    // lv: レベルを入れるもの（0 で使わない）。group: 同じ group の中では1つしか使えない。
    const BUFFS = [
        { title: 'ギルドスキル', items: [
            ['noblessBoss', 'Boss Slayers', 'buff/noblessboss.png', { lv: 0, max: 15 }],
            ['noblessIgnore', 'Undeterred', 'buff/noblessignore.png', { lv: 3, max: 15 }],
            ['noblessDmg', 'For the Guild', 'buff/noblessdam.png', { lv: 1, max: 15 }],
            ['noblessCriDmg', 'Hard Hitter', 'buff/noblesscridam.png', { lv: 2, max: 15 }],
        ] },
        { title: '秘薬・バフ', items: [
            ['statPotion', 'ステータス薬（主＋副）', 'buff/statpotion.png', { stat: true, max: 30 }],
            ['extreme', 'Extreme Potion', 'buff/extreme.png'],
            ['heroesHawl', 'Echo of Hero', 'buff/hero.png'],
            ['unionsPower', "Legion's Might", 'buff/union.png'],
            ['urus', 'Ursus', 'buff/urus.png'],
            ['superPower', 'MVP Super Power', 'buff/superpower.png'],
            ['additional1', 'VIP Buff', 'buff/vipbuff.png'],
            ['sayram', 'Sayram の霊薬', 'buff/sayram.png'],
            ['collector', 'Collector の霊薬', 'buff/collector.png'],
            ['buff275', '名誉の霊薬', 'buff/buff300.png'],
            ['moonshine', 'Moonshine', 'buff/moonshine.png'],
            ['shiningRed', 'Red Star', 'buff/shiningred.png'],
            ['genePass', 'Genesis Pass', 'buff/opponent.png'],
            ['candy', 'Candied Apple', 'buff/candy.png'],
        ] },
        { title: '攻撃力の薬（1つ）', items: [
            ['bigHero', '大英雄の秘薬', 'buff/bighero.png', { group: 'atk' }],
            ['legendHero', '伝説の英雄の秘薬', 'buff/legendhero.png', { group: 'atk' }],
            ['jangBi', '高級武器精錬', 'buff/jangbi.png', { group: 'atk' }],
            ['shiningBlue', 'Blue Star', 'buff/shiningblue.png', { group: 'atk' }],
        ] },
        { title: '食べ物（1つ）', items: [
            ['fish', 'Fish Bread', 'buff/fish.png', { group: 'food' }],
            ['apple', 'Onyx Apple', 'buff/apple.webp', { group: 'food' }],
            ['tengu', "Tengu's Judgement", 'buff/tengu.png', { group: 'food' }],
            // 先方にない項目。攻撃力用と魔力用は別アイテムだが同じ枠なので1つのボタンにする。
            // ON のとき攻撃力・魔力の基礎値に +8 して送る（buildUserStat）。
            ['potion4', 'Potion IV', ['buff/potion4_att.png', 'buff/potion4_matt.png'], { group: 'food' }],
            ['house', "Caretaker's Support", 'buff/house.png'],
        ] },
        // Champion のバフ。レベル 0〜5。アイコンが全部同じなので左上に種類（tag）を重ねる。
        { title: 'Champion', items: [
            ['championAll', 'ALLステ / HP', 'buff/champion.png', { champ: true, max: 5, tag: 'ALL', title: 'ALLステ +10 / 最大HP +500（1段あたり）' }],
            ['championAtk', '攻撃力 / 魔力', 'buff/champion.png', { champ: true, max: 5, tag: 'AMA', title: '攻撃力・魔力 +5（1段あたり）' }],
            ['championBoss', 'ボスダメージ', 'buff/champion.png', { champ: true, max: 5, tag: 'BOSS', title: 'ボスダメージ +2%（1段あたり）' }],
            ['championIgnore', '防御率無視', 'buff/champion.png', { champ: true, max: 5, tag: 'IED', title: '防御率無視 +2%（1段あたり）' }],
            ['championCriDmg', 'クリダメ', 'buff/champion.png', { champ: true, max: 5, tag: 'CRI', title: 'クリティカルダメージ +0.5%（1段あたり）' }],
        ] },
    ];
    // 同じ group のもの（先方の画面で、1つ選ぶと他が外れるもの）。
    const GROUP_KEYS = {
        atk: ['bigHero', 'legendHero', 'legendHp', 'jangBi', 'shiningBlue'],
        food: ['fish', 'apple', 'tengu', 'potion4', 'cake', 'dragonsMeal', 'whiteBear', 'rebootAtkPotion'],
    };
    // HEXA。hexa_data.js のキー → 先方のキー。
    const HEXA_KEYS = [
        ['origin', 'skillCore1', 'Origin'], ['ascent', 'skillCore2', 'Ascent'],
        ['mastery1', 'masteryCore1', 'Mastery 1'], ['mastery2', 'masteryCore2', 'Mastery 2'],
        ['mastery3', 'masteryCore3', 'Mastery 3'], ['mastery4', 'masteryCore4', 'Mastery 4'],
        ['enhance1', 'reinCore1', 'Boost 1'], ['enhance2', 'reinCore2', 'Boost 2'],
        ['enhance3', 'reinCore3', 'Boost 3'], ['enhance4', 'reinCore4', 'Boost 4'],
        ['common1', 'solJanus', 'Sol Janus'], ['common2', 'generalCore2', 'Sol Hekate'],
        ['common3', 'generalCore3', 'Common 3'],
    ];
    // 先方が計算できなかったときに返す負の値（先方のフロントJSの表示文言から）。
    const ERRORS = { '-2': '防御率無視の値がおかしい', '-4': '入力エラー', '-5': 'ありえない組み合わせ', '-6': 'クリティカル率が100%未満' };

    const blankStat = () => ({ base: '', per: '', abs: '' });
    const HY = () => (typeof scouterHyper !== 'undefined' ? scouterHyper : null);
    const HX = () => (typeof scouterHexaStat !== 'undefined' ? scouterHexaStat : null);
    const blankHexaStat = () => [0, 1, 2].map(() => ({ main: '', mainLv: '0', a1: '', a1Lv: '0', a2: '', a2Lv: '0' }));
    const HYPER_KEYS = ['str', 'dex', 'int', 'luk', 'hp', 'mp', 'df', 'cr', 'cd', 'ied', 'dmg', 'boss', 'normal', 'status', 'att', 'exp', 'arcane'];
    // 画面の項目名（GMS の表記）と日本語。
    const HYPER_JA = {
        str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', hp: 'HP', mp: 'MP', df: 'DF/TF',
        cr: 'クリティカル率', cd: 'クリティカルダメージ', ied: '防御率無視', dmg: 'ダメージ', boss: 'ボスダメージ',
        normal: '一般モンスターダメージ', status: '状態異常耐性', att: '攻撃力・魔力', exp: '獲得経験値', arcane: 'アーケインフォース',
    };
    const dopingDefault = () => ({ ...DOPING, nobless: [...DOPING.nobless] });
    function DEFAULT_FORM() {
        return {
            classId: '', level: '', reboot: false, genesis: false, destiny: false,
            main: blankStat(), sub: blankStat(), sub2: blankStat(), atk: blankStat(),
            dmg: '', bossDmg: '', ignoreDef: '', normalDmg: '', critical: '', criticalDmg: '',
            coolSec: '', coolPer: '', buffDuration: '', resetCool: '', ignoreElem: '', statusDmg: '', summonDur: '',
            arcane: '', sacred: '',
            hexa: Object.fromEntries(HEXA_KEYS.map(([, k]) => [k, k === 'solJanus' ? '30' : '0'])),
            link: { ark: '2', illium: '2', kadena: '2', kain: '2', magician: '6', thief: '6', angel: '2', hoyoung: '0', mukhyun: '0', mihile: '0', kaiser: '0', kanna: '0' },
            seed: { restraintRing: '4', continuosRing: '4' },
            doping: dopingDefault(),
            symbol: Object.fromEntries(SYMBOLS.map(([k]) => [k, false])),
            wildhunterUnion: '0',
            // ハイパーステータスの今のレベル（scouter_hyper.js の KEYS）と、画面の残りポイント。
            hyper: Object.fromEntries(HYPER_KEYS.map((k) => [k, '0'])), hyperPoint: '',
            hexaStat: blankHexaStat(),
            screen: {},   // 画面から読んだ最終値（STR などの検算用）と戦闘力
        };
    }

    const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
    const str = (v) => String(num(v));
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const fmt = (n) => (n === null || n === undefined || !Number.isFinite(n)) ? '—' : Math.round(n).toLocaleString();
    const finalOf = (s) => Math.floor(num(s.base) * (1 + num(s.per) / 100)) + num(s.abs);

    // 画面のバフ欄 → 先方の doping。ギルドスキルはレベル、ステータス薬は値を入れたら使う扱い。
    function dopingOf(f) {
        const d = { ...dopingDefault(), ...(f.doping || {}) };
        const lv = (v, max) => String(Math.max(0, Math.min(max, Math.floor(num(v)))));
        d.nobless = [0, 1, 2, 3].map((i) => lv((d.nobless || [])[i], 15));
        d.noblessBoss = d.nobless[0] !== '0'; d.noblessDmg = d.nobless[1] !== '0';
        d.noblessCriDmg = d.nobless[2] !== '0'; d.noblessIgnore = d.nobless[3] !== '0';
        d.stat = lv(d.stat, 30);
        for (const k of ['championAll', 'championAtk', 'championBoss', 'championIgnore', 'championCriDmg']) d[k] = lv(d[k], 5);
        d.statPotion = d.stat !== '0';
        // デーモンアヴェンジャーは「伝説の英雄の秘薬」が HP 版になる（先方の画面と同じ）。
        if (f.classId === 'demonavenger') { d.legendHp = !!d.legendHero; d.legendHero = false; } else d.legendHp = false;
        delete d.potion4; delete d.dragonFood;   // 先方にない項目。攻撃力・魔力に足して送る。
        d.authenticDmg = false;   // シンボルのダメージはボス別なので送らない（symbolCuts でボスカットに掛ける）。
        return d;
    }

    function buildUserStat(f) {
        const c = CLASSES[f.classId];
        const sx = (k) => f[k] || blankStat();
        const screen = f.screen || {};
        const others = ['STR', 'DEX', 'INT', 'LUK'].filter((s) => c && ![c[1], c[2], c[3]].includes(s));
        const entire = { str: str(screen.str), dex: str(screen.dex), int: str(screen.int), luk: str(screen.luk) };
        const seedLv = (k) => SEEDS.some(([sk]) => sk === k) ? str(f.seed[k]) : '0';
        const linkOn = ([k, , , only]) => !only || only === f.classId;
        // Potion IV（攻撃力・魔力 +8）は先方にないので、攻撃力・魔力の基礎値に足す。
        const atkBase = num(sx('atk').base) + (f.doping && f.doping.potion4 ? 8 : 0);
        return {
            doping: dopingOf(f),
            linkSkill: { hayato: '0', ...Object.fromEntries(LINKS.map((l) => [l[0], linkOn(l) ? str(f.link[l[0]]) : '0'])) },
            special: {
                isReboot: !!f.reboot, combat: true, epiSoul: '0', mugongSoul: '0', genesis: !!f.genesis,
                destiny: !!f.destiny, oneHandSword: false, useRuinForceShild: false, useContinuousRingAsMainRing: false,
                restraintRing: seedLv('restraintRing'), weaponRing: seedLv('weaponRing'), ringOfSum: seedLv('ringOfSum'),
                riskTaker: seedLv('riskTaker'), continuosRing: seedLv('continuosRing'),
                statThird: entire[(others[0] || 'int').toLowerCase()] || '0',
                statFourth: entire[(others[1] || 'luk').toLowerCase()] || '0',
                challenge: false, is30min: false, destiny2ndSkill: false, famPassiveUp: false,
            },
            stat: {
                myClass: c ? c[0] : '', level: str(f.level),
                mainStatBase: str(sx('main').base), mainStatPer: str(sx('main').per), mainStatAbs: str(sx('main').abs),
                subStatBase: str(sx('sub').base), subStatPer: str(sx('sub').per), subStatAbs: str(sx('sub').abs),
                ssubStatBase: str(sx('sub2').base), ssubStatPer: str(sx('sub2').per), ssubStatAbs: str(sx('sub2').abs),
                arcaneForce: str(f.arcane), authenticForce: str(f.sacred), classForce: '0',
                atkBase: String(atkBase), atkAbs: str(sx('atk').abs), atkPercent: str(sx('atk').per),
                dmg: str(f.dmg), bossDmg: str(f.bossDmg), normalDmg: str(f.normalDmg), ignoreDef: str(f.ignoreDef),
                buffDuration: str(f.buffDuration), critical: str(f.critical), criticalDmg: str(f.criticalDmg),
                weaponAtk: '0', coolTimeReducePercent: str(f.coolPer), coolTimeReduce: str(f.coolSec),
                wildhunterUnion: str(f.wildhunterUnion), resetCoolDown: str(f.resetCool), statusAdditionalDmg: str(f.statusDmg),
                passiveSkillLevelUp: false, increaseTarget: false, summonPersistTime: str(f.summonDur),
                artifact_increaseTarget: true, artifact_finalAttack: '30',
                subStat_hyper: '', subStat_ability: '', subStat_union: '', subStat_doping: '', subStat_afterDoping: '',
                ssubStat_hyper: '', ssubStat_ability: '', ssubStat_union: '', ssubStat_doping: '', ssubStat_afterDoping: '',
                ignoreElementalResist: str(f.ignoreElem), maple_combatPower: '', tms_fd: '0', tms_soul: '0',
            },
            hexa: {
                ...Object.fromEntries(HEXA_KEYS.filter(([, k]) => k !== 'solJanus').map(([, k]) => [k, str(f.hexa[k])])),
                skillCore3: '0', skillCore4: '0', skillCore5: '0', skillCore6: '0', generalCore4: '0', hexaStat: 0,
            },
            seedRing: {
                restraintRing: { level: seedLv('restraintRing'), efficiency: 0 }, weaponRing: { level: seedLv('weaponRing'), efficiency: 0 },
                ringOfSum: { level: seedLv('ringOfSum'), efficiency: 0 }, riskTakerRing: { level: seedLv('riskTaker'), efficiency: 0 },
                criDamageRing: { level: '0', efficiency: 0 }, levelRing: { level: '0', efficiency: 0 },
                continuosRing: { level: seedLv('continuosRing'), efficiency: 0 }, ultiRing: { level: '0', efficiency: 0 },
                durabilityRing: { level: '0', efficiency: 0 },
            },
            entireStat: entire,
            isGMS: true, isTMS: false, isJMS: false, isMSEA: false,
            // 戦闘力（ゲーム内の表示に近い値）の計算にだけ使われる。
            power: {
                mainStatBase: num(sx('main').base), mainStatPer: num(sx('main').per), mainStatAbs: num(sx('main').abs),
                subStatBase: num(sx('sub').base), subStatPer: num(sx('sub').per), subStatAbs: num(sx('sub').abs),
                ssubStatBase: num(sx('sub2').base), ssubStatPer: num(sx('sub2').per), ssubStatAbs: num(sx('sub2').abs),
                atk: atkBase, atkPer: num(sx('atk').per), bossDmg: num(f.bossDmg), criDmg: num(f.criticalDmg),
            },
            huntSkill: { solJanus: str(f.hexa.solJanus), erdaShower: '25' },
        };
    }

    /* ---------- 保存 ---------- */
    let data = {};
    let loaded = false;
    function load() {
        try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (e) { data = {}; }
        loaded = true;
    }
    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* 保存できなくても画面は動かす */ }
    }
    function entry(id) {
        if (!loaded) load();
        if (!data[id]) data[id] = { form: DEFAULT_FORM(), result: null, history: [] };
        const e = data[id];
        // 以前の「シンボル最大（ダメージ20%）」は全ボスにダメージ +20% を足していた。オンだった人は全地域 Lv11 として引き継ぐ。
        const legacySym = !!(e.form && e.form.doping && e.form.doping.authenticDmg);
        e.form = { ...DEFAULT_FORM(), ...e.form };
        for (const k of ['main', 'sub', 'sub2', 'atk']) e.form[k] = { ...blankStat(), ...e.form[k] };
        for (const k of ['hexa', 'link', 'seed', 'doping', 'hyper', 'symbol']) e.form[k] = { ...DEFAULT_FORM()[k], ...e.form[k] };
        if ('authenticDmg' in e.form.doping) {
            if (legacySym) {
                for (const [k] of SYMBOLS) e.form.symbol[k] = true;
                // そのとき出したボスカットは全ボスに +20% 入りなので印を付けておく（symbolCuts でシンボル外のボスから外す）。
                // 実測補正の倍率も、EXスウ（シンボル外）の％が下がる分だけ直す。
                if (e.result && e.result.cuts) {
                    e.result.symAll = true;
                    if (e.calib && e.calib.scale) e.calib.scale *= symbolFactor(e);
                }
            }
            delete e.form.doping.authenticDmg;
        }
        // 少しのあいだ Baby Dragon Food だった枠は Potion IV に置き換えた。
        if ('dragonFood' in e.form.doping) { if (e.form.doping.dragonFood) e.form.doping.potion4 = true; delete e.form.doping.dragonFood; }
        // ボス防御率は 380% だけ、クリ率のバフ上乗せはなし（bi 指定 2026-11-01）。
        // crLv はハイパーでクリティカル率に振る Lv（自分で決める。'' なら今の Lv）。最適化はそれを差し引いた残りで行う。
        e.hyperOpt = { locked: {}, crLv: '', ...(e.hyperOpt || {}) };
        delete e.hyperOpt.pdr; delete e.hyperOpt.critBuff; delete e.hstatOpt;
        e.form.hexaStat = blankHexaStat().map((b, i) => ({ ...b, ...((e.form.hexaStat || [])[i] || {}) }));
        // リンクスキルと Wild Hunter ユニオンは全キャラ共通（シードリングはキャラごと）。
        // link は共通の入れ物をそのまま指すので、入力すると全キャラに効く。
        const sh = shared();
        e.form.link = sh.link;
        e.form.wildhunterUnion = sh.wildhunterUnion;
        if (migrate20(e)) save();
        return e;
    }
    // 全キャラ共通の値。初めて作るときは、最後に計算したキャラ（なければ仮入力）の値を引き継ぐ。
    function shared() {
        if (!data.shared) {
            const at = (e) => (e && e.result && e.result.at) || '';
            const src = Object.entries(data).filter(([k, v]) => (k === 'free' || k.startsWith('char:')) && v && v.form)
                .map(([, v]) => v).sort((a, b) => at(b).localeCompare(at(a)))[0];
            const f = (src && src.form) || {};
            data.shared = { link: { ...DEFAULT_FORM().link, ...(f.link || {}) }, wildhunterUnion: f.wildhunterUnion !== undefined ? f.wildhunterUnion : '0' };
        }
        data.shared.link = { ...DEFAULT_FORM().link, ...data.shared.link };
        return data.shared;
    }
    // 入力のあと、共通の値を共通の入れ物へ戻す（link は同じ入れ物なので wildhunterUnion だけ）。
    function syncShared(f) {
        shared().wildhunterUnion = f.wildhunterUnion;
    }

    const chars = () => (window.app && window.app.data && window.app.data.characters) || [];
    const charOf = (id) => chars().find((c) => c.id === id);
    function classIdFor(char) {
        if (!char) return '';
        const cls = window.app && window.app.classByJobName && window.app.classByJobName(char.job);
        return cls && CLASSES[cls.id] ? cls.id : '';
    }
    // hexa_data.js はトップレベルの const なので window には載らない。
    const tracker = () => (typeof hexaTracker !== 'undefined' ? hexaTracker : null);
    const hexaClass = (cid) => (typeof HEXA_CLASS_SKILLS !== 'undefined' ? HEXA_CLASS_SKILLS.find((c) => c.id === cid) : null);
    function classInfo(cid) {
        for (const arr of Object.values(window.CLASS_DATA || {})) {
            const m = arr.find((c) => c.id === cid);
            if (m) return m;
        }
        return null;
    }

    /* ---------- アプリのページ ---------- */
    // サイドバーの Scouter は仮入力（'free'）の入力画面をそのまま出す。登録キャラは
    // Character Manager のカードの SCOUTER からモーダルで開く（Upgrade Priority と同じ分け方）。
    let rootEl = null;
    function init(rootId) {
        rootEl = document.getElementById(rootId);
        if (!loaded) load();
        render();
    }
    function render() {
        if (!rootEl) return;
        if (cur) { if (cur.page) renderModal(); return; }
        rootEl.innerHTML = '<div id="sc-overlay" class="sc-inline"></div>';
        open('free', { page: true });
    }

    /* ---------- モーダル ---------- */
    let cur = null;   // { id, char, e, reads: [], busy, live }

    function open(id, opt = {}) {
        if (!loaded) load();
        const char = id.startsWith('char:') ? charOf(id.slice(5)) : null;
        const e = entry(id);
        if (!e.form.classId) e.form.classId = classIdFor(char);
        if (!e.form.level && char && char.level) e.form.level = String(char.level);
        const page = !!opt.page;
        const pageVeil = page ? document.getElementById('sc-overlay') : null;
        if (page && !pageVeil) return;
        close(true);
        cur = { id, char, e, page, reads: null, busy: false, live: null, msg: '', msgKind: '' };
        let veil = pageVeil;
        if (!page) {
            veil = document.createElement('div');
            veil.id = 'sc-overlay';
            veil.className = 'modal modal-open bg-slate-950/80 z-[200]';
            veil.addEventListener('click', (ev) => { if (ev.target === veil) close(); });
            document.body.appendChild(veil);
        }
        bindModal(veil);   // veil は閉じるまで同じ要素なので、ここで1回だけ付ける
        cur.esc = (ev) => { if (ev.key === 'Escape' && !page) close(); };
        document.addEventListener('keydown', cur.esc);
        cur.paste = (ev) => {
            if (page && !(rootEl && rootEl.offsetParent)) return;   // ページが隠れているときは読まない
            if (cur && (cur.tab === 'hstat' || cur.tab === 'quick')) return;   // HEXAステ・簡易換算のタブには読み取るものがない
            const item = [...((ev.clipboardData && ev.clipboardData.items) || [])].find((x) => x.type.startsWith('image/'));
            if (!item) return;
            ev.preventDefault();
            readImage(item.getAsFile());
        };
        document.addEventListener('paste', cur.paste);
        renderModal();
    }
    function openForCharacter(charId) { open('char:' + charId); }

    function close(silent) {
        if (!cur) return;
        stopLive();
        document.removeEventListener('keydown', cur.esc);
        document.removeEventListener('paste', cur.paste);
        const v = document.getElementById('sc-overlay');
        if (v) v.remove();
        const wasPage = cur.page;
        cur = null;
        if (!silent && !wasPage) render();   // モーダルを閉じたら、アプリのページを描き直す
        refreshRoster();
    }
    function refreshRoster() {
        if (window.app && typeof window.app.renderDashboard === 'function') window.app.renderDashboard();
        if (window.app && typeof window.app.renderCharacters === 'function') window.app.renderCharacters();
    }

    function renderModal() {
        const veil = document.getElementById('sc-overlay');
        if (!veil || !cur) return;
        const { char, e } = cur;
        const info = classInfo(e.form.classId);
        const portrait = char ? ((char.image && char.image.startsWith('http')) ? char.image : (char.classImage || '')) : (info ? info.path : '');
        const tabNow = cur.tab || 'input';
        const result = tabNow === 'result';
        // ページでは入力／結果／ハイパー／HEXAステの切り替えを上部のヘッダー（#scouter-nav）に置く。モーダルでは枠のヘッダーに置く。
        syncNav();
        const tab = (id, icon, label) => `<button role="tab" data-sc="tab" data-tab="${id}" class="tab gap-1.5 ${id === tabNow ? 'tab-active' : ''}"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i>${label}</button>`;
        const head = cur.page ? '' : `<div class="flex items-center gap-3 h-12 px-3 shrink-0 bg-base-100 border-b border-base-content/10">
                ${portrait ? `<img src="${esc(portrait)}" alt="" class="w-8 h-8 object-contain bg-base-300 border border-base-content/10">` : ''}
                <b class="text-white">${esc(char ? char.name : '仮入力')}</b>
                <span class="text-xs text-base-content/50">の Scouter</span>
                <nav role="tablist" class="tabs tabs-box tabs-sm ml-2">${tab('input', 'pencil-line', '入力')}${tab('result', 'gauge', '結果')}${tab('quick', 'timer', '簡易換算')}${tab('hyper', 'sliders-horizontal', 'ハイパー最適化')}${tab('hstat', 'hexagon', 'HEXAステ最適化')}</nav>
                <button data-sc="close" class="btn btn-sm btn-ghost btn-square ml-auto" title="閉じる"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>`;
        veil.innerHTML = `<div class="sc-modal ${cur.page ? '' : 'modal-box max-w-[1400px] w-[96vw] max-h-[94vh] p-0 flex flex-col bg-base-200 border border-base-content/15'}">
            ${head}
            <!-- 中の枠は縮ませない（overflow-hidden のカードが枠の高さまで縮んで、下が切れてスクロールできなくなる） -->
            <div class="${cur.page ? '' : 'flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3'} flex flex-col gap-3 [&>*]:shrink-0">
                ${result && cur.live ? `<div class="flex">${actionsHTML()}</div>` : ''}
                <div class="sc-msg ${cur.msgKind}" id="sc-msg">${esc(cur.msg)}</div>
                ${result ? `<div class="card card-sm bg-base-100 border border-base-content/10 overflow-hidden"><div class="sc-body sc-resbody">
                    <div class="sc-side" id="sc-result">${resultHTML(e)}</div>
                    <div class="sc-cutpage">${cutPageHTML(e)}</div>
                </div></div>` : tabNow === 'quick' ? quickPageHTML(e) : tabNow === 'hyper' ? hyperPageHTML(e) : tabNow === 'hstat' ? hstatPageHTML(e) : `${stepsHTML(inputSteps())}
                <div id="sc-reads">${readsHTML()}</div>
                ${formHTML(e.form)}`}
            </div>
        </div>`;
        bindDrop(veil);
        if (window.lucide) lucide.createIcons();
    }
    // ページのときだけ、上部ヘッダーのタブの選択を合わせる。
    function syncNav() {
        const nav = document.getElementById('scouter-nav');
        if (!nav || !cur || !cur.page) return;
        nav.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('tab-active', b.dataset.tab === (cur.tab || 'input')));
    }
    function setTab(tab) {
        if (!cur) return;
        cur.tab = tab;
        renderModal();
    }

    // 読み取り・計算のボタン。入力・ハイパーのタブでは「読み取りの手順」カードの右に置く。
    // 結果タブには出さない（ライブ読み取り中だけ、止められるように停止ボタンを残す）。
    function actionsHTML() {
        const tab = cur.tab || 'input';
        return `<div class="ml-auto flex gap-1 shrink-0">
                ${tab !== 'result' && tab !== 'hstat' ? `<button data-sc="file" class="btn btn-sm" title="ステータス画面のスクショを読み取る（貼り付け・ドロップでも可）"><i data-lucide="image" class="w-3.5 h-3.5"></i>スクショ読み取り</button>` : ''}
                ${(tab !== 'result' && tab !== 'hstat') || cur.live ? `<button data-sc="live" class="btn btn-sm ${cur.live ? 'btn-error btn-soft' : ''}" title="ゲーム画面を共有して、ステータス画面を読み取り続ける"><i data-lucide="monitor" class="w-3.5 h-3.5"></i>${cur.live ? 'ライブ停止' : 'ライブ読み取り'}</button>` : ''}
                ${tab === 'input' ? `<button data-sc="calc" class="btn btn-sm btn-primary" ${cur.busy ? 'disabled' : ''}><i data-lucide="calculator" class="w-3.5 h-3.5"></i>${cur.busy ? '計算中…' : '計算する'}</button>` : ''}
                ${tab === 'hstat' ? `<button data-sc="xcalc" class="btn btn-sm btn-primary" ${cur.busy ? 'disabled' : ''}><i data-lucide="hexagon" class="w-3.5 h-3.5"></i>${cur.busy ? '計算中…' : 'HEXAステを計算する'}</button>` : ''}
                ${tab === 'hyper' ? `<button data-sc="hcalc" class="btn btn-sm btn-primary" ${cur.busy ? 'disabled' : ''}><i data-lucide="sliders-horizontal" class="w-3.5 h-3.5"></i>${cur.busy ? '計算中…' : 'ハイパーを計算する'}</button>` : ''}
                <input type="file" accept="image/*" multiple data-sc="input" hidden>
            </div>`;
    }

    const inp = (path, v, cls = 'w-full') => `<input class="input input-xs font-mono text-right ${num(v) ? 'font-bold' : 'text-base-content/35'} ${cls}" data-k="${path}" value="${esc(v)}" inputmode="decimal" placeholder="0">`;
    // 見出しつきのカード。count は右上の「使用 n / m」など。
    const card = (title, small, body, count) => `<section class="card card-sm bg-base-100 border border-base-content/10"><div class="card-body gap-2">
        <div class="flex items-baseline gap-2"><h3 class="font-bold text-sm text-white">${title}</h3><span class="text-[11px] text-base-content/50">${small || ''}</span>${count ? `<span class="ml-auto badge badge-sm badge-ghost">${count}</span>` : ''}</div>
        ${body}</div></section>`;
    const grid4 = (html) => `<div class="grid grid-cols-4 gap-1">${html}</div>`;

    function formHTML(f) {
        const opts = Object.entries(window.CLASS_DATA || {}).map(([g, list]) => `<optgroup label="${esc(g)}">${
            list.filter((c) => CLASSES[c.id]).map((c) => `<option value="${c.id}" ${c.id === f.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
        const statRows = [...statsOf(f.classId), ['atk', isMagic(f.classId) ? 'Magic ATT' : 'Attack Power']].map(([k, label]) => {
            const s = f[k];
            const shown = f.screen && f.screen[screenKey(k, label)];
            const fin = finalOf(s);
            const diff = shown !== undefined && shown !== null && k !== 'atk' ? (fin === shown ? 'text-success' : 'text-error') : 'text-base-content/40';
            return `<tr>
                <th class="whitespace-nowrap">${esc(label)}</th>
                <td>${inp(k + '.base', s.base)}</td><td>${inp(k + '.per', s.per)}</td><td>${inp(k + '.abs', s.abs)}</td>
                <td class="text-right font-mono font-bold tabular-nums" data-fin="${k}">${fmt(fin)}</td>
                <td class="text-right font-mono tabular-nums ${diff}" title="${diff === 'text-error' ? '入力から出した最終値と、画面の値が合いません' : ''}">${shown !== undefined && shown !== null ? fmt(shown) : '—'}</td>
            </tr>`;
        }).join('');
        const chk = (k, label) => `<label class="label text-xs text-base-content whitespace-nowrap"><input type="checkbox" class="checkbox checkbox-xs" data-k="${k}" ${f[k] ? 'checked' : ''}>${label}</label>`;
        const basic = `<div class="flex flex-col gap-1">
                <div class="flex items-center gap-3">
                    <label class="flex items-center gap-2 text-xs text-base-content/60 whitespace-nowrap">職業<select class="select select-sm w-36" data-k="classId"><option value="">選択</option>${opts}</select></label>
                    <label class="flex items-center gap-2 text-xs text-base-content/60">Lv${inp('level', f.level, 'input-sm w-16')}</label>
                </div>
                <div class="flex items-center gap-x-3 gap-y-1 flex-wrap">${chk('reboot', 'リブート（Heroic）')}${chk('genesis', 'ジェネシス解放')}${chk('destiny', 'デスティニー（最初の遺産）')}</div>
            </div>`;
        const main = f.classId ? `<div class="overflow-x-auto"><table class="table table-sm table-zebra border border-base-content/10 [&_th]:px-1.5 [&_td]:px-1.5">
                <thead><tr><th></th><th class="text-right">Base Value</th><th class="text-right">% Value</th><th class="text-right">% Not Applied</th><th class="text-right">最終値</th><th class="text-right">画面の値</th></tr></thead>
                <tbody>${statRows}</tbody>
            </table></div>` : '<p class="text-xs text-base-content/50">先に職業を選んでください。</p>';
        const filled = DETAIL.filter(([k]) => num(f[k])).length;
        const detail = `<div class="grid grid-cols-2 gap-x-6 gap-y-1">${DETAIL.map(([k, label, unit]) => `<label class="flex items-center gap-2">
                <span class="text-xs flex-1 ${num(f[k]) ? 'text-base-content/75' : 'text-base-content/40'}">${esc(label)}</span>${inp(k, f[k], 'w-20')}<span class="w-4 text-[11px] text-base-content/40">${unit}</span></label>`).join('')}</div>`;
        const links = LINKS.filter(([, , , only]) => !only || only === f.classId);
        const linkBody = grid4(links.map(([k, label, icon]) => lvTile(label, icon, 'link.' + k, f.link[k])).join(''));
        // Wild Hunter のユニオン効果は、ユニオンに置いた Wild Hunter のレベルで決まる。
        const whBody = `<div class="w-48">${tileLv(img('link/wildhunter_union.png'), 'Wild Hunter', 'wildhunterUnion', f.wildhunterUnion, 'Wild Hunter のレベル')}</div>`;
        const seedBody = `<div class="grid grid-cols-2 gap-1">${SEEDS.map(([k, label, icon]) => lvTile(label, icon, 'seed.' + k, f.seed[k])).join('')}</div>`;
        const allBuffs = BUFFS.flatMap((g) => g.items);
        const buffOn = allBuffs.filter((it) => buffIsOn(f, it)).length;
        const buffBody = BUFFS.map((g) => `<div class="text-[11px] text-base-content/50 mt-1">${esc(g.title)}</div>${grid4(g.items.map((it) => buffTile(f, it)).join(''))}`).join('');
        const note = 'ゲーム内の値は MapleScouter の前提の状態で入れます: 秘薬・外部バフ・ギルドスキルなし、リンクスキル装着（スタックなし）、シードリング装着、召喚獣（ソル・ヘカテなど）On、コンバットオーダーズ・シャープアイズ使用、ソウルゲージ初期化、ファミリア召喚。ボス戦で使うバフは「バフアイテム」で選びます。';
        return `<div class="grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-3 items-start">
            <div class="flex flex-col gap-3">
                ${card('基本・主ステータス', 'ステータス画面で STR などをクリックすると出る STAT INFO の値', basic + main)}
                ${card('詳細ステータス', '', detail, `入力済み ${filled} / ${DETAIL.length}`)}
                ${card('リンクスキル', '全キャラ共通のレベル', linkBody)}
                ${card('Wild Hunter（ユニオン）', 'Wild Hunter のレベルを入力（全キャラ共通）', whBody)}
                ${card('シードリング', 'このキャラのレベル', seedBody)}
            </div>
            <div class="flex flex-col gap-3">
                ${hexaHTML(f)}
                ${card('バフアイテム', 'ボス戦で使うもの。押すと On / Off', buffBody, `使用 ${buffOn} / ${allBuffs.length}`)}
                ${symbolHTML(f)}
                <div role="alert" class="alert alert-soft alert-info text-[11px] py-2 leading-relaxed">${esc(note)}</div>
            </div>
        </div>`;
    }
    // icon が配列のときは並べて1つのアイコンにする（Potion IV の攻撃力用・魔力用など）。
    const img = (icon) => Array.isArray(icon) ? `<span class="flex shrink-0 -space-x-1">${icon.map(img).join('')}</span>`
        : `<img class="w-6 h-6 shrink-0 object-contain" src="${ICON}${icon}" alt="" loading="lazy">`;
    // レベルを入れるタイル。0 より大きいと紫で点く。
    function tileLv(ico, label, path, v, title) {
        const on = num(v) > 0;
        return `<label class="btn btn-sm h-9 justify-start gap-2 px-1.5 font-normal ${on ? 'btn-soft btn-secondary' : 'btn-ghost border-base-content/10 [&_img]:grayscale [&_img]:opacity-50'}" title="${esc(title || label)}">
            ${ico}<span class="truncate text-xs ${on ? 'text-base-content font-semibold' : 'text-base-content/45'}">${esc(label)}</span>${inp(path, v, 'w-9 px-1 ml-auto shrink-0')}</label>`;
    }
    function lvTile(label, icon, path, v) { return tileLv(img(icon), label, path, v); }
    function buffIsOn(f, [k, , , opt = {}]) {
        const d = f.doping;
        if (opt.stat) return num(d.stat) > 0;
        if (opt.champ) return num(d[k]) > 0;
        if (opt.lv !== undefined) return num((d.nobless || [])[opt.lv]) > 0;
        return !!d[k];
    }
    function buffTile(f, [k, label, icon, opt = {}]) {
        const d = f.doping;
        if (opt.champ) {
            const ico = `<span class="relative shrink-0">${img(icon)}<span class="absolute -top-1 -left-1 px-0.5 rounded-sm bg-base-300/90 text-[8px] leading-[10px] font-bold font-mono text-base-content">${esc(opt.tag)}</span></span>`;
            return tileLv(ico, label, 'doping.' + k, d[k], `${opt.title}（0〜${opt.max}、0 で使わない）`);
        }
        if (opt.lv !== undefined || opt.stat) {
            const path = opt.stat ? 'doping.stat' : 'doping.nobless.' + opt.lv;
            const v = opt.stat ? d.stat : (d.nobless || [])[opt.lv];
            return tileLv(img(icon), label, path, v, `${label}（0〜${opt.max}、0 で使わない）`);
        }
        const on = !!d[k];
        return `<button type="button" class="btn btn-sm h-9 justify-start gap-2 px-1.5 font-normal ${on ? 'btn-soft btn-secondary' : 'btn-ghost border-base-content/10 [&_img]:grayscale [&_img]:opacity-50'}" data-sc="buff" data-key="${k}" title="${esc(label)}">
            ${img(icon)}<span class="truncate text-xs ${on ? 'text-base-content font-semibold' : 'text-base-content/45'}">${esc(label)}</span><span class="ml-auto text-[10px] font-mono font-bold ${on ? 'text-secondary' : 'text-base-content/30'}">${on ? 'ON' : 'OFF'}</span></button>`;
    }

    // オーセンティックシンボル Lv11 以上の地域。ボタンにカーソルを合わせると効くボスが出る。
    function symbolHTML(f) {
        const n = SYMBOLS.filter(([k]) => f.symbol[k]).length;
        const tiles = SYMBOLS.map(([k, region, bosses]) => {
            const on = !!f.symbol[k];
            const names = bosses.map((b) => { const m = bossOf(b); return m ? (m.short || m.ja) : b; }).join('・');
            return `<button type="button" class="btn btn-sm h-9 justify-start gap-2 px-1.5 font-normal ${on ? 'btn-soft btn-secondary' : 'btn-ghost border-base-content/10 [&_img]:grayscale [&_img]:opacity-50'}" data-sc="sym" data-key="${k}" title="${esc(`${region}（${names}）: Lv11 以上でダメージ +${SYMBOL_DMG}%`)}">
                ${img(`symbol/${k}.png`)}<span class="truncate text-xs ${on ? 'text-base-content font-semibold' : 'text-base-content/45'}">${esc(region)}</span><span class="ml-auto text-[10px] font-mono font-bold ${on ? 'text-secondary' : 'text-base-content/30'}">${on ? 'ON' : 'OFF'}</span></button>`;
        }).join('');
        return card('オーセンティックシンボル', `Lv11 以上の地域。そのボスにだけダメージ +${SYMBOL_DMG}%`, grid4(tiles), `Lv11 ${n} / ${SYMBOLS.length}`);
    }

    // HEXA。手で入れる。キャラは HEXA Tracker の今のレベルをボタンで取り込める。
    function hexaHTML(f) {
        const canImport = cur && cur.char && tracker();
        const cls = hexaClass(f.classId);
        const used = HEXA_KEYS.filter(([, k]) => num(f.hexa[k]) > 0).length;
        const tiles = HEXA_KEYS.map(([hk, k, label]) => {
            const s = cls && cls.skills.find((x) => x.key === hk);
            const ico = s && s.icon ? `<img class="w-6 h-6 shrink-0 object-contain" src="assets/hexa_icons/gms/${esc(s.icon)}.png" alt="" loading="lazy">`
                : `<span class="w-6 h-6 shrink-0 grid place-items-center border border-base-content/20 text-[10px] font-bold">${esc(label.slice(0, 2))}</span>`;
            return tileLv(ico, label, 'hexa.' + k, f.hexa[k], s ? s.name : label);
        }).join('');
        const imp = canImport ? '<button data-sc="hexa" class="btn btn-xs"><i data-lucide="download" class="w-3 h-3"></i>HEXA Tracker から取り込む</button>' : '';
        return card('HEXA', 'レベル', (imp ? `<div>${imp}</div>` : '') + grid4(tiles), `使用 ${used} / ${HEXA_KEYS.length}`);
    }
    /* ---------- ハイパーステータス ---------- */
    const hyperLv = (f) => Object.fromEntries(HYPER_KEYS.map((k) => [k, num(f.hyper && f.hyper[k])]));
    const hyperTotal = (f) => (HY() && num(f.level) >= 140 ? HY().pointsAt(f.level) : 0);
    const effText = (k, lv) => {
        const it = HY() && HY().ITEMS.find((x) => x.key === k);
        return it && it.eff && lv ? `+${it.eff(lv)}${it.unit}` : '';
    };
    // ハイパー最適化タブ。
    function hyperPageHTML(e) {
        const f = e.form, o = e.hyperOpt, H = HY();
        const cls = CLASSES[f.classId];
        if (!H) return '<div class="sc-res-empty">読み込み中です。</div>';
        const total = hyperTotal(f);
        const now = hyperLv(f);
        const used = H.costOf(now);
        // 計算できないときは、今のレベルの入力だけ出す（理由は右の枠に）。
        const why = !cls || !num(f.main.base) || !num(f.atk.base) ? '「入力」で職業と主ステータス・攻撃力の内訳を入れると、一番伸びる振り方が出ます。'
            : !total ? '「入力」で Lv を入れてください（所持ポイントを Lv から出します）。' : '';
        // 結果は「ハイパーを計算する」を押したときのもの。そのあと入力や条件が変わったら古い印を出す。
        const run = e.hyperRun || null;
        const r = run && run.levels ? run : null;
        const stale = !!run && run.sig !== hyperSig(e);
        const err = why || (run && run.error) || '';
        const left = num(f.hyperPoint);
        const mismatch = f.hyperPoint !== '' && total && used + left !== total
            ? `<p class="text-[11px] text-warning">画面の残り ${fmt(left)}pt と合いません（Lv${esc(f.level)} の所持 ${fmt(total)}pt − 使用 ${fmt(used)}pt = ${fmt(total - used)}pt）。Lv かレベルの読み取りを確かめてください。</p>` : '';
        const opts = (v) => Array.from({ length: 16 }, (_, i) => `<option value="${i}" ${i === v ? 'selected' : ''}>${i}</option>`).join('');
        const pct = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
        const crLv = hyperCrLv(e);
        const rows = HYPER_KEYS.map((k) => {
            const a = now[k], b = r ? (r.levels[k] || 0) : null, d = r ? b - a : 0;
            const lockOn = !!o.locked[k];
            // クリティカル率は条件で決めた Lv に固定（固定ボタンは出さない）。
            const lockCell = k === 'cr'
                ? `<span class="btn btn-xs btn-square btn-warning btn-soft pointer-events-none" title="条件の「クリティカル率に振る Lv」で固定"><i data-lucide="lock" class="w-3 h-3"></i></span>`
                : `<button data-sc="hlock" data-key="${k}" class="btn btn-xs btn-square ${lockOn ? 'btn-warning btn-soft' : 'btn-ghost text-base-content/30'}" title="${lockOn ? '固定を外す' : '今のレベルで固定する'}"><i data-lucide="${lockOn ? 'lock' : 'lock-open'}" class="w-3 h-3"></i></button>`;
            return `<tr class="${d ? 'sc-hy-chg' : ''}">
                <th><span class="text-base-content/85" title="${esc(H.ITEMS.find((x) => x.key === k).name)}">${esc(HYPER_JA[k])}</span></th>
                <td class="text-right whitespace-nowrap"><select class="select select-xs w-14 font-mono ${a ? 'font-bold' : 'text-base-content/35'}" data-k="hyper.${k}">${opts(a)}</select><small>${esc(effText(k, a))}</small></td>
                <td class="font-mono text-right font-bold ${b ? 'text-white' : 'text-base-content/30'}">${r ? b : '—'}<small>${r ? esc(effText(k, b)) : ''}</small></td>
                <td class="font-mono text-right ${d > 0 ? 'text-success font-bold' : d < 0 ? 'text-error font-bold' : 'text-base-content/25'}">${d > 0 ? '+' + d : d < 0 ? d : '·'}</td>
                <td class="font-mono text-right text-base-content/60">${r ? fmt(H.CUM[b]) : ''}</td>
                <td class="text-center">${lockCell}</td>
            </tr>`;
        }).join('');
        const same = r && HYPER_KEYS.every((k) => (r.levels[k] || 0) === now[k]);
        const chk = r && r.check ? r.check : null;
        // 伸びは最終ダメージで出す。MapleScouter の HEXA 込みダメージ（calculatedHexaDamage）の比が取れたらそれ、
        // 取れるまで・取れなかったときは手元の計算（scouter_hyper.js）の見込み。
        const fd = (a, b) => a > 0 && b > 0 ? b / a - 1 : null;
        const api380 = chk && !chk.error ? fd(chk.nowD380, chk.newD380) : null;
        const useApi = api380 !== null;
        const g380 = useApi ? api380 : r && r.gain380;
        const srcNote = !r || same ? '' : useApi
            ? `<p class="text-[11px] text-base-content/50">${ENGINE_NAME} で今とおすすめのダメージを出した比です（6次スキルの進捗込み）。手元の見込みは ${esc(pct(r.gain380))}。</p>`
            : chk && chk.error ? `<p class="text-xs text-error">${esc(chk.error)}</p><p class="text-[11px] text-base-content/50">上は手元の計算の見込みです。</p>`
            : chk && chk.nowError ? `<p class="text-[11px] text-warning">今の振り方は ${ENGINE_NAME} で計算できませんでした（${esc(chk.nowError.replace(/^\S+ が計算できませんでした: /, ''))}）。上は手元の計算の見込みです。</p>`
            : chk ? `<p class="text-[11px] text-base-content/50">手元の計算の見込みです。もう一度「ハイパーを計算する」を押すと ${ENGINE_NAME} の値になります。</p>`
            : `<p class="text-[11px] text-base-content/50">${ENGINE_NAME} で確かめています。いま出ているのは手元の計算の見込みです。</p>`;
        const staleNote = stale ? '<p class="text-[11px] text-warning">計算したあとに入力や条件が変わりました。もう一度「ハイパーを計算する」を押してください。</p>' : '';
        const effNote = r && !r.byEff ? '<p class="text-[11px] text-warning">「入力」で一度「計算する」をしてから押すと、計算元のスペック効率で振り方を選びます（今は手元の式で、防御率無視を高めに見ています）。</p>' : '';
        const gainBox = r && !why ? card('伸び', same ? '今の振り方が一番です' : '今の振り方と比べた最終ダメージ', `
                    ${staleNote}
                    <div class="sc-big"><span>最終ダメージ（ボス防御率 380%）</span><b>${pct(g380)}</b></div>
                    ${srcNote}${effNote}`)
            : card('伸び', '', `<div class="sc-res-empty ${err && !why ? 'sc-err' : ''}">${esc(err || '上の「ハイパーを計算する」を押すと、一番伸びる振り方と、最終ダメージが何％上がるかが出ます。')}</div>${err && !why ? '' : staleNote}`);
        return `${stepsHTML(['hyper'])}
            <div id="sc-reads">${readsHTML()}</div>
            <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] gap-3 items-start">
            ${card('ハイパーステータス', '「今」に今のレベルを入れると、ボス相手のダメージが一番伸びる振り方を出します', `<div class="overflow-x-auto"><table class="table table-sm table-zebra sc-hytbl border border-base-content/10">
                <thead><tr><th></th><th class="text-right">今</th><th class="text-right">おすすめ</th><th class="text-right">差</th><th class="text-right">pt</th><th class="text-center">固定</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr><th>合計</th><td class="text-right font-mono">${fmt(used)}pt</td><td class="text-right font-mono font-bold text-white">${r ? fmt(r.used) + 'pt' : ''}</td><td></td><td class="text-right font-mono text-base-content/60">${total ? fmt(total) + 'pt 中' : ''}</td><td></td></tr></tfoot>
            </table></div>${mismatch}`)}
            <div class="flex flex-col gap-3">
                ${gainBox}
                ${card('条件', '', `<div class="flex flex-col gap-2 text-xs">
                    <label class="flex items-center gap-2"><span class="w-40 text-base-content/60">クリティカル率に振る Lv</span><select class="select select-xs w-14 font-mono font-bold" data-ho="crLv">${opts(crLv)}</select><small class="text-base-content/50">${esc(effText('cr', crLv) || '+0%')}</small></label>
                    <p class="text-[11px] text-base-content/50 leading-relaxed">ダメージにかからない項目（一般モンスターダメージ・獲得経験値・アーケインフォースなど）は固定しない限り 0 にします。${total ? `所持ポイントは Lv${esc(f.level)} から出しています（${fmt(total)}pt）。` : ''}</p>
                </div>`)}
            </div>
        </div>`;
    }
    function toggleLock(k) {
        const L = cur.e.hyperOpt.locked;
        if (L[k]) delete L[k]; else L[k] = true;
        save(); renderModal();
    }

    /* ---------- HEXAステータス ---------- */
    const HSTAT_SLOTS = [['main', 'メイン'], ['a1', '追加1'], ['a2', '追加2']];
    const CORE_NAME = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    const CORE_LOCKED = 3;   // IV〜VI はまだ解放されていないので、枠だけグレーで出す（bi 指定 2026-11-01）
    // その枠の値（メインは表の累計、追加は Lv × 1Lv分）。
    const hstatVal = (slot, t, lv) => { const X = HX(); return !X || !t ? 0 : slot === 'main' ? X.mainVal(t, lv) : X.addVal(t, lv); };
    // HEXAステ最適化タブ。Lv は今のまま、各枠の種類だけ選び直したときに一番伸びる置き方を出す（bi 指定）。
    function hstatPageHTML(e) {
        const f = e.form, X = HX();
        const cls = CLASSES[f.classId];
        if (!X) return '<div class="sc-res-empty">読み込み中です。</div>';
        const why = !cls || !num(f.main.base) || !num(f.atk.base) ? '「入力」で職業と主ステータス・攻撃力の内訳を入れると、一番伸びる置き方が出ます。' : '';
        const run = e.hstatRun || null;
        const r = run && run.nodes ? run : null;
        const stale = !!run && run.sig !== hstatSig(e);
        const bad = X.check(f.hexaStat);
        const err = why || (run && run.error) || '';
        const pct = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
        const typeSel = (path, v) => `<select class="select select-xs w-44 ${v ? 'font-bold' : 'text-base-content/35'}" data-k="${path}"><option value="">—</option>${
            X.TYPES.map((t) => `<option value="${t}" ${t === v ? 'selected' : ''}>${esc(X.NAME[t])}</option>`).join('')}</select>`;
        const lvSel = (path, v) => `<select class="select select-xs w-14 font-mono ${num(v) ? 'font-bold' : 'text-base-content/35'}" data-k="${path}">${
            Array.from({ length: X.MAX_LV + 1 }, (_, i) => `<option value="${i}" ${i === num(v) ? 'selected' : ''}>${i}</option>`).join('')}</select>`;
        const rows = f.hexaStat.map((n, i) => {
            const on = X.created(n);
            const rec = r && r.nodes[i];
            return HSTAT_SLOTS.map(([slot, label], j) => {
                const t = n[slot], lv = n[slot + 'Lv'];
                const rt = rec ? rec[slot] : '';
                const chg = rec && rt !== t;
                return `<tr class="${chg ? 'sc-hy-chg' : ''} ${j === 2 ? 'sc-hx-end' : ''}">
                    ${j === 0 ? `<th rowspan="3" class="sc-hx-core ${on ? 'text-white' : 'text-base-content/30'}">${CORE_NAME[i]}</th>` : ''}
                    <td class="whitespace-nowrap ${slot === 'main' ? 'font-bold text-base-content/85' : 'text-base-content/60'}">${label}</td>
                    <td class="whitespace-nowrap">${typeSel(`hexaStat.${i}.${slot}`, t)} ${lvSel(`hexaStat.${i}.${slot}Lv`, lv)}<small>${esc(on ? X.valText(t, hstatVal(slot, t, lv)) : '')}</small></td>
                    <td class="whitespace-nowrap ${chg ? 'text-white font-bold' : rec ? 'text-base-content/45' : 'text-base-content/25'}">${rec ? esc(X.NAME[rt]) : '—'}<small>${rec ? esc(X.valText(rt, hstatVal(slot, rt, lv))) : ''}</small></td>
                </tr>`;
            }).join('');
        }).join('') + CORE_NAME.slice(CORE_LOCKED).map((name, k) => HSTAT_SLOTS.map(([, label], j) => `<tr class="sc-hx-lock ${j === 2 && k < CORE_NAME.length - CORE_LOCKED - 1 ? 'sc-hx-end' : ''}" title="まだ解放されていません">
                    ${j === 0 ? `<th rowspan="3" class="sc-hx-core">${name}<i data-lucide="lock" class="w-3 h-3 mx-auto mt-1"></i></th>` : ''}
                    <td class="whitespace-nowrap">${label}</td>
                    <td class="whitespace-nowrap"><select class="select select-xs w-44" disabled><option>—</option></select> <select class="select select-xs w-14" disabled><option>0</option></select><small></small></td>
                    <td>—</td>
                </tr>`).join('')).join('');
        const same = r && !r.changed;
        const chk = r && r.check ? r.check : null;
        // 伸びは最終ダメージ。計算元の HEXA 込みダメージの比が取れたらそれ、取れるまでは手元の計算の見込み。
        const fd = (a, b) => a > 0 && b > 0 ? b / a - 1 : null;
        const api380 = chk && !chk.error ? fd(chk.nowD380, chk.newD380) : null;
        const useApi = api380 !== null;
        const g380 = useApi ? api380 : r && r.gain380;
        const srcNote = !r || same ? '' : useApi
            ? `<p class="text-[11px] text-base-content/50">${ENGINE_NAME} で今とおすすめのダメージを出した比です。手元の見込みは ${esc(pct(r.gain380))}。</p>`
            : chk && chk.error ? `<p class="text-xs text-error">${esc(chk.error)}</p><p class="text-[11px] text-base-content/50">上は手元の計算の見込みです。</p>`
            : chk && chk.nowError ? `<p class="text-[11px] text-warning">今の置き方は ${ENGINE_NAME} で計算できませんでした（${esc(chk.nowError)}）。上は手元の計算の見込みです。</p>`
            : `<p class="text-[11px] text-base-content/50">${ENGINE_NAME} で確かめています。いま出ているのは手元の計算の見込みです。</p>`;
        const staleNote = stale ? '<p class="text-[11px] text-warning">計算したあとに入力や条件が変わりました。もう一度「HEXAステを計算する」を押してください。</p>' : '';
        // 置き方は計算元のスペック効率で選ぶ。まだ「計算する」をしていないと手元の式になり、防御率無視を高く見がち。
        const effNote = r && !r.byEff ? '<p class="text-[11px] text-warning">「入力」で一度「計算する」をしてから押すと、計算元のスペック効率で置き方を選びます（今は手元の式で、防御率無視を高めに見ています）。</p>' : '';
        const gainBox = r && !why ? card('伸び', same ? '今の置き方が一番です' : `選び直すコア ${r.changed} 個`, `
                    ${staleNote}
                    <div class="sc-big"><span>最終ダメージ（ボス防御率 380%）</span><b>${pct(g380)}</b></div>
                    ${srcNote}${effNote}`)
            : card('伸び', '', `<div class="sc-res-empty ${err && !why ? 'sc-err' : ''}">${esc(err || '「HEXAステを計算する」を押すと、一番伸びる置き方と、最終ダメージが何％上がるかが出ます。')}</div>${err && !why ? '' : staleNote}`);
        return `<div class="flex">${actionsHTML()}</div>
            <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] gap-3 items-start">
            ${card('HEXAステータス', '', `<div class="overflow-x-auto"><table class="table table-sm sc-hytbl sc-hxtbl border border-base-content/10">
                <thead><tr><th>コア</th><th></th><th>今（種類・Lv）</th><th>おすすめ</th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>${bad ? `<p class="text-[11px] text-warning">${esc(bad)}</p>` : ''}`)}
            <div class="flex flex-col gap-3">
                ${gainBox}
            </div>
        </div>`;
    }
    function hstatSig(e) {
        const f = e.form;
        return JSON.stringify([f.classId, f.main, f.sub, f.sub2, f.atk, f.dmg, f.bossDmg, f.ignoreDef, f.critical, f.criticalDmg,
            f.hexaStat, e.result && e.result.at]);
    }
    // 「HEXAステを計算する」: 置き方の探索は手元だけ。計算元に送るのは今とおすすめの2回だけ（今が一番なら送らない）。
    async function runHexaStat() {
        if (!cur || cur.busy) return;
        const e = cur.e, f = e.form, X = HX(), cls = CLASSES[f.classId];
        if (!X) return;
        if (!cls || !num(f.main.base) || !num(f.atk.base)) { setMsg('「入力」で職業・主ステータスと攻撃力の内訳を入れてください。', 'err'); return; }
        const sig = hstatSig(e), at = new Date().toISOString();
        const r = X.optimize(f, cls, f.classId, f.hexaStat, { pdr: 380, critBuff: 0, eff: e.result && e.result.eff });
        if (r.error) { e.hstatRun = { sig, at, error: r.error }; save(); renderModal(); return; }
        e.hstatRun = { nodes: r.nodes, changed: r.changed, gain300: r.gain300, gain380: r.gain380, byEff: r.byEff, sig, at, pdr: 380, check: null };
        if (!r.changed) { save(); renderModal(); setMsg('今の置き方が一番です。', 'ok'); return; }
        const st = X.shift(f, cls, f.classId, X.sumOf(f.hexaStat), X.sumOf(r.nodes));
        // 今のHEXAステ分を差し引くと入力の値を下回る（入力の内訳とHEXAステの入力が合っていない）なら、計算元には送らない。
        const neg = [['main', '主ステ'], ['sub', '副ステ'], ['sub2', '第3ステ'], ['atk', isMagic(f.classId) ? '魔力' : '攻撃力']]
            .find(([k]) => st[k].base < 0 || st[k].abs < 0);
        if (neg) {
            e.hstatRun.check = { error: `入力の${neg[1]}の内訳より今のHEXAステの${neg[1]}の方が大きくなっています。「入力」の${neg[1]}の Base Value・% Value Not Applied と、HEXAステの種類・Lv を確かめてください。` };
            save(); renderModal(); return;
        }
        const g = JSON.parse(JSON.stringify(f));
        for (const k of ['main', 'sub', 'sub2', 'atk']) g[k] = { base: String(st[k].base), per: String(st[k].per), abs: String(Math.round(st[k].abs)) };
        for (const k of ['dmg', 'bossDmg', 'criticalDmg']) g[k] = String(Math.round(st[k] * 100) / 100);
        g.ignoreDef = String(Math.round(st.ignoreDef * 1e4) / 1e4);
        const run = e.hstatRun;
        cur.busy = true;
        renderModal();
        setMsg(`${ENGINE_NAME} で最終ダメージを確かめています…`);
        const mine = cur;
        try {
            const [a, b] = await Promise.allSettled([calcForm(f), calcForm(g)]);
            if (b.status === 'rejected') throw b.reason;
            const A = a.status === 'fulfilled' ? a.value : {};
            run.check = { nowD300: A.calculatedHexaDamage_300, nowD380: A.calculatedHexaDamage_380, newD300: b.value.calculatedHexaDamage_300, newD380: b.value.calculatedHexaDamage_380,
                nowError: a.status === 'rejected' ? String(a.reason && a.reason.message || a.reason) : '' };
            if (cur === mine) setMsg('計算しました。', 'ok');
        } catch (err) {
            run.check = { error: `${ENGINE_NAME} の計算に失敗しました: ` + (err && err.message || err) };
            if (cur === mine) setMsg('', '');
        } finally {
            save();
            if (cur === mine) { cur.busy = false; renderModal(); }
        }
    }

    // 計算元に送って、MapleScouter の calculatedData の形で受け取る。
    async function calcForm(f) {
        if (ENGINE === 'kinoko') {
            if (typeof scouterKinoko === 'undefined') throw new Error('計算の部品を読み込めませんでした');
            return scouterKinoko.calculate(f, CLASSES[f.classId], isMagic(f.classId));
        }
        return postCalc(buildUserStat(f));
    }
    async function postCalc(us) {
        const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userStat: us }) });
        const out = await res.json().catch(() => null);
        if (!res.ok || !out || !out.calculatedData) throw new Error((out && out.error) || `HTTP ${res.status}`);
        const d = out.calculatedData;
        const bad = [d.boss300_stat, d.boss300_hexaStat].find((v) => typeof v === 'number' && v < 0);
        if (bad !== undefined) throw new Error(`MapleScouter が計算できませんでした: ${ERRORS[String(bad)] || 'コード ' + bad}`);
        return d;
    }
    // 計算に効く入力と条件（変わったら結果を古い扱いにする）。
    function hyperSig(e) {
        const f = e.form, o = e.hyperOpt;
        return JSON.stringify([f.classId, f.level, f.main, f.sub, f.sub2, f.atk, f.dmg, f.bossDmg, f.ignoreDef, f.critical, f.criticalDmg,
            hyperLv(f), o.locked, hyperCrLv(e), e.result && e.result.at]);
    }
    // ハイパーでクリティカル率に振る Lv（条件で決める。未設定なら今の Lv）。
    function hyperCrLv(e) {
        const v = e.hyperOpt && e.hyperOpt.crLv;
        return v === '' || v === undefined ? num(e.form.hyper && e.form.hyper.cr) : Math.max(0, Math.min(15, Math.floor(num(v))));
    }
    // 「ハイパーを計算する」: 一番伸びる振り方を出し、今とおすすめを計算元に投げて最終ダメージの比を出す。
    async function runHyper() {
        if (!cur || cur.busy) return;
        const e = cur.e, f = e.form, o = e.hyperOpt, H = HY(), cls = CLASSES[f.classId];
        if (!H) return;
        const total = hyperTotal(f);
        if (!cls || !num(f.main.base) || !num(f.atk.base) || !total) { setMsg('「入力」で職業・Lv・主ステータスと攻撃力の内訳を入れてください。', 'err'); return; }
        const now = hyperLv(f);
        const sig = hyperSig(e), at = new Date().toISOString();
        const r = H.optimize(f, cls, f.classId, now, { total, locked: o.locked, fixed: { cr: hyperCrLv(e) }, pdr: 380, critBuff: 0, eff: e.result && e.result.eff });
        if (!r) { e.hyperRun = { sig, at, error: 'クリティカル率と固定した項目だけで所持ポイントを超えています。Lv か固定を見直してください。' }; save(); renderModal(); return; }
        e.hyperRun = { ...r, sig, at, pdr: 380, check: null };
        if (HYPER_KEYS.every((k) => (r.levels[k] || 0) === now[k])) { save(); renderModal(); setMsg('今の振り方が一番です。', 'ok'); return; }
        const st = H.shift(f, cls, now, r.levels);
        const g = JSON.parse(JSON.stringify(f));
        for (const k of ['main', 'sub', 'sub2', 'atk']) g[k] = { base: String(st[k].base), per: String(st[k].per), abs: String(st[k].abs) };
        for (const k of ['dmg', 'bossDmg', 'criticalDmg', 'critical']) g[k] = String(st[k]);
        g.ignoreDef = String(Math.round(st.ignoreDef * 1e4) / 1e4);
        const run = e.hyperRun;
        cur.busy = true;
        renderModal();
        setMsg(`${ENGINE_NAME} で最終ダメージを確かめています…`);
        const mine = cur;
        try {
            // 今の振り方はクリティカル率が足りず先方が計算できないことがある。おすすめだけでも出す。
            const [a, b] = await Promise.allSettled([calcForm(f), calcForm(g)]);
            if (b.status === 'rejected') throw b.reason;
            const A = a.status === 'fulfilled' ? a.value : {};
            run.check = { nowD300: A.calculatedHexaDamage_300, nowD380: A.calculatedHexaDamage_380, newD300: b.value.calculatedHexaDamage_300, newD380: b.value.calculatedHexaDamage_380,
                nowError: a.status === 'rejected' ? String(a.reason && a.reason.message || a.reason) : '' };
            if (cur === mine) setMsg('計算しました。', 'ok');
        } catch (err) {
            run.check = { error: `${ENGINE_NAME} の計算に失敗しました: ` + (err && err.message || err) };
            if (cur === mine) setMsg('', '');
        } finally {
            save();
            if (cur === mine) { cur.busy = false; renderModal(); }
        }
    }

    const screenKey = (k, label) => k === 'atk' ? (label === 'Magic ATT' ? 'matt' : 'att') : label.toLowerCase();

    /* ---------- ボスカット ---------- */
    // 計算のときに出して結果と一緒に保存する（先方の応答そのものは大きいので持たない）。
    function bossCuts(d, us) {
        if (typeof scouterBossCut === 'undefined') return null;
        try {
            const out = scouterBossCut.computeBossCuts(d, us);
            if (out.error) return null;
            return out.rows.map((x) => ({ b: x.boss, n: x.name, d: x.difficulty, s: x.bossStat, r: Math.round(x.clearRate * 1e4) / 1e4, p: x.isPartyBoss ? 1 : 0, l: x.partyLimit, v: x.label, ...(x.estimate ? { e: 1 } : {}) }));
        } catch (err) { console.error(err); return null; }
    }
    const CUT_LABEL = {
        '솔플 여유컷': ['ソロ余裕', 'c-solo2'], '솔플 가능': ['ソロ可', 'c-solo1'], '솔플 최소컷': ['ソロ最低', 'c-solo0'],
        '파티격 가능': ['パーティー可', 'c-pt1'], '파티 최소컷': ['パーティー最低', 'c-pt0'],
        '2인 최소컷': ['2人最低', 'c-pt1'], '3인 최소컷': ['3人最低', 'c-pt1'], '4인 최소컷': ['4人最低', 'c-pt0'],
        '6인 최소컷': ['6人最低', 'c-pt0'], '불가능': ['不可', 'c-no'], '입장 불가능': ['Lv不足', 'c-no'],
    };
    const DIFF_NAME = { Easy: 'Easy', Normal: 'Normal', Hard: 'Hard', Chaos: 'Chaos', Extreme: 'Extreme', Destiny: 'Destiny', Champion: 'Champion' };
    function bossOf(ko) {
        const list = window.BOSS_MASTER || [];
        const k = ko === '가엔슬' ? '가디언 엔젤 슬라임' : ko;
        return list.find((b) => b.ko && (b.ko === k || b.ko.endsWith(' ' + k))) || null;
    }
    const CUT_HIDE = 5;
    const pctText = (r) => { const p = r * 100; return (p >= 1000 ? Math.round(p).toLocaleString() : p >= 100 ? p.toFixed(1) : p.toFixed(2)) + '%'; };
    // 列。Hard と Chaos は同じ列（Character Manager の編集画面と同じ）。Destiny・Champion は右端（bi 指定）。
    const CUT_COLS = [['Easy'], ['Normal'], ['Hard', 'Chaos'], ['Extreme'], ['Destiny'], ['Champion']];
    // ボスの並びは CUT_ORDER（bi 指定）。それ以外は暗黒の魔法使いの下に Character Manager の編集画面の順（BOSS_REGISTER_ORDER）で。
    const CUT_ORDER = ["Jupiter", "Baldrix", "Bellona", "Malefic Star", "Limbo", "First Adversary", "Kaling", "Kalos the Guardian",
        "Chosen Seren", "Lotus", "Black Mage"];
    function cutRows(cuts) {
        const order = [...CUT_ORDER, ...(window.BOSS_REGISTER_ORDER || []).filter((en) => !CUT_ORDER.includes(en))];
        const by = {};
        for (const c of cuts) {
            if (c.r > CUT_HIDE) continue;   // 楽すぎるもの（500%超）は出さない（bi 指定）
            (by[c.b] = by[c.b] || []).push(c);
        }
        const rank = (ko) => { const b = bossOf(ko); const i = b ? order.indexOf(b.en) : -1; return i < 0 ? 99 : i; };
        return Object.keys(by).sort((x, y) => rank(x) - rank(y)).map((ko) => ({ ko, boss: bossOf(ko), cuts: by[ko] }));
    }
    // シンボルが効いているボスの名前の横に、その地域のシンボルを出す。
    function symbolMark(ko) {
        const s = SYMBOLS.find(([, , b]) => b.includes(ko));
        return s ? `<img class="sc-bc-sym" src="${ICON}symbol/${s[0]}.png" alt="" title="${esc(s[1])} シンボル Lv11（ダメージ +${SYMBOL_DMG}%）">` : '';
    }
    function cutCell(c) {
        if (!c) return '<td class="sc-bc-none"></td>';
        const [txt, cls] = CUT_LABEL[c.v] || [c.v, 'c-no'];
        const bar = Math.max(0, Math.min(100, c.r / (c.p ? 5.1 : 2) * 100));
        return `<td class="sc-bc ${cls}" title="${esc(DIFF_NAME[c.d] || c.d)}: ボスカットに対して ${pctText(c.r)}${c.p ? '（パーティ前提のボス。最大' + c.l + '人）' : ''}${c.e ? '（GMS の値が無いので推測値）' : ''}">
            <div class="sc-bc-in">
                <span class="sc-bc-ic"><img src="${ICON}boss/${esc(c.d.toLowerCase())}_${esc(c.n)}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">${c.p ? '<i>PT</i>' : ''}${c.e ? '<i class="sc-bc-est">推測</i>' : ''}<small class="df-${esc(c.d.toLowerCase())}">${esc(DIFF_NAME[c.d] || c.d)}</small></span>
                <span class="sc-bc-t"><b>${pctText(c.r)}</b><em>${esc(txt)}</em></span>
            </div>
            <span class="sc-bc-bar"><span style="width:${bar.toFixed(1)}%"></span></span>
        </td>`;
    }
    // 実測補正（bi 指定）: EXスウのソロ実測タイムから火力の倍率を出し、全ボスの％に一律で掛ける。
    // ％は火力に比例し、EXスウ 100% で制限時間（20分。20分化の前は 30分）、時間は火力に反比例とみる
    // （20分なら 200% で 10分。5分で倒せたら 400% 扱い）。
    // 倍率は保存して、再計算したあとも掛け続ける（ずれは職業ごとの計算の癖なので、装備が変わってもほぼ同じ）。
    // 掛けるかどうかはトグル（on）で切り替える。時間は残したまま外せる（bi 指定）。
    // GMS v.272（2026-11-11）のボス20分化: 主要ボスの HP が 3分の2、制限時間が 30分 → 20分。
    // 切り替えはメンテ明け（2026-11-12 0:00 JST ごろ、Party Scouter の LIMIT_SWITCH と同じ）。
    // それより前に測った時間は、切り替え後に開いたとき 3分の2 に換算して置き換える（bi 決定、migrate20）。
    // 倍率（calib.scale）は 30分÷(率×T) = 20分÷(率×T×2/3) で変わらないので、そのまま使う。
    const LIMIT_SWITCH = Date.parse('2026-11-11T15:00:00Z');
    const CALIB_MIN = Date.now() >= LIMIT_SWITCH ? 20 : 30;
    function migrate20(e) {
        if (CALIB_MIN !== 20) return false;
        let changed = false;
        for (const x of [e.calib, e.quick]) {
            if (!x || !(x.min > 0) || x.m20 || Date.parse(x.at) >= LIMIT_SWITCH) continue;
            x.min = x.min * 2 / 3;
            x.m20 = 1;
            changed = true;
        }
        return changed;
    }
    const calibBase = (cuts) => (cuts || []).find((c) => c.b === '스우' && c.d === 'Extreme') || null;
    // シンボルのダメージ +20% で火力が何倍になるか。ダメージは足し算なので、ダメージ 1% の伸び（スペック効率）の 20 倍。
    // スペック効率が無い古い結果は画面の値から出す（+18 は計算元の補正、scouter_kinoko.js の DMG_FIX）。
    function symbolFactor(e) {
        const eff = e.result && e.result.eff && e.result.eff.dmgeff1;
        if (eff > 0) return 1 + SYMBOL_DMG * eff;
        const f = e.form || {};
        return 1 + SYMBOL_DMG / (100 + 18 + num(f.dmg) + num(f.bossDmg));
    }
    const symbolBosses = (f) => new Set(SYMBOLS.filter(([k]) => f.symbol && f.symbol[k]).flatMap(([, , b]) => b));
    // ボスカットにシンボルを反映する。％は火力に比例するので、そのボスだけ倍率を掛けて判定を付け直す（Lv不足はそのまま）。
    // symAll は以前の「全ボス +20%」で出した結果。シンボル外（または Lv11 にしていない地域）のボスから外す。
    function symbolCuts(e) {
        const cuts = e.result && e.result.cuts;
        if (!cuts || typeof scouterBossCut === 'undefined') return cuts;
        const on = symbolBosses(e.form), all = !!e.result.symAll;
        if (!on.size && !all) return cuts;
        const k = symbolFactor(e);
        return cuts.map((c) => {
            const m = (on.has(c.b) ? k : 1) / (all ? k : 1);
            const sym = on.has(c.b) ? { sym: 1 } : {};
            if (m === 1) return { ...c, ...sym };
            const r = c.r * m;
            return { ...c, ...sym, r, v: c.v === '입장 불가능' ? c.v : scouterBossCut.verdict(r, !!c.p, c.l) };
        });
    }
    // 時間は秒数で入れる（コロンは打ちにくいので、bi 指定）。「630」→ 10.5分。読めなければ null。保存は分（calib.min）。
    function parseSeconds(s) {
        const t = String(s || '').trim().replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/秒$/, '');
        if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
        const sec = Number(t);
        return sec > 0 ? sec / 60 : null;
    }
    const fmtSeconds = (min) => String(Math.round(min * 60));
    const fmtMinutes = (min) => { const sec = Math.round(min * 60); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
    // 表に出す％と判定。シンボルを反映してから、補正があれば倍率を掛けて判定を付け直す（Lv不足はそのまま）。
    function shownCuts(e) {
        const cuts = symbolCuts(e);
        const k = e.calib && e.calib.on && e.calib.scale;
        if (!cuts || !k || typeof scouterBossCut === 'undefined') return cuts;
        return cuts.map((c) => {
            const r = c.r * k;
            return { ...c, r, v: c.v === '입장 불가능' ? c.v : scouterBossCut.verdict(r, !!c.p, c.l) };
        });
    }
    function setCalib(text) {
        const e = cur.e;
        const base = calibBase(symbolCuts(e));
        const min = parseSeconds(text);
        if (!String(text || '').trim()) delete e.calib;
        else if (!min) { setMsg('時間は秒数で入れてください（例 10分30秒なら 630）。', 'err'); return; }
        else if (!base || !(base.r > 0)) { setMsg('EXスウのボスカットが無いので補正できません。', 'err'); return; }
        else e.calib = { min, scale: CALIB_MIN / base.r / min, at: new Date().toISOString(), on: e.calib ? e.calib.on : true };
        save();
        renderModal();
    }
    function calibHTML(e) {
        const base = calibBase(symbolCuts(e));
        if (!base || !(base.r > 0)) return '';
        const c = e.calib, on = !!(c && c.on);
        return `<div class="sc-calib ${on ? 'on' : ''}">
                <label class="sc-calib-sw" title="${c ? '補正を掛ける／外す' : '先に EXスウの時間を入れてください'}"><input type="checkbox" data-sc="calibon" class="toggle toggle-xs toggle-warning" ${on ? 'checked' : ''} ${c ? '' : 'disabled'}><span class="sc-calib-tag">実測補正</span></label>
                <span class="sc-calib-l">EXスウ ソロ</span>
                <input data-sc="calib" inputmode="numeric" class="input input-xs w-20 font-mono text-center" value="${c ? fmtSeconds(c.min) : ''}" placeholder="秒" title="EXスウをソロで倒した時間を秒数で（例 10分30秒なら 630）">
                <span class="sc-calib-p">${c ? `秒（${fmtMinutes(c.min)}）` : '秒'}</span>
                <span class="sc-calib-p">計算上 <b>${fmtSeconds(CALIB_MIN / base.r)}</b>秒（${fmtMinutes(CALIB_MIN / base.r)}）</span>
                ${c ? `<b class="sc-calib-x">×${c.scale.toFixed(2)}</b>${on ? `<span class="sc-calib-p">EXスウ ${pctText(base.r)} → <b>${pctText(base.r * c.scale)}</b></span>` : ''}` : ''}
            </div>`;
    }
    const CUT_LEGEND = [['c-solo2', 'ソロ余裕'], ['c-solo1', 'ソロ可'], ['c-solo0', 'ソロ最低'], ['c-pt1', 'パーティー可'], ['c-pt0', 'パーティー最低'], ['c-no', '不可']];
    function cutPageHTML(e) {
        const r = e.result;
        if (!r || r.error) return '';
        if (!r.cuts) return `<div class="sc-res-empty">もう一度「計算する」を押すと出ます（ボスカットを足す前の計算結果です）。</div>`;
        const { legend, table } = cutTableHTML(shownCuts(e));
        return `<h3 class="sc-bc-h"><i data-lucide="skull"></i>ボスカット
                <span class="sc-bc-out"><button data-sc="cutcopy" class="btn btn-xs" title="コンパクトな表を画像にしてクリップボードへ"><i data-lucide="copy" class="w-3 h-3"></i>画像をコピー</button><button data-sc="cutsave" class="btn btn-xs" title="コンパクトな表を PNG で保存"><i data-lucide="download" class="w-3 h-3"></i>画像を保存</button></span></h3>
            ${calibHTML(e)}
            <div class="sc-bc-head">
                ${legend}
                <p>％は MapleScouter のボスカット（そのボスに必要な火力）に対する今の火力です。100% 前後でソロの最低ライン。<i>PT</i> はパーティ前提のボスで、人数ごとの目安を出しています。レベル・フォース不足も反映しています。500% を超えたものは出していません。<i class="sc-bc-est">推測</i> は MapleScouter に GMS の値が無いボス（ベローナ）で、KMS の値から推し量ったものです。</p>
            </div>
            ${table}`;
    }
    // ボスカットの凡例（判定ごとの数）と表。結果タブと簡易換算タブで使う。
    function cutTableHTML(cuts) {
        const rows = cutRows(cuts || []);
        const count = {};
        for (const x of rows) for (const c of x.cuts) { const cls = (CUT_LABEL[c.v] || [, 'c-no'])[1]; count[cls] = (count[cls] || 0) + 1; }
        const body = rows.map(({ ko, boss, cuts: cs }) => `<tr>
            <th><b>${esc(boss ? (boss.short || boss.ja) : ko)}</b>${cs.some((c) => c.sym) ? symbolMark(ko) : ''}</th>
            ${CUT_COLS.map((ds) => cutCell(cs.find((c) => ds.includes(c.d)))).join('')}
        </tr>`).join('');
        return {
            legend: `<div class="sc-bc-legend">${CUT_LEGEND.map(([cls, t]) => `<span class="${cls}"><i></i>${t}<b>${count[cls] || 0}</b></span>`).join('')}</div>`,
            table: `<table class="sc-bctbl">
                <thead><tr><th></th>${CUT_COLS.map((ds) => `<th>${ds.join(' / ')}</th>`).join('')}</tr></thead>
                <tbody>${body}</tbody>
            </table>`,
        };
    }

    /* ---------- 簡易換算（EXスウのソロタイムから） ---------- */
    // ステータスを使わずにボスカットを出す（bi 依頼 2026-11-05）。計算元（kinokohub）に無い職（シア・エレルライト）でも使える。
    // EXスウはフォースもシンボルも関係ないので、率＝30分÷ソロ実測時間（実測補正と同じ考え方）から自分の火力を逆算し、
    // その火力で表の全ボスを出す（要求値・easyRate・Lv差・フォース差は scouter_bosscut.js のまま）。
    //   - 防御率 300% のボスは、換算主ステが 380% と同じとみる（防御無視の差は見られない）。
    //   - 職業ごとの時間補正（timeFactor）は掛けない。
    //   - シンボルはダメージの値が無いので、該当地域のボスに最終ダメージ QUICK_SYM_FD % を掛ける（bi 指定）。
    // 入力の Lv・フォース・シンボルは「入力」タブと同じ値（form）を使う。時間だけ e.quick.min（分）に持つ。
    const QUICK_SYM_FD = 0.4;
    function quickCuts(f, min) {
        const B = typeof scouterBossCut !== 'undefined' ? scouterBossCut : null;
        const K = typeof scouterKinoko !== 'undefined' ? scouterKinoko : null;
        if (!B || !K || !K.SPLINE_380 || !B.splineEval || !(min > 0) || !(num(f.level) > 0)) return null;
        const sp3 = K.SPLINE_300, sp8 = K.SPLINE_380;
        const zero = { cridmgeff1: 0, atkeff1: 0, dmgeff1: 0, mainStateff1: 0, atkPereff1: 0 };
        const us = { stat: { level: String(num(f.level)), arcaneForce: String(num(f.arcane)), authenticForce: String(num(f.sacred)), myClass: '' } };
        const run = (stat) => {
            const d3 = B.splineEval(sp3, stat), d8 = B.splineEval(sp8, stat);
            const out = B.computeBossCuts({
                calculatedHexaDamage_300: d3, calculatedHexaDamage_380: d8, calculatedHexaDamage_kaling: d8, calculatedDamage_380: d8,
                spline_300: sp3, spline_380: sp8, specEfficiency: zero, elixir: 3,
                ascent_const: 0, ignoreDefConst_300: 1, ignoreDefConst_380: 1, genePassConst: 1,
            }, us);
            return out.error ? null : out.rows;
        };
        const lotus = (rows) => rows && rows.find((x) => x.boss === '스우' && x.difficulty === 'Extreme');
        // 仮の火力で1回出し、EXスウの率が実測に合うように火力を直してから出し直す（率は火力に比例）。
        const S0 = 100000;
        const r0 = lotus(run(S0));
        if (!r0 || !(r0.clearRate > 0)) return null;
        const stat = B.splineInverse(sp8, B.splineEval(sp8, S0) * (CALIB_MIN / min) / r0.clearRate);
        const rows = run(stat);
        if (!rows) return null;
        const on = symbolBosses(f), k = 1 + QUICK_SYM_FD / 100;
        const cuts = rows.map((x) => {
            const sym = on.has(x.boss);
            const r = x.clearRate * (sym ? k : 1);
            const v = x.label === '입장 불가능' || !sym ? x.label : B.verdict(r, x.isPartyBoss, x.partyLimit);
            return { b: x.boss, n: x.name, d: x.difficulty, s: x.bossStat, r, p: x.isPartyBoss ? 1 : 0, l: x.partyLimit, v, ...(x.estimate ? { e: 1 } : {}), ...(sym ? { sym: 1 } : {}) };
        });
        return { cuts, stat, lotus: CALIB_MIN / min };
    }
    // まだ入れていなければ、結果タブの実測補正の時間を借りる。
    const quickMin = (e) => (e.quick ? e.quick.min : (e.calib && e.calib.min)) || null;
    function quickSumHTML(e) {
        const q = quickCuts(e.form, quickMin(e));
        return `<div class="sc-q-sum">
                <div><span>EXスウ</span><b>${q ? pctText(q.lotus) : '—'}</b></div>
                <div title="EXスウのタイムから逆算した、防御率 380% の HEXA換算の目安"><span>推定 HEXA換算</span><b class="sc-q-big">${q ? fmt(q.stat) : '—'}</b></div>
            </div>`;
    }
    function quickOutHTML(e) {
        const min = quickMin(e);
        if (!(num(e.form.level) > 0) || !min) return `<div class="sc-res-empty">Lv と EXスウのソロタイムを入れると出ます。</div>`;
        const q = quickCuts(e.form, min);
        if (!q) return `<div class="sc-res-empty">計算できませんでした。</div>`;
        const { legend, table } = cutTableHTML(q.cuts);
        return `<h3 class="sc-bc-h"><i data-lucide="skull"></i>ボスカット
                <span class="sc-bc-out"><button data-sc="cutcopy" class="btn btn-xs" title="コンパクトな表を画像にしてクリップボードへ"><i data-lucide="copy" class="w-3 h-3"></i>画像をコピー</button><button data-sc="cutsave" class="btn btn-xs" title="コンパクトな表を PNG で保存"><i data-lucide="download" class="w-3 h-3"></i>画像を保存</button></span></h3>
            <div class="sc-bc-head">${legend}</div>
            ${table}`;
    }
    function quickPageHTML(e) {
        const f = e.form, min = quickMin(e);
        const field = (label, html) => `<label class="sc-q-f"><span>${label}</span>${html}</label>`;
        const tiles = SYMBOLS.map(([k, region, bosses]) => {
            const on = !!f.symbol[k];
            const names = bosses.map((b) => { const m = bossOf(b); return m ? (m.short || m.ja) : b; }).join('・');
            return `<button type="button" class="btn btn-sm h-8 justify-start gap-1.5 px-1.5 font-normal ${on ? 'btn-soft btn-secondary' : 'btn-ghost border-base-content/10 [&_img]:grayscale [&_img]:opacity-50'}" data-sc="sym" data-key="${k}" title="${esc(`${region}（${names}）: Lv11 以上で最終ダメージ +${QUICK_SYM_FD}% として計算`)}">
                ${img(`symbol/${k}.png`)}<span class="truncate text-xs ${on ? 'text-base-content font-semibold' : 'text-base-content/45'}">${esc(region)}</span><span class="ml-auto text-[10px] font-mono font-bold ${on ? 'text-secondary' : 'text-base-content/30'}">${on ? 'ON' : 'OFF'}</span></button>`;
        }).join('');
        return `<div class="card card-sm bg-base-100 border border-base-content/10 overflow-hidden"><div class="sc-body sc-resbody">
                <div class="sc-side sc-q-side">
                    <h3><i data-lucide="timer"></i>EXスウのソロタイムから</h3>
                    <div class="sc-q-grid">
                        ${field('Lv', inp('level', f.level))}
                        ${field('EXスウ ソロ（秒）', `<input data-sc="qmin" inputmode="numeric" class="input input-xs w-full font-mono text-right ${min ? 'font-bold' : 'text-base-content/35'}" value="${min ? fmtSeconds(min) : ''}" placeholder="秒" title="EXスウをソロで倒した時間を秒数で（例 10分30秒なら 630）">`)}
                        ${field('アーケインフォース', inp('arcane', f.arcane))}
                        ${field('オーセンティックフォース', inp('sacred', f.sacred))}
                    </div>
                    <div id="sc-quick-sum">${quickSumHTML(e)}</div>
                    <h3 class="mt-3"><i data-lucide="gem"></i>シンボル Lv11 以上<small>最終ダメージ +${QUICK_SYM_FD}%</small></h3>
                    <div class="grid grid-cols-2 gap-1">${tiles}</div>
                </div>
                <div class="sc-cutpage" id="sc-quick-out">${quickOutHTML(e)}</div>
            </div></div>`;
    }
    // 打っている間は表と左の数字だけ書き換える（入力欄を作り直すとフォーカスが外れる）。
    function refreshQuick() {
        const veil = document.getElementById('sc-overlay');
        if (!veil || !cur || cur.tab !== 'quick') return;
        const out = veil.querySelector('#sc-quick-out'), sum = veil.querySelector('#sc-quick-sum');
        if (out) out.innerHTML = quickOutHTML(cur.e);
        if (sum) sum.innerHTML = quickSumHTML(cur.e);
        if (window.lucide) lucide.createIcons();
    }

    // ボスカットのコンパクト版を画像にする（Discord などに貼る用）。表に出ているマスだけ、空の難易度の列は詰める。
    const CUT_COLOR = { 'c-solo2': '#34d399', 'c-solo1': '#6ee7b7', 'c-solo0': '#fbbf24', 'c-pt1': '#a5b4fc', 'c-pt0': '#818cf8', 'c-no': '#475569' };
    const DIFF_COLOR = { Easy: '#9ca3af', Normal: '#22d3ee', Hard: '#f87171', Chaos: '#ca8a04', Extreme: '#ef4444', Destiny: '#e879f9', Champion: '#fbbf24' };
    const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
    // 画像に入れる中身。結果タブは保存した計算結果、簡易換算タブは EXスウのタイムからその場で出した表。
    function cutSpec(e, char, quick) {
        const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (quick) {
            const min = quickMin(e), q = quickCuts(e.form, min);
            if (!q) return null;
            const info = classInfo(e.form.classId);
            return {
                cuts: q.cuts, sub: '推定 HEXA換算（防御率380%）', val: q.stat,
                tag: `簡易換算 EXスウ ${fmtMinutes(min)}`, tagSub: pctText(q.lotus),
                lv: char ? null : `Lv${num(e.form.level)} ${info ? info.name : ''}`, date: ymd(new Date()),
                foot: '％は EXスウのソロタイムから逆算した火力での目安（100% 前後でソロの最低ライン）',
            };
        }
        const r = e.result;
        if (!r || r.error || !r.cuts) return null;
        const cal = e.calib && e.calib.on;
        return {
            cuts: shownCuts(e), sub: 'HEXA換算（防御率380%）', val: r.b380h,
            tag: cal ? `実測補正 ×${e.calib.scale.toFixed(2)}` : '', tagSub: cal ? `EXスウ ${fmtMinutes(e.calib.min)}` : '',
            lv: null, date: r.at ? ymd(new Date(r.at)) : '',
            foot: '％は MapleScouter のボスカットに対する今の火力（100% 前後でソロの最低ライン）',
        };
    }
    async function cutImage(e, char, quick) {
        const sp = cutSpec(e, char, quick);
        if (!sp) return null;
        const rows = cutRows(sp.cuts);
        if (!rows.length) return null;
        const cols = CUT_COLS.filter((ds) => rows.some((x) => x.cuts.some((c) => ds.includes(c.d))));
        const S = 2, PAD = 12, NAME_W = 92, CW = 112, RH = 42, HEAD = 46, CH = 18, FOOT = 22;
        const W = PAD * 2 + NAME_W + cols.length * CW, H = PAD * 2 + HEAD + CH + rows.length * RH + FOOT;
        const cv = document.createElement('canvas');
        cv.width = W * S; cv.height = H * S;
        const g = cv.getContext('2d');
        g.scale(S, S);
        await document.fonts.ready.catch(() => {});
        const icons = {};
        await Promise.all(rows.flatMap((x) => x.cuts).map(async (c) => { icons[c.d + c.n] = await loadImg(`${ICON}boss/${c.d.toLowerCase()}_${c.n}.png`); }));
        const JP = '"IBM Plex Sans JP", sans-serif', MONO = '"IBM Plex Mono", monospace', CON = '"Saira Condensed", sans-serif';
        g.fillStyle = '#020617'; g.fillRect(0, 0, W, H);
        g.textBaseline = 'middle';
        // 見出し: キャラ名・HEXA換算・計算日
        const name = char ? char.name : '仮入力';
        g.fillStyle = '#f1f5f9'; g.font = `700 16px ${JP}`;
        g.fillText(name, PAD, PAD + 13);
        const nw = g.measureText(name).width;
        const lv = char && (char.level || char.job) ? `Lv${char.level || ''} ${char.job || ''}` : sp.lv;
        if (lv) { g.fillStyle = '#64748b'; g.font = `400 11px ${JP}`; g.fillText(lv, PAD + nw + 8, PAD + 14); }
        g.fillStyle = '#94a3b8'; g.font = `400 11px ${JP}`;
        g.fillText(sp.sub, PAD, PAD + 34);
        const sw = g.measureText(sp.sub).width;
        g.fillStyle = '#fbbf24'; g.font = `700 14px ${MONO}`;
        g.fillText(fmt(sp.val), PAD + sw + 4, PAD + 34);
        if (sp.tag) {
            const hw = g.measureText(fmt(sp.val)).width;
            g.fillStyle = '#fbbf24'; g.font = `700 11px ${JP}`;
            g.fillText(sp.tag, PAD + sw + hw + 16, PAD + 34);
            const cw = g.measureText(sp.tag).width;
            g.fillStyle = '#64748b'; g.font = `400 10px ${JP}`;
            g.fillText(sp.tagSub, PAD + sw + hw + 16 + cw + 6, PAD + 34);
        }
        g.textAlign = 'right';
        g.fillStyle = '#818cf8'; g.font = `800 13px ${CON}`;
        g.fillText('BOSS CUT', W - PAD, PAD + 13);
        if (sp.date) { g.fillStyle = '#64748b'; g.font = `400 10px ${MONO}`; g.fillText(sp.date, W - PAD, PAD + 34); }
        g.textAlign = 'left';
        // 列見出し
        let y = PAD + HEAD;
        g.font = `700 10px ${CON}`;
        cols.forEach((ds, i) => { g.fillStyle = '#64748b'; g.textAlign = 'center'; g.fillText(ds.join(' / ').toUpperCase(), PAD + NAME_W + i * CW + CW / 2, y + CH / 2); });
        g.textAlign = 'left';
        y += CH;
        for (const { ko, boss, cuts } of rows) {
            g.fillStyle = '#0b1224'; g.fillRect(PAD, y, NAME_W - 2, RH - 2);
            g.fillStyle = '#f1f5f9'; g.font = `700 12px ${JP}`;
            g.fillText(boss ? (boss.short || boss.ja) : ko, PAD + 8, y + RH / 2 - 1, NAME_W - 14);
            cols.forEach((ds, i) => {
                const x = PAD + NAME_W + i * CW, c = cuts.find((q) => ds.includes(q.d));
                if (!c) { g.fillStyle = '#060c1c'; g.fillRect(x, y, CW - 2, RH - 2); return; }
                const [txt, cls] = CUT_LABEL[c.v] || [c.v, 'c-no'];
                const col = CUT_COLOR[cls], no = cls === 'c-no';
                g.fillStyle = no ? '#060c1c' : col + '14'; g.fillRect(x, y, CW - 2, RH - 2);
                g.fillStyle = col; g.fillRect(x, y, 3, RH - 2);
                const ic = icons[c.d + c.n], IS = 34, ix = x + 6, iy = y + (RH - 2 - IS) / 2;
                if (ic) { g.save(); if (no) { g.globalAlpha = .45; g.filter = 'grayscale(1)'; } g.drawImage(ic, ix, iy, IS, IS); g.restore(); }
                const grad = g.createLinearGradient(0, iy + IS - 12, 0, iy + IS);
                grad.addColorStop(0, '#02061700'); grad.addColorStop(.55, '#020617e6');
                g.fillStyle = grad; g.fillRect(ix, iy + IS - 12, IS, 12);
                g.fillStyle = DIFF_COLOR[c.d] || '#94a3b8'; g.font = `700 7px ${MONO}`; g.textAlign = 'center';
                g.fillText(c.d.toUpperCase(), ix + IS / 2, iy + IS - 4, IS);
                g.textAlign = 'left';
                const tag = (t, fg, bg, right) => { g.font = `700 7px ${MONO}`; const tw = g.measureText(t).width + 4; const tx = right ? ix + IS - tw : ix; g.fillStyle = bg; g.fillRect(tx, iy, tw, 9); g.fillStyle = fg; g.fillText(t, tx + 2, iy + 5); };
                if (c.p) tag('PT', '#c7d2fe', '#312e81e6', true);
                if (c.e) tag('推測', '#fde68a', '#92400ee6', false);
                const tx = ix + IS + 6;
                g.fillStyle = no ? '#64748b' : col; g.font = `${no ? 400 : 700} 13px ${MONO}`;
                g.fillText(pctText(c.r), tx, y + 13, CW - (tx - x) - 4);
                g.font = `${no ? 400 : 700} 10px ${JP}`;
                g.fillText(txt, tx, y + 28, CW - (tx - x) - 4);
            });
            y += RH;
        }
        g.fillStyle = '#475569'; g.font = `400 9px ${JP}`;
        g.fillText(sp.foot, PAD, y + FOOT / 2 + 2);
        g.textAlign = 'right'; g.fillStyle = '#64748b'; g.font = `700 9px ${CON}`;
        g.fillText('BijyonTools', W - PAD, y + FOOT / 2 + 2);
        return cv;
    }
    async function exportCuts(mode) {
        if (!cur) return;
        const quick = cur.tab === 'quick';
        const cv = await cutImage(cur.e, cur.char, quick);
        if (!cv) { setMsg(quick ? '画像にできるボスカットがありません。Lv と EXスウのソロタイムを入れてから試してください。' : '画像にできるボスカットがありません。「計算する」を押してから試してください。', 'err'); return; }
        const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
        if (!blob) { setMsg('画像を作れませんでした。', 'err'); return; }
        if (mode === 'copy') {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                setMsg('ボスカットの画像をコピーしました。', 'ok');
                return;
            } catch (err) { setMsg('コピーできなかったので保存します。', 'err'); }
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bosscut_${(cur.char ? cur.char.name : 'scouter').replace(/[^\w-]/g, '_')}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        if (mode !== 'copy') setMsg('ボスカットの画像を保存しました。', 'ok');
    }

    // スペック効率（主ステ Base 1 いくつ分か）を Upgrade Priority のスコア重みに入れる。
    // ダメージ・ボスは1つの値なのでボスダメとダメージの両方へ。防御率無視と未適用主ステは重みの欄がないので使わない。
    async function applyToGear() {
        const eff = (cur.e.result || {}).eff || {};
        const base = eff.mainStateff1;
        if (!base) return;
        const to = { att: eff.atkeff1, attPct: eff.atkPereff1, statPct: eff.mainStatPereff1, allStat: eff.allStatEff,
            crit: eff.cridmgeff1, boss: eff.dmgeff1, dmg: eff.dmgeff1, sub: eff.subStateff1 };
        const w = { main: 1 };
        for (const [k, v] of Object.entries(to)) if (typeof v === 'number' && v > 0) w[k] = Math.round(v / base * 100) / 100;
        const charId = cur.char ? cur.char.id : null;
        try {
            await window.app.loadAppAssets('gear');
            window.gearPriority.applyWeights(charId, w);
            setMsg(`Upgrade Priority${cur.char ? `（${cur.char.name}）` : '（仮入力）'}のスコア重みに反映しました。`, 'ok');
        } catch (err) {
            console.error(err);
            setMsg('Upgrade Priority に反映できませんでした。', 'err');
        }
    }

    function resultHTML(e) {
        const r = e.result;
        const f = e.form;
        if (!r) return `<div class="sc-res-empty">「入力」で値を入れて「計算する」を押すと、ここに結果が出ます。</div>`;
        if (r.error) return `<div class="sc-res-empty sc-err">${esc(r.error)}</div>`;
        const eff = r.eff || {};
        // 各スペックが主ステ（Base に足す主ステ 1）いくつ分かで出す。
        const base = eff.mainStateff1;
        const label = (CLASSES[f.classId] || [])[1] || '主ステ';
        const sub = (CLASSES[f.classId] || [])[2] || '副ステ';
        const atkLabel = isMagic(f.classId) ? '魔力' : '攻撃力';
        const rows = [
            [`${atkLabel} 1`, eff.atkeff1], [`${atkLabel} 1%`, eff.atkPereff1], [`${label} 1%`, eff.mainStatPereff1],
            ['ダメージ・ボス 1%', eff.dmgeff1], ['クリダメ 1%', eff.cridmgeff1], ['オールステ 1%', eff.allStatEff],
            ['防御率無視 1%', eff.igreff1], [`未適用${label} 1`, eff.mainStatAbseff1], [`${sub} 1`, eff.subStateff1],
        ].filter(([, v]) => typeof v === 'number' && v > 0);
        const hist = (e.history || []).filter((h) => h.b380h > 0).slice(-6).reverse();
        const cpGame = f.screen && f.screen.combatPower;
        return `
            <div class="sc-big">
                <span>HEXA換算（防御率380%）</span>
                <b>${fmt(r.b380h)}</b>
            </div>
            <table class="sc-kv">
                <tr><th>換算戦闘力</th><td>${fmt(r.xp)}</td></tr>
                <tr><th>戦闘力（計算）</th><td>${r.cp ? fmt(r.cp) : '—'}</td></tr>
                ${cpGame ? `<tr><th>戦闘力（画面）</th><td>${fmt(cpGame)}</td></tr>` : ''}
            </table>
            ${r.src === 'kinokohub' ? '<p class="text-[11px] text-base-content/50 mt-1 mb-3">計算元: kinokohub（MapleScouter 互換の計算を GMS・Heroic に寄せた推定値。MapleScouter との差はおおむね ±0.5%）</p>' : ''}
            ${rows.length && base ? `<h3>スペック効率 <small>${esc(label)}いくつ分か</small></h3>
            <table class="sc-kv sc-eff">${rows.map(([n, v]) => `<tr><th>${esc(n)}</th><td>${esc(label)} <b>${(v / base).toFixed(2)}</b></td></tr>`).join('')}</table>
            <button data-sc="togear" class="btn btn-xs btn-soft btn-primary w-full mt-1.5" title="この値を Upgrade Priority のスコア重みに入れる${cur.char ? '（このキャラ）' : '（サイドバーの仮入力）'}"><i data-lucide="arrow-right-left" class="w-3 h-3"></i>Upgrade Priority のスコア重みに反映</button>` : ''}
            ${hist.length > 1 ? `<h3>履歴</h3><table class="sc-kv">${hist.map((h) => `<tr><th>${esc((h.at || '').replace('T', ' ').slice(0, 16))}</th><td>${fmt(h.b380h)}</td></tr>`).join('')}</table>` : ''}`;
    }

    function setMsg(text, kind = '') {
        if (!cur) return;
        cur.msg = text; cur.msgKind = kind;
        const el = document.getElementById('sc-msg');
        if (el) { el.textContent = text; el.className = 'sc-msg ' + kind; }
    }

    function setPath(f, path, v) {
        const ks = path.split('.');
        let o = f;
        for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
        o[ks[ks.length - 1]] = v;
    }

    function toggleBuff(key) {
        const d = cur.e.form.doping;
        const on = !d[key];
        for (const ks of Object.values(GROUP_KEYS)) if (on && ks.includes(key)) for (const o of ks) d[o] = false;
        d[key] = on;
        save();
        renderModal();
    }

    function bindModal(veil) {
        veil.addEventListener('click', (ev) => {
            const t = ev.target.closest('[data-sc]');
            if (!t) return;
            const k = t.dataset.sc;
            if (k === 'close') close();
            else if (k === 'calc') calc();
            else if (k === 'file') veil.querySelector('[data-sc="input"]').click();
            else if (k === 'live') toggleLive();
            else if (k === 'hexa') importHexa();
            else if (k === 'buff') toggleBuff(t.dataset.key);
            else if (k === 'sym') { const sy = cur.e.form.symbol; sy[t.dataset.key] = !sy[t.dataset.key]; save(); renderModal(); }
            else if (k === 'tab') { cur.tab = t.dataset.tab; renderModal(); }
            else if (k === 'hlock') toggleLock(t.dataset.key);
            else if (k === 'step') { cur.step = t.dataset.step; renderModal(); }
            else if (k === 'hcalc') runHyper();
            else if (k === 'xcalc') runHexaStat();
            else if (k === 'cutcopy') exportCuts('copy');
            else if (k === 'cutsave') exportCuts('save');
            else if (k === 'togear') applyToGear();
            else if (k === 'apply') applyReads();
            else if (k === 'discard') { cur.reads = null; cur.step = null; renderModal(); setMsg('読み取りを捨てました。'); }
        });
        veil.addEventListener('change', async (ev) => {
            const t = ev.target;
            if (t.dataset.sc === 'input') {
                const files = [...t.files];
                t.value = '';
                for (const f of files) await readImage(f);
                return;
            }
            if (t.dataset.sc === 'calib') { const v = t.value; setTimeout(() => setCalib(v)); return; }
            if (t.dataset.sc === 'calibon') { if (cur.e.calib) { cur.e.calib.on = t.checked; save(); } setTimeout(renderModal); return; }
            if (t.dataset.ho) { cur.e.hyperOpt[t.dataset.ho] = t.value.trim(); save(); setTimeout(renderModal); return; }
            if (!t.dataset.k) return;
            const f = cur.e.form;
            if (t.type === 'checkbox') setPath(f, t.dataset.k, t.checked);
            else setPath(f, t.dataset.k, t.value.trim());
            syncShared(f);
            save();
            // 入力欄が消えるときの blur からも change が来るので、作り直しは後に回す。
            if (t.dataset.k === 'classId' || /^(doping|link|seed|hexa|hyper|hexaStat)\.|^wildhunterUnion$|^level$/.test(t.dataset.k)) setTimeout(renderModal);
        });
        // 打っている間は作り直さない（フォーカスが外れる）。最終値の欄だけ書き換える。
        veil.addEventListener('input', (ev) => {
            const t = ev.target;
            if (t.dataset.sc === 'qmin') {
                const v = String(t.value || '').trim(), min = parseSeconds(v);
                if (!v) cur.e.quick = { min: null }; else if (min) cur.e.quick = { min, at: new Date().toISOString() };
                t.classList.toggle('font-bold', !!min); t.classList.toggle('text-base-content/35', !min);
                save();
                refreshQuick();
                return;
            }
            if (!t.dataset.k || t.type === 'checkbox' || t.tagName === 'SELECT') return;
            setPath(cur.e.form, t.dataset.k, t.value.trim());
            syncShared(cur.e.form);
            save();
            const k = t.dataset.k.split('.')[0];
            const cell = veil.querySelector(`[data-fin="${k}"]`);
            if (cell) cell.textContent = fmt(finalOf(cur.e.form[k]));
            refreshQuick();
        });
    }
    // .sc-modal は描き直すたびに作り直すので、こちらは毎回付ける。
    function bindDrop(veil) {
        const box = veil.querySelector('.sc-modal');
        box.addEventListener('dragover', (ev) => { if ([...ev.dataTransfer.types].includes('Files')) { ev.preventDefault(); box.classList.add('drop'); } });
        box.addEventListener('dragleave', (ev) => { if (!box.contains(ev.relatedTarget)) box.classList.remove('drop'); });
        box.addEventListener('drop', async (ev) => {
            if (cur && (cur.tab === 'hstat' || cur.tab === 'quick')) return;
            const files = [...ev.dataTransfer.files].filter((x) => x.type.startsWith('image/'));
            if (!files.length) return;
            ev.preventDefault();
            box.classList.remove('drop');
            for (const f of files) await readImage(f);
        });
    }

    /* ---------- HEXA Tracker から ---------- */
    function importHexa() {
        const ht = tracker();
        if (!ht || !cur || !cur.char) return;
        ht.ensureLoaded();
        const classId = ht.getCharClassId(cur.char);
        const cls = classId && hexaClass(classId);
        const saved = ht.data['char:' + cur.char.id];
        if (!cls || !saved || !saved.levels) { setMsg('HEXA Tracker にこのキャラの入力がありません。', 'err'); return; }
        for (const [hk, k] of HEXA_KEYS) {
            const s = cls.skills.find((x) => x.key === hk);
            cur.e.form.hexa[k] = String(s ? Math.max(ht.minLevel(s), saved.levels[hk] || 0) : 0);
        }
        save();
        renderModal();
        setMsg('HEXA Tracker の今のレベルを取り込みました。', 'ok');
    }

    /* ---------- 計算 ---------- */
    async function calc() {
        if (!cur || cur.busy) return;
        const e = cur.e, f = e.form;
        if (!CLASSES[f.classId]) { setMsg('職業を選んでください。', 'err'); return; }
        if (!num(f.main.base)) { setMsg(`${CLASSES[f.classId][1]} の Base Value を入れてください。`, 'err'); return; }
        cur.busy = true;
        renderModal();
        setMsg(`${ENGINE_NAME} で計算しています…`);
        const mine = cur;
        const us = buildUserStat(f);
        try {
            const d = await calcForm(f);
            const at = new Date().toISOString();
            e.result = {
                at, b300: d.boss300_stat, b380: d.boss380_stat, b300h: d.boss300_hexaStat, b380h: d.boss380_hexaStat,
                cp: d.combatPower, xp: d.exchangePower, xph: d.exchangePowerHexa, eff: d.specEfficiency || {},
                cuts: bossCuts(d, us), src: d.source || 'maplescouter',
            };
            e.history = (e.history || []).concat({ at, b300: d.boss300_stat, b300h: d.boss300_hexaStat, b380h: d.boss380_hexaStat }).slice(-30);
            save();
            if (cur === mine) { cur.tab = 'result'; setMsg('計算しました。', 'ok'); }
        } catch (err) {
            if (cur === mine) setMsg('計算に失敗しました: ' + (err && err.message || err) + (location.protocol === 'file:' ? '（Worker 経由で開いてください）' : ''), 'err');
        } finally {
            if (cur === mine) { cur.busy = false; renderModal(); }
            render();
        }
    }

    /* ---------- 読み取り ---------- */
    // 読み取った値は一旦「読み取り結果」に並べ、反映ボタンで入力欄に入れる（Upgrade Priority と同じ）。
    const READ_LABEL = {
        level: 'Lv', combatPower: 'Combat Power', dmg: 'ダメージ', bossDmg: 'ボスダメージ', ignoreDef: '防御率無視',
        normalDmg: '一般モンスターダメージ', critical: 'クリティカル率', criticalDmg: 'クリティカルダメージ',
        coolSec: 'クールタイム減少（秒）', coolPer: 'クールタイム減少（%）', buffDuration: 'バフ持続時間',
        resetCool: 'クールタイム無視', ignoreElem: '属性耐性無視', statusDmg: '状態異常追加ダメージ',
        summonDur: '召喚獣持続時間増加', arcane: 'アーケインフォース', sacred: 'オーセンティックフォース',
        str: 'STR（画面）', dex: 'DEX（画面）', int: 'INT（画面）', luk: 'LUK（画面）', hp: 'HP（画面）',
        att: 'Attack Power（画面）', matt: 'Magic ATT（画面）',
    };
    const FORM_KEYS = ['level', 'dmg', 'bossDmg', 'ignoreDef', 'normalDmg', 'critical', 'criticalDmg', 'coolSec', 'coolPer',
        'buffDuration', 'resetCool', 'ignoreElem', 'statusDmg', 'summonDur', 'arcane', 'sacred'];
    const SCREEN_KEYS = ['combatPower', 'str', 'dex', 'int', 'luk', 'hp', 'att', 'matt'];

    // 1回の読み取り結果を、溜めている読み取りに足す。新しく入った項目の数を返す。
    function stage(res, only) {
        if (!cur) return 0;
        if (only) res = onlyStep(res, only);
        const r = cur.reads || (cur.reads = { values: {}, splits: {} });
        let n = 0;
        const w = res.window || {};
        if (w.sacred === undefined && w.authentic !== undefined) w.sacred = w.authentic;
        for (const k of [...FORM_KEYS, ...SCREEN_KEYS]) {
            if (w[k] === undefined) continue;
            if (r.values[k] !== w[k]) n++;
            r.values[k] = w[k];
        }
        const h = res.hyper;
        if (h && Object.keys(h.levels || {}).length >= 10) {
            const prev = JSON.stringify(r.hyper || null);
            r.hyper = { levels: h.levels, point: h.point };
            if (prev !== JSON.stringify(r.hyper)) n++;
        }
        const t = res.tooltip;
        if (t) {
            const prev = r.splits[t.stat];
            if (!prev || prev.base !== t.base || prev.per !== t.per || prev.abs !== t.abs) n++;
            r.splits[t.stat] = { base: t.base, per: t.per, abs: t.abs };
        }
        return n;
    }
    // 読み取り結果から、その段階の値だけを残す。
    function onlyStep(res, only) {
        if (only === 'hyper') return { hyper: res.hyper };
        if (only === 'window') return { window: res.window };
        return { tooltip: res.tooltip && slotOf(res.tooltip.stat, cur.e.form.classId) === only ? res.tooltip : null };
    }
    // ライブ用: 同じ値が2回続けて読めた項目だけを残す（一瞬の誤読を入れない）。
    // seen に項目ごとの前回の値を覚えておき、今回と同じなら確定、違えば覚え直して保留にする。
    // 返り値の pending は保留にした項目の数。
    function confirmTwice(res, seen) {
        const out = { window: {}, hyper: null, tooltip: null };
        let pending = 0;
        const check = (key, val) => {
            const v = JSON.stringify(val);
            if (seen[key] === v) return true;
            seen[key] = v;
            pending++;
            return false;
        };
        for (const [k, v] of Object.entries(res.window || {})) if (check('w:' + k, v)) out.window[k] = v;
        if (res.hyper && check('hyper', res.hyper)) out.hyper = res.hyper;
        const t = res.tooltip;
        if (t && check('t:' + t.stat, [t.base, t.per, t.abs])) out.tooltip = t;
        out.pending = pending;
        return out;
    }
    // ツールチップの stat（str/dex/att…）がこの職業のどの欄か。
    function slotOf(stat, cid) {
        if (stat === 'att' || stat === 'matt') return (stat === 'matt') === isMagic(cid) ? 'atk' : null;
        const hit = statsOf(cid).find(([, label]) => label.toLowerCase() === stat);
        return hit ? hit[0] : null;
    }
    /* ---------- 読み取りの手順 ---------- */
    // 1回で全部は写らないので、画面ごと・ツールチップごとに段階を分けて取る。
    // ライブ中は今の段階の値だけを受け付ける（スクショは写っているものを全部取る）。
    function inputSteps() {
        const f = cur ? cur.e.form : {};
        return ['window', ...statsOf(f.classId).map(([slot]) => slot), 'atk'];
    }
    function stepLabel(step) {
        const f = cur.e.form;
        if (step === 'window') return 'ステータス画面';
        if (step === 'hyper') return 'ハイパーステータス画面';
        if (step === 'atk') return isMagic(f.classId) ? 'Magic ATT' : 'Attack Power';
        const hit = statsOf(f.classId).find(([slot]) => slot === step);
        return hit ? hit[1] : { main: '主ステ', sub: '副ステ', sub2: '第3ステ' }[step];
    }
    function stepHelp(step) {
        if (step === 'window') return 'キャラクター情報のステータス画面（STAT）を開いてください。DAMAGE・BOSS DAMAGE などの一覧と Lv・Combat Power を読みます。';
        if (step === 'hyper') return 'ステータス画面の下の「Hyper Stats」を押して、ハイパーステータス画面を開いてください。今のプリセットの各Lvと残りポイントを読みます。';
        return `ステータス画面で ${stepLabel(step)} をクリックして、右に出る STAT INFO（Current Value・Base Value・% Value・% Value Not Applied）が見える状態にしてください。カーソルを合わせて出る内訳でも読めます。`;
    }
    function stepDone(step) {
        const r = cur && cur.reads;
        if (!r) return false;
        if (step === 'window') return ['dmg', 'bossDmg', 'ignoreDef', 'critical', 'criticalDmg'].filter((k) => r.values[k] !== undefined).length >= 3;
        if (step === 'hyper') return !!r.hyper;
        return Object.keys(r.splits).some((s) => slotOf(s, cur.e.form.classId) === step);
    }
    // 今の段階。ハイパータブではハイパーだけ。入力タブでは選んだものか、まだのうち最初のもの。
    function curStep() {
        if (!cur) return null;
        if (cur.tab === 'hyper') return 'hyper';
        const steps = inputSteps();
        if (cur.step && steps.includes(cur.step)) return cur.step;
        return steps.find((x) => !stepDone(x)) || null;
    }
    function stepsHTML(steps) {
        const now = curStep();
        const needClass = steps.length > 1 && !cur.e.form.classId;
        const btns = steps.map((st, i) => {
            const done = stepDone(st), on = st === now;
            return `${i ? '<i data-lucide="chevron-right" class="w-3.5 h-3.5 text-base-content/25 shrink-0"></i>' : ''}
                <button data-sc="step" data-step="${st}" class="btn btn-sm gap-1.5 ${on ? 'btn-primary' : done ? 'btn-soft btn-success' : 'btn-ghost border-base-content/10 text-base-content/50'}">
                    ${done ? '<i data-lucide="check" class="w-3.5 h-3.5"></i>' : `<span class="font-mono text-[11px] opacity-70">${i + 1}</span>`}${esc(stepLabel(st))}</button>`;
        }).join('');
        const help = needClass ? '先に下の「職業」を選ぶと、主ステ・副ステの段階が出ます。'
            : now ? stepHelp(now) : '全部取れました。内容を確かめて「反映して保存」を押してください。';
        return `<div class="card card-sm bg-base-100 border border-base-content/10"><div class="card-body gap-2">
            <div class="flex items-center gap-1.5 flex-wrap"><b class="text-sm text-white mr-2">読み取りの手順</b>${btns}${actionsHTML()}</div>
            <div class="flex items-baseline gap-3 flex-wrap">
                <p class="text-xs ${now ? 'text-base-content/80' : 'text-success'}">${now ? `<b class="text-primary">${esc(stepLabel(now))}:</b> ` : ''}${esc(help)}</p>
                <span class="ml-auto text-[11px] text-base-content/50">${cur.live ? 'ライブ中は今の段階の値だけ、同じ値が2回続けて読めたら受け付けます' : 'スクショは貼り付け・ドロップでも読めます'}</span>
            </div>
        </div></div>`;
    }
    // 読み取りのあと、今の段階が取れていたら次のまだの段階へ。
    function advanceStep() {
        if (!cur || cur.tab === 'hyper') return;
        if (cur.step && stepDone(cur.step)) cur.step = null;
    }

    function readsHTML() {
        if (!cur || !cur.reads) return '';
        const { values, splits } = cur.reads;
        const f = cur.e.form;
        const vals = Object.entries(values).map(([k, v]) => `<span><em>${esc(READ_LABEL[k] || k)}</em>${esc(String(v))}</span>`).join('');
        const sp = Object.entries(splits).map(([s, v]) => {
            const slot = slotOf(s, f.classId);
            return `<span class="${slot ? '' : 'sc-skip'}" title="${slot ? '' : 'この職業では使わない値です'}"><em>${esc(s.toUpperCase())}</em>${fmt(v.base)} / ${v.per}% / ${fmt(v.abs)}</span>`;
        }).join('');
        const missing = statsOf(f.classId).concat([['atk', isMagic(f.classId) ? 'matt' : 'att']])
            .filter(([slot, label]) => !Object.keys(splits).some((s) => slotOf(s, f.classId) === slot)).map(([, label]) => label === 'att' ? 'Attack Power' : label === 'matt' ? 'Magic ATT' : label);
        const hy = cur.reads.hyper ? `<span><em>ハイパー</em>${esc(HYPER_KEYS.filter((k) => cur.reads.hyper.levels[k]).map((k) => `${HYPER_JA[k]} ${cur.reads.hyper.levels[k]}`).join('・') || 'すべて 0')}${cur.reads.hyper.point !== undefined ? `（残り ${cur.reads.hyper.point}pt）` : ''}</span>` : '';
        return `<div class="sc-reads">
            <div class="sc-reads-h"><b>読み取り結果</b>
                <span>${missing.length && f.classId && cur.tab !== 'hyper' ? `まだ内訳がない: ${esc(missing.join('・'))}（ステータス画面でクリックして STAT INFO を出した状態で読み取り）` : ''}</span>
                <button data-sc="apply" class="sc-go">反映して保存</button><button data-sc="discard">捨てる</button></div>
            <div class="sc-reads-v">${vals}${sp}${hy}</div>
        </div>`;
    }
    // 読み取りは入力タブとハイパータブで見せる（結果タブなら入力タブへ）。手順の表示も変わるので描き直す。
    function showReads() {
        if (!cur) return;
        if (cur.tab === 'result') cur.tab = 'input';
        advanceStep();
        renderModal();
    }
    function applyReads() {
        if (!cur || !cur.reads) return;
        const f = cur.e.form;
        const { values, splits, hyper } = cur.reads;
        if (hyper) {
            f.hyper = Object.fromEntries(HYPER_KEYS.map((k) => [k, String(hyper.levels[k] ?? num(f.hyper[k]))]));
            f.hyperPoint = hyper.point !== undefined ? String(hyper.point) : '';
        }
        for (const k of FORM_KEYS) if (values[k] !== undefined) f[k] = String(values[k]);
        f.screen = { ...(f.screen || {}) };
        for (const k of SCREEN_KEYS) if (values[k] !== undefined) f.screen[k] = values[k];
        let n = 0;
        for (const [s, v] of Object.entries(splits)) {
            const slot = slotOf(s, f.classId);
            if (!slot) continue;
            f[slot] = { base: String(v.base), per: String(v.per), abs: String(v.abs) };
            n++;
        }
        cur.reads = null;
        save();
        renderModal();
        setMsg(`反映しました${n ? `（内訳 ${n} 件）` : ''}。「計算する」で換算を出せます。`, 'ok');
    }

    async function readImage(blob) {
        if (!window.scouterReader || !cur) return;
        setMsg('読み取り中…（初回は文字認識の読み込みに少し時間がかかります）');
        try {
            const img = await scouterReader.pixelsOf(blob);
            const res = await scouterReader.read(img);
            const n = stage(res);
            showReads();
            if (n) beep();
            setMsg(n ? '読み取りました。内容を確かめて「反映して保存」を押してください。' : 'ステータス画面・ハイパーステータス画面の値が見つかりませんでした。', n ? 'ok' : 'err');
        } catch (err) {
            console.error(err);
            setMsg('読み取りに失敗しました: ' + (err && err.message || err), 'err');
        }
    }

    // ライブ: ゲーム画面を共有し、読み取りを繰り返す。新しい値が読めたら音を鳴らす。
    let audioCtx = null;
    function beep() {
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.frequency.value = 880; g.gain.value = 0.08;
            o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + 0.12);
        } catch (e) { /* 音が出せなくても続ける */ }
    }
    async function toggleLive() {
        if (!cur) return;
        if (cur.live) { stopLive(); renderModal(); setMsg('ライブ読み取りを止めました。'); return; }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { setMsg('このブラウザは画面共有に対応していません。', 'err'); return; }
        let stream;
        try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false }); }
        catch (e) { setMsg('画面共有がキャンセルされました。', 'err'); return; }
        const video = document.createElement('video');
        video.muted = true; video.playsInline = true; video.srcObject = stream;
        try { await video.play(); } catch (e) { /* フレームが来れば再生される */ }
        const L = { stream, video, busy: false, seen: {} };
        cur.live = L;
        stream.getVideoTracks()[0].addEventListener('ended', () => { if (cur && cur.live === L) { stopLive(); renderModal(); setMsg('画面共有が終わりました。'); } });
        L.timer = setInterval(() => liveTick(L), 600);
        renderModal();
        setMsg('ライブ読み取り中。「読み取りの手順」の段階に沿って画面を出してください。');
    }
    function stopLive() {
        if (!cur || !cur.live) return;
        clearInterval(cur.live.timer);
        cur.live.stream.getTracks().forEach((t) => t.stop());
        cur.live = null;
    }
    async function liveTick(L) {
        if (!cur || cur.live !== L || L.busy || !L.video.videoWidth) return;
        L.busy = true;
        try {
            const res = await scouterReader.read(await scouterReader.pixelsOf(L.video));
            if (!cur || cur.live !== L) return;
            const step = curStep();
            if (!step) return;
            const ok = confirmTwice(onlyStep(res, step), L.seen);
            const n = stage(ok);
            if (!n && ok.pending) setMsg(`${stepLabel(step)} を読みました。もう一度同じ値が読めたら確定します…`);
            if (n) {
                beep(); showReads();
                const next = curStep();
                setMsg(next && next !== step ? `${stepLabel(step)} を読み取りました。次は ${stepLabel(next)} です。` : next ? '読み取りました。' : '全部取れました。内容を確かめて「反映して保存」を押してください。', 'ok');
            }
        } catch (e) {
            console.error(e);
        } finally {
            L.busy = false;
        }
    }

    // ダッシュボードのカード用（scouter.js を読まなくても localStorage から直接読める形にしてある）。
    function resultFor(charId) {
        if (!loaded) load();
        const e = data['char:' + charId];
        return e && e.result && e.result.b300 > 0 ? e.result : null;
    }

    return { STORAGE_KEY, init, render, open, openForCharacter, close, setTab, resultFor, buildUserStat, DEFAULT_FORM, CLASSES };
})();
