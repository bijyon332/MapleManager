// 全アプリ・全タブの画面を仮のキャラで撮る（UI を直す前と後を同じ条件で比べる用。docs/ui-guide.md）。
//   node tools/shoot-all.js <出力先> [ファイル名の正規表現]
// 事前に public/ を 127.0.0.1:8787 で配信しておく（cd public && python3 -m http.server 8787 --bind 127.0.0.1）。
// Playwright はグローバルに入っているものを使う。CDN（Tailwind・daisyUI・lucide）は curl で取って差し替え、
// /api・/kinoko などの Worker の中継は 403 にする（本番のデータには触らない）。
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const { execFileSync } = require('child_process'); const fs = require('fs');
const OUT = process.argv[2]; const cache = {};
function curl(url) { if (cache[url]) return cache[url]; const tmp = OUT + '/.body';
  const hdr = execFileSync('curl', ['-sSL', '-D', '-', '-o', tmp, url], { maxBuffer: 1e8 }).toString();
  const blocks = hdr.trim().split(/\r?\n\r?\n/); const last = blocks[blocks.length - 1];
  return cache[url] = { status: parseInt(last.split(' ')[1]), contentType: (last.match(/content-type: *([^\r\n]+)/i) || [])[1] || 'application/octet-stream', body: fs.readFileSync(tmp) }; }
const B = ['b_kalos_normal','b_kaling_normal','b_seren_hard','b_fa_normal','b_limbo_normal','b_vhilla_hard','b_darknell_hard','b_will_hard','b_lucid_easy'];
const ch = (id, name, job, lv, server, cls, role, n) => ({ id, name, job, level: lv, server, classImage: `assets/${cls}/CharacterIcon.png`, image: '', role, hidden: false, settings: { boss_ids: B.slice(B.length - n), boss_party_sizes: {} }, progress: {} });
const planner = { config: { activeServer: 'KRONOS' }, memo: '', resetCheckedAt: Date.now(), characters: [
  ch('c1', 'BijyonHero', 'Hero', 268, 'KRONOS', 'EXPLORER_Hero', 'SUB', 5),
  ch('c2', 'BijyonMain', 'Bishop', 287, 'KRONOS', 'EXPLORER_Bishop', 'MAIN', 9),
  ch('c3', 'ChalMain', 'Night Lord', 282, 'CHALLENGER', 'EXPLORER_NightLord', 'MAIN', 9),
  ch('c4', 'BijyonDB', 'Dual Blade', 261, 'KRONOS', 'EXPLORER_DualBlade', 'SUB', 3),
  ch('c5', 'BijyonCorsair', 'Corsair', 276, 'KRONOS', 'EXPLORER_Corsair', 'SUB', 7),
  ch('c6', 'BijyonBM', 'Bowmaster', 245, 'KRONOS', 'EXPLORER_BowMaster', 'SUB', 2),
] };
// [ファイル名, アプリ, 開いたあとに実行する式]
const SHOTS = [
  ['01-updates', 'updates', ''],
  ['02-guide', 'guide', ''],
  ['03-quanah-gear', 'quanah', ''],
  ['03-quanah-pieces', 'quanah', "libaeGear.setTab('pieces')"],
  ['03-quanah-jewel', 'quanah', "libaeGear.setTab('jewel')"],
  ['03-quanah-battlesim', 'quanah', "libaeGear.setTab('battlesim')"],
  ['03-quanah-hexa', 'quanah', "libaeGear.setTab('hexa')"],
  ['03-quanah-reference', 'quanah', "libaeGear.setTab('reference')"],
  ['04-ultima', 'ultima', ''],
  ['05-planner-dashboard', 'planner', ''],
  ['05-planner-characters', 'planner', "app.navigate('characters')"],
  ['05-planner-system', 'planner', "app.navigate('system')"],
  ['05-planner-edit', 'planner', "app.navigate('dashboard'); app.openCharModal && app.openCharModal('c2')"],
  ['06-hexa-ranking', 'hexa', "hexaTracker.setPage('ranking')"],
  ['06-hexa-tracker', 'hexa', "hexaTracker.setPage('tracker')"],
  ['07-gear', 'gear', ''],
  ['08-scouter-input', 'scouter', "scouter.setTab('input')"],
  ['08-scouter-result', 'scouter', "scouter.setTab('result')"],
  ['08-scouter-quick', 'scouter', "scouter.setTab('quick')"],
  ['08-scouter-hyper', 'scouter', "scouter.setTab('hyper')"],
  ['08-scouter-hstat', 'scouter', "scouter.setTab('hstat')"],
  ['09-ptscouter', 'ptscouter', ''],
  ['10-exp-sim', 'exp', "expPlan.setTab('sim')"],
  ['10-exp-plan', 'exp', "expPlan.setTab('plan')"],
  ['10-exp-buffs', 'exp', "expPlan.setTab('buffs')"],
  ['11-symbol-progress', 'symbol', "symbolPlanner.setTab('progress')"],
  ['11-symbol-timeline', 'symbol', "symbolPlanner.setTab('timeline')"],
  ['11-symbol-events', 'symbol', "symbolPlanner.setTab('events')"],
  ['12-cheatsheet', 'cheatsheet', ''],
  ['13-kmsvideos', 'kmsvideos', ''],
  ['14-ranks-board', 'ranks', ''],
  ['14-ranks-trend', 'ranks', "document.querySelector('.ranks-tab-btn[data-tab=trend]').click()"],
  ['15-scheduler-members', 'scheduler', "app.schedulerTab('members')"],
  ['15-scheduler-builder', 'scheduler', "app.schedulerTab('builder')"],
  ['15-scheduler-dashboard', 'scheduler', "app.schedulerTab('dashboard')"],
  ['16-community-roster', 'community', "community.setTab('roster')"],
  ['16-community-list', 'community', "community.setTab('list')"],
  ['16-community-guild', 'community', "community.setTab('guild')"],
  ['16-community-todo', 'community', "community.setTab('todo')"],
];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 });
  await ctx.route('**/*', async route => { const req = route.request(); const u = new URL(req.url());
    if (u.hostname === '127.0.0.1') { if (/^\/(api|maplehub|scouter|kinoko)(\/|$)/.test(u.pathname)) return route.fulfill({ status: 403, body: '' }); return route.continue(); }
    if (/fonts\.(googleapis|gstatic)|nexon/.test(u.hostname)) return route.fulfill({ status: 200, body: '' });
    if (req.method() !== 'GET') return route.abort();
    try { route.fulfill(curl(req.url())); } catch (e) { console.log('fail', req.url()); route.abort(); } });
  await ctx.addInitScript((planner) => { if (!localStorage.getItem('gms_v24_data')) localStorage.setItem('gms_v24_data', JSON.stringify(planner)); }, planner);
  const page = await ctx.newPage(); page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('http://127.0.0.1:8787/'); await page.waitForTimeout(4000);
  const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
  for (const [file, appName, js] of SHOTS) {
    if (only && !only.test(file)) continue;
    try {
      await page.evaluate(a => app.switchApp(a), appName); await page.waitForTimeout(1500);
      if (js) { await page.evaluate(js); await page.waitForTimeout(1000); }
      await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main, [id^=view-], .overflow-auto, .overflow-y-auto').forEach(e => e.scrollTop = 0); });
      await page.screenshot({ path: `${OUT}/${file}.png` });
      if (file === '05-planner-edit') await page.evaluate(() => app.closeCharModal());
      console.log('ok', file);
    } catch (e) { console.log('NG', file, e.message.split('\n')[0]); }
  }
  await browser.close(); })();
