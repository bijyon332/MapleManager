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
//   /maplehub?name=&region=  -> MapleHub character API (needs a custom header,
//                               so it cannot go through public CORS proxies)
//   /api?name=               -> Nexon GMS ranking API (current level / exp snapshot)
//   /api/scheduler           -> Boss Scheduler の共有データ (D1)
//                               GET  現在のスナップショットとバージョン
//                               PUT  {version, data, updatedBy} で保存（楽観ロック）

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function json(body, status, cacheSeconds) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (cacheSeconds) headers['Cache-Control'] = `public, max-age=${cacheSeconds}`;
  return new Response(JSON.stringify(body), { status, headers });
}

// MapleHub keeps ~90 days of daily snapshots for every ranked character. The
// endpoint returns 403 unless the X-MapleHub-Request header is present, which is
// why this must be proxied server-side rather than fetched from the browser.
async function handleMaplehub(url) {
  const name = url.searchParams.get('name');
  const region = (url.searchParams.get('region') || 'na').toLowerCase();
  if (!name) return json({ error: 'Character name is required' }, 400);
  if (region !== 'na' && region !== 'eu') return json({ error: "region must be 'na' or 'eu'" }, 400);

  const headers = { 'X-MapleHub-Request': 'true', 'User-Agent': UA, 'Accept': 'application/json' };
  const primary  = `https://maplehub.app/api/character/?characterName=${encodeURIComponent(name)}&region=${region}`;
  const fallback = `https://maplehub.app/api/character-fallback/?characterName=${encodeURIComponent(name)}&region=${region}&_t=${Date.now()}`;

  try {
    let res = await fetch(primary, { headers });
    if (!res.ok) {
      const res2 = await fetch(fallback, { headers });
      if (!res2.ok) return json({ error: `MapleHub API returned ${res.status}` }, res.status);
      res = res2;
    }
    return json(await res.json(), 200, 1800); // 30分キャッシュ(日次更新)
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// Nexon GMS ranking (NA) - current level / within-level exp snapshot.
async function handleApi(url) {
  const name = url.searchParams.get('name');
  if (!name) return json({ error: 'Character name is required' }, 400);
  const target = `https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na?type=overall&id=legendary&reboot_index=0&page_index=1&character_name=${encodeURIComponent(name)}`;
  try {
    const res = await fetch(target, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!res.ok) return json({ error: `Nexon API returned ${res.status}` }, res.status);
    return json(await res.json(), 200, 300); // 5分キャッシュ
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ---------------------------------------------------------
//  Boss Scheduler の共有データ (D1)
// ---------------------------------------------------------
// データは scheduler_state の1行に JSON で入っている。分割したテーブルにせず
// スナップショットにしているのは、全体で数十KBしかなく、書き込むのが数人で、
// 「全員が同じ編成を見られる」ことが目的だから。詳細は schema.sql を参照。
//
// 書き込みは SCHEDULER_EDIT_KEY を設定している場合のみ鍵を要求する。
//   npx wrangler secret put SCHEDULER_EDIT_KEY
// 設定しなければ誰でも保存できる（身内だけにURLを配る前提）。
const SCHEDULER_ID = 'current';

async function handleSchedulerGet(env) {
  if (!env.DB) return json({ error: 'D1 (DB) がバインドされていません' }, 501);
  const row = await env.DB
    .prepare('SELECT version, data, updated_at, updated_by FROM scheduler_state WHERE id = ?')
    .bind(SCHEDULER_ID)
    .first();
  if (!row) return json({ version: 0, data: null, updatedAt: null, updatedBy: null }, 200);
  return json({
    version: row.version,
    data: JSON.parse(row.data),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by
  }, 200);
}

async function handleSchedulerPut(request, env) {
  if (!env.DB) return json({ error: 'D1 (DB) がバインドされていません' }, 501);

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

  // 楽観ロック: 読んだときの version と一致する行だけ更新する。
  // 一致しなければ、その間に誰かが保存している。
  const res = await env.DB
    .prepare(`UPDATE scheduler_state
                 SET version = version + 1, data = ?, updated_at = ?, updated_by = ?
               WHERE id = ? AND version = ?`)
    .bind(payload, updatedAt, updatedBy, SCHEDULER_ID, base)
    .run();

  if (!res.meta.changes) {
    const current = await env.DB
      .prepare('SELECT version, data, updated_at, updated_by FROM scheduler_state WHERE id = ?')
      .bind(SCHEDULER_ID)
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
      .prepare('INSERT OR REPLACE INTO scheduler_history (version, data, updated_at, updated_by) VALUES (?, ?, ?, ?)')
      .bind(version, payload, updatedAt, updatedBy)
      .run();
  } catch (e) { /* 履歴は落ちても本体には影響させない */ }

  return json({ version, updatedAt, updatedBy }, 200);
}

async function handleScheduler(request, env) {
  if (request.method === 'GET')     return handleSchedulerGet(env);
  if (request.method === 'PUT')     return handleSchedulerPut(request, env);
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/maplehub')      return handleMaplehub(url);
    if (url.pathname === '/api/scheduler') return handleScheduler(request, env);
    if (url.pathname === '/api')           return handleApi(url);
    return env.ASSETS.fetch(request);
  }
};
