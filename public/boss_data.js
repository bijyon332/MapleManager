/* =========================================================
 *  Boss definitions
 *  週ボスPT編成ツールのマスタ。コード内に散らさず、ここだけを
 *  差し替えればボス追加・難易度追加に対応できるようにしている。
 * ========================================================= */

// ---- Bosses (表示順 = リスト順) ----------------------------
// 実体は boss_master.js（全アプリ共通）。ここでは Party Builder に出すボス（party があるもの）を
// Party Builder の形に並べ替えるだけ。
// difficulties: 易しい順。難易度の高さはこの配列内の位置で決まる（ボスをまたいだ比較はしない）。
// image: public/assets/bosses/ のファイル名（拡張子なし）。読み込みに失敗したら icon(lucide) + color にフォールバックする。
const BOSS_DATA = BOSS_MASTER.filter(b => b.party).map(b => ({
    id: b.party.id, name: b.short || b.ja, difficulties: b.party.difficulties,
    maxMembers: b.maxMembers, color: b.party.color, icon: b.party.icon, image: b.image
}));

// ボス画像は自前で持つ（MapleHub CDN から弾かれるようになったため）
const BOSS_IMAGE_BASE = "assets/bosses/";
// image が "http..." で始まればそのまま返し、それ以外は assets/bosses/ のファイル名として解釈
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
