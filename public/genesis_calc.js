// Genesis Weapon liberation date calculator.
// Data (stage thresholds, boss trace rates, party caps) mirrors meaegi.com's
// live "제네시스 무기 해방 날짜 계산기" as of 2026-07.
const genesisCalc = createLiberationCalc({
    storageKey: 'gms-genesis-liberation-calc',
    titleJa: 'ジェネシス武器 解放計算機',
    subtitleJa: '闇の痕跡を集めてジェネシス武器を解放しよう',
    currencyLabel: '闇の痕跡',
    maxHold: 3000,
    hasPass: true,
    passLabel: 'ジェネシスパス',
    passMultiplier: 3,
    passDefaultActive: true,
    passDefaultEndDate: '2026-09-16',
    stages: [
        { id: 'van-leon', label: 'Von Leon', need: 500 },
        { id: 'arkarium', label: 'Arkarium', need: 500 },
        { id: 'magnus', label: 'Magnus', need: 500 },
        { id: 'lotus', label: 'Lotus', need: 1000 },
        { id: 'damien', label: 'Damien', need: 1000 },
        { id: 'will', label: 'Will', need: 1000 },
        { id: 'lucid', label: 'Lucid', need: 1000 },
        { id: 'verus-hilla', label: 'Verus Hilla', need: 1000 }
    ],
    bosses: [
        { id: 'lotus', label: 'Lotus', rates: { normal: 10, hard: 50, extreme: 50 }, partyMax: 6 },
        { id: 'damien', label: 'Damien', rates: { normal: 10, hard: 50 }, partyMax: 6 },
        { id: 'lucid', label: 'Lucid', rates: { easy: 15, normal: 20, hard: 65 }, partyMax: 6 },
        { id: 'will', label: 'Will', rates: { easy: 15, normal: 25, hard: 75 }, partyMax: 6 },
        { id: 'giant-monster-gloom', label: 'Gloom', rates: { normal: 20, chaos: 65 }, partyMax: 6 },
        { id: 'verus-hilla', label: 'Verus Hilla', rates: { normal: 45, hard: 90 }, partyMax: 6 },
        { id: 'guard-captain-darknell', label: 'Darknell', rates: { normal: 25, hard: 75 }, partyMax: 6 },
        { id: 'black-mage', label: 'Black Mage', rates: { hard: 600, extreme: 600 }, partyMax: 6, monthly: true }
    ]
});
