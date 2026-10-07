/* =========================================================
 *  ボスの定義（全アプリ共通）
 *  Character Manager（結晶価格）・Party Builder（最大人数・画像・色）・
 *  Cheat Sheet（入場Lv・ボスLv・必要フォース）が、どれもここを読む。
 *  新ボス・難易度・価格の変更は、このファイルだけを直せばよい。
 *
 *  1体1エントリ:
 *    en / ja / ko : 英語名（GMS）・日本語名・韓国語名（KMS）。パッチノートや資料との突き合わせ用。
 *                   ko の空欄は未確認。
 *    short        : 日本語の短い表記（Party Builder のカード）。無ければ ja。
 *    shortEn      : 英語の短い表記（Character Manager のボスのマスで画像が無いとき）。無ければ en。
 *    aliases      : 資料や過去のデータで使われていた別の表記。
 *    maxMembers   : 最大人数。
 *    image        : public/assets/bosses/{image}.webp のファイル名（元は MapleHub CDN のスラグ）。
 *    force        : 'arc'（アーケイン）/ 'sac'（オーセンティック）/ 'none'（要求フォースなし）。
 *                   無い場合は未登録（Cheat Sheet の結晶表で「要求未登録」と出る）。
 *    entry        : 入場Lv。forceNote: Cheat Sheet でボス名の横に出す補足。
 *    party        : Party Builder に出すボスだけ。id は保存データのキーなので変えないこと。
 *                   difficulties は Party Builder で選べる難易度（易しい順）。
 *    diffs        : 難易度ごと（易しい順）。
 *                   id / type / meso … Character Manager の結晶（id は保存データのキーなので変えないこと）
 *                   max             … この難易度だけ最大人数が違うとき（スウ Extreme は2人）
 *                   lv / af / sac   … Cheat Sheet のボスLv・必要AF・必要AUT
 *
 *  メモ:
 *  - 最初の対敵者ハード/エクストリームのボスLv（285/290）は Mapler House の値。MapleStory Wiki は 270。
 *  - ベローナは KMS で 2026-08 実装。GMS に来ているかは未確認のまま載せている（結晶価格なし）。
 * ========================================================= */

const BOSS_MASTER = [
    {
        en: "Kalos the Guardian", ja: "カロス", ko: "감시자 칼로스",
        shortEn: "Kalos", aliases: ["監視者カロス"],
        maxMembers: 6, image: "kalos-the-guardian",
        force: "sac", entry: 265, forceNote: "ノーマル1段階目は250",
        party: { id: "kalos", difficulties: ["NORMAL","CHAOS","EXTREME"], color: "#f97316", icon: "snowflake" },
        diffs: [
            { d: "EASY", id: "b_kalos_easy", type: "WEEKLY", meso: 937500000, lv: 270, sac: 200 },
            { d: "NORMAL", id: "b_kalos_normal", type: "WEEKLY", meso: 1300000000, lv: 280, sac: 300 },
            { d: "CHAOS", id: "b_kalos_chaos", type: "WEEKLY", meso: 2600000000, lv: 285, sac: 330 },
            { d: "EXTREME", id: "b_kalos_ex", type: "WEEKLY", meso: 5200000000, lv: 285, sac: 440 },
        ],
    },
    {
        en: "Kaling", ja: "カリーン", ko: "카링",
        maxMembers: 6, image: "kaling",
        force: "sac", entry: 275,
        party: { id: "kaling", difficulties: ["EASY","NORMAL","HARD"], color: "#f43f5e", icon: "flame" },
        diffs: [
            { d: "EASY", id: "b_kaling_easy", type: "WEEKLY", meso: 1031250000, lv: 275, sac: 230 },
            { d: "NORMAL", id: "b_kaling_normal", type: "WEEKLY", meso: 1506500000, lv: 285, sac: 330 },
            { d: "HARD", id: "b_kaling_hard", type: "WEEKLY", meso: 2990000000, lv: 285, sac: 350 },
            { d: "EXTREME", id: "b_kaling_ex", type: "WEEKLY", meso: 6026000000, lv: 285, sac: 480 },
        ],
    },
    {
        en: "Chosen Seren", ja: "選ばれし者セレン", ko: "선택받은 세렌",
        short: "セレン", shortEn: "Seren", aliases: ["セレン"],
        maxMembers: 6, image: "chosen-seren",
        force: "sac", entry: 260, forceNote: "1段階目は150",
        party: { id: "seren", difficulties: ["HARD","EXTREME"], color: "#10b981", icon: "sun" },
        diffs: [
            { d: "NORMAL", id: "b_seren_normal", type: "WEEKLY", meso: 889021875, lv: 270, sac: 200 },
            { d: "HARD", id: "b_seren_hard", type: "WEEKLY", meso: 1096562500, lv: 275, sac: 200 },
            { d: "EXTREME", id: "b_seren_ex", type: "WEEKLY", meso: 4235000000, lv: 280, sac: 200 },
        ],
    },
    {
        en: "Black Mage", ja: "暗黒の魔法使い", ko: "검은 마법사",
        maxMembers: 6, image: "black-mage",
        force: "arc", entry: 255,
        party: { id: "darknight", difficulties: ["EXTREME"], color: "#4f46e5", icon: "moon" },
        diffs: [
            { d: "HARD", id: "b_bm_hard", type: "MONTHLY", meso: 4500000000, lv: 275, af: 1320 },
            { d: "EXTREME", id: "b_bm_ex", type: "MONTHLY", meso: 18000000000, lv: 280, af: 1320 },
        ],
    },
    {
        en: "First Adversary", ja: "最初の対敵者", ko: "최초의 대적자",
        short: "対敵者", shortEn: "First Adv.", aliases: ["対敵者"],
        maxMembers: 3, image: "the-first-adversary",
        force: "sac", entry: 270,
        party: { id: "adversary", difficulties: ["NORMAL","HARD"], color: "#a78bfa", icon: "shield-alert" },
        diffs: [
            { d: "EASY", id: "b_fa_easy", type: "WEEKLY", meso: 985000000, lv: 270, sac: 220 },
            { d: "NORMAL", id: "b_fa_normal", type: "WEEKLY", meso: 1365000000, lv: 280, sac: 320 },
            { d: "HARD", id: "b_fa_hard", type: "WEEKLY", meso: 2940000000, lv: 285, sac: 340 },
            { d: "EXTREME", id: "b_fa_ex", type: "WEEKLY", meso: 5880000000, lv: 290, sac: 460 },
        ],
    },
    {
        en: "Limbo", ja: "リンボ", ko: "림보",
        maxMembers: 3, image: "limbo",
        force: "sac", entry: 285,
        party: { id: "limbo", difficulties: ["NORMAL","HARD"], color: "#c026d3", icon: "infinity" },
        diffs: [
            { d: "NORMAL", id: "b_limbo_normal", type: "WEEKLY", meso: 2100000000, lv: 285, sac: 500 },
            { d: "HARD", id: "b_limbo_hard", type: "WEEKLY", meso: 3745000000, lv: 285, sac: 500 },
        ],
    },
    {
        en: "Malefic Star", ja: "凶星", ko: "찬란한 흉성",
        shortEn: "Malefic", aliases: ["燦爛たる凶星"],
        maxMembers: 3, image: "malefic-star",
        force: "sac", entry: 280,
        party: { id: "kyousei", difficulties: ["NORMAL","HARD"], color: "#eab308", icon: "star" },
        diffs: [
            { d: "NORMAL", id: "b_malefic_normal", type: "WEEKLY", meso: 1452000000, lv: 280, sac: 400 },
            { d: "HARD", id: "b_malefic_hard", type: "WEEKLY", meso: 3990000000, lv: 280, sac: 550 },
        ],
    },
    {
        en: "Bellona", ja: "ベローナ", ko: "",
        maxMembers: 3, image: "bellona",
        force: "sac", entry: 280,
        party: { id: "bellona", difficulties: ["NORMAL","HARD"], color: "#06b6d4", icon: "swords" },
        diffs: [
            { d: "EASY", lv: 280, sac: 400 },
            { d: "NORMAL", lv: 280, sac: 450 },
            { d: "HARD", lv: 280, sac: 550 },
        ],
    },
    {
        en: "Baldrix", ja: "バルドリクス", ko: "발드릭스",
        aliases: ["バルドリックス"],
        maxMembers: 3, image: "baldrix",
        force: "sac", entry: 290,
        party: { id: "baldrix", difficulties: ["NORMAL","HARD"], color: "#38bdf8", icon: "sword" },
        diffs: [
            { d: "NORMAL", id: "b_baldrix_normal", type: "WEEKLY", meso: 2800000000, lv: 290, sac: 700 },
            { d: "HARD", id: "b_baldrix_hard", type: "WEEKLY", meso: 4200000000, lv: 290, sac: 700 },
        ],
    },
    {
        en: "Jupiter", ja: "ユピテル", ko: "유피테르",
        aliases: ["ジュピター"],
        maxMembers: 3, image: "jupiter",
        force: "sac", entry: 295,
        party: { id: "jupiter", difficulties: ["NORMAL","HARD"], color: "#facc15", icon: "zap" },
        diffs: [
            { d: "NORMAL", id: "b_jupiter_normal", type: "WEEKLY", meso: 2965000000, lv: 295, sac: 810 },
            { d: "HARD", id: "b_jupiter_hard", type: "WEEKLY", meso: 5593000000, lv: 295, sac: 810 },
        ],
    },
    {
        en: "Lotus", ja: "スウ", ko: "스우",
        maxMembers: 6, image: "lotus",
        force: "none",
        diffs: [
            { d: "NORMAL", id: "b_lotus_normal", type: "WEEKLY", meso: 162562500 },
            { d: "HARD", id: "b_lotus_hard", type: "WEEKLY", meso: 444675000 },
            { d: "EXTREME", id: "b_lotus_ex", type: "WEEKLY", meso: 1397500000, max: 2 },
        ],
    },
    {
        en: "Verus Hilla", ja: "真・ヒルラ", ko: "진 힐라",
        shortEn: "V.Hilla",
        maxMembers: 6, image: "verus-hilla",
        force: "arc", entry: 250,
        diffs: [
            { d: "NORMAL", id: "b_vhilla_normal", type: "WEEKLY", meso: 581880000, lv: 250, af: 820 },
            { d: "HARD", id: "b_vhilla_hard", type: "WEEKLY", meso: 762105000, lv: 250, af: 900 },
        ],
    },
    {
        en: "Darknell", ja: "デュンケル", ko: "듄켈",
        maxMembers: 6, image: "darknell",
        force: "arc", entry: 255,
        diffs: [
            { d: "NORMAL", id: "b_darknell_normal", type: "WEEKLY", meso: 316875000, lv: 265, af: 850 },
            { d: "HARD", id: "b_darknell_hard", type: "WEEKLY", meso: 667920000, lv: 265, af: 850 },
        ],
    },
    {
        en: "Will", ja: "ウィル", ko: "윌",
        maxMembers: 6, image: "will",
        force: "arc", entry: 235,
        diffs: [
            { d: "EASY", id: "b_will_easy", type: "WEEKLY", meso: 246744750, lv: 235, af: 560 },
            { d: "NORMAL", id: "b_will_normal", type: "WEEKLY", meso: 279075000, lv: 250, af: 760 },
            { d: "HARD", id: "b_will_hard", type: "WEEKLY", meso: 621810000, lv: 250, af: 760 },
        ],
    },
    {
        en: "Guardian Angel Slime", ja: "Gスライム", ko: "가디언 엔젤 슬라임",
        shortEn: "Slime",
        maxMembers: 6, image: "guardian-angel-slime",
        force: "none",
        diffs: [
            { d: "NORMAL", id: "b_gas_normal", type: "WEEKLY", meso: 231673500 },
            { d: "CHAOS", id: "b_gas_chaos", type: "WEEKLY", meso: 600578125 },
        ],
    },
    {
        en: "Gloom", ja: "ダスク", ko: "더스크",
        maxMembers: 6, image: "gloom",
        force: "arc", entry: 245,
        diffs: [
            { d: "NORMAL", id: "b_gloom_normal", type: "WEEKLY", meso: 297675000, lv: 255, af: 730 },
            { d: "CHAOS", id: "b_gloom_chaos", type: "WEEKLY", meso: 563945000, lv: 255, af: 730 },
        ],
    },
    {
        en: "Lucid", ja: "ルシード", ko: "루시드",
        maxMembers: 6, image: "lucid",
        force: "arc", entry: 220,
        diffs: [
            { d: "EASY", id: "b_lucid_easy", type: "WEEKLY", meso: 237009375, lv: 230, af: 360 },
            { d: "NORMAL", id: "b_lucid_normal", type: "WEEKLY", meso: 253828125, lv: 230, af: 360 },
            { d: "HARD", id: "b_lucid_hard", type: "WEEKLY", meso: 504000000, lv: 230, af: 360 },
        ],
    },
    {
        en: "Damien", ja: "デミアン", ko: "데미안",
        maxMembers: 6, image: "damien",
        force: "none",
        diffs: [
            { d: "NORMAL", id: "b_damien_normal", type: "WEEKLY", meso: 169000000 },
            { d: "HARD", id: "b_damien_hard", type: "WEEKLY", meso: 421875000 },
        ],
    },
    {
        en: "Mitsuhide", ja: "アケチミツヒデ", ko: "",
        maxMembers: 6, image: "akechi-mitsuhide",
        diffs: [
            { d: "NORMAL", id: "b_mitu_normal", type: "WEEKLY", meso: 144000000 },
        ],
    },
    {
        en: "Papulatus", ja: "ビシャスプラント", ko: "파풀라투스",
        shortEn: "Papulatus",
        maxMembers: 6, image: "papulatus",
        diffs: [
            { d: "CHAOS", id: "b_papa_chaos", type: "WEEKLY", meso: 132250000 },
        ],
    },
    {
        en: "Vellum", ja: "ベルルム", ko: "벨룸",
        maxMembers: 6, image: "vellum",
        diffs: [
            { d: "CHAOS", id: "b_vellum_chaos", type: "WEEKLY", meso: 105062500 },
        ],
    },
    {
        en: "Magnus", ja: "マグナス", ko: "매그너스",
        maxMembers: 6, image: "magnus",
        diffs: [
            { d: "NORMAL", id: "b_mag_normal", type: "DAILY", meso: 12960000 },
            { d: "HARD", id: "b_mag_hard", type: "WEEKLY", meso: 95062500 },
        ],
    },
    {
        en: "Princess No", ja: "ノウ姫", ko: "",
        shortEn: "P.No",
        maxMembers: 6, image: "princess-no",
        diffs: [
            { d: "NORMAL", id: "b_pno_normal", type: "WEEKLY", meso: 81000000 },
        ],
    },
    {
        en: "Zakum", ja: "ジャクム", ko: "자쿰",
        maxMembers: 6, image: "zakum",
        diffs: [
            { d: "CHAOS", id: "b_zakum_chaos", type: "WEEKLY", meso: 81000000 },
        ],
    },
    {
        en: "Pierre", ja: "ピエール", ko: "피에르",
        maxMembers: 6, image: "pierre",
        diffs: [
            { d: "CHAOS", id: "b_pierre_chaos", type: "WEEKLY", meso: 81000000 },
        ],
    },
    {
        en: "Von Bon", ja: "バンバン", ko: "반반",
        maxMembers: 6, image: "von-bon",
        diffs: [
            { d: "CHAOS", id: "b_bon_chaos", type: "WEEKLY", meso: 81000000 },
        ],
    },
    {
        en: "Crimson Queen", ja: "ブラッディクイーン", ko: "블러디퀸",
        shortEn: "Queen",
        maxMembers: 6, image: "crimson-queen",
        diffs: [
            { d: "CHAOS", id: "b_queen_chaos", type: "WEEKLY", meso: 81000000 },
        ],
    },
    {
        en: "Cygnus", ja: "シグナス", ko: "시그너스",
        maxMembers: 6, image: "cygnus",
        diffs: [
            { d: "NORMAL", id: "b_cygnus_normal", type: "WEEKLY", meso: 72250000 },
        ],
    },
    {
        en: "Pink Bean", ja: "ピンクビーン", ko: "핑크빈",
        maxMembers: 6, image: "pink-bean",
        diffs: [
            { d: "NORMAL", id: "b_pink_normal", type: "DAILY", meso: 7022500 },
            { d: "CHAOS", id: "b_pink_chaos", type: "WEEKLY", meso: 64000000 },
        ],
    },
    {
        en: "Hilla", ja: "ヒルラ", ko: "힐라",
        maxMembers: 6, image: "hilla",
        diffs: [
            { d: "HARD", id: "b_hilla_hard", type: "WEEKLY", meso: 56250000 },
        ],
    },
    {
        en: "Arkarium", ja: "アーカイラム", ko: "아카이럼",
        maxMembers: 6, image: "arkarium",
        diffs: [
            { d: "NORMAL", id: "b_ark_normal", type: "DAILY", meso: 12602500 },
        ],
    },
    {
        en: "Gollux", ja: "ヴェラッド", ko: "",
        maxMembers: 6, image: "gollux",
        diffs: [
            { d: "NORMAL", id: "b_gollux_normal", type: "DAILY", meso: 0 },
        ],
    },
];

const bossByEn = (en) => BOSS_MASTER.find(b => b.en === en) || null;

// Character Manager 用の結晶一覧（1難易度1行）。
// Character Manager の編集画面でのボスの並び（bi 指定、2026-09-29）。英語名で書く。
// ここに無いボスは後ろに、結晶価格の高い順で並ぶ。
const BOSS_REGISTER_ORDER = [
    "Jupiter", "Baldrix", "Malefic Star", "Limbo", "First Adversary", "Kaling", "Kalos the Guardian",
    "Chosen Seren", "Verus Hilla", "Darknell", "Gloom", "Guardian Angel Slime", "Will", "Lucid", "Damien", "Lotus"
];

function bossCrystalList() {
    return BOSS_MASTER.flatMap(b => b.diffs.filter(d => d.id).map(d => ({
        id: d.id, name: b.en, kana: b.ja, difficulty: d.d, meso: d.meso, type: d.type,
        max: d.max || b.maxMembers || 6
    })));
}

// Cheat Sheet 用の要求フォース表。kind は 'arc' か 'sac'。
// 列は E / N / H / X（カオスはハードの列）。
function bossForceTable(kind) {
    const col = { EASY: 'E', NORMAL: 'N', HARD: 'H', CHAOS: 'H', EXTREME: 'X' };
    const key = kind === 'arc' ? 'af' : 'sac';
    return BOSS_MASTER.filter(b => b.force === kind).map(b => {
        const row = { boss: b.ja, en: b.en, entry: b.entry };
        if (b.forceNote) row.sub = b.forceNote;
        b.diffs.forEach(d => { if (d[key] != null) row[col[d.d]] = { lv: d.lv, [key]: d[key] }; });
        return row;
    });
}

if (typeof window !== 'undefined') {
    window.BOSS_MASTER = BOSS_MASTER;
    window.bossByEn = bossByEn;
    window.bossCrystalList = bossCrystalList;
    window.BOSS_REGISTER_ORDER = BOSS_REGISTER_ORDER;
    window.bossForceTable = bossForceTable;
}
