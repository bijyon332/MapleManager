// ダッシュボードのキャラカードに敷く職業の絵（透かし）の、職業ごとの位置と大きさ。
// 値は DEV の Job Art Position で調整して「書き出す」でコピーしたものを貼る（このファイルの中身を丸ごと置き換える）。
// 絵は立ち絵（CharacterIcon.png）か KMS の職業イラスト（Illust.webp、class_data.js の illust）を職ごとに選ぶ。
// キーは class_data.js の id。載っていない職は DEFAULT を使う。
//   x … 絵の右端をカードの右端から何px内側に置くか（マイナスではみ出す）
//   y … 絵の上端を帯の上端から何px下に置くか（マイナスで上にはみ出す）
//   z … 絵の横幅（カードのボス欄の幅に対する%）
const JOB_ART_DEFAULT = { x: -20, y: -30, z: 62 };
const JOB_ART_POS = {
    archmagefp: { x: -52, y: -120, z: 100 },
    archmageil: { x: -47, y: -118, z: 100 },
    bishop: { x: -68, y: -144, z: 100 },
    bowmaster: { x: -66, y: -103, z: 100 },
    buccaneer: { x: -146, y: -220, z: 110 },
    cannoneer: { x: -84, y: -146, z: 100 },
    corsair: { x: -78, y: -155, z: 100 },
    darkknight: { x: -93, y: -140, z: 100 },
    dualblade: { x: -58, y: -140, z: 92 },
    hero: { x: -40, y: -89, z: 86 },
    marksman: { x: -66, y: -142, z: 96 },
    nightlord: { x: -102, y: -151, z: 100 },
    paladin: { x: -53, y: -99, z: 96 },
    pathfinder: { x: -66, y: -156, z: 108 },
    shadower: { x: -51, y: -70, z: 78 },
    blazewizard: { x: -67, y: -119, z: 96 },
    dawnwarrior: { x: -66, y: -128, z: 100 },
    mihile: { x: -96, y: -159, z: 100 },
    nightwalker: { x: -120, y: -178, z: 120 },
    thunderbreaker: { x: -106, y: -138, z: 100 },
    windarcher: { x: -79, y: -140, z: 100 },
    aran: { x: -57, y: -97, z: 100 },
    evan: { x: -35, y: -90, z: 84 },
    luminous: { x: -63, y: -125, z: 98 },
    mercedes: { x: 1, y: -93, z: 82 },
    phantom: { x: -111, y: -151, z: 88 },
    shade: { x: -52, y: -85, z: 94 },
    battlemage: { x: -33, y: -130, z: 82 },
    blaster: { x: -72, y: -92, z: 100 },
    mechanic: { x: -63, y: -105, z: 100 },
    wildhunter: { x: -118, y: -56, z: 116 },
    xenon: { x: -4, y: -79, z: 58 },
    demonavenger: { x: -121, y: -147, z: 94 },
    demonslayer: { x: -124, y: -134, z: 106 },
    angelicbuster: { x: -16, y: -107, z: 98 },
    cadena: { x: 6, y: -52, z: 62 },
    kain: { x: -39, y: -103, z: 88 },
    kaiser: { x: -75, y: -125, z: 88 },
    adele: { x: -71, y: -67, z: 102 },
    ark: { x: -12, y: -64, z: 70 },
    illium: { x: -42, y: -92, z: 84 },
    khali: { x: -51, y: -70, z: 92 },
    hoyoung: { x: -67, y: -140, z: 100 },
    lara: { x: -41, y: -104, z: 90 },
    ren: { x: -129, y: -133, z: 122 },
    kinesis: { x: -46, y: -111, z: 90 },
    zero: { x: -24, y: -59, z: 68 },
    hayato: { x: -6, y: -159, z: 96 },
    kanna: { x: -46, y: -115, z: 94 },
    lynn: { x: 2, y: -105, z: 94 },
    moxuan: { x: -114, y: -88, z: 94 },
    erellight: { x: -60, y: -124, z: 114 },
    sia: { x: -76, y: -106, z: 92 },
};

// イラストを使うときの位置と大きさ（立ち絵とは別に持つ。意味は上と同じ）
const JOB_ART_ILLUST_DEFAULT = { x: 0, y: -40, z: 100 };
const JOB_ART_ILLUST_POS = {
};

// 透かしにイラストを使う職（載っていない職は立ち絵）
const JOB_ART_USE_ILLUST = [];
