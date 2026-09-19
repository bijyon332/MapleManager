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

// ------------------------------------------------------------- efficiency curve

t.data = {};
const curve = t.curveData('hero', 'hero');
const pts = curve.points;
check(pts.length > 10, 'the hero curve should have several blocks, got ' + pts.length);
for (let i = 1; i < pts.length; i++) {
    check(pts[i].frag >= pts[i - 1].frag, 'curve fragments must be non-decreasing at ' + i);
    check(pts[i].fd >= pts[i - 1].fd - 1e-9, 'curve FD must be non-decreasing at ' + i);
}
// Each step takes the best block available, and a node's next-best block can only
// be worse than the one just taken, so the rate falls monotonically. That is what
// makes the curve concave and the break-even point unique — if this ever fails,
// the break-even reading is meaningless, not just imprecise.
for (let i = 2; i < pts.length; i++) {
    check(pts[i].ratio <= pts[i - 1].ratio + 1e-12,
        'curve marginal rate must not rise at step ' + i + ' (' + pts[i - 1].ratio + ' -> ' + pts[i].ratio + ')');
}

const heroFresh = t.getProgress('hero', 'hero');
check(Math.abs(curve.totalFrag - (heroFresh.fragMax - heroFresh.fragSpent)) < 1,
    'curve total should equal the fragments needed to max the board, got ' + curve.totalFrag
    + ' vs ' + (heroFresh.fragMax - heroFresh.fragSpent));
check(Math.abs(curve.totalErda - (heroFresh.erdaMax - heroFresh.erdaSpent)) < 1,
    'curve Sol Erda total should equal the progress tab\'s');
check(Math.abs(curve.fdMax - heroFresh.fdMax) < 0.01, 'curve top should equal fdMax');
check(Math.abs(curve.fdFloor - heroFresh.fdNow) < 0.01, 'curve floor should equal a fresh board\'s FD');

// The break-even point is the last level still beating the whole-board average.
check(pts[curve.breakIdx].ratio >= curve.avg, 'break-even point must be at or above the average slope');
check(curve.breakIdx + 1 >= pts.length || pts[curve.breakIdx + 1].ratio < curve.avg,
    'the level after the break-even point must fall below the average slope');
const brkPct = curve.breakIdx > 0 ? pts[curve.breakIdx].fd / curve.fdMax * 100 : 0;
const brkFragPct = pts[curve.breakIdx].frag / curve.totalFrag * 100;
check(brkPct > 10 && brkPct < 100, 'break-even FD share should be a meaningful fraction, got ' + brkPct.toFixed(1) + '%');
notes.push('hero curve: ' + pts.length + ' points, break-even at FD ' + brkPct.toFixed(0)
    + '% for ' + brkFragPct.toFixed(0) + '% of the fragments, average '
    + (curve.avg * 1000).toFixed(1) + ' FD per 1,000');

// The 20% lookup table must land on real points, in order.
let prevFrag = -1;
for (let k = 1; k <= 5; k++) {
    const { p } = t.curveAt(curve, curve.fdMax * k / 5);
    check(p.fd >= curve.fdMax * k / 5 - 1e-9, 'curveAt must reach the requested FD for ' + (k * 20) + '%');
    check(p.frag > prevFrag, 'lookup rows must increase in cost at ' + (k * 20) + '%');
    prevFrag = p.frag;
}
// Reaching 100% Final Damage can cost less than the whole board, because some
// nodes (Sol Janus, and any node the source weights at 0) carry no FD at all.
const fullFd = t.curveAt(curve, curve.fdMax).p;
check(Math.abs(fullFd.fd - curve.fdMax) < 0.01, '100% must land on the maximum FD');
check(fullFd.frag <= curve.totalFrag + 1, '100% cannot cost more than the whole board');
check(Math.abs(pts[pts.length - 1].fd - curve.fdMax) < 0.01, 'the curve must end at maximum FD');
const deadFrag = curve.totalFrag - fullFd.frag;
check(deadFrag >= 0, 'the zero-FD tail cannot be negative');
notes.push('hero: FD 100% costs ' + Math.round(fullFd.frag).toLocaleString() + ' fragments; a further '
    + Math.round(deadFrag).toLocaleString() + ' buys nodes with no FD weight');

// Every class should produce a usable curve, not just Hero.
for (const c of CLASSES) {
    if (PLACEHOLDER_CLASSES.has(c.id)) continue;
    const cv = t.curveData(c.id, c.id);
    check(cv.totalFrag > 0 && cv.fdMax > 0, 'no usable curve for ' + c.id);
    check(cv.breakIdx > 0 && cv.breakIdx < cv.points.length, 'break-even out of range for ' + c.id);
}
notes.push('curves build for all ' + (CLASSES.length - PLACEHOLDER_CLASSES.size) + ' classes with node data');

// ------------------------------------------------------------------- report

for (const n of notes) console.log('  ' + n);
if (failures.length) {
    console.log('\n' + failures.length + ' problem(s):');
    for (const f of failures) console.log('  ✗ ' + f);
    process.exit(1);
}
console.log('\nall checks passed');
