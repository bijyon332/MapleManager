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
// Lv.2, and Origin Lv.1 is free on 6th job). Void Origin is the 3rd Skill Core
// and Sovereign Everlasting the Ascent (bi, 2026-11-18). Sol Janus is not in the order and carries no FD, as for every class.
//
// Icons: KMS skill icons from the Nexon Open API static path (as in
// hexa_third.js), saved under assets/hexa_icons/lethe/<node key>.png. Skill IDs
// from the KMST 1.2.202 / 1.2.203 diffs (Jancy-49/Papulatus-Daily):
//   origin 192141500 오버로드 : 이터널 게이즈, ascent 192141502 앱솔루트 레인,
//   skill3 192141504 보이드 오리진, mastery1 (Assize) 192140000 임프린트 VI,
//   mastery2 (Vargr) 192141005 인보크 : 바르가르 VI, mastery3 (Dread Knight) 192140011 인보크 : 템플러 VI,
//   mastery4 (Majeure) 192141015 임펠 VI, enhance1 (Dread Onslaught) 500004213 오버로드 : 템플러 온슬로트 강화,
//   enhance2 (Pack United) 500004214 오버로드 : 바르가르 트라이던트 강화,
//   enhance3 (Azrath) 500004215 인보크/오버로드 : 아즈라스 강화, enhance4 (Chains of Command) 500004216 체인 커맨드 강화,
//   common3 500001136 프라이멀 퓨리 VI.
// Mastery and Boost slots follow the in-game board, top to bottom (bi, 2026-11-18):
// Assize, Vargr, Dread Knight, Majeure / Dread Onslaught, Pack United, Azrath,
// Chains of Command. bi also confirmed the Majeure icon.
//
// When the source gains Lethe, regenerate hexa_data.js: this file then sees a
// real Lethe entry and steps aside, so it can simply be deleted.

(function () {
    if (typeof HEXA_CLASS_SKILLS === 'undefined') return;
    if (HEXA_CLASS_SKILLS.some(c => c.id === 'lethe')) return;

    const node = (key, type, tier, slot, name) => ({ key, type, tier, slot, name, fd: 0, c: -1, icon: null,
        iconSrc: 'assets/hexa_icons/lethe/' + key + '.png', prov: true });
    const skills = [
        node('origin', 'origin', 'skillNodes', 0, 'Dominus: Eye of Eternity'),
        node('ascent', 'ascent', 'skillNodes', 1, 'Sovereign Everlasting'),
        node('skill3', 'third', 'skillNodes', 2, 'Void Origin'),
        node('mastery1', 'mastery', 'mastery', 0, 'HEXA Assize / HEXA Edict: Fell Storm'),
        node('mastery2', 'mastery', 'mastery', 1, 'HEXA Beckon: Vargr / HEXA Edict: Rampage'),
        node('mastery3', 'mastery', 'mastery', 2, 'HEXA Beckon: Dread Knight / HEXA Edict: Dread Advance'),
        node('mastery4', 'mastery', 'mastery', 3, 'HEXA Majeure'),
        node('enhance1', 'enhance', 'boost', 0, 'Dominus: Dread Onslaught Boost'),
        node('enhance2', 'enhance', 'boost', 1, 'Dominus: Pack United Boost'),
        node('enhance3', 'enhance', 'boost', 2, 'Dominus: Azrath Boost'),
        node('enhance4', 'enhance', 'boost', 3, 'Chains of Command Boost'),
        { key: 'common1', type: 'common', tier: 'common', slot: 0, name: 'Sol Janus', fd: 0, c: -1, icon: 'General_1' },
        Object.assign(node('common2', 'common', 'common', 1, 'Sol Hekate'), { icon: 'General_2', iconSrc: null }),
        node('common3', 'common', 'common', 2, 'HEXA Demonic Wrath'),
    ];

    // [node key, level to raise it to], in the order of the source list.
    const ORDER = [
        ['mastery4', 1], ['mastery3', 4], ['enhance4', 1], ['mastery3', 5], ['mastery1', 4], ['mastery2', 3], ['mastery3', 6], ['mastery2', 4],
        ['mastery1', 5], ['mastery3', 7], ['common3', 1], ['mastery1', 6], ['mastery3', 8], ['mastery2', 5], ['mastery4', 2], ['skill3', 1],
        ['mastery2', 6], ['mastery1', 7], ['mastery3', 9], ['mastery1', 8], ['mastery4', 3], ['mastery2', 7], ['mastery1', 9], ['mastery2', 8],
        ['mastery4', 4], ['mastery2', 9], ['mastery4', 5], ['mastery4', 7], ['mastery3', 14], ['mastery3', 15], ['mastery4', 8], ['mastery3', 16],
        ['mastery4', 9], ['mastery1', 14], ['mastery3', 17], ['mastery1', 15], ['mastery3', 18], ['mastery2', 14], ['ascent', 1], ['skill3', 3],
        ['mastery1', 16], ['mastery2', 15], ['mastery3', 19], ['mastery1', 17], ['enhance1', 1], ['mastery2', 16], ['mastery1', 18], ['mastery2', 17],
        ['enhance3', 1], ['enhance4', 6], ['mastery1', 19], ['mastery2', 18], ['enhance2', 1], ['mastery2', 19], ['mastery3', 26], ['origin', 2],
        ['mastery3', 27], ['mastery4', 15], ['mastery3', 29], ['mastery1', 26], ['mastery4', 16], ['origin', 3], ['common2', 2], ['mastery1', 27],
        ['skill3', 9], ['ascent', 2], ['mastery4', 17], ['mastery2', 25], ['mastery1', 29], ['mastery2', 26], ['origin', 4], ['mastery2', 27],
        ['mastery4', 18], ['common2', 3], ['ascent', 3], ['mastery2', 29], ['mastery4', 19], ['origin', 5], ['common2', 4], ['ascent', 4],
        ['enhance4', 12], ['origin', 6], ['common2', 5], ['origin', 7], ['ascent', 5], ['mastery4', 25], ['common2', 6], ['mastery4', 26],
        ['origin', 8], ['ascent', 6], ['mastery4', 27], ['origin', 9], ['common2', 7], ['mastery4', 29], ['mastery3', 30], ['ascent', 7],
        ['common2', 8], ['ascent', 8], ['common3', 2], ['enhance1', 2], ['common2', 9], ['mastery1', 30], ['enhance4', 18], ['ascent', 9],
        ['enhance3', 2], ['enhance1', 3], ['mastery2', 30], ['common3', 3], ['enhance2', 2], ['enhance1', 4], ['enhance3', 3], ['skill3', 18],
        ['common3', 4], ['enhance1', 10], ['enhance2', 3], ['enhance3', 4], ['enhance4', 24], ['origin', 14], ['enhance3', 10], ['enhance2', 4],
        ['origin', 15], ['common3', 5], ['enhance4', 30], ['enhance2', 10], ['origin', 16], ['common3', 6], ['common2', 15], ['mastery4', 30],
        ['origin', 17], ['ascent', 14], ['origin', 18], ['ascent', 15], ['common3', 7], ['ascent', 16], ['common3', 8], ['common2', 16],
        ['skill3', 24], ['ascent', 17], ['common2', 30], ['common3', 9], ['ascent', 18], ['enhance1', 11], ['skill3', 30], ['ascent', 19],
        ['enhance3', 11], ['enhance1', 12], ['enhance2', 11], ['enhance1', 20], ['enhance3', 12], ['origin', 30], ['enhance3', 20], ['enhance2', 12],
        ['ascent', 26], ['enhance2', 20], ['ascent', 27], ['enhance1', 30], ['ascent', 29], ['common3', 14], ['enhance3', 30], ['common3', 16],
        ['enhance2', 30], ['common3', 26], ['ascent', 30], ['common3', 30],
    ];

    HEXA_CLASS_SKILLS.push({
        id: 'lethe', gms: 'Lethe', icon: null, provisional: true, order: ORDER,
        slots: { skillNodes: 6, mastery: 4, boost: 4, common: 4 },
        skills,
    });
})();
