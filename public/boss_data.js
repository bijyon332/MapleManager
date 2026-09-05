/* =========================================================
 *  Boss definitions
 *  週ボスPT編成ツールのマスタ。コード内に散らさず、ここだけを
 *  差し替えればボス追加・難易度追加に対応できるようにしている。
 * ========================================================= */

// ---- Bosses (表示順 = リスト順) ----------------------------
// difficulties: 易しい順に並べる。難易度の高さはこの配列内の位置で決まる
//               （ボスをまたいだ難易度比較はしない）。
// image: MapleHub CDN slug (https://cdn.maplehub.app/bosses/{slug}.webp)。
//        読み込みに失敗したら icon(lucide) + color にフォールバックする。
// color: カードの背景ティント / 上部アクセント / アイコンのテーマカラー。
const BOSS_DATA = [
    { id: "kalos",     name: "カロス",             difficulties: ["NORMAL", "CHAOS", "EXTREME"],
      maxMembers: 6, color: "#f97316", icon: "snowflake",    image: "kalos-the-guardian" },
    { id: "kaling",    name: "カリーン",           difficulties: ["EASY", "NORMAL", "HARD"],
      maxMembers: 6, color: "#f43f5e", icon: "flame",        image: "kaling" },
    { id: "seren",     name: "セレン",             difficulties: ["EXTREME"],
      maxMembers: 6, color: "#10b981", icon: "sun",          image: "chosen-seren" },
    { id: "darknight", name: "暗黒の魔法使い",     difficulties: ["EXTREME"],
      maxMembers: 6, color: "#4f46e5", icon: "moon",         image: "black-mage" },
    { id: "adversary", name: "対敵者",             difficulties: ["NORMAL", "HARD"],
      maxMembers: 3, color: "#a78bfa", icon: "shield-alert", image: "the-first-adversary" },
    { id: "limbo",     name: "リンボ",             difficulties: ["NORMAL", "HARD"],
      maxMembers: 3, color: "#c026d3", icon: "infinity",     image: "limbo" },
    { id: "kyousei",   name: "凶星",               difficulties: ["NORMAL", "HARD"],
      maxMembers: 3, color: "#eab308", icon: "star",         image: "malefic-star" },
    { id: "bellona",   name: "ベローナ",           difficulties: ["NORMAL", "HARD"],
      maxMembers: 3, color: "#06b6d4", icon: "swords",       image: "bellona" },
    { id: "baldrix",   name: "バルドリクス",       difficulties: ["NORMAL", "HARD"],
      maxMembers: 3, color: "#38bdf8", icon: "sword",        image: "baldrix" },
    { id: "jupiter",   name: "ユピテル",           difficulties: ["NORMAL", "HARD"],
      maxMembers: 3, color: "#facc15", icon: "zap",          image: "jupiter" }
];

// MapleHub CDN base URL
const BOSS_IMAGE_BASE = "https://cdn.maplehub.app/bosses/";
// image が "http..." で始まればそのまま返し、それ以外はMapleHub CDNのスラグとして解釈
function bossImageUrl(boss) {
    if (!boss || !boss.image) return "";
    if (/^https?:\/\//i.test(boss.image)) return boss.image;
    return BOSS_IMAGE_BASE + boss.image + ".webp";
}

// バッジ用の短い英語表記（既存デザインを踏襲）
const DIFFICULTY_LABEL = {
    EASY:    "Easy",
    NORMAL:  "Normal",
    HARD:    "Hard",
    CHAOS:   "Chaos",
    EXTREME: "Extreme"
};

// 希望チップ・Discord出力用の日本語表記
const DIFFICULTY_LABEL_JA = {
    EASY:    "イージー",
    NORMAL:  "ノーマル",
    HARD:    "ハード",
    CHAOS:   "カオス",
    EXTREME: "エクストリーム"
};

const DIFFICULTY_BADGE_CLASS = {
    EASY:    "badge-easy",
    NORMAL:  "badge-normal",
    HARD:    "badge-hard",
    CHAOS:   "badge-chaos",
    EXTREME: "badge-extreme"
};

// 表示上の一般的な並び（ボス内の相対順位は BOSS_DATA.difficulties が優先）
const DIFFICULTY_ORDER = ["EASY", "NORMAL", "HARD", "CHAOS", "EXTREME"];

if (typeof window !== "undefined") {
    window.BOSS_DATA = BOSS_DATA;
    window.DIFFICULTY_LABEL = DIFFICULTY_LABEL;
    window.DIFFICULTY_LABEL_JA = DIFFICULTY_LABEL_JA;
    window.DIFFICULTY_BADGE_CLASS = DIFFICULTY_BADGE_CLASS;
    window.DIFFICULTY_ORDER = DIFFICULTY_ORDER;
    window.BOSS_IMAGE_BASE = BOSS_IMAGE_BASE;
    window.bossImageUrl = bossImageUrl;
}
