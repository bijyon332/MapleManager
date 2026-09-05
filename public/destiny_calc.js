// Destiny Weapon transcendence date calculator.
// Data mirrors meaegi.com's live "데스티니 해방 계산기" as of 2026-07.
// Only the 1st transcendence chain (Chosen Seren -> Kalos the Guardian ->
// Kaling) has published stage thresholds; later bosses already farmable
// (The First Antagonist, Radiant Ominous Star, Limbo, Baldrix) are included
// in the boss schedule since their traces carry over once the 2nd
// transcendence stage thresholds are published.
const destinyCalc = createLiberationCalc({
    storageKey: 'gms-destiny-liberation-calc',
    titleJa: 'デスティニー武器 解放計算機',
    subtitleJa: '対抗者の決意を集めてデスティニー武器を解放しよう',
    currencyLabel: '対抗者の決意',
    maxHold: 3000,
    hasPass: false,
    stages: [
        { id: 'chosen-seren', label: 'Chosen Seren', need: 2000 },
        { id: 'kalos-the-guardian', label: 'Kalos the Guardian', need: 2500 },
        { id: 'kaling', label: 'Kaling', need: 3000 }
    ],
    bosses: [
        { id: 'chosen-seren', label: 'Chosen Seren', rates: { hard: 6, extreme: 80 }, partyMax: 6 },
        { id: 'kalos-the-guardian', label: 'Kalos the Guardian', rates: { normal: 10, chaos: 70, extreme: 400 }, partyMax: 6 },
        { id: 'the-first-adversary', label: 'The First Antagonist', rates: { normal: 20, hard: 120, extreme: 500 }, partyMax: 3 },
        { id: 'radiant-ominous-star', label: 'Radiant Ominous Star', rates: { normal: 20, hard: 380 }, partyMax: 3 },
        { id: 'kaling', label: 'Kaling', rates: { normal: 20, hard: 160, extreme: 1200 }, partyMax: 6 },
        { id: 'limbo', label: 'Limbo', rates: { normal: 120, hard: 360 }, partyMax: 3 },
        { id: 'baldrix', label: 'Baldrix', rates: { normal: 150, hard: 450 }, partyMax: 3 }
    ]
});
