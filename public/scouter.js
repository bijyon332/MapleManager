// Scouter — MapleScouter（maplescouter.com）の換算主ステを、キャラごとに入力・保存して出す。
//
// 計算は先方のサーバー（POST /api/calc/dmg、本文 {userStat}）で行う。ブラウザからは
// 直接呼べないので Worker の /scouter が中継する（worker.js）。GMS は先方のキャラ検索に
// 対応していないので、ステータス画面の値を手入力するか、スクショ／画面共有から読み取る
// （scouter_reader.js）。
//
// 保存（localStorage）:
//   { 'char:<id>': entry, 'free': entry }   — 'free' はキャラに紐付けない仮入力
//   entry = { form: {...}, result: {...} | null, history: [{at, b300, b300h}] }
// form は画面の項目そのまま。送るときに buildUserStat() で先方の形に組み立てる。

const scouter = (() => {
    'use strict';

    const STORAGE_KEY = 'mapleManager_scouter_v1';
    const API = '/scouter';

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
        authenticDmg: false, moonshine: false, cake: false, apple: false, tengu: false, candy: false, house: false,
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
            ['authenticDmg', 'シンボル最大（ダメージ20%）', 'buff/authentic_symbol.png'],
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
            ['candy', 'Candied Apple', 'buff/candy.png'],
            ['house', "Caretaker's Support", 'buff/house.png'],
        ] },
    ];
    // 同じ group のもの（先方の画面で、1つ選ぶと他が外れるもの）。
    const GROUP_KEYS = {
        atk: ['bigHero', 'legendHero', 'legendHp', 'jangBi', 'shiningBlue'],
        food: ['fish', 'apple', 'tengu', 'cake', 'dragonsMeal', 'whiteBear', 'rebootAtkPotion'],
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
            wildhunterUnion: '0',
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
        d.statPotion = d.stat !== '0';
        // デーモンアヴェンジャーは「伝説の英雄の秘薬」が HP 版になる（先方の画面と同じ）。
        if (f.classId === 'demonavenger') { d.legendHp = !!d.legendHero; d.legendHero = false; } else d.legendHp = false;
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
                atkBase: str(sx('atk').base), atkAbs: str(sx('atk').abs), atkPercent: str(sx('atk').per),
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
                atk: num(sx('atk').base), atkPer: num(sx('atk').per), bossDmg: num(f.bossDmg), criDmg: num(f.criticalDmg),
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
        e.form = { ...DEFAULT_FORM(), ...e.form };
        for (const k of ['main', 'sub', 'sub2', 'atk']) e.form[k] = { ...blankStat(), ...e.form[k] };
        for (const k of ['hexa', 'link', 'seed', 'doping']) e.form[k] = { ...DEFAULT_FORM()[k], ...e.form[k] };
        return e;
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

    /* ---------- 一覧ページ ---------- */
    let rootEl = null;
    function init(rootId) {
        rootEl = document.getElementById(rootId);
        if (!loaded) load();
        render();
    }
    function cardHTML(id, title, sub, portrait) {
        const e = data[id];
        const r = e && e.result;
        const ok = r && r.b300 > 0;
        return `<button onclick="scouter.open('${esc(id)}')" class="sc-card ${ok ? 'is-on' : ''}">
            <span class="sc-pic">${portrait ? `<img src="${esc(portrait)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>
            <span class="sc-who"><b>${esc(title)}</b><small>${esc(sub)}</small></span>
            ${ok ? `<span class="sc-val"><b>${fmt(r.b300)}</b><small>HEXA ${fmt(r.b300h)} · ${esc((r.at || '').slice(5, 10).replace('-', '/'))}</small></span>`
                 : '<span class="sc-val sc-none">未入力</span>'}
        </button>`;
    }
    function render() {
        if (!rootEl) return;
        const list = chars();
        const cards = list.map((c) => cardHTML('char:' + c.id, c.name, `Lv.${c.level || '?'} ${c.job || ''}`,
            (c.image && c.image.startsWith('http')) ? c.image : (c.classImage || ''))).join('');
        rootEl.innerHTML = `<div class="sc-page">
            <div class="sc-head">
                <h2>Scouter</h2>
                <p>MapleScouter の換算主ステ（防御率300%のボス相手）をキャラごとに出します。カードを押すと入力と結果を開きます。</p>
            </div>
            <div class="sc-grid">${cards}${cardHTML('free', '仮入力', 'キャラに紐付けない入力', '')}</div>
            ${list.length ? '' : '<p class="sc-empty">Character Manager にキャラを登録すると、ここに並びます。</p>'}
        </div>`;
    }

    /* ---------- モーダル ---------- */
    let cur = null;   // { id, char, e, reads: [], busy, live }

    function open(id) {
        if (!loaded) load();
        const char = id.startsWith('char:') ? charOf(id.slice(5)) : null;
        const e = entry(id);
        if (!e.form.classId) e.form.classId = classIdFor(char);
        if (!e.form.level && char && char.level) e.form.level = String(char.level);
        close();
        cur = { id, char, e, reads: null, busy: false, live: null, msg: '', msgKind: '' };
        const veil = document.createElement('div');
        veil.id = 'sc-overlay';
        veil.className = 'fixed inset-0 z-[200] flex items-start justify-center bg-black/70 p-3 overflow-y-auto';
        veil.addEventListener('click', (ev) => { if (ev.target === veil) close(); });
        document.body.appendChild(veil);
        bindModal(veil);   // veil は閉じるまで同じ要素なので、ここで1回だけ付ける
        cur.esc = (ev) => { if (ev.key === 'Escape') close(); };
        document.addEventListener('keydown', cur.esc);
        cur.paste = (ev) => {
            const item = [...((ev.clipboardData && ev.clipboardData.items) || [])].find((x) => x.type.startsWith('image/'));
            if (!item) return;
            ev.preventDefault();
            readImage(item.getAsFile());
        };
        document.addEventListener('paste', cur.paste);
        renderModal();
    }
    function openForCharacter(charId) { open('char:' + charId); }

    function close() {
        if (!cur) return;
        stopLive();
        document.removeEventListener('keydown', cur.esc);
        document.removeEventListener('paste', cur.paste);
        const v = document.getElementById('sc-overlay');
        if (v) v.remove();
        cur = null;
        render();
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
        veil.innerHTML = `<div class="sc-modal">
            <div class="sc-bar">
                <div class="sc-bar-who">
                    ${portrait ? `<img src="${esc(portrait)}" alt="">` : ''}
                    <b>${esc(char ? char.name : '仮入力')}</b>
                    <span>Scouter</span>
                </div>
                <div class="sc-bar-act">
                    <button data-sc="file" title="ステータス画面のスクショを読み取る（貼り付け・ドロップでも可）"><i data-lucide="image"></i>スクショ読み取り</button>
                    <button data-sc="live" class="${cur.live ? 'is-live' : ''}" title="ゲーム画面を共有して、ステータス画面を読み取り続ける"><i data-lucide="monitor"></i>${cur.live ? 'ライブ停止' : 'ライブ読み取り'}</button>
                    <button data-sc="calc" class="sc-go" ${cur.busy ? 'disabled' : ''}><i data-lucide="calculator"></i>${cur.busy ? '計算中…' : '計算する'}</button>
                </div>
                <button data-sc="close" class="sc-x" title="閉じる"><i data-lucide="x"></i></button>
                <input type="file" accept="image/*" multiple data-sc="input" hidden>
            </div>
            <div class="sc-msg ${cur.msgKind}" id="sc-msg">${esc(cur.msg)}</div>
            <div id="sc-reads">${readsHTML()}</div>
            <div class="sc-body">
                <div class="sc-form">${formHTML(e.form)}</div>
                <div class="sc-side" id="sc-result">${resultHTML(e)}</div>
            </div>
        </div>`;
        bindDrop(veil);
        if (window.lucide) lucide.createIcons();
    }

    const inp = (path, v, w = '') => `<input class="sc-in ${w}" data-k="${path}" value="${esc(v)}" inputmode="decimal" placeholder="0">`;

    function formHTML(f) {
        const opts = Object.entries(window.CLASS_DATA || {}).map(([g, list]) => `<optgroup label="${esc(g)}">${
            list.filter((c) => CLASSES[c.id]).map((c) => `<option value="${c.id}" ${c.id === f.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
        const statRows = [...statsOf(f.classId), ['atk', isMagic(f.classId) ? 'Magic ATT' : 'Attack Power']].map(([k, label]) => {
            const s = f[k];
            const shown = f.screen && f.screen[screenKey(k, label)];
            const fin = finalOf(s);
            const diff = shown !== undefined && shown !== null && k !== 'atk' ? (fin === shown ? 'ok' : 'ng') : '';
            return `<tr>
                <th>${esc(label)}</th>
                <td>${inp(k + '.base', s.base)}</td><td>${inp(k + '.per', s.per)}</td><td>${inp(k + '.abs', s.abs)}</td>
                <td class="sc-fin" data-fin="${k}">${fmt(fin)}</td>
                <td class="sc-scr ${diff}" title="${diff === 'ng' ? '入力から出した最終値と、画面の値が合いません' : ''}">${shown !== undefined && shown !== null ? fmt(shown) : '—'}</td>
            </tr>`;
        }).join('');
        return `
            <p class="sc-note">ゲーム内の値は MapleScouter の前提の状態で入れます: 秘薬・外部バフ・ギルドスキルなし、リンクスキル装着（スタックなし）、シードリング装着、召喚獣（ソル・ヘカテなど）On、コンバットオーダーズ・シャープアイズ使用、ソウルゲージ初期化、ファミリア召喚。ボス戦で使うバフは下の「バフアイテム」で選びます。</p>
            <section class="sc-sec">
                <h3><i data-lucide="user-round"></i>基本</h3>
                <div class="sc-row">
                    <label>職業<select data-k="classId"><option value="">選択</option>${opts}</select></label>
                    <label>Lv${inp('level', f.level, 'w-s')}</label>
                    <label class="sc-chk"><input type="checkbox" data-k="reboot" ${f.reboot ? 'checked' : ''}>リブート（Heroic）</label>
                    <label class="sc-chk"><input type="checkbox" data-k="genesis" ${f.genesis ? 'checked' : ''}>ジェネシス解放</label>
                    <label class="sc-chk"><input type="checkbox" data-k="destiny" ${f.destiny ? 'checked' : ''}>デスティニー（最初の遺産）</label>
                </div>
            </section>
            <section class="sc-sec">
                <h3><i data-lucide="swords"></i>主ステータス・攻撃力 <small>STRなどにカーソルを合わせると出る [Applied Value] の値</small></h3>
                ${f.classId ? `<table class="sc-tbl">
                    <thead><tr><th></th><th>Base Value</th><th>% Value</th><th>% Not Applied</th><th>最終値</th><th>画面の値</th></tr></thead>
                    <tbody>${statRows}</tbody>
                </table>` : '<p class="sc-empty">先に職業を選んでください。</p>'}
            </section>
            <section class="sc-sec">
                <h3><i data-lucide="list"></i>詳細ステータス</h3>
                <div class="sc-detail">${DETAIL.map(([k, label, unit]) => `<label><span>${esc(label)}</span>${inp(k, f[k])}<i>${unit}</i></label>`).join('')}</div>
            </section>
            ${hexaHTML(f)}
            <section class="sc-sec">
                <h3><i data-lucide="flask-conical"></i>バフアイテム <small>ボス戦で使うもの。押すと On / Off</small></h3>
                ${BUFFS.map((g) => `<div class="sc-bgrp"><h4>${esc(g.title)}</h4><div class="sc-tiles">${g.items.map((it) => buffTile(f, it)).join('')}</div></div>`).join('')}
            </section>
            <section class="sc-sec">
                <h3><i data-lucide="link"></i>リンクスキル・シードリング <small>レベル</small></h3>
                <div class="sc-tiles">${LINKS.filter(([, , , only]) => !only || only === f.classId).map(([k, label, icon]) => lvTile(label, icon, 'link.' + k, f.link[k])).join('')}</div>
                <div class="sc-tiles sc-tiles-2">${SEEDS.map(([k, label, icon]) => lvTile(label, icon, 'seed.' + k, f.seed[k])).join('')}
                    <label class="sc-tile sc-tile-lv ${num(f.wildhunterUnion) ? 'on' : ''}" title="Wild Hunter のユニオン効果（%）"><span class="sc-ico sc-ico-txt">WH</span><span class="sc-tn">Wild Hunter ユニオン</span>${inp('wildhunterUnion', f.wildhunterUnion)}</label>
                </div>
            </section>`;
    }
    const img = (icon) => `<img class="sc-ico" src="${ICON}${icon}" alt="" loading="lazy">`;
    function lvTile(label, icon, path, v) {
        return `<label class="sc-tile sc-tile-lv ${num(v) ? 'on' : ''}" title="${esc(label)}">${img(icon)}<span class="sc-tn">${esc(label)}</span>${inp(path, v)}</label>`;
    }
    function buffTile(f, [k, label, icon, opt = {}]) {
        const d = f.doping;
        if (opt.lv !== undefined || opt.stat) {
            const path = opt.stat ? 'doping.stat' : 'doping.nobless.' + opt.lv;
            const v = opt.stat ? d.stat : (d.nobless || [])[opt.lv];
            return `<label class="sc-tile sc-tile-lv ${num(v) ? 'on' : ''}" title="${esc(label)}（0〜${opt.max}、0 で使わない）">${img(icon)}<span class="sc-tn">${esc(label)}</span>${inp(path, v)}</label>`;
        }
        return `<button type="button" class="sc-tile ${d[k] ? 'on' : ''}" data-sc="buff" data-key="${k}" title="${esc(label)}">${img(icon)}<span class="sc-tn">${esc(label)}</span><i class="sc-onoff">${d[k] ? 'ON' : 'OFF'}</i></button>`;
    }

    // HEXA。手で入れる。キャラは HEXA Tracker の今のレベルをボタンで取り込める。
    function hexaHTML(f) {
        const canImport = cur && cur.char && tracker();
        const head = `<h3><i data-lucide="hexagon"></i>HEXA <small>レベル</small>${canImport ? '<button data-sc="hexa" class="sc-mini"><i data-lucide="download"></i>HEXA Tracker から取り込む</button>' : ''}</h3>`;
        const cls = hexaClass(f.classId);
        const tiles = HEXA_KEYS.map(([hk, k, label]) => {
            const s = cls && cls.skills.find((x) => x.key === hk);
            return `<label class="sc-tile sc-tile-lv ${num(f.hexa[k]) ? 'on' : ''}" title="${esc(s ? s.name : label)}">
                ${s && s.icon ? `<img class="sc-ico" src="assets/hexa_icons/gms/${esc(s.icon)}.png" alt="" loading="lazy">` : `<span class="sc-ico sc-ico-txt">${esc(label.slice(0, 2))}</span>`}
                <span class="sc-tn">${esc(label)}</span>${inp('hexa.' + k, f.hexa[k])}</label>`;
        }).join('');
        return `<section class="sc-sec">${head}<div class="sc-tiles">${tiles}</div></section>`;
    }
    const screenKey = (k, label) => k === 'atk' ? (label === 'Magic ATT' ? 'matt' : 'att') : label.toLowerCase();

    /* ---------- ボスカット ---------- */
    // 計算のときに出して結果と一緒に保存する（先方の応答そのものは大きいので持たない）。
    function bossCuts(d, us) {
        if (typeof scouterBossCut === 'undefined') return null;
        try {
            const out = scouterBossCut.computeBossCuts(d, us);
            if (out.error) return null;
            return out.rows.map((x) => ({ b: x.boss, n: x.name, d: x.difficulty, s: x.bossStat, r: Math.round(x.clearRate * 1e4) / 1e4, p: x.isPartyBoss ? 1 : 0, l: x.partyLimit, v: x.label }));
        } catch (err) { console.error(err); return null; }
    }
    const CUT_LABEL = {
        '솔플 여유컷': ['ソロ余裕', 'c-solo2'], '솔플 가능': ['ソロ可', 'c-solo1'], '솔플 최소컷': ['ソロ最低ライン', 'c-solo0'],
        '파티격 가능': ['パーティで可', 'c-pt1'], '파티 최소컷': ['パーティ最低ライン', 'c-pt0'],
        '2인 최소컷': ['2人で最低ライン', 'c-pt1'], '3인 최소컷': ['3人で最低ライン', 'c-pt1'], '4인 최소컷': ['4人で最低ライン', 'c-pt0'],
        '6인 최소컷': ['6人で最低ライン', 'c-pt0'], '불가능': ['不可', 'c-no'], '입장 불가능': ['入場Lv不足', 'c-no'],
    };
    const DIFF_NAME = { Easy: 'Easy', Normal: 'Normal', Hard: 'Hard', Chaos: 'Chaos', Extreme: 'Extreme', Destiny: 'Destiny', Champion: 'Champion' };
    function bossOf(ko) {
        const list = window.BOSS_MASTER || [];
        const k = ko === '가엔슬' ? '가디언 엔젤 슬라임' : ko;
        return list.find((b) => b.ko && (b.ko === k || b.ko.endsWith(' ' + k))) || null;
    }
    // 先方の「自分の目安」と同じ絞り込み: 楽すぎる（10倍超）・遠すぎるボスは出さない。
    const nearCut = (c) => c.p ? (c.r / c.l <= 10 && c.r >= 0.85 / c.l) : (c.r <= 10 && c.r >= 0.15);
    function cutsHTML(cuts) {
        if (!cuts) return `<h3><i data-lucide="skull"></i>ボスカット</h3><p class="sc-empty">もう一度「計算する」を押すと出ます。</p>`;
        const all = cur && cur.allCuts;
        const list = cuts.filter((c) => c.d !== 'Destiny' && c.d !== 'Champion' && (all || nearCut(c)));
        const rows = list.map((c) => {
            const b = bossOf(c.b);
            const [txt, cls] = CUT_LABEL[c.v] || [c.v, 'c-no'];
            const pct = c.r * 100;
            const pctTxt = (pct >= 1000 ? Math.round(pct).toLocaleString() : pct >= 100 ? pct.toFixed(1) : pct.toFixed(2)) + '%';
            const img = b && b.image ? `<img src="https://cdn.maplehub.app/bosses/${esc(b.image)}.webp" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span></span>';
            return `<tr class="${cls}" title="ボスカットに対して ${pctTxt}${c.p ? '（パーティ前提のボス）' : ''}">
                <td class="sc-cut-img">${img}</td>
                <th><b>${esc(b ? (b.short || b.ja) : c.b)}</b><small class="df-${esc(c.d.toLowerCase())}">${esc(DIFF_NAME[c.d] || c.d)}</small></th>
                <td class="sc-cut-pct">${c.p ? '<i>PT</i>' : ''}${pctTxt}</td>
                <td class="sc-cut-v">${esc(txt)}</td>
            </tr>`;
        }).join('');
        return `<h3><i data-lucide="skull"></i>ボスカット <small>${all ? 'すべて' : '自分の目安'}</small><button data-sc="cuts" class="sc-mini">${all ? '目安だけ' : 'すべて表示'}</button></h3>
            ${rows ? `<table class="sc-cut">${rows}</table>` : '<p class="sc-empty">目安に入るボスがありません。</p>'}`;
    }

    function resultHTML(e) {
        const r = e.result;
        const f = e.form;
        if (!r) return `<div class="sc-res-empty">値を入れて「計算する」を押すと、ここに換算主ステが出ます。</div>`;
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
        const hist = (e.history || []).slice(-6).reverse();
        const cpGame = f.screen && f.screen.combatPower;
        return `
            <div class="sc-big">
                <span>換算主ステ（防御率300%）</span>
                <b>${fmt(r.b300)}</b>
                <small>380%: ${fmt(r.b380)}</small>
            </div>
            <table class="sc-kv">
                <tr><th>HEXA換算（300%）</th><td>${fmt(r.b300h)}</td></tr>
                <tr><th>HEXA換算（380%）</th><td>${fmt(r.b380h)}</td></tr>
                <tr><th>換算戦闘力</th><td>${fmt(r.xp)}</td></tr>
                <tr><th>戦闘力（計算）</th><td>${fmt(r.cp)}</td></tr>
                ${cpGame ? `<tr><th>戦闘力（画面）</th><td>${fmt(cpGame)}</td></tr>` : ''}
                <tr><th>計算日時</th><td>${esc((r.at || '').replace('T', ' ').slice(0, 16))}</td></tr>
            </table>
            ${cutsHTML(r.cuts)}
            ${rows.length && base ? `<h3>スペック効率 <small>${esc(label)}いくつ分か</small></h3>
            <table class="sc-kv sc-eff">${rows.map(([n, v]) => `<tr><th>${esc(n)}</th><td>${esc(label)} <b>${(v / base).toFixed(2)}</b></td></tr>`).join('')}</table>` : ''}
            ${hist.length > 1 ? `<h3>履歴</h3><table class="sc-kv">${hist.map((h) => `<tr><th>${esc((h.at || '').replace('T', ' ').slice(0, 16))}</th><td>${fmt(h.b300)}</td></tr>`).join('')}</table>` : ''}`;
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
            else if (k === 'cuts') { cur.allCuts = !cur.allCuts; renderModal(); }
            else if (k === 'apply') applyReads();
            else if (k === 'discard') { cur.reads = null; document.getElementById('sc-reads').innerHTML = ''; setMsg('読み取りを捨てました。'); }
        });
        veil.addEventListener('change', async (ev) => {
            const t = ev.target;
            if (t.dataset.sc === 'input') {
                const files = [...t.files];
                t.value = '';
                for (const f of files) await readImage(f);
                return;
            }
            if (!t.dataset.k) return;
            const f = cur.e.form;
            if (t.type === 'checkbox') setPath(f, t.dataset.k, t.checked);
            else setPath(f, t.dataset.k, t.value.trim());
            save();
            // 入力欄が消えるときの blur からも change が来るので、作り直しは後に回す。
            if (t.dataset.k === 'classId' || /^(doping|link|seed|hexa)\.|^wildhunterUnion$/.test(t.dataset.k)) setTimeout(renderModal);
        });
        // 打っている間は作り直さない（フォーカスが外れる）。最終値の欄だけ書き換える。
        veil.addEventListener('input', (ev) => {
            const t = ev.target;
            if (!t.dataset.k || t.type === 'checkbox' || t.tagName === 'SELECT') return;
            setPath(cur.e.form, t.dataset.k, t.value.trim());
            save();
            const k = t.dataset.k.split('.')[0];
            const cell = veil.querySelector(`[data-fin="${k}"]`);
            if (cell) cell.textContent = fmt(finalOf(cur.e.form[k]));
        });
    }
    // .sc-modal は描き直すたびに作り直すので、こちらは毎回付ける。
    function bindDrop(veil) {
        const box = veil.querySelector('.sc-modal');
        box.addEventListener('dragover', (ev) => { if ([...ev.dataTransfer.types].includes('Files')) { ev.preventDefault(); box.classList.add('drop'); } });
        box.addEventListener('dragleave', (ev) => { if (!box.contains(ev.relatedTarget)) box.classList.remove('drop'); });
        box.addEventListener('drop', async (ev) => {
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
        setMsg('MapleScouter で計算しています…');
        const mine = cur;
        const us = buildUserStat(f);
        try {
            const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userStat: us }) });
            const out = await res.json().catch(() => null);
            if (!res.ok || !out || !out.calculatedData) throw new Error((out && out.error) || `HTTP ${res.status}`);
            const d = out.calculatedData;
            const bad = [d.boss300_stat, d.boss300_hexaStat].find((v) => typeof v === 'number' && v < 0);
            if (bad !== undefined) {
                e.result = { error: `MapleScouter が計算できませんでした: ${ERRORS[String(bad)] || 'コード ' + bad}`, at: new Date().toISOString() };
            } else {
                const at = new Date().toISOString();
                e.result = {
                    at, b300: d.boss300_stat, b380: d.boss380_stat, b300h: d.boss300_hexaStat, b380h: d.boss380_hexaStat,
                    cp: d.combatPower, xp: d.exchangePower, xph: d.exchangePowerHexa, eff: d.specEfficiency || {},
                    cuts: bossCuts(d, us),
                };
                e.history = (e.history || []).concat({ at, b300: d.boss300_stat, b300h: d.boss300_hexaStat }).slice(-30);
            }
            save();
            if (cur === mine) setMsg(e.result.error ? '' : '計算しました。', e.result.error ? 'err' : 'ok');
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
    function stage(res) {
        if (!cur) return 0;
        const r = cur.reads || (cur.reads = { values: {}, splits: {} });
        let n = 0;
        const w = res.window || {};
        if (w.sacred === undefined && w.authentic !== undefined) w.sacred = w.authentic;
        for (const k of [...FORM_KEYS, ...SCREEN_KEYS]) {
            if (w[k] === undefined) continue;
            if (r.values[k] !== w[k]) n++;
            r.values[k] = w[k];
        }
        const t = res.tooltip;
        if (t) {
            const prev = r.splits[t.stat];
            if (!prev || prev.base !== t.base || prev.per !== t.per || prev.abs !== t.abs) n++;
            r.splits[t.stat] = { base: t.base, per: t.per, abs: t.abs };
        }
        return n;
    }
    // ツールチップの stat（str/dex/att…）がこの職業のどの欄か。
    function slotOf(stat, cid) {
        if (stat === 'att' || stat === 'matt') return (stat === 'matt') === isMagic(cid) ? 'atk' : null;
        const hit = statsOf(cid).find(([, label]) => label.toLowerCase() === stat);
        return hit ? hit[0] : null;
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
        return `<div class="sc-reads">
            <div class="sc-reads-h"><b>読み取り結果</b>
                <span>${missing.length && f.classId ? `まだ内訳がない: ${esc(missing.join('・'))}（カーソルを合わせた状態で読み取り）` : ''}</span>
                <button data-sc="apply" class="sc-go">反映して保存</button><button data-sc="discard">捨てる</button></div>
            <div class="sc-reads-v">${vals}${sp}</div>
        </div>`;
    }
    function showReads() {
        const el = document.getElementById('sc-reads');
        if (el) el.innerHTML = readsHTML();
    }
    function applyReads() {
        if (!cur || !cur.reads) return;
        const f = cur.e.form;
        const { values, splits } = cur.reads;
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
            setMsg(n ? '読み取りました。内容を確かめて「反映して保存」を押してください。' : 'ステータス画面の値が見つかりませんでした。', n ? 'ok' : 'err');
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
        const L = { stream, video, busy: false };
        cur.live = L;
        stream.getVideoTracks()[0].addEventListener('ended', () => { if (cur && cur.live === L) { stopLive(); renderModal(); setMsg('画面共有が終わりました。'); } });
        L.timer = setInterval(() => liveTick(L), 600);
        renderModal();
        setMsg('ライブ読み取り中。ステータス画面を開き、STR などにカーソルを合わせると内訳も読み取ります。');
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
            const n = stage(res);
            if (n) { beep(); showReads(); setMsg('読み取りました。ほかの項目にもカーソルを合わせられます。終わったら「反映して保存」。', 'ok'); }
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

    return { STORAGE_KEY, init, render, open, openForCharacter, close, resultFor, buildUserStat, DEFAULT_FORM, CLASSES };
})();
