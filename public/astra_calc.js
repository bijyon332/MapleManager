// Astra Secondary Weapon growth date calculator.
// Data mirrors meaegi.com's live "아스트라 보조무기 성장 날짜 계산기" as of 2026-07.
// Growth date is gated purely by 격전의 흔적/Traces of Fierce Battle from Grandis
// bosses (weekly, Thursday reset); 에리온의 조각/Erion's Fragments accrue daily from
// a single chosen area's daily quest and are shown as a secondary readout.
const astraCalc = createLiberationCalc({
    storageKey: 'gms-astra-growth-calc',
    titleJa: 'アストラ副武器 成長計算機',
    subtitleJa: '激戦の痕跡とエリオンの欠片を集めてアストラ副武器を成長させよう',
    currencyLabel: '激戦の痕跡',
    maxHold: 1000,
    hasPass: false,
    stages: [
        { id: '1', label: '第1次成長', need: 600 },
        { id: '2', label: '第2次成長', need: 600 },
        { id: '3', label: '最終成長', need: 800 }
    ],
    bosses: [
        { id: 'chosen-seren', label: 'Chosen Seren', rates: { normal: 6, hard: 15, extreme: 180 }, partyMax: 6 },
        { id: 'kalos-the-guardian', label: 'Kalos the Guardian', rates: { easy: 6, normal: 30, chaos: 100, extreme: 500 }, partyMax: 6 },
        { id: 'the-first-adversary', label: 'The First Antagonist', rates: { easy: 10, normal: 40, hard: 180, extreme: 540 }, partyMax: 3 },
        { id: 'radiant-ominous-star', label: 'Radiant Ominous Star', rates: { normal: 60, hard: 240 }, partyMax: 3 },
        { id: 'kaling', label: 'Kaling', rates: { easy: 20, normal: 80, hard: 240, extreme: 1440 }, partyMax: 6 },
        { id: 'limbo', label: 'Limbo', rates: { normal: 80, hard: 240 }, partyMax: 3 },
        { id: 'baldrix', label: 'Baldrix', rates: { normal: 80, hard: 240 }, partyMax: 3 }
    ],
    secondaryCurrency: {
        label: 'エリオンの欠片',
        perStageFragmentNeed: [3000, 3000, 4000],
        dailySources: [
            { id: 'cernium', label: 'Cernium', rate: 1 },
            { id: 'arcus', label: 'Arcus', rate: 3 },
            { id: 'odium', label: 'Odium', rate: 6 },
            { id: 'dowonkyeong', label: 'Dowon Gyeong', rate: 10 },
            { id: 'arteria', label: 'Arteria', rate: 15 },
            { id: 'carcion', label: 'Carcion', rate: 25 },
            { id: 'tallahart', label: 'Tallahart', rate: 45 },
            { id: 'geardrak', label: 'Geardrak', rate: 65 }
        ]
    }
});
