// worker.js
// Cloudflare Worker entry for the MapleManager static-assets deployment.
//
// This project is deployed as a Worker with static assets (see wrangler.jsonc:
// assets.directory = "."). Cloudflare *Pages*-style functions/ routing is NOT
// active in this mode, so server-side API routes must be handled here in the
// Worker. Any request that isn't an API route falls through to the static
// assets binding (env.ASSETS), which serves index.html / *.js / images as before.
//
// Routes:
//   /maplehub?name=&region=  -> 日次EXPの推移（MapleBot、予備で MapleHub）。先方が
//                               他オリジンを弾くので公開CORSプロキシは使えない
//   /api?name=               -> Nexon GMS ranking API (current level / exp snapshot)
//   /scouter                 -> MapleScouter の換算計算（POST {userStat}）。
//                               先方は他オリジンからの呼び出しを許していないので中継する
//                               （2026-10 から先方の Bot 対策で弾かれるので今は使っていない）
//   /kinoko                  -> kinokohub（きのこツール）のメインステ換算（POST {basicStats, buffStats}）。
//                               Scouter の今の計算元。先方は他オリジンを許していないので中継する
//   /api/scheduler           -> Boss Scheduler の共有データ (D1)
//                               GET  現在のスナップショットとバージョン
//                               PUT  {version, data, updatedBy} で保存（楽観ロック）
//   /api/hit                 -> アプリを開いた回数を数える（POST {app, vid}、D1）
//   /api/usage?days=         -> その集計（GET、?admin=1 の Usage 画面が読む）

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function json(body, status, cacheSeconds) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (cacheSeconds) headers['Cache-Control'] = `public, max-age=${cacheSeconds}`;
  return new Response(JSON.stringify(body), { status, headers });
}

// 日次EXPの推移。MapleBot（maplebot.io）が約90日分の日次スナップショットを持っていて、
// 2026-10 以降の MapleHub と同じ形式 { success, data: { character, expHistory, levelHistory } }
// を返す。MapleBot は自サイト以外からの呼び出しを Origin/Referer で弾くので、ここで
// Referer を付けて中継する。MapleHub は 2026-10-07 から Cloudflare の Bot 対策で
// サーバーから取れなくなったが、外れたときのために予備として残す。
async function handleMaplehub(url) {
  const name = url.searchParams.get('name');
  const region = (url.searchParams.get('region') || 'na').toLowerCase();
  if (!name) return json({ error: 'Character name is required' }, 400);
  if (region !== 'na' && region !== 'eu') return json({ error: "region must be 'na' or 'eu'" }, 400);

  const q = encodeURIComponent(name);
  const sources = [
    { url: `https://maplebot.io/api/character/${q}?region=${region}`,
      headers: { 'Referer': 'https://maplebot.io/', 'User-Agent': UA, 'Accept': 'application/json' } },
    { url: `https://maplehub.app/api/character/?characterName=${q}&region=${region}`,
      headers: { 'X-MapleHub-Request': 'true', 'User-Agent': UA, 'Accept': 'application/json' } },
    { url: `https://maplehub.app/api/character-fallback/?characterName=${q}&region=${region}&_t=${Date.now()}`,
      headers: { 'X-MapleHub-Request': 'true', 'User-Agent': UA, 'Accept': 'application/json' } },
  ];

  let firstError = null;
  for (const src of sources) {
    try {
      const res = await fetch(src.url, { headers: src.headers });
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (data && data.success !== false) return json(data, 200, 1800); // 30分キャッシュ(日次更新)
      if (!firstError) firstError = { status: res.ok ? 502 : res.status, message: (data && data.error) || `EXP history API returned ${res.status}` };
    } catch (e) {
      if (!firstError) firstError = { status: 502, message: e.message };
    }
  }
  return json({ error: firstError.message }, firstError.status);
}

// Nexon GMS ranking (NA/EU) - current level / within-level exp snapshot.
async function handleApi(url) {
  const name = url.searchParams.get('name');
  if (!name) return json({ error: 'Character name is required' }, 400);
  const region = url.searchParams.get('region') === 'eu' ? 'eu' : 'na';
  const target = `https://www.nexon.com/api/maplestory/no-auth/ranking/v2/${region}?type=overall&id=legendary&reboot_index=0&page_index=1&character_name=${encodeURIComponent(name)}`;
  try {
    const res = await fetch(target, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!res.ok) return json({ error: `Nexon API returned ${res.status}` }, res.status);
    return json(await res.json(), 200, 300); // 5分キャッシュ
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// MapleScouter（maplescouter.com）の換算計算。計算は先方のサーバーで行われ、
// 本文の {userStat} に戦闘力・換算主ステ（防御率300%/380%）などが返る。
// api-key はサイトのフロントに埋め込まれている公開キー。
// 中継するのは計算API 1本だけにして、ほかの先方APIの踏み台にはしない。
const SCOUTER_URL = 'https://api.maplescouter.com/api/calc/dmg';
const SCOUTER_KEY = '01ce8bc7-43a0-4122-ae05-e23f07640b9c';

async function handleScouter(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const text = await request.text();
  if (text.length > 64_000) return json({ error: 'データが大きすぎます' }, 413);
  let body;
  try { body = JSON.parse(text); }
  catch (e) { return json({ error: 'JSONとして読めません' }, 400); }
  if (!body || typeof body.userStat !== 'object' || !body.userStat) return json({ error: 'userStat がありません' }, 400);

  try {
    const res = await fetch(SCOUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': SCOUTER_KEY,
        'Origin': 'https://maplescouter.com',
        'Referer': 'https://maplescouter.com/',
        'User-Agent': UA
      },
      body: JSON.stringify({ userStat: body.userStat })
    });
    const out = await res.json().catch(() => null);
    if (!res.ok || !out) {
      return json({ error: (out && out.message) || `MapleScouter API returned ${res.status}` }, res.status === 430 ? 429 : 502);
    }
    return json(out, 200);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

// kinokohub（kinokohub.net、JMS 向けのきのこツール）のメインステ換算。MapleScouter 互換の計算を
// 先方のサーバーで行い、{ success, payload: { stats, power, specEfficiency, ... } } が返る。
// GMS への寄せ（Heroic など）は public/scouter_kinoko.js 側で行う。
// 中継するのは計算の action 1つだけにして、ほかの先方APIの踏み台にはしない。
const KINOKO_URL = 'https://kinokohub.net/api/mainStatsConverter';

async function handleKinoko(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const text = await request.text();
  if (text.length > 64_000) return json({ error: 'データが大きすぎます' }, 413);
  let body;
  try { body = JSON.parse(text); }
  catch (e) { return json({ error: 'JSONとして読めません' }, 400); }
  if (!body || typeof body.basicStats !== 'object' || typeof body.buffStats !== 'object') return json({ error: 'basicStats / buffStats がありません' }, 400);

  try {
    const res = await fetch(KINOKO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://kinokohub.net',
        'Referer': 'https://kinokohub.net/tools/main-stats-converter',
        'User-Agent': UA
      },
      body: JSON.stringify({ action: 'calculate', payload: { basicStats: body.basicStats, buffStats: body.buffStats } })
    });
    const out = await res.json().catch(() => null);
    if (!out) return json({ error: `kinokohub returned ${res.status}` }, 502);
    // 入力エラーなどは先方の { success: false, error: { message } } をそのまま返す。
    return json(out, out.success ? 200 : (res.status >= 400 && res.status < 500 ? res.status : 502));
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

// ---------------------------------------------------------
//  共有データ (D1)
// ---------------------------------------------------------
// 共有するものは2つある。どちらも「スナップショット1行 + version」で持つ。
//
//   /api/community … コミュニティ名簿（Discord名とキャラの対応）
//                    Community / Boss Scheduler / GMS Planner /
//                    EXP Leaderboard がここを軸に繋がる。
//   /api/scheduler … 週ボスの希望とPT編成
//
// 分割したテーブルにせずスナップショットにしているのは、全体で数十KBしかなく、
// 書き込むのが数人で、「全員が同じものを見られる」ことが目的だから。
// 詳細は schema.sql を参照。
//
// 書き込みは SCHEDULER_EDIT_KEY を設定している場合のみ鍵を要求する。
//   npx wrangler secret put SCHEDULER_EDIT_KEY
// 設定しなければ誰でも保存できる（身内だけにURLを配る前提）。名簿と編成で
// 鍵は共通。片方だけ書ける状態にしても意味がないため。
const STATE_ROW_ID = 'current';

// テーブル名はここに書いたものしか使わない（外から来た文字列は混ぜない）。
const SHARED_STATES = {
  scheduler: { table: 'scheduler_state', history: 'scheduler_history' },
  community: { table: 'community_state', history: 'community_history' }
};

async function handleStateGet(env, kind) {
  if (!env.DB) return json({ error: 'D1 (DB) がバインドされていません' }, 501);
  const t = SHARED_STATES[kind];
  const row = await env.DB
    .prepare(`SELECT version, data, updated_at, updated_by FROM ${t.table} WHERE id = ?`)
    .bind(STATE_ROW_ID)
    .first();
  if (!row) return json({ version: 0, data: null, updatedAt: null, updatedBy: null }, 200);
  return json({
    version: row.version,
    data: JSON.parse(row.data),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by
  }, 200);
}

async function handleStatePut(request, env, kind) {
  if (!env.DB) return json({ error: 'D1 (DB) がバインドされていません' }, 501);
  const t = SHARED_STATES[kind];

  if (env.SCHEDULER_EDIT_KEY) {
    const key = request.headers.get('X-Edit-Key') || '';
    if (key !== env.SCHEDULER_EDIT_KEY) {
      return json({ error: '編集キーが違います' }, 401);
    }
  }

  let body;
  try { body = await request.json(); }
  catch (e) { return json({ error: 'JSONとして読めません' }, 400); }

  const base = Number(body.version);
  if (!Number.isInteger(base) || base < 0) return json({ error: 'version が不正です' }, 400);
  if (!body.data || typeof body.data !== 'object') return json({ error: 'data がありません' }, 400);

  const payload = JSON.stringify(body.data);
  if (payload.length > 4_000_000) return json({ error: 'データが大きすぎます' }, 413);

  const updatedAt = new Date().toISOString();
  const updatedBy = typeof body.updatedBy === 'string' ? body.updatedBy.slice(0, 60) : null;

  // 行がまだ無ければ、最初の保存のときに作る。スキーマ適用で初期行を入れ忘れても
  // 動くようにしておく（UPDATE しかしないと、行が無い限り永久に409になる）。
  // INSERT OR IGNORE なので、同時に来ても行は1つしかできない。
  if (base === 0) {
    await env.DB
      .prepare(`INSERT OR IGNORE INTO ${t.table} (id, version, data, updated_at, updated_by)
                VALUES (?, 0, ?, ?, ?)`)
      .bind(STATE_ROW_ID, '{}', updatedAt, null)
      .run();
  }

  // 楽観ロック: 読んだときの version と一致する行だけ更新する。
  // 一致しなければ、その間に誰かが保存している。
  const res = await env.DB
    .prepare(`UPDATE ${t.table}
                 SET version = version + 1, data = ?, updated_at = ?, updated_by = ?
               WHERE id = ? AND version = ?`)
    .bind(payload, updatedAt, updatedBy, STATE_ROW_ID, base)
    .run();

  if (!res.meta.changes) {
    const current = await env.DB
      .prepare(`SELECT version, data, updated_at, updated_by FROM ${t.table} WHERE id = ?`)
      .bind(STATE_ROW_ID)
      .first();
    return json({
      error: 'conflict',
      message: '別の人が先に保存しています。読み込み直してください。',
      version: current ? current.version : 0,
      data: current ? JSON.parse(current.data) : null,
      updatedAt: current ? current.updated_at : null,
      updatedBy: current ? current.updated_by : null
    }, 409);
  }

  const version = base + 1;
  // 履歴。失敗しても保存自体は成功しているので握りつぶす。
  try {
    await env.DB
      .prepare(`INSERT OR REPLACE INTO ${t.history} (version, data, updated_at, updated_by) VALUES (?, ?, ?, ?)`)
      .bind(version, payload, updatedAt, updatedBy)
      .run();
  } catch (e) { /* 履歴は落ちても本体には影響させない */ }

  return json({ version, updatedAt, updatedBy }, 200);
}

async function handleState(request, env, kind) {
  if (request.method === 'GET')     return handleStateGet(env, kind);
  if (request.method === 'PUT')     return handleStatePut(request, env, kind);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Edit-Key'
      }
    });
  }
  return json({ error: 'Method not allowed' }, 405);
}

// ---------------------------------------------------------
//  利用状況（アプリを開いた回数と利用ブラウザ数）
// ---------------------------------------------------------
// 画面がアプリを開くたびに /api/hit へ {app, vid} を送ってくる。vid はブラウザごとの
// ランダムな文字列（localStorage）で、個人とは結び付かない。そのままは残さず、
// ハッシュにしてから「その日・そのアプリを使ったブラウザ」として1行ずつ持つ。
// IP・キャラ名・Discord名などは一切受け取らない。
//
//   usage_daily    … 日 × アプリ ごとの開いた回数
//   usage_visitors … 日 × アプリ × ブラウザ（ハッシュ）。app = '*' はサイト全体
//
// 日付は JST。テーブルは最初の記録のときに作るので、schema.sql を流し直さなくても動く。
// プレビュー（<版>-maplemanager.*.workers.dev）とローカルは本番と同じ D1 を
// 汚さないよう数えない（USAGE_ALL_HOSTS を付けた wrangler dev だけ例外）。
const USAGE_DDL = [
  `CREATE TABLE IF NOT EXISTS usage_daily (
     day TEXT NOT NULL, app TEXT NOT NULL, opens INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (day, app))`,
  `CREATE TABLE IF NOT EXISTS usage_visitors (
     day TEXT NOT NULL, app TEXT NOT NULL, vid TEXT NOT NULL,
     PRIMARY KEY (day, app, vid))`
];
let usageReady = null;
function ensureUsageTables(env) {
  if (!usageReady) {
    usageReady = env.DB.batch(USAGE_DDL.map(q => env.DB.prepare(q)));
    usageReady.catch(() => { usageReady = null; });
  }
  return usageReady;
}

function jstDay(ms) {
  return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
}

function countsHost(hostname, env) {
  if (env.USAGE_ALL_HOSTS) return true;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
  return !(hostname.endsWith('.workers.dev') && !hostname.startsWith('maplemanager.'));
}

async function hashVid(vid) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bijyontools-usage:' + vid));
  return [...new Uint8Array(buf).slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleHit(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.DB || !countsHost(url.hostname, env)) return new Response(null, { status: 204 });

  // sendBeacon は text/plain で来るので Content-Type は見ずに読む。
  let body;
  try { body = JSON.parse(await request.text()); } catch (e) { return json({ error: 'JSONとして読めません' }, 400); }
  const app = String(body && body.app || '');
  const vid = String(body && body.vid || '');
  if (!/^[a-z0-9_-]{1,32}$/.test(app)) return json({ error: 'app が不正です' }, 400);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(vid)) return json({ error: 'vid が不正です' }, 400);

  await ensureUsageTables(env);
  const day = jstDay(Date.now());
  const h = await hashVid(vid);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO usage_daily (day, app, opens) VALUES (?, ?, 1)
                    ON CONFLICT (day, app) DO UPDATE SET opens = opens + 1`).bind(day, app),
    env.DB.prepare(`INSERT OR IGNORE INTO usage_visitors (day, app, vid) VALUES (?, ?, ?)`).bind(day, app, h),
    env.DB.prepare(`INSERT OR IGNORE INTO usage_visitors (day, app, vid) VALUES (?, '*', ?)`).bind(day, h)
  ]);
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
}

// 直近 days 日（今日を含む）の集計。中身は回数とブラウザ数だけなので鍵は要求しない。
//   daily   … [{day, app, opens, browsers}]（app = '*' の行はサイト全体のブラウザ数）
//   period  … [{app, browsers}] 期間を通した重複なしのブラウザ数
async function handleUsage(env, url) {
  if (!env.DB) return json({ error: 'D1 (DB) がバインドされていません' }, 501);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days'), 10) || 30, 1), 366);
  await ensureUsageTables(env);
  const from = jstDay(Date.now() - (days - 1) * 86400e3);
  const [opens, browsers, period] = await env.DB.batch([
    env.DB.prepare(`SELECT day, app, opens FROM usage_daily WHERE day >= ?`).bind(from),
    env.DB.prepare(`SELECT day, app, COUNT(*) AS n FROM usage_visitors WHERE day >= ? GROUP BY day, app`).bind(from),
    env.DB.prepare(`SELECT app, COUNT(DISTINCT vid) AS n FROM usage_visitors WHERE day >= ? GROUP BY app`).bind(from)
  ]);
  const rows = new Map();
  const row = (day, app) => {
    const k = day + '|' + app;
    if (!rows.has(k)) rows.set(k, { day, app, opens: 0, browsers: 0 });
    return rows.get(k);
  };
  opens.results.forEach(r => { row(r.day, r.app).opens = r.opens; });
  browsers.results.forEach(r => { row(r.day, r.app).browsers = r.n; });
  return json({
    from, to: jstDay(Date.now()), days,
    daily: [...rows.values()],
    period: period.results.map(r => ({ app: r.app, browsers: r.n }))
  }, 200);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/maplehub')      return handleMaplehub(url);
    if (url.pathname === '/scouter')       return handleScouter(request);
    if (url.pathname === '/kinoko')        return handleKinoko(request);
    if (url.pathname === '/api/scheduler') return handleState(request, env, 'scheduler');
    if (url.pathname === '/api/community') return handleState(request, env, 'community');
    if (url.pathname === '/api/hit')       return handleHit(request, env, url);
    if (url.pathname === '/api/usage')     return handleUsage(env, url);
    if (url.pathname === '/api')           return handleApi(url);
    return env.ASSETS.fetch(request);
  }
};
