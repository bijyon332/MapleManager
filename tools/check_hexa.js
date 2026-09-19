#!/usr/bin/env node
// Sanity checks for the HEXA data + tracker: every node has an icon on disk, the
// cost tables agree with the published values, and the priority planner produces
// the ordering the reference tracker shows.
//
//   node tools/check_hexa.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const PUB = path.join(REPO, 'public');

// Icons the upstream source does not publish; these fall back to a type badge.
const KNOWN_ICONLESS = new Set(['hayato.common3', 'kanna.common3', 'lynn.common3', 'moxuan.common3']);
// Classes with no GMS HEXA table (Erel Light is on Erda Link).
const PLACEHOLDER_CLASSES = new Set(['erellight']);

const failures = [];
const notes = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// ------------------------------------------------------------------ load code

const store = {};
const sandbox = {
    window: {},
    document: { getElementById: () => null, createElement: () => ({ setAttribute() {} }), addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
    console,
};
sandbox.window.localStorage = sandbox.localStorage;
vm.createContext(sandbox);
// The browser loads these as classic scripts sharing one global lexical scope,
// so concatenate them rather than running each on its own.
const src = ['class_data.js', 'hexa_data.js', 'hexa_tracker.js']
    .map(f => fs.readFileSync(path.join(PUB, f), 'utf8'))
    .join('\n;\n') + '\n;({ tracker: hexaTracker, classData: CLASS_DATA })';
const loaded = vm.runInContext(src, sandbox, { filename: 'hexa bundle' });

const t = loaded.tracker;
const CLASSES = sandbox.window.HEXA_CLASS_SKILLS;
const COST = sandbox.window.HEXA_COST;
sandbox.CLASS_DATA = loaded.classData;

// ------------------------------------------------------- coverage against roster

const rosterIds = [];
for (const arr of Object.values(sandbox.CLASS_DATA)) for (const c of arr) rosterIds.push(c.id);
const dataIds = new Set(CLASSES.map(c => c.id));
for (const id of rosterIds) check(dataIds.has(id), 'class in CLASS_DATA but not in HEXA_CLASS_SKILLS: ' + id);
for (const c of CLASSES) check(rosterIds.includes(c.id), 'class in HEXA_CLASS_SKILLS but not in CLASS_DATA: ' + c.id);
notes.push(rosterIds.length + ' classes, all present in both tables');

// ----------------------------------------------------------------- icon files

let iconSlots = 0, iconMissing = 0, placeholderSlots = 0;
for (const c of CLASSES) {
    if (PLACEHOLDER_CLASSES.has(c.id)) { placeholderSlots += c.skills.length; continue; }
    for (const s of c.skills) {
        iconSlots++;
        const ref = c.id + '.' + s.key;
        if (!s.icon) {
            if (!KNOWN_ICONLESS.has(ref)) { failures.push('no icon assigned: ' + ref); iconMissing++; }
            continue;
        }
        const p = path.join(PUB, 'assets', 'hexa_icons', 'gms', s.icon + '.png');
        if (!fs.existsSync(p)) { failures.push('icon file missing on disk: ' + ref + ' -> ' + s.icon + '.png'); iconMissing++; }
    }
}
notes.push(iconSlots + ' released node slots, ' + iconMissing + ' without an icon ('
    + KNOWN_ICONLESS.size + ' known upstream gaps, ' + placeholderSlots + ' placeholder slots skipped)');

// Every icon on disk should be referenced by something.
const onDisk = fs.readdirSync(path.join(PUB, 'assets', 'hexa_icons', 'gms')).filter(f => f.endsWith('.png'));
const referenced = new Set();
for (const c of CLASSES) for (const s of c.skills) if (s.icon) referenced.add(s.icon + '.png');
const orphans = onDisk.filter(f => !referenced.has(f));
check(orphans.length === 0, 'unreferenced icon files: ' + orphans.slice(0, 8).join(', ') + (orphans.length > 8 ? ' …' : ''));
notes.push(onDisk.length + ' icon files on disk, ' + orphans.length + ' unreferenced');

// ---------------------------------------------------------------- cost tables

for (const [key, tbl] of Object.entries(COST)) {
    check(tbl.frag.length === 31, key + '.frag should have 31 entries');
    check(tbl.erda.length === 31, key + '.erda should have 31 entries');
    for (let i = 1; i < 31; i++) {
        check(tbl.frag[i] >= tbl.frag[i - 1], key + '.frag must be non-decreasing at ' + i);
        check(tbl.erda[i] >= tbl.erda[i - 1], key + '.erda must be non-decreasing at ' + i);
    }
}
check(COST.origin.frag[1] === 0, 'Origin Lv.1 must be free (auto-granted on 6th job)');
check(COST.ascent.frag[1] === 100, 'Ascent Lv.1 must cost 100 fragments');
check(COST.mastery.frag[9] === 242, 'Mastery Lv.9 must cost 242 fragments cumulative');
check(COST.common3.frag[6] === 265, '3rd Common Lv.6 must cost 265 fragments cumulative');

// ------------------------------------------------------- FD + planner, vs site

// Reference values read off the upstream Paladin priority board with a fresh
// character (Origin auto-granted at Lv.1, everything else at 0).
const pal = CLASSES.find(c => c.id === 'paladin');
check(!!pal, 'paladin class data missing');
if (pal) {
    const m1 = pal.skills.find(s => s.key === 'mastery1');
    check(m1.name === 'HEXA Blast / HEXA Divine Judgment', 'paladin mastery1 name drifted: ' + m1.name);
    const fd9 = t.fdAt(m1, 9);
    check(Math.abs(fd9 - 19.78) < 0.01, 'paladin mastery1 Lv.9 FD should be ~19.78, got ' + fd9.toFixed(3));

    const steps = t.buildPlan('paladin', 'paladin');
    const head = steps.slice(0, 6).map(s => s.skill.key + ' ' + s.from + '->' + s.to);
    const want = ['mastery1 0->9', 'mastery4 0->1', 'mastery2 0->1', 'enhance2 0->1', 'enhance3 0->1', 'enhance4 0->1'];
    check(JSON.stringify(head) === JSON.stringify(want),
        'paladin priority head drifted:\n    got  ' + JSON.stringify(head) + '\n    want ' + JSON.stringify(want));
    check(steps[0].frag === 242, 'first paladin step should cost 242 fragments, got ' + steps[0].frag);
    notes.push('paladin plan: ' + steps.length + ' steps to max, first = ' + head[0]);
}

// A fresh character sits above 0% because Origin Lv.1 is granted.
const fresh = t.getProgress('hero', 'hero');
check(fresh.fragSpent === 0, 'a fresh character has spent 0 fragments, got ' + fresh.fragSpent);
check(fresh.fdNow > 0, 'a fresh character should already have some FD from the free Origin Lv.1');
check(fresh.pct === 0, 'a fresh character should read 0%, got ' + fresh.pct + '%');

// Targets: default to 30, clamp to at least the current level.
t.data = {};
t.updateLevel('char:test', 'hero', 'mastery1', 12);
check(t.targetOf('char:test', CLASSES.find(c => c.id === 'hero').skills.find(s => s.key === 'mastery1')) === 30,
    'an untouched target defaults to Lv.30');
t.updateTarget('char:test', 'hero', 'mastery1', 5);
check(t.data['char:test'].targets.mastery1 === 12, 'a target below the current level clamps up to it');
t.updateLevel('char:test', 'hero', 'mastery1', 20);
check(t.data['char:test'].targets.mastery1 === 20, 'raising the current level drags a lower target with it');

// Planning stops at the target rather than at Lv.30.
t.data = {};
const heroCls = CLASSES.find(c => c.id === 'hero');
for (const s of heroCls.skills) t.updateTarget('char:t2', 'hero', s.key, t.minLevel(s));
check(t.buildPlan('char:t2', 'hero').length === 0, 'a plan with every target at the floor should be empty');

// ------------------------------------------------------------------- report

for (const n of notes) console.log('  ' + n);
if (failures.length) {
    console.log('\n' + failures.length + ' problem(s):');
    for (const f of failures) console.log('  ✗ ' + f);
    process.exit(1);
}
console.log('\nall checks passed');
