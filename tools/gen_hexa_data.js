#!/usr/bin/env node
// Regenerates public/hexa_data.js (and, with --icons, public/assets/hexa_icons/gms/)
// from the GMS HEXA node table published by gms-upgrade-tracker.vercel.app.
//
//   node tools/gen_hexa_data.js            # data only
//   node tools/gen_hexa_data.js --icons    # data + re-download the 32x32 icon set
//
// The site is a Next.js build, so the data lives in a content-hashed JS chunk.
// We discover the chunk by scanning /hexa for script URLs and picking the one
// that contains the node table, rather than pinning a hash that changes on every
// deploy.

const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://gms-upgrade-tracker.vercel.app';
const REPO = path.join(__dirname, '..');
const OUT_DATA = path.join(REPO, 'public', 'hexa_data.js');
const OUT_ICONS = path.join(REPO, 'public', 'assets', 'hexa_icons', 'gms');

// Marker that identifies the chunk holding the per-class node table.
const NODE_MARKER = 'Hero:{classKey:"Hero"';
// Marker for the chunk holding the cumulative cost tables.
const COST_MARKER = '"costToReach",0,';

// ---------------------------------------------------------------- source data

// Icon-prefix table, lifted from the site's own class -> asset-name map.
// `Xenon` is absent there (their Xenon page renders iconless) but the files are
// published under the obvious name, so we add it.
const ICON_PREFIX = {
  Hero: 'Hero', Paladin: 'Palladin', 'Dark Knight': 'DarkKnight', 'Fire/Poison': 'ArchMageFP',
  'Ice/Lightning': 'ArchMageTC', Bishop: 'Bishop', Bowmaster: 'Bowmaster', Marksman: 'Marksman',
  Pathfinder: 'PathFinder', 'Night Lord': 'NightLord', Shadower: 'Shadower', 'Dual Blade': 'DualBlader',
  Buccaneer: 'Viper', Corsair: 'Captain', Cannoneer: 'CannonMaster', Mechanic: 'Mechanic',
  'Wild Hunter': 'WildHunter', 'Battle Mage': 'BattleMage', Blaster: 'Blaster', Mercedes: 'Mercedes',
  Phantom: 'Phantom', Luminous: 'Luminous', Shade: 'Eunwol', Aran: 'Aran', Evan: 'Evan',
  Mihile: 'Mikhail', 'Demon Slayer': 'DemonSlayer', 'Demon Avenger': 'DemonAvenger', Kaiser: 'Kaiser',
  'Angelic Buster': 'AngelicBuster', Cadena: 'Cadena', Kain: 'Kain', Illium: 'Illium', Ark: 'Ark',
  Adele: 'Adele', Khali: 'Khali', Lara: 'Lara', Hoyoung: 'Hoyeong', Hayato: 'Hayato', Kanna: 'Kanna',
  Zero: 'Zero', Kinesis: 'Kinesis', Lynn: 'Lynn', 'Dawn Warrior': 'SoulMaster',
  'Blaze Wizard': 'FlameWizard', 'Wind Archer': 'WindBreaker', 'Night Walker': 'NightWalker',
  'Thunder Breaker': 'Striker', 'Mo Xuan': 'Moxuan', Sia: 'Sia', Ren: 'Len', Xenon: 'Xenon',
};

// Icon files the source names but never publishes (their own board renders a
// placeholder for these). We emit `icon: null` so the tracker falls back to a
// type badge instead of a broken image. Drop entries here once they show up.
const UNPUBLISHED_ICONS = new Set(['Hayato_11', 'Kanna_11', 'Lynn_11', 'Moxuan_11']);

// Board position -> icon file number, from the same source.
// common 0/1 always use the shared General_1 / General_2 art.
const ICON_SLOT = {
  skillNodes: [1, 10, null, null, null, null],
  mastery: [2, 7, 8, 9],
  boost: [3, 4, 5, 6],
  common: [null, null, 11, null],
};

// Source tier -> our storage key prefix. The keys are the ones already written
// into localStorage by earlier versions, so they must not change.
const KEY = {
  skillNodes: ['origin', 'ascent', 'skill3', 'skill4', 'skill5', 'skill6'],
  mastery: ['mastery1', 'mastery2', 'mastery3', 'mastery4'],
  boost: ['enhance1', 'enhance2', 'enhance3', 'enhance4'],
  common: ['common1', 'common2', 'common3', 'common4'],
};
const TYPE = {
  skillNodes: i => (i === 0 ? 'origin' : 'ascent'),
  mastery: () => 'mastery',
  boost: () => 'enhance',
  common: () => 'common',
};

// Display names that don't normalise onto one of our class ids.
const NAME_ALIAS = { firepoison: 'archmagefp', icelightning: 'archmageil' };

// Classes we keep hand-maintained because the source has no HEXA table for them
// (Erel Light is on the Erda Link system, not the HEXA Matrix).
const KEEP_LOCAL = ['erellight'];

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// ------------------------------------------------------------------- fetching

async function text(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  return r.text();
}

async function findChunk(marker) {
  const html = await text(ORIGIN + '/hexa');
  const urls = [...new Set((html.match(/\/_next\/static\/chunks\/[A-Za-z0-9_\-.]+\.js/g) || []))];
  for (const u of urls) {
    const body = await text(ORIGIN + u);
    if (body.includes(marker)) return body;
  }
  throw new Error('no chunk contains ' + JSON.stringify(marker));
}

// Extract the object literal that starts at the `{` preceding `marker` and ends
// at its matching brace. The chunks are minified, so a brace walk that skips
// string literals is the most robust way in.
function objectLiteralAround(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error('marker not found: ' + marker);
  let start = at - 1;
  while (start > 0 && src[start] !== '{') start--;
  const BS = String.fromCharCode(92);
  let depth = 0, end = start;
  for (; end < src.length; end++) {
    const c = src[end];
    if (c === '"' || c === "'") {
      const q = c;
      end++;
      while (end < src.length && (src[end] !== q || src[end - 1] === BS)) end++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end++; break; } }
  }
  // eslint-disable-next-line no-eval
  return eval('(' + src.slice(start, end) + ')');
}

// The cost chunk declares the tables as bare minified arrays. Pull them out by
// their first few values, which are stable and unique per table.
function numberArrayAfter(src, head) {
  const at = src.indexOf(head);
  if (at < 0) throw new Error('cost table not found: ' + head);
  const open = src.lastIndexOf('[', at);
  const close = src.indexOf(']', at);
  const arr = JSON.parse(src.slice(open, close + 1).replace(/(\d)e(\d)/g, (m, a, b) => String(Number(m))));
  if (arr.length !== 31) throw new Error('expected 31 entries for ' + head + ', got ' + arr.length);
  return arr;
}

// ------------------------------------------------------------------ generation

function buildClasses(nodes, classData) {
  const ours = [];
  for (const arr of Object.values(classData)) for (const c of arr) ours.push(c);

  const out = [];
  const unmatched = [];
  const byId = {};

  for (const [key, cls] of Object.entries(nodes)) {
    const n = norm(key);
    const id = NAME_ALIAS[n] || (ours.find(c => norm(c.name) === n || norm(c.id) === n) || {}).id;
    if (!id) { unmatched.push(key); continue; }
    byId[id] = { key, cls };
  }

  // Emit in our CLASS_DATA order so the tracker's class list stays grouped.
  for (const c of ours) {
    const hit = byId[c.id];
    if (!hit) continue;
    const { key, cls } = hit;
    const prefix = ICON_PREFIX[key];
    if (!prefix) throw new Error('no icon prefix for ' + key);

    const skills = [];
    const slots = {};
    for (const tier of ['skillNodes', 'mastery', 'boost', 'common']) {
      slots[tier] = cls[tier].length;
      cls[tier].forEach((node, i) => {
        if (!node) return;
        let num = ICON_SLOT[tier][i];
        if (num != null && UNPUBLISHED_ICONS.has(prefix + '_' + num)) num = null;
        skills.push({
          key: KEY[tier][i],
          type: TYPE[tier](i),
          tier,
          slot: i,
          name: node.name,
          fd: node.fdWeight,
          curve: node.fdPerLevel || null,
          icon: tier === 'common' && i < 2 ? 'General_' + (i + 1) : (num == null ? null : prefix + '_' + num),
        });
      });
    }
    out.push({ id: c.id, gms: key, icon: prefix, slots, skills });
  }
  return { out, unmatched };
}

function dedupeCurves(classes) {
  const curves = [];
  const index = new Map();
  for (const c of classes) for (const s of c.skills) {
    if (!s.curve) { s.curveIdx = -1; continue; }
    const k = JSON.stringify(s.curve);
    if (!index.has(k)) { index.set(k, curves.length); curves.push(s.curve); }
    s.curveIdx = index.get(k);
  }
  return curves;
}

function emit({ classes, curves, cost, localEntries }) {
  const j = v => JSON.stringify(v);
  const lines = [];
  lines.push('// Auto-generated by tools/gen_hexa_data.js — do not hand-edit.');
  lines.push('// Source: the GMS HEXA node table published by gms-upgrade-tracker.vercel.app,');
  lines.push('// which carries GMS skill names, per-node Final Damage weights and the exact');
  lines.push('// Sol Erda / fragment cost tables. Re-run the generator after a GMS patch.');
  lines.push('//');
  lines.push('// Erel Light is kept hand-maintained below: it uses the Erda Link system, not');
  lines.push('// the HEXA Matrix, so the source has no node table for it.');
  lines.push('');

  lines.push('// Cumulative cost to reach a level, indexed 0..30.');
  lines.push('// `origin` is the Origin node itself, whose Lv.1 is granted free on 6th job;');
  lines.push('// `ascent` covers Ascent and the yet-unreleased skill slots, which pay for Lv.1.');
  lines.push('const HEXA_COST = {');
  for (const [k, v] of Object.entries(cost)) {
    lines.push('    ' + k + ': { frag: ' + j(v.frag) + ', erda: ' + j(v.erda) + ' },');
  }
  lines.push('};');
  lines.push('');

  lines.push('// Level 1 is granted automatically for these nodes, so they start above zero.');
  lines.push('const HEXA_MIN_LEVEL = { origin: 1 };');
  lines.push('');

  lines.push('// Share of a node\'s Final Damage weight unlocked at each level (30 entries,');
  lines.push('// relative — the tracker normalises by the sum). Deduped across classes.');
  lines.push('const HEXA_FD_CURVES = [');
  for (const c of curves) lines.push('    ' + j(c) + ',');
  lines.push('];');
  lines.push('');

  lines.push('// Fallback shape for nodes the source ships without an explicit curve');
  lines.push('// (every Mastery and Common node): `first` of the weight lands at Lv.1, `slope`');
  lines.push('// spreads evenly to Lv.30, and `steps` are extra jumps at Lv.10/20/30.');
  lines.push('const HEXA_FD_FALLBACK = {');
  lines.push('    skillNodes: { first: 0.11766, slope: 0.88234, steps: { 10: 0, 20: 0, 30: 0 } },');
  lines.push('    mastery:    { first: 0.18893, slope: 0.81107, steps: { 10: 0, 20: 0, 30: 0 } },');
  lines.push('    boost:      { first: 0.16667, slope: 0.5,     steps: { 10: 0.08333, 20: 0.08333, 30: 0.16667 } },');
  lines.push('    common:     { first: 0,       slope: 1,       steps: { 10: 0, 20: 0, 30: 0 } },');
  lines.push('};');
  lines.push('');

  lines.push('// Per class: `icon` is the asset-name prefix, `slots` the board size per tier');
  lines.push('// (released nodes are listed in `skills`; the remainder show as unreleased),');
  lines.push('// `fd` the node\'s Final Damage weight and `c` its HEXA_FD_CURVES index (-1 = fallback).');
  lines.push('const HEXA_CLASS_SKILLS = [');
  for (const c of classes) {
    lines.push('  {id:' + j(c.id) + ',gms:' + j(c.gms) + ',icon:' + j(c.icon) + ',slots:' + j(c.slots) + ',skills:[');
    for (const s of c.skills) {
      lines.push('    {key:' + j(s.key) + ',type:' + j(s.type) + ',tier:' + j(s.tier) + ',slot:' + s.slot
        + ',name:' + j(s.name) + ',fd:' + s.fd + ',c:' + s.curveIdx + ',icon:' + j(s.icon) + '},');
    }
    lines.push('  ]},');
  }
  for (const e of localEntries) lines.push(e);
  lines.push('];');
  lines.push('');
  lines.push('if (typeof window !== \'undefined\') {');
  lines.push('    window.HEXA_COST = HEXA_COST;');
  lines.push('    window.HEXA_MIN_LEVEL = HEXA_MIN_LEVEL;');
  lines.push('    window.HEXA_FD_CURVES = HEXA_FD_CURVES;');
  lines.push('    window.HEXA_FD_FALLBACK = HEXA_FD_FALLBACK;');
  lines.push('    window.HEXA_CLASS_SKILLS = HEXA_CLASS_SKILLS;');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

// --------------------------------------------------------------------- icons

async function downloadIcons(classes) {
  fs.mkdirSync(OUT_ICONS, { recursive: true });
  const want = new Set(['General_1', 'General_2']);
  for (const c of classes) for (const s of c.skills) if (s.icon) want.add(s.icon);

  const names = [...want].sort();
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const missing = [];
  let saved = 0, bytes = 0;

  const one = async name => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(ORIGIN + '/hexa-icons/' + name + '.png');
        if (r.status === 404) { missing.push(name); return; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 8 || !buf.subarray(0, 4).equals(PNG)) { missing.push(name + ' (not a PNG)'); return; }
        fs.writeFileSync(path.join(OUT_ICONS, name + '.png'), buf);
        saved++; bytes += buf.length;
        return;
      } catch (e) {
        if (attempt === 2) missing.push(name + ' (' + e.message + ')');
        else await new Promise(res => setTimeout(res, 300 * (attempt + 1)));
      }
    }
  };

  for (let i = 0; i < names.length; i += 12) await Promise.all(names.slice(i, i + 12).map(one));
  console.log('icons: saved ' + saved + '/' + names.length + ' (' + Math.round(bytes / 1024) + ' KB)');
  if (missing.length) console.log('icons not published upstream: ' + missing.join(', '));
}

// ----------------------------------------------------------------------- main

(async () => {
  const classData = require(path.join(REPO, 'public', 'class_data.js'));

  console.log('fetching node table...');
  const nodeChunk = await findChunk(NODE_MARKER);
  const nodes = objectLiteralAround(nodeChunk, NODE_MARKER);
  console.log('  ' + Object.keys(nodes).length + ' classes');

  console.log('fetching cost tables...');
  const costChunk = await findChunk(COST_MARKER);
  const cost = {
    // Ascent + future skill slots pay for Lv.1; the Origin node does not.
    ascent: { erda: numberArrayAfter(costChunk, '0,5,6,7,8,10,12,14,17,20,30'), frag: numberArrayAfter(costChunk, '0,100,130,165,205,250,300,355,415,480,680') },
    mastery: { erda: numberArrayAfter(costChunk, '0,3,4,5,6,7,8,9,11,13,18'), frag: numberArrayAfter(costChunk, '0,50,65,83,103,126,151,179,209,242,342') },
    enhance: { erda: numberArrayAfter(costChunk, '0,4,5,6,7,9,11,13,16,19,27'), frag: numberArrayAfter(costChunk, '0,75,98,125,155,189,227,269,314,363,513') },
    common: { erda: numberArrayAfter(costChunk, '0,7,9,11,13,16,19,22,27,32,46'), frag: numberArrayAfter(costChunk, '0,125,163,207,257,314,377,446,521,603,903') },
    common3: { erda: numberArrayAfter(costChunk, '0,4,5,6,7,9,11,13,16,19,28'), frag: numberArrayAfter(costChunk, '0,90,115,145,180,220,265,315,370,430,610') },
  };
  // Origin's own table is the Ascent table with the Lv.1 cost removed.
  cost.origin = {
    erda: cost.ascent.erda.map((v, i) => (i === 0 ? 0 : v - cost.ascent.erda[1])),
    frag: cost.ascent.frag.map((v, i) => (i === 0 ? 0 : v - cost.ascent.frag[1])),
  };

  const { out: classes, unmatched } = buildClasses(nodes, classData);
  if (unmatched.length) console.log('source classes with no local id: ' + unmatched.join(', '));
  const localIds = new Set(classes.map(c => c.id));
  const skipped = [];
  for (const arr of Object.values(classData)) for (const c of arr) if (!localIds.has(c.id)) skipped.push(c.id);
  console.log('  generated ' + classes.length + ' classes; hand-maintained: ' + skipped.join(', '));
  for (const id of skipped) {
    if (!KEEP_LOCAL.includes(id)) throw new Error('class ' + id + ' has no source data and no hand-maintained entry');
  }

  const curves = dedupeCurves(classes);
  console.log('  ' + curves.length + ' distinct FD curves');

  // Erel Light: placeholder board, so progress still renders for the class.
  const erel = [
    '  // Erel Light runs on Erda Link, not the HEXA Matrix — placeholder board until',
    '  // a GMS HEXA table exists for it.',
    '  {id:"erellight",gms:null,icon:null,slots:{"skillNodes":6,"mastery":4,"boost":4,"common":4},skills:[',
    ...['mastery1', 'mastery2', 'mastery3', 'mastery4'].map((k, i) =>
      '    {key:"' + k + '",type:"mastery",tier:"mastery",slot:' + i + ',name:"TBD",fd:0,c:-1,icon:null},'),
    '    {key:"origin",type:"origin",tier:"skillNodes",slot:0,name:"TBD",fd:0,c:-1,icon:null},',
    '    {key:"ascent",type:"ascent",tier:"skillNodes",slot:1,name:"TBD",fd:0,c:-1,icon:null},',
    ...['enhance1', 'enhance2', 'enhance3', 'enhance4'].map((k, i) =>
      '    {key:"' + k + '",type:"enhance",tier:"boost",slot:' + i + ',name:"TBD",fd:0,c:-1,icon:null},'),
    '    {key:"common1",type:"common",tier:"common",slot:0,name:"Sol Janus",fd:0,c:-1,icon:"General_1"},',
    '    {key:"common2",type:"common",tier:"common",slot:1,name:"Sol Hekate",fd:0,c:-1,icon:"General_2"},',
    '  ]},',
  ];

  fs.writeFileSync(OUT_DATA, emit({ classes, curves, cost, localEntries: erel }));
  console.log('wrote ' + path.relative(REPO, OUT_DATA) + ' (' + Math.round(fs.statSync(OUT_DATA).size / 1024) + ' KB)');

  if (process.argv.includes('--icons')) await downloadIcons(classes);
})().catch(e => { console.error(e); process.exit(1); });
