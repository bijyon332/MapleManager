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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/maplehub') return handleMaplehub(url);
    if (url.pathname === '/api')      return handleApi(url);
    return env.ASSETS.fetch(request);
  }
};
