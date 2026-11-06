// 3rd HEXA skill core (KMS 1.2.417, 2026-07-23). Coming to GMS soon; GMS has not
// published the skill names yet, so the node is called "3rd Skill Core" for now.
//
// Hand-maintained, and kept out of hexa_data.js because that file is regenerated
// from gms-upgrade-tracker, which has no 3rd skill node yet. This file runs after
// hexa_data.js and adds one node per class to the Skill Node tier (slot 2).
//
// The node has no Final Damage weight (fd: 0), so it stays out of the FD math
// and the 強化順 plan. It does pay fragments / Sol Erda (HEXA_COST.skill3).
//
// Cost: KMS values, cumulative to reach each level (index 0..30).
//   Per-level table: Orange Mushroom "KMS ver. 1.2.417 – 3rd HEXA Skill Core"
//   (orangemushroom.net/2026/07/31/...), the same table on MapleStory Wiki
//   (HEXA Matrix, "3rd Skill Node") and the KMS fixture of jini520/maple-routine
//   (sourced from namu.wiki HEXA 매트릭스). Total Lv0→30: 117 Sol Erda, 3,442 fragments.
//
// Icons: KMS skill icons from the Nexon Open API static path
// (open.api.nexon.com/static/maplestory/skill/icon/<code>, code = skill id
// encoded), saved under assets/hexa_icons/kms3rd/<classId>.png. Classes KMS does
// not have (Hayato, Kanna, Lynn, Mo Xuan) get no icon. When GMS ships the skill,
// swap in the GMS name / icon and give the node an FD weight.

(function () {
    if (typeof HEXA_COST === 'undefined' || typeof HEXA_CLASS_SKILLS === 'undefined') return;

    // Per-level cost (Lv.n-1 → Lv.n), n = 1..30.
    const STEP_ERDA = [7, 1, 1, 1, 1, 2, 2, 2, 2, 8, 2, 2, 3, 3, 3, 3, 3, 3, 3, 12, 4, 4, 4, 4, 4, 4, 5, 5, 5, 14];
    const STEP_FRAG = [140, 21, 26, 30, 34, 38, 43, 47, 51, 142, 62, 69, 77, 83, 91, 98, 105, 112, 120, 252, 128, 136, 145, 152, 161, 168, 177, 184, 193, 357];
    const cumulative = steps => steps.reduce((acc, v) => { acc.push(acc[acc.length - 1] + v); return acc; }, [0]);
    HEXA_COST.skill3 = { frag: cumulative(STEP_FRAG), erda: cumulative(STEP_ERDA) };

    // classId -> KMS skill name (unofficial English, as in the Journal column
    // 「3次HEXAスキルの歴史」). Classes with an entry also have an icon file.
    const KMS_SKILL = {
        hero: 'Rage Explosion', paladin: 'Divine Convergence', darkknight: 'Darkness of Grace',
        archmagefp: 'Infernal Wave', archmageil: 'Subzero Fulmination', bishop: 'Angels Pledge',
        bowmaster: 'Eye of Aquila', marksman: 'Lethal Punisher', pathfinder: 'Material Burst',
        nightlord: 'Shadow Ritual', shadower: 'Void Trance', dualblade: 'Dark Shadow Slash',
        buccaneer: 'Neptunus Advent', corsair: 'Aerial Bombardment', cannoneer: 'Mega Cannon Bombard',
        mihile: 'Radiance of Valor', dawnwarrior: 'Celestial Cleave', blazewizard: 'Ignis Requiem',
        windarcher: "Sylph's Breath", nightwalker: 'Singularity Throw', thunderbreaker: 'Sea Emperor Smash',
        aran: 'Maha Unleashed', evan: 'Dragon Soar / Vertical Finisher', luminous: 'Absolute Space',
        mercedes: 'Varian Surge', phantom: 'Fleche Retour', shade: 'Tempest of Love',
        blaster: 'Overheat Punch', battlemage: 'Mortis Edge', wildhunter: 'Resonance: Wild Pierce',
        xenon: 'Rail Gun Cannonade', mechanic: 'Buster Station', demonslayer: 'Wrath of Satan',
        demonavenger: 'Rabid Carnage', kaiser: 'Draconic Extinction', kain: 'Strike Impact / Phantom Requiem',
        cadena: 'Chain Arts: Torrent', angelicbuster: 'Popping Heart', zero: 'Time Authority',
        kinesis: 'Gravity Object', adele: 'Aether Ruefe', illium: 'Glory Wings: Splendor',
        khali: 'Hex: Dune Burst', ark: 'Primal Torrent', ren: 'Thousandfold Slash',
        lara: 'Embracing Breath', hoyoung: 'Four Perils Taotie',
    };

    // Sia and Erel Light level through Erda Link, not the HEXA Matrix.
    const SKIP = new Set(['sia', 'erellight']);

    for (const cls of HEXA_CLASS_SKILLS) {
        if (SKIP.has(cls.id)) continue;
        if (cls.skills.some(s => s.tier === 'skillNodes' && s.slot === 2)) continue;
        cls.skills.push({
            key: 'skill3', type: 'third', tier: 'skillNodes', slot: 2,
            name: '3rd Skill Core', fd: 0, c: -1, icon: null,
            iconSrc: KMS_SKILL[cls.id] ? 'assets/hexa_icons/kms3rd/' + cls.id + '.png' : null,
            kmsName: KMS_SKILL[cls.id] || null,
        });
    }
})();
