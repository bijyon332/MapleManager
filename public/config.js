// ボスの一覧と結晶価格は boss_master.js にある（全アプリ共通）。ここではそれを Character Manager の形に並べ替えるだけ。
const DEFAULT_BOSSES = bossCrystalList();

// Arthur's Equipment Rental（GMS v.269、Nexon パッチノート）。1回目のレンタル費（メル、Heroic ワールドの値）だけ持つ。
// 2回目以降は Maple Points なのでメルの計算には入れない。1回借りると2日使える。
// キャラごとの選択は settings.rental = { ids: [...], cross: 週跨ぎなら true }。週跨ぎは2週で割るので費用は半分。
const RENTAL_ITEMS = [
    { id: 'face',     en: 'Red Beryl Face Accessory',         ja: 'レッドベリル 顔飾り',       price: 200000000, image: 'red-beryl-face-accessory' },
    { id: 'eye',      en: 'Red Beryl Eye Accessory',          ja: 'レッドベリル 目飾り',       price: 200000000, image: 'red-beryl-eye-accessory' },
    { id: 'earrings', en: 'Red Beryl Earrings',               ja: 'レッドベリル イヤリング',   price: 300000000, image: 'red-beryl-earrings' },
    { id: 'pendant',  en: 'Red Beryl Pendant',                ja: 'レッドベリル ペンダント',   price: 300000000, image: 'red-beryl-pendant' },
    { id: 'belt',     en: 'Red Beryl Belt',                   ja: 'レッドベリル ベルト',       price: 300000000, image: 'red-beryl-belt' },
    { id: 'ring-inf', en: 'Infinite Red Beryl Ring',          ja: 'インフィニット レッドベリルリング（コンティニュアス Lv4）', price: 100000000, image: 'infinite-red-beryl-ring' },
    { id: 'ring-fin', en: 'Finite Red Beryl Ring',            ja: 'ファイナイト レッドベリルリング（リストレイント Lv4）',   price: 100000000, image: 'finite-red-beryl-ring' },
    { id: 'totem-a',  en: 'Arthur Totem',                     ja: 'アーサー トーテム',         price: 200000000, image: 'arthur-totem' },
    { id: 'totem-f',  en: 'Flash Totem',                      ja: 'フラッシュ トーテム',       price: 200000000, image: 'flash-totem' },
    { id: 'totem-r',  en: 'Red Beryl Totem',                  ja: 'レッドベリル トーテム',     price: 200000000, image: 'red-beryl-totem' },
];
// キャラの設定から週あたりのレンタル費（メル）を出す。
function rentalWeeklyCost(settings) {
    const r = (settings && settings.rental) || {};
    const sum = (r.ids || []).reduce((s, id) => s + ((RENTAL_ITEMS.find(x => x.id === id) || {}).price || 0), 0);
    return r.cross ? sum / 2 : sum;
}
