// functions/maplehub.js
// Cloudflare Pages Functions - MapleHub Character API Proxy
// エンドポイント: /maplehub?name=characterName&region=na|eu
//
// MapleHub (maplehub.app) は全ランカーの日次スナップショット(約90日分)を
// 自前DBに保持しており、/api/character/ で経験値・レベルの推移を返す。
// ただし `X-MapleHub-Request: true` ヘッダーが無いと 403 になり、ブラウザから
// 直接叩くと CORS で弾かれるため、ここでサーバー側から中継する。
export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const name = searchParams.get('name');
  const region = (searchParams.get('region') || 'na').toLowerCase();

  if (!name) {
    return json({ error: "Character name is required" }, 400);
  }
  if (region !== 'na' && region !== 'eu') {
    return json({ error: "region must be 'na' or 'eu'" }, 400);
  }

  const headers = {
    'X-MapleHub-Request': 'true',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  };

  const primary = `https://maplehub.app/api/character/?characterName=${encodeURIComponent(name)}&region=${region}`;
  const fallback = `https://maplehub.app/api/character-fallback/?characterName=${encodeURIComponent(name)}&region=${region}&_t=${Date.now()}`;

  try {
    let res = await fetch(primary, { headers });
    if (!res.ok) {
      // 本命が失敗したら fallback エンドポイントを試す
      const res2 = await fetch(fallback, { headers });
      if (!res2.ok) {
        return json({ error: `MapleHub API returned ${res.status}` }, res.status);
      }
      res = res2;
    }
    const data = await res.json();
    return json(data, 200, true);
  } catch (error) {
    return json({ error: error.message }, 500);
  }
}

function json(body, status, cache) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
  if (cache) headers['Cache-Control'] = 'public, max-age=1800'; // 30分(日次更新なので長め)
  return new Response(JSON.stringify(body), { status, headers });
}
