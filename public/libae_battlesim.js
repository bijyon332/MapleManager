/**
 * Quanah Tools の「バトルシム」タブ: Quanah のダンジョン Battlesim で手に入るプログラム全46種の図鑑。
 * bi の単体版「Quanah バトルシム プログラム図鑑」（2026-11-16）を移植。分類は bi の判断（2026-11-17）、カードのガイド欄は Shapaz さんのダンジョン解説動画（Quanah ガイドまとめ 3章）、
 * アイコンと効果は masonym.dev の Quanah データ（GMS クライアントから抽出、2026-11-15 版）。名前は GMS の英語表記のまま。
 * アイコンは public/assets/libae/battlesim/<icon>.png。
 */
const libaeBattlesim = (() => {
    // v = 分類（2026-11-17 bi 指定）。fus フュージョン素材／key だいじ（Return Protocol、上に別枠）／
    //     取る: hi 優先度 高・lo 優先度 低／状況次第: job 職次第・speed 高速周回用・other その他／avoid 取ってはいけない／bug マイナス効果
    // cat = 系統（atk 火力／def 防御・回復／holo ホログラム強化／res EXP・Bytes／util 特殊／use 使用型（使うと消費。Dummy Mapae・Garbage Collection・Desynced Timer だけ、bi 確認）／bug バグ）
    // gc = ガイドの評価、note = 元の一覧と値が違う項目の注記、tip = ゲーム内のツールチップ名
    const PROGRAMS = [
        {"v": "fus", "name": "Creaking Limb", "icon": "creaking-limb", "cat": "atk", "eff": ["攻撃力・魔力 +20、移動速度 -20"], "gc": "素材①。単体ではマイナス寄りでも融合のために取る", "note": "手元の一覧では +10（+20表記あり）。データは +20"},
        {"v": "fus", "name": "Broken Heart", "icon": "broken-heart", "cat": "def", "eff": ["専用ポーション回復量 +30%", "被ダメージ +10%"], "gc": "素材②。単体ではマイナス寄りでも融合のために取る"},
        {"v": "fus", "name": "Overheated Head", "icon": "overheated-head", "cat": "res", "eff": ["フロア入場時に 10 Bytes 獲得", "20%の確率で所持プログラムを1つ削除（これ自身も対象）"], "gc": "素材③。20%で所持プログラムを消す（自分も対象）ので必ず最後に取る"},
        {"v": "fus", "name": "Overclocked Fusion", "icon": "overclocked-fusion", "cat": "res", "eff": ["被ダメージ -30%、最終ダメージ +30%", "入手時に 300 Bytes 獲得"], "gc": "素材3つが揃うと自動で手に入る"},
        {"v": "hi", "name": "Buffer Overflow", "icon": "buffer-overflow", "cat": "res", "eff": ["まだ持っていないプログラムを入手するたびに 20 / 30 / 50 Bytes 獲得"], "gc": "Bytes収入系。序盤の最優先。ショップやボス後のルートルームでオーブなどを買えるかがBytesの育ち方で決まる"},
        {"v": "hi", "name": "Inspector's Stamp", "icon": "inspector-s-stamp", "cat": "res", "eff": ["獲得Bytes +30 / 50 / 100%"], "gc": "Bytes収入系。序盤の最優先"},
        {"v": "hi", "name": "Wild Pointer", "icon": "wild-pointer", "cat": "res", "eff": ["入手時に即 50 Bytes 獲得", "一度所持すると再出現しない"], "gc": "取得時にBytesが入る系。序盤の最優先枠"},
        {"v": "hi", "name": "Energy Drink", "icon": "energy-drink", "cat": "atk", "eff": ["フロア入場時、10秒間 攻撃力・魔力 +100%"], "gc": "序盤では最強クラス。フロアに入った瞬間に敵を吹き飛ばせる。バフ持続時間が長いキャラほど強い"},
        {"v": "hi", "name": "Synchronization Chip", "icon": "synchronization-chip", "cat": "atk", "eff": ["現在のセクター数1つにつき最終ダメージ +4%（最大10セクター分）"], "gc": "最終ダメージが付く系。見たら取って損なし"},
        {"v": "hi", "name": "Nest egg", "icon": "nest-egg", "cat": "atk", "eff": ["所持Bytes 70ごとに最終ダメージ +3%（最大20回）"], "gc": "1,400 Bytesで最大+60%。後半フロアの本命。Bytes収入系とセットで真価を発揮"},
        {"v": "key", "name": "Return Protocol", "icon": "return-protocol", "cat": "util", "eff": ["使用すると休憩マップを飛ばして即座にダンジョンから退出できる", "報酬はすべて受け取れる。使用すると消える"], "gc": "帰還用。いつでも離脱して戦利品を持ち帰れる保険。もう無理そうと思ったら迷わず使う", "note": "手元の一覧では特殊アイテム扱い。データ上はプログラム"},
        {"v": "hi", "name": "Modular Heart", "icon": "modular-heart", "cat": "def", "eff": ["被ダメージ -3 / 6 / 9 / 12%"], "gc": "ユーザー判断で「取る」に分類（ガイドでの言及なし）"},
        {"v": "lo", "name": "Simulation W", "icon": "simulation-w", "cat": "holo", "eff": ["ホログラムスキルで攻撃時、投影された戦士が [Hologram] Worldreaver を使用し [Hologram] Format を発動", "投影の Format からも [Hologram] Defrag が発動可能"], "gc": "ユーザー判断で「取る（優先度 低）」に分類（ガイドでの言及なし）。Type系の投影は互いに上書きされるので、投影は1種に絞る", "tip": "Type-W Projection"},
        {"v": "hi", "name": "Data Compression", "icon": "data-compression", "cat": "res", "eff": ["獲得EXP +10 / 20 / 30 / 40%"], "gc": "ユーザー判断で「取る」に分類（ガイドでの言及なし）", "note": "手元の一覧の +10% は1段階目の値"},
        {"v": "hi", "name": "Desynced Timer", "icon": "desynced-timer", "cat": "use", "eff": ["5次以下のスキルのクールタイムをリセット", "使用するたびに1つ消費"], "gc": "ユーザー判断で「取る」に分類（ガイドでの言及なし）", "note": "手元の一覧では「コード」として別枠。データ上はプログラム（使用型）"},
        {"v": "other", "name": "Hard Reset", "icon": "hard-reset", "cat": "atk", "eff": ["入手した瞬間に、その時点の所持プログラムをすべて削除", "削除した数1つにつき最終ダメージ +5%（再入手すると再発動）"], "gc": "所持数×最終ダメージ+5%（19個なら+95%）。取り直せるので深く潜るランほど強い。中くらいのフロアで切り上げるなら不要"},
        {"v": "speed", "name": "One Coin", "icon": "one-coin", "cat": "atk", "eff": ["最大HPが50%に固定される代わりに最終ダメージ +30%"], "gc": "強いがリスクも大きい。スペックに余裕が出てから"},
        {"v": "speed", "name": "Quality Assurance", "icon": "quality-assurance", "cat": "atk", "eff": ["被弾しない時間10秒ごとに最終ダメージ +3%（最大5スタック）", "被弾でリセット"], "gc": "被弾しなければ最終ダメージが伸びる系。状況次第で可", "note": "手元の一覧では最大Lv3。データ上は重ね取りの段階値なし"},
        {"v": "other", "name": "Emergency Backup", "icon": "emergency-backup", "cat": "def", "eff": ["HPが30%を切ると最大HPの 20 / 30 / 70% を即回復", "クールタイム 120秒"], "gc": "回復系。継戦がきついときに", "note": "手元の一覧では回復量20%のみ。データでは重ね取りで 20/30/70%"},
        {"v": "hi", "name": "Strangler Fig Pattern", "icon": "strangler-fig-pattern", "cat": "def", "eff": ["モンスター撃破時、20 / 40 / 60% の確率でHPを5%回復"], "gc": "回復系。ガイドでは「継戦がきついときに」だが、ユーザー判断で「取る（優先度 高）」に分類", "note": "手元の一覧では「10%で3%回復」。データは 20/40/60% で5%回復"},
        {"v": "other", "name": "Empty Bottle", "icon": "empty-bottle", "cat": "def", "eff": ["専用ポーション回復量 +90%"], "gc": "回復系。継戦がきついときに", "note": "手元の一覧では「回復量が40%に」。データは回復量 +90%"},
        {"v": "other", "name": "Debuggy", "icon": "debuggy", "cat": "def", "eff": ["死亡時にHP100%で復活", "発動すると消える"], "gc": "死亡時のクッション系。状況次第で可"},
        {"v": "other", "name": "Garbage Collection", "icon": "garbage-collection", "cat": "use", "eff": ["10秒間無敵", "使用すると消費"], "gc": "無敵化系は「ボスで苦戦するときの保険」くらいの評価", "note": "手元の一覧では「コード」として別枠。データ上はプログラム（使用型）"},
        {"v": "lo", "name": "Simulation Enhancement: W", "icon": "simulation-enhancement-w", "cat": "holo", "eff": ["投影戦士の [Hologram] Worldreaver ダメージ +10 / 20 / 30%"], "gc": "Jailbreak系は優先度最下位クラスだが、大範囲の戦士タイプ（Type-W）だけは例外的にまだマシ", "tip": "Type-W Jailbreak"},
        {"v": "speed", "name": "Overclock Core", "icon": "overclock-core", "cat": "atk", "eff": ["最終ダメージ +8 / 10 / 12%", "被ダメージ +5 / 10 / 15%"], "gc": "ユーザー判断で分類（ガイドでの言及なし）"},
        {"v": "job", "name": "Backspace", "icon": "backspace", "cat": "atk", "eff": ["10 / 20 / 30% の確率でスキルのクールタイムが即リセット"], "gc": "ユーザー判断で分類（ガイドでの言及なし）"},
        {"v": "lo", "name": "VPN", "icon": "vpn", "cat": "holo", "eff": ["[Hologram] Registry の再付着時間 -1 / 2 / 3秒"], "gc": "ユーザー判断で「取る（優先度 低）」に分類（ガイドでの言及なし）", "note": "手元の一覧の -1.0秒は1段階目の値。重ね取りで -2 / -3秒"},
        {"v": "avoid", "name": "Entropy", "icon": "entropy", "cat": "atk", "eff": ["最終ダメージ +50%", "フロア入場時、30%の確率で [Disorder] が1スタック", "[Disorder] が3スタックになるとダンジョンから自動退出"], "gc": "フロアに入るたび30%でスタックが溜まり、3つで強制退出。死亡扱いではないので復活系も効かない"},
        {"v": "avoid", "name": "Black Box", "icon": "black-box", "cat": "util", "eff": ["入手した瞬間にランダムなプログラムを3つ獲得し、所持プログラムからランダムに2つ削除（再入手すると再発動）"], "gc": "3つもらえる代わりに自分のプログラムが2つ消える。大事なものを消されるリスクが見合わない"},
        {"v": "avoid", "name": "Dependency Injection", "icon": "dependency-injection", "cat": "res", "eff": ["フロア入場時に 50 Bytes を消費し、次のどちらかを得る", "・アイテムドロップ率 +40%、獲得EXP +10%", "・獲得EXP +40%、アイテムドロップ率 +10%", "Bytesが足りないと発動しない"], "gc": "毎フロア50 Bytes払う系。Wild Pointer を取っているときだけコストが見合うので取ってもいい（上の「組み合わせ」、ユーザー判断）。ガイドでは：序盤は厳禁。ルートルームで買い物するBytesが足りなくなる。収入が育った後半向け"},
        {"v": "lo", "name": "Simulation Enhancement: M", "icon": "simulation-enhancement-m", "cat": "holo", "eff": ["投影魔法使いの [Hologram] Bolt Barrage ダメージ +10 / 20 / 30%"], "gc": "Jailbreak系（ホログラム投影の強化）。ガイドでは火力が低く優先度は最下位クラスだが、ユーザー判断で「取る（優先度 低）」に分類", "tip": "Type-M Jailbreak"},
        {"v": "lo", "name": "Simulation Enhancement: B", "icon": "simulation-enhancement-b", "cat": "holo", "eff": ["投影弓使いの [Hologram] Ultimate Snipe ダメージ +10 / 20 / 30%"], "gc": "Jailbreak系。ガイドでは優先度最下位クラス。ユーザー判断で「取る（優先度 低）」に分類", "tip": "Type-B Jailbreak"},
        {"v": "lo", "name": "Simulation Enhancement: T", "icon": "simulation-enhancement-t", "cat": "holo", "eff": ["投影盗賊の [Hologram] Shurrikane ダメージ +10 / 20 / 30%"], "gc": "Jailbreak系。ガイドでは優先度最下位クラス。ユーザー判断で「取る（優先度 低）」に分類", "tip": "Type-T Jailbreak"},
        {"v": "lo", "name": "Simulation Enhancement: P", "icon": "simulation-enhancement-p", "cat": "holo", "eff": ["投影海賊の [Hologram] Rolling Rainbow ダメージ +10 / 20 / 30%"], "gc": "Jailbreak系。ガイドでは優先度最下位クラス。ユーザー判断で「取る（優先度 低）」に分類", "tip": "Type-P Jailbreak"},
        {"v": "bug", "name": "Bug: Clogged Fan", "icon": "bug-clogged-fan", "cat": "bug", "eff": ["最終ダメージ -5%"]},
        {"v": "bug", "name": "Bug: Deadlock", "icon": "bug-deadlock", "cat": "bug", "eff": ["移動速度 -20"], "tip": "Bug: Glass Slippers"},
        {"v": "bug", "name": "Bug: Battery Drain", "icon": "bug-battery-drain", "cat": "bug", "eff": ["獲得EXP -20%"], "tip": "Bug: Empty Battery"},
        {"v": "bug", "name": "Bug: Underflow", "icon": "bug-underflow", "cat": "bug", "eff": ["獲得Bytes -20%"], "tip": "Bug: Goose Egg"},
        {"v": "bug", "name": "Bug: Off-By-One", "icon": "bug-off-by-one", "cat": "bug", "eff": ["選べるプログラムの数 -1"], "tip": "Bug: Blue Pill"},
        {"v": "job", "name": "Memory Leak", "icon": "memory-leak", "cat": "atk", "eff": ["所持プログラム1つにつき最終ダメージ +1%（最大20）", "10秒ごとに最大HPの3%が減少"]},
        {"v": "lo", "name": "Simulation M", "icon": "simulation-m", "cat": "holo", "eff": ["ホログラムスキルで攻撃時、投影された魔法使いが [Hologram] Bolt Barrage を使用し [Hologram] Format を発動", "投影の Format からも [Hologram] Defrag が発動可能"], "gc": "ユーザー判断で「取る（優先度 低）」に分類（ガイドでの言及なし）。Type系の投影は互いに上書きされるので全部は集められない", "tip": "Type-M Projection"},
        {"v": "lo", "name": "Simulation B", "icon": "simulation-b", "cat": "holo", "eff": ["ホログラムスキルで攻撃時、投影された弓使いが [Hologram] Ultimate Snipe を使用し [Hologram] Format を発動", "投影の Format からも [Hologram] Defrag が発動可能"], "gc": "ユーザー判断で「取る（優先度 低）」に分類（ガイドでの言及なし）。Type系の投影は互いに上書きされるので全部は集められない", "tip": "Type-B Projection"},
        {"v": "lo", "name": "Simulation T", "icon": "simulation-t", "cat": "holo", "eff": ["ホログラムスキルで攻撃時、投影された盗賊が [Hologram] Shurrikane を使用し [Hologram] Format を発動", "投影の Format からも [Hologram] Defrag が発動可能"], "gc": "ユーザー判断で「取る（優先度 低）」に分類（ガイドでの言及なし）。Type系の投影は互いに上書きされるので全部は集められない", "tip": "Type-T Projection"},
        {"v": "lo", "name": "Simulation P", "icon": "simulation-p", "cat": "holo", "eff": ["ホログラムスキルで攻撃時、投影された海賊が [Hologram] Rolling Rainbow を使用し [Hologram] Format を発動", "投影の Format からも [Hologram] Defrag が発動可能"], "gc": "ユーザー判断で「取る（優先度 低）」に分類（ガイドでの言及なし）。Type系の投影は互いに上書きされるので全部は集められない", "tip": "Type-P Projection"},
        {"v": "other", "name": "Rubber Duck", "icon": "rubber-duck", "cat": "util", "eff": ["効果は一切なし"], "note": "手元の一覧ではコード枠にも同名あり。データ上はプログラム1種のみ"},
        {"v": "other", "name": "Dummy Mapae", "icon": "dummy-mapae", "cat": "use", "eff": ["命中した敵を5秒間スタン", "ボスを含め15体まで適用。使用すると消費"]},
    ];
    // 分類。group は上の大きな区分（取る／状況次第）、sub はその中の小区分。
    const VERDICTS = [
        { id: 'fus', label: 'フュージョン', badge: 'badge-info', border: '#22d3ee', meta: 'Overclocked Fusion とその素材' },
        { id: 'key', label: 'だいじ', badge: 'badge-warning', border: '#f59e0b', meta: '帰還に使う。いつでも取れるように' },
        { id: 'hi', group: 'take', sub: '優先度 高', label: '取る', badge: 'badge-success', border: '#4ade80', meta: '見たら取る' },
        { id: 'lo', group: 'take', sub: '優先度 低', label: '取る', badge: 'badge-success badge-soft', border: '#4ade80', meta: '取れるなら取る。上の「高」を優先' },
        { id: 'job', group: 'cond', sub: '職次第', label: '状況次第', badge: 'badge-warning badge-soft', border: '#facc15', meta: '職業によって強さが変わる' },
        { id: 'speed', group: 'cond', sub: '高速周回用', label: '状況次第', badge: 'badge-warning badge-soft', border: '#facc15', meta: '火力が足りていて速く回したいとき' },
        { id: 'other', group: 'cond', sub: 'その他', label: '状況次第', badge: 'badge-warning badge-soft', border: '#facc15', meta: '必要に応じて' },
        { id: 'avoid', label: '取ってはいけない', badge: 'badge-error', border: '#fb7185', meta: '取ると損をするもの' },
        { id: 'bug', label: 'マイナス効果', badge: 'badge-error badge-outline', border: '#9f1239', meta: '効果がマイナスだけのバグ枠' },
    ];
    const VMAP = Object.fromEntries(VERDICTS.map((v) => [v.id, v]));
    // 絞り込みボタンと上の一覧の段。取る・状況次第は小区分をまとめて1つ
    const GROUPS = [
        { id: 'fus', label: 'フュージョン', vs: ['fus'] },
        { id: 'take', label: '取る', vs: ['hi', 'lo'] },
        { id: 'cond', label: '状況次第', vs: ['job', 'speed', 'other'] },
        { id: 'avoid', label: '取ってはいけない', vs: ['avoid'] },
        { id: 'bug', label: 'マイナス効果', vs: ['bug'] },
    ];
    const groupOf = (v) => (GROUPS.find((g) => g.vs.includes(v)) || { id: v }).id;
    const CATS = {
        atk: { label: '火力', color: '#fb923c' }, def: { label: '防御・回復', color: '#4ade80' }, holo: { label: 'ホログラム強化', color: '#a78bfa' },
        res: { label: 'EXP・Bytes', color: '#facc15' }, util: { label: '特殊', color: '#38bdf8' }, use: { label: '使用型', color: '#2dd4bf' }, bug: { label: 'バグ', color: '#fb7185' },
    };
    const PERKS = [
        ['from__future__import', '1ランで15種類のプログラムを集める', 'ラン開始時にプログラムを1つ付与'],
        ["That Ain't It", '1セクターでプログラム選択のたびにリロールする', 'プログラムのリロール回数 +1'],
        ['Heavy Pockets', '1ランで素材を合計500以上入手', 'ラン開始時に Byte +50'],
    ];
    const ICON_DIR = 'assets/libae/battlesim/';
    const byName = Object.fromEntries(PROGRAMS.map((p) => [p.name, p]));
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // 取る・状況次第は「取る｜優先度 高」のように小区分まで出す
    const vBadge = (id, extra = '') => { const v = VMAP[id]; return `<span class="badge badge-sm font-bold ${v.badge} ${extra}">${v.label}${v.sub ? `<span class="opacity-50 font-normal">｜</span>${v.sub}` : ''}</span>`; };
    const catTag = (p) => `<span class="bs-cat" style="color:${CATS[p.cat].color}">${esc(CATS[p.cat].label)}</span>`;
    const img = (p, size, cls = '') => `<img class="bs-ico ${cls}" src="${ICON_DIR}${p.icon}.png" alt="" width="${size}" height="${size}" loading="lazy">`;
    const searchText = (p) => [p.name, p.tip || '', ...p.eff, p.gc || '', p.note || '', CATS[p.cat].label].join(' ').toLowerCase();

    // 絞り込みの状態（タブを切り替えても残す）
    let filter = 'all', query = '';
    // Return Protocol（だいじ）は「取る」で絞り込んだときも出す
    const matches = (p) => (filter === 'all' || groupOf(p.v) === filter || (filter === 'take' && p.v === 'key')) && (!query || searchText(p).includes(query));

    // 上の3枠（フュージョン／組み合わせ／Return Protocol）は広い画面で横並び、下の一覧と合わせて1画面に収める（bi 指定）
    const fig = (p, step, cls = '') => `<button type="button" class="bs-fig ${cls}" data-bs-go="${esc(p.name)}" title="${esc(p.name)} の説明へ"><span class="bs-step">${step}</span>${img(p, 44)}<span class="bs-figname">${esc(p.name)}</span></button>`;
    function fusionHTML() {
        const steps = [['Creaking Limb', '①'], ['Broken Heart', '②'], ['Overheated Head', '③ 最後']];
        const parts = steps.map(([n, s], i) => fig(byName[n], s, i === 2 ? 'bs-last' : '')).join('<span class="bs-op">+</span>');
        return `<section class="bs-fusion">
            <div class="bs-boxhead"><span class="text-white">フュージョン</span><span class="text-cyan-300">Overclocked Fusion</span>${vBadge('hi')}</div>
            <div class="bs-figs">${parts}<span class="bs-op">→</span>${fig(byName['Overclocked Fusion'], '完成', 'bs-done')}</div>
            <p class="bs-boxtext"><b class="text-amber-300">取る順番が大事。</b>Overheated Head は20%で所持プログラムを1つ消す（自分も対象）ので、①②を持ってから<b class="text-white">最後に取る</b>。揃うと <b class="text-white">最終ダメージ +30%・被ダメージ -30%・300 Bytes</b>。</p>
        </section>`;
    }
    // 組み合わせ: Dependency Injection は Wild Pointer を取っているときだけコストが見合う（bi 指定、フュージョンと同じ形で別枠）
    function comboHTML() {
        return `<section class="bs-fusion bs-combo">
            <div class="bs-boxhead"><span class="text-white">組み合わせ</span><span class="badge badge-sm font-bold badge-success badge-soft">条件付きで取ってもいい</span></div>
            <div class="bs-figs">${fig(byName['Wild Pointer'], '持っている')}<span class="bs-op">+</span>${fig(byName['Dependency Injection'], '取ってもいい', 'bs-last')}</div>
            <p class="bs-boxtext"><b class="text-lime-300">Wild Pointer を取っているときだけ。</b>Dependency Injection は毎フロア <b class="text-white">50 Bytes</b> 払ってドロップ率・EXP を上げるので、Wild Pointer があればコストが見合う。ないなら<b class="text-white">取ってはいけない</b>のまま。</p>
        </section>`;
    }
    // Return Protocol は帰還に使うので、上に別枠で目立たせる（bi 指定）
    function keyHTML() {
        return PROGRAMS.filter((p) => p.v === 'key').map((p) => `<section class="bs-fusion bs-key">
            <div class="bs-boxhead"><span class="text-white">だいじ</span><span class="text-amber-300">${esc(p.name)}</span>${catTag(p)}</div>
            <div class="bs-figs">${fig(p, '帰還用')}</div>
            <p class="bs-boxtext"><b class="text-amber-300">帰還に使う。</b>使うと休憩マップを飛ばしてすぐダンジョンから出られ、<b class="text-white">報酬はすべて受け取れる</b>。もう無理そうと思ったら迷わず使う（使うと消える）。</p>
        </section>`).join('');
    }
    function tileHTML(p) {
        return `<button type="button" class="bs-tile" data-bs-go="${esc(p.name)}" title="${esc(p.name)} の説明へ">${img(p, 40)}<span>${esc(p.name)}</span><i class="bs-tcat" style="color:${CATS[p.cat].color}">${esc(CATS[p.cat].label)}</i></button>`;
    }
    // 段ごとに、小区分（優先度 高・低／職次第・高速周回用・その他）を横に詰めて並べる。
    // 取ってはいけない・マイナス効果は数が少ないので、広い画面では2つを横に並べる
    function boardHTML() {
        let h = '<section class="bs-board">';
        GROUPS.filter((g) => g.id !== 'fus').forEach((g) => {
            const subs = g.vs.map((id) => VMAP[id]);
            const n = PROGRAMS.filter((p) => g.vs.includes(p.v)).length;
            h += `<div class="bs-brow bs-brow-${g.id}" style="border-left-color:${subs[0].border}">
                <div class="bs-blabel"><span class="badge badge-sm font-bold whitespace-nowrap ${subs[0].badge.replace(' badge-soft', '')}">${esc(g.label)}</span><span class="font-mono text-[11px] text-base-content/50">${n}種</span></div>
                <div class="bs-subs">${subs.map((v) => {
                    const ps = PROGRAMS.filter((p) => p.v === v.id);
                    return `<div class="bs-sub">${v.sub ? `<span class="bs-sublabel">${esc(v.sub)}</span>` : ''}<div class="bs-tiles">${ps.map(tileHTML).join('')}</div></div>`;
                }).join('')}</div>
            </div>`;
        });
        return h + '</section>';
    }
    function toolbarHTML() {
        const btn = (id, label) => `<button type="button" class="btn btn-xs join-item ${filter === id ? 'btn-primary' : ''}" data-bs-filter="${id}" aria-pressed="${filter === id}">${label}</button>`;
        return `<div class="bs-toolbar">
            <label class="input input-sm flex-1 min-w-[200px] max-w-[420px]"><i data-lucide="search" class="w-3.5 h-3.5 opacity-50"></i><input type="search" data-bs-q value="${esc(query)}" placeholder="名前や効果で検索（例: 最終ダメージ, Bytes）" aria-label="プログラムを検索"></label>
            <div class="join flex-wrap" role="group" aria-label="分類で絞り込み">${btn('all', 'すべて')}${GROUPS.map((g) => btn(g.id, g.label)).join('')}</div>
        </div>`;
    }
    function cardHTML(p) {
        return `<article class="bs-card bs-v-${p.v}" id="bs-${p.icon}" data-bs-card="${esc(p.name)}" ${matches(p) ? '' : 'hidden'}>
            ${img(p, 56, 'shrink-0')}
            <div class="min-w-0 flex flex-col gap-1">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5"><h3 class="text-[14px] font-black text-white font-mono">${esc(p.name)}</h3>${catTag(p)}${p.tip ? `<span class="text-[11px] text-base-content/50">ツールチップ名: ${esc(p.tip)}</span>` : ''}</div>
                <p class="text-[13px] text-slate-200 leading-snug">${p.eff.map(esc).join('<br>')}</p>
                ${p.gc ? `<p class="bs-gc"><b>ガイド：</b>${esc(p.gc)}</p>` : ''}
                ${p.note ? `<p class="bs-note">${esc(p.note)}</p>` : ''}
            </div>
        </article>`;
    }
    function listHTML() {
        let h = '';
        VERDICTS.forEach((v) => {
            const ps = PROGRAMS.filter((p) => p.v === v.id);
            h += `<section class="bs-tier" data-bs-tier="${v.id}" ${ps.some(matches) ? '' : 'hidden'}>
                <div class="flex items-baseline gap-3 mb-2">${vBadge(v.id, 'badge-md')}<span class="text-[12px] text-base-content/55">${esc(v.meta)}</span></div>
                <div class="bs-grid">${ps.map(cardHTML).join('')}</div>
            </section>`;
        });
        h += `<p class="lg-empty" data-bs-empty ${PROGRAMS.some(matches) ? 'hidden' : ''}>条件に合うプログラムはありません。</p>`;
        return h;
    }
    function footHTML() {
        const box = 'card card-sm bg-base-100 border border-base-content/10 px-4 py-3';
        return `<div class="grid gap-4 xl:grid-cols-2 items-start">
            <section><h3 class="lg-h"><i data-lucide="link"></i>出典</h3><div class="${box} text-[12px] leading-relaxed">
                <p><b class="text-white">分類：</b>Bijyon の判断（2026-11-17）。各カードの「ガイド」欄は Shapaz「クアナダンジョン プログラムガイド/ヒント」（Quanah ガイドまとめ 3章）。動画の自動字幕が不安定で、ガイドは効果ベースで書かれているため、プログラム名への当てはめは効果から判断しています。</p>
                <p class="mt-1.5"><b class="text-white">アイコンと効果：</b><a href="https://github.com/masonym/masonym.dev/tree/main/public/quanah" target="_blank" rel="noreferrer" class="link link-hover text-indigo-300 font-bold">masonym.dev の Quanah データ</a>（GMS クライアントから抽出、2026-11-15 版）。黄色の注記は、元の一覧と値が違う項目です。</p>
                <p class="mt-1.5 text-base-content/55">元の一覧で「コード」として別枠だった Desynced Timer・Garbage Collection・Rubber Duck、特殊アイテム扱いだった Return Protocol は、抽出データではプログラムとして登録されていたので図鑑に載せています。</p>
            </div></section>
            <section><h3 class="lg-h"><i data-lucide="image-off"></i>アイコンが見つからなかったパーク<span class="text-base-content/50 font-normal ml-1">The Quanah Files</span></h3><div class="card card-sm bg-base-100 border border-base-content/10 overflow-x-auto">
                <table class="table table-xs lg-table"><thead><tr><th>パーク</th><th>解放条件</th><th>効果</th></tr></thead>
                <tbody>${PERKS.map((r) => `<tr><td class="font-bold font-mono text-white whitespace-nowrap">${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>
            </div></section>
        </div>`;
    }
    function html() {
        return `<div class="bs-root flex flex-col gap-3">
            <div class="bs-top">${fusionHTML()}${comboHTML()}${keyHTML()}</div>${boardHTML()}
            ${toolbarHTML()}
            <div class="flex flex-col gap-5">${listHTML()}</div>
            ${footHTML()}
        </div>`;
    }
    // 検索・絞り込みは描き直さずに表示だけ切り替える（入力欄のフォーカスを保つため）
    function apply(root) {
        root.querySelectorAll('[data-bs-card]').forEach((el) => { el.hidden = !matches(byName[el.dataset.bsCard]); });
        root.querySelectorAll('[data-bs-tier]').forEach((el) => { el.hidden = !el.querySelector('[data-bs-card]:not([hidden])'); });
        const empty = root.querySelector('[data-bs-empty]'); if (empty) empty.hidden = !!root.querySelector('[data-bs-card]:not([hidden])');
        root.querySelectorAll('[data-bs-filter]').forEach((b) => { const on = b.dataset.bsFilter === filter; b.classList.toggle('btn-primary', on); b.setAttribute('aria-pressed', on); });
    }
    function bind(root) {
        root.addEventListener('input', (ev) => {
            if (!ev.target.matches || !ev.target.matches('[data-bs-q]')) return;
            query = ev.target.value.trim().toLowerCase(); apply(root);
        });
        root.addEventListener('click', (ev) => {
            const f = ev.target.closest && ev.target.closest('[data-bs-filter]');
            if (f) { filter = f.dataset.bsFilter; apply(root); return; }
            const go = ev.target.closest && ev.target.closest('[data-bs-go]');
            if (go) {
                const p = byName[go.dataset.bsGo]; if (!p) return;
                // 絞り込みで隠れていたら解除してから移動する
                if (!matches(p)) { filter = 'all'; query = ''; const q = root.querySelector('[data-bs-q]'); if (q) q.value = ''; apply(root); }
                const card = root.querySelector(`#bs-${p.icon}`);
                if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); card.classList.remove('bs-flash'); void card.offsetWidth; card.classList.add('bs-flash'); }
            }
        });
    }
    return { html, bind, PROGRAMS };
})();
window.libaeBattlesim = libaeBattlesim;
