// functions/mapleranks.js
// Cloudflare Pages Function - MapleRanks data proxy + decoder
// Endpoint: /mapleranks?name=characterName[&region=na|eu]
//
// Fetches https://mapleranks.com/u/h/{name} (or /u/h/eu/{name}) and
// decodes the XOR-encrypted base64 payload using the same algorithm
// MapleRanks uses client-side. Returns the decoded JSON as-is.

function generateKey(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash << 5) - hash + name.charCodeAt(i);
        hash &= hash;
    }
    const seed = Math.abs(hash);
    const key = new Uint8Array(16);
    let r = seed;
    for (let i = 0; i < 16; i++) {
        r = (1664525 * r + 1013904223) % 4294967296;
        key[i] = 255 & r;
    }
    return key;
}

function decodePayload(base64, key) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const saltLen = bytes[0];
    const payload = bytes.slice(1 + saltLen);
    const out = new Uint8Array(payload.length);
    for (let i = 0; i < payload.length; i++) {
        out[i] = payload[i] ^ key[i % key.length];
    }
    return JSON.parse(new TextDecoder().decode(out));
}

const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
};

export async function onRequest(context) {
    const { searchParams } = new URL(context.request.url);
    const name = (searchParams.get('name') || '').trim();
    const region = (searchParams.get('region') || 'na').toLowerCase();

    if (!name) {
        return new Response(JSON.stringify({ error: 'name parameter is required' }), { status: 400, headers: CORS });
    }

    const path = region === 'eu' ? `/u/h/eu/${encodeURIComponent(name)}` : `/u/h/${encodeURIComponent(name)}`;
    const upstream = `https://mapleranks.com${path}`;

    try {
        const resp = await fetch(upstream, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Referer': 'https://mapleranks.com/',
                'Accept': 'text/plain,*/*'
            },
            cf: { cacheTtl: 300, cacheEverything: true }
        });

        if (!resp.ok) {
            return new Response(JSON.stringify({ error: `Upstream ${resp.status}` }), { status: resp.status, headers: CORS });
        }

        const encoded = (await resp.text()).trim();
        if (!encoded) {
            return new Response(JSON.stringify({ error: 'Empty upstream response' }), { status: 502, headers: CORS });
        }

        const key = generateKey(name.toLowerCase());
        const data = decodePayload(encoded, key);

        return new Response(JSON.stringify(data), {
            headers: { ...CORS, 'Cache-Control': 'public, max-age=300' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: CORS });
    }
}
