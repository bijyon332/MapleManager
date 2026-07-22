/* =========================================================
 *  Boss & Server definitions
 * ========================================================= */

// ---- Bosses (表示順 = リスト順) ----------------------------
// image: MapleHub CDN slug (https://cdn.maplehub.app/bosses/{slug}.webp).
//        画像読み込み失敗時は icon(lucide) + color にフォールバック。
// color: カードの背景ティント / 上部アクセント / アイコンに使うテーマカラー。
// 隣り合うボスを見分けやすいよう、色相が重複しないように割り当てている。
const BOSS_DATA = [
    { id: "black_mage", name: "暗黒の魔法使い",    difficulties: ["HARD", "EXTREME"],
      maxMembers: 6, color: "#4f46e5", icon: "moon",         image: "black-mage" },
    { id: "ex_sw",     name: "EXスウ",             difficulties: ["EXTREME"],
      maxMembers: 2, color: "#ef4444", icon: "skull",        image: "lotus" /* スウ = Lotus (週ボスタスクと同じスラグ) */ },
    { id: "seren",     name: "セレン",             difficulties: ["HARD", "EXTREME"],
      maxMembers: 6, color: "#10b981", icon: "sun",          image: "chosen-seren" },
    { id: "kalos",     name: "カロス",             difficulties: ["EASY", "NORMAL", "CHAOS", "EXTREME"],
      maxMembers: 6, color: "#f97316", icon: "snowflake",    image: "kalos-the-guardian" },
    { id: "kaling",    name: "カリーン",           difficulties: ["EASY", "NORMAL", "HARD", "EXTREME"],
      maxMembers: 6, color: "#f43f5e", icon: "flame",        image: "kaling" },
    { id: "first_adv", name: "最初の対敵者",       difficulties: ["EASY", "NORMAL", "HARD", "EXTREME"],
      maxMembers: 3, color: "#a78bfa", icon: "shield-alert", image: "the-first-adversary" },
    { id: "malefic",   name: "マレフィックスター", difficulties: ["NORMAL", "HARD"],
      maxMembers: 3, color: "#eab308", icon: "star",         image: "malefic-star" },
    { id: "limbo",     name: "リンボ",             difficulties: ["NORMAL", "HARD"],
      maxMembers: 3, color: "#c026d3", icon: "infinity",     image: "limbo" },
    { id: "baldrix",   name: "バルドリクス",       difficulties: ["NORMAL", "HARD"],
      maxMembers: 3, color: "#38bdf8", icon: "sword",        image: "baldrix" }
];

// MapleHub CDN base URL
const BOSS_IMAGE_BASE = "https://cdn.maplehub.app/bosses/";
// image が "http..." で始まればそのまま返し、それ以外はMapleHub CDNのスラグとして解釈
function bossImageUrl(boss) {
    if (!boss || !boss.image) return "";
    if (/^https?:\/\//i.test(boss.image)) return boss.image;
    return BOSS_IMAGE_BASE + boss.image + ".webp";
}

const DIFFICULTY_LABEL = {
    EASY:    "Easy",
    NORMAL:  "Normal",
    HARD:    "Hard",
    CHAOS:   "Chaos",
    EXTREME: "Extreme"
};

const DIFFICULTY_BADGE_CLASS = {
    EASY:    "badge-easy",
    NORMAL:  "badge-normal",
    HARD:    "badge-hard",
    CHAOS:   "badge-chaos",
    EXTREME: "badge-extreme"
};

const DIFFICULTY_ORDER = ["EASY", "NORMAL", "HARD", "CHAOS", "EXTREME"];

// ---- Servers (GMS Heroic worlds) ---------------------------
const SERVERS = [
    { id: "kronos",      name: "Kronos" },
    { id: "challengers", name: "Challengers" }
];

if (typeof window !== "undefined") {
    window.BOSS_DATA = BOSS_DATA;
    window.DIFFICULTY_LABEL = DIFFICULTY_LABEL;
    window.DIFFICULTY_BADGE_CLASS = DIFFICULTY_BADGE_CLASS;
    window.DIFFICULTY_ORDER = DIFFICULTY_ORDER;
    window.SERVERS = SERVERS;
    window.BOSS_IMAGE_BASE = BOSS_IMAGE_BASE;
    window.bossImageUrl = bossImageUrl;
}
