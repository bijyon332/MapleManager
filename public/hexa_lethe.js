// Lethe — provisional HEXA board and build order (2026-11-18, bi).
//
// gms-upgrade-tracker (the source of hexa_data.js) has no Lethe table yet, so
// there are no Final Damage weights. What we do have is a build order from
// another source (167 lines, "skill – level"; the original is kept in the
// project files as lethe-hexa/order-source.txt). This file adds a Lethe board
// with fd: 0 on every node and `provisional: true` on the class:
//   - progress input and fragment / Sol Erda costs work as for any class
//     (the cost tables are shared by every class);
//   - 強化順マップ follows ORDER below instead of the FD-per-cost greedy plan;
//   - Final Damage shows as "—", and Lethe stays out of the efficiency curve and
//     the class rankings.
//
// Reading the order: each "skill – n" means "raise that skill to n", taking
// every level in between in one go (Majeure 5 → 7 = Lv.6 and 7). The three
// "HEXA Stat" lines are not board nodes and are left out, which leaves 164 steps.
//
// Node mapping (assumed): Dominus: Eye of Eternity is Origin (its first line is
// Lv.2, and Origin Lv.1 is free on 6th job). Void Origin is taken as Ascent and
// Sovereign Everlasting as the 3rd Skill Core; the names alone do not say which
// is which. Sol Janus is not in the order and carries no FD, as for every class.
//
// When the source gains Lethe, regenerate hexa_data.js: this file then sees a
// real Lethe entry and steps aside, so it can simply be deleted.

(function () {
    if (typeof HEXA_CLASS_SKILLS === 'undefined') return;
    if (HEXA_CLASS_SKILLS.some(c => c.id === 'lethe')) return;

    const node = (key, type, tier, slot, name) => ({ key, type, tier, slot, name, fd: 0, c: -1, icon: null, prov: true });
    const skills = [
        node('origin', 'origin', 'skillNodes', 0, 'Dominus: Eye of Eternity'),
        node('ascent', 'ascent', 'skillNodes', 1, 'Void Origin'),
        node('skill3', 'third', 'skillNodes', 2, 'Sovereign Everlasting'),
        node('mastery1', 'mastery', 'mastery', 0, 'HEXA Majeure'),
        node('mastery2', 'mastery', 'mastery', 1, 'HEXA Beckon: Dread Knight / HEXA Edict: Dread Advance'),
        node('mastery3', 'mastery', 'mastery', 2, 'HEXA Assize / HEXA Edict: Fell Storm'),
        node('mastery4', 'mastery', 'mastery', 3, 'HEXA Beckon: Vargr / HEXA Edict: Rampage'),
        node('enhance1', 'enhance', 'boost', 0, 'Chains of Command Boost'),
        node('enhance2', 'enhance', 'boost', 1, 'Dominus: Dread Onslaught Boost'),
        node('enhance3', 'enhance', 'boost', 2, 'Dominus: Azrath Boost'),
        node('enhance4', 'enhance', 'boost', 3, 'Dominus: Pack United Boost'),
        { key: 'common1', type: 'common', tier: 'common', slot: 0, name: 'Sol Janus', fd: 0, c: -1, icon: 'General_1' },
        Object.assign(node('common2', 'common', 'common', 1, 'Sol Hekate'), { icon: 'General_2' }),
        node('common3', 'common', 'common', 2, 'HEXA Demonic Wrath'),
    ];

    // [node key, level to raise it to], in the order of the source list.
    const ORDER = [
        ['mastery1', 1], ['mastery2', 4], ['enhance1', 1], ['mastery2', 5], ['mastery3', 4], ['mastery4', 3], ['mastery2', 6], ['mastery4', 4],
        ['mastery3', 5], ['mastery2', 7], ['common3', 1], ['mastery3', 6], ['mastery2', 8], ['mastery4', 5], ['mastery1', 2], ['ascent', 1],
        ['mastery4', 6], ['mastery3', 7], ['mastery2', 9], ['mastery3', 8], ['mastery1', 3], ['mastery4', 7], ['mastery3', 9], ['mastery4', 8],
        ['mastery1', 4], ['mastery4', 9], ['mastery1', 5], ['mastery1', 7], ['mastery2', 14], ['mastery2', 15], ['mastery1', 8], ['mastery2', 16],
        ['mastery1', 9], ['mastery3', 14], ['mastery2', 17], ['mastery3', 15], ['mastery2', 18], ['mastery4', 14], ['skill3', 1], ['ascent', 3],
        ['mastery3', 16], ['mastery4', 15], ['mastery2', 19], ['mastery3', 17], ['enhance2', 1], ['mastery4', 16], ['mastery3', 18], ['mastery4', 17],
        ['enhance3', 1], ['enhance1', 6], ['mastery3', 19], ['mastery4', 18], ['enhance4', 1], ['mastery4', 19], ['mastery2', 26], ['origin', 2],
        ['mastery2', 27], ['mastery1', 15], ['mastery2', 29], ['mastery3', 26], ['mastery1', 16], ['origin', 3], ['common2', 2], ['mastery3', 27],
        ['ascent', 9], ['skill3', 2], ['mastery1', 17], ['mastery4', 25], ['mastery3', 29], ['mastery4', 26], ['origin', 4], ['mastery4', 27],
        ['mastery1', 18], ['common2', 3], ['skill3', 3], ['mastery4', 29], ['mastery1', 19], ['origin', 5], ['common2', 4], ['skill3', 4],
        ['enhance1', 12], ['origin', 6], ['common2', 5], ['origin', 7], ['skill3', 5], ['mastery1', 25], ['common2', 6], ['mastery1', 26],
        ['origin', 8], ['skill3', 6], ['mastery1', 27], ['origin', 9], ['common2', 7], ['mastery1', 29], ['mastery2', 30], ['skill3', 7],
        ['common2', 8], ['skill3', 8], ['common3', 2], ['enhance2', 2], ['common2', 9], ['mastery3', 30], ['enhance1', 18], ['skill3', 9],
        ['enhance3', 2], ['enhance2', 3], ['mastery4', 30], ['common3', 3], ['enhance4', 2], ['enhance2', 4], ['enhance3', 3], ['ascent', 18],
        ['common3', 4], ['enhance2', 10], ['enhance4', 3], ['enhance3', 4], ['enhance1', 24], ['origin', 14], ['enhance3', 10], ['enhance4', 4],
        ['origin', 15], ['common3', 5], ['enhance1', 30], ['enhance4', 10], ['origin', 16], ['common3', 6], ['common2', 15], ['mastery1', 30],
        ['origin', 17], ['skill3', 14], ['origin', 18], ['skill3', 15], ['common3', 7], ['skill3', 16], ['common3', 8], ['common2', 16],
        ['ascent', 24], ['skill3', 17], ['common2', 30], ['common3', 9], ['skill3', 18], ['enhance2', 11], ['ascent', 30], ['skill3', 19],
        ['enhance3', 11], ['enhance2', 12], ['enhance4', 11], ['enhance2', 20], ['enhance3', 12], ['origin', 30], ['enhance3', 20], ['enhance4', 12],
        ['skill3', 26], ['enhance4', 20], ['skill3', 27], ['enhance2', 30], ['skill3', 29], ['common3', 14], ['enhance3', 30], ['common3', 16],
        ['enhance4', 30], ['common3', 26], ['skill3', 30], ['common3', 30],
    ];

    HEXA_CLASS_SKILLS.push({
        id: 'lethe', gms: 'Lethe', icon: null, provisional: true, order: ORDER,
        slots: { skillNodes: 6, mastery: 4, boost: 4, common: 4 },
        skills,
    });
})();
