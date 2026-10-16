// HEXA Reader — reads node levels out of a screenshot (or a shared screen) of the
// GMS HEXA Matrix window, HEXA Skill tab.
//
// The board is always drawn the same way, so nodes are found by position, not by
// icon: Tesseract only finds the "HEXA Matrix" title, and every node sits at a
// fixed offset from it. Each unlocked node carries its level in a small dark pill
// above the icon, in a 4x5-pixel digit font that OCR cannot read reliably, so the
// pill is cut out and its digits are matched against hand-drawn templates.
// Locked nodes have no pill and read as 0.
//
// readBoard() works on plain pixels so it can be tried outside a page.
(function (root) {
    'use strict';

    // Same release as gear_reader.js / scouter_reader.js, so the page loads it once.
    const TESS_VER = '7.0.0';
    const TESS_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESS_VER}/dist/tesseract.min.js`;

    /* ---------- board layout ---------- */
    // Centre of each node's icon, measured from the left edge / top of the word
    // "HEXA" in the window title, at 100% (title "HEXA Matrix" is 129px wide).
    // Index = the node's slot in hexa_data.js. Each colour group runs outward from
    // the emblem in the middle: nearest node first, then its neighbour, then the
    // far one in that row, then the tip.
    const TITLE_W = 129;
    const LAYOUT = {
        skillNodes: [[197, 248], [128, 248], [162, 188], [93, 188], [128, 128], [59, 128]],
        mastery:    [[292, 248], [327, 188], [396, 188], [430, 128]],
        boost:      [[197, 388], [162, 448], [93, 448], [59, 507]],
        common:     [[292, 388], [327, 448], [396, 448], [430, 507]],
    };
    const PILL_DY = -23;   // pill centre, above the icon centre

    /* ---------- digit font ---------- */
    // 4 columns x 5 rows. 0, 2, 3, 7 and 9 were copied from a real screenshot;
    // the rest are drawn in the same style. "1" is told apart by its width.
    const FONT = {
        0: ['.##.', '#..#', '#..#', '#..#', '.##.'],
        2: ['###.', '...#', '.##.', '#...', '####'],
        3: ['###.', '...#', '.##.', '...#', '###.'],
        4: ['#..#', '#..#', '####', '...#', '...#'],
        5: ['####', '#...', '###.', '...#', '###.'],
        6: ['.##.', '#...', '###.', '#..#', '.##.'],
        7: ['####', '...#', '..#.', '..#.', '..#.'],
        8: ['.##.', '#..#', '.##.', '#..#', '.##.'],
        9: ['.##.', '#..#', '.###', '...#', '.##.'],
    };
    const FW = 4, FH = 5;
    const TEMPLATES = Object.entries(FONT).map(([d, rows]) => ({
        d: Number(d),
        px: rows.join('').split('').map((c) => (c === '#' ? 1 : 0)),
    }));

    /* ---------- pixels ---------- */
    // Darkest channel: the pill is dark navy, digits near white, and the coloured
    // hex faces stay mid-grey whatever their hue.
    function minChannel(img, x, y) {
        const ch = img.channels || (img.data.length / (img.width * img.height));
        const i = (y * img.width + x) * ch;
        return Math.min(img.data[i], img.data[i + 1], img.data[i + 2]);
    }

    // Cut out the level pill around (cx, cy). Returns the digits as rows of ink
    // (0..1), or null when there is no pill (locked node). When the pill sits off
    // the middle of the search box, the box is moved onto it and cut again, so a
    // title found a few pixels off still lands every pill.
    function pillAt(img, cx, cy, s, again) {
        const w = Math.round(30 * s), h = Math.round(20 * s);
        const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
        if (x0 < 0 || y0 < 0 || x0 + w > img.width || y0 + h > img.height) return null;
        const W = new Float32Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) W[y * w + x] = minChannel(img, x0 + x, y0 + y);

        // Dark pixels, relative to the hex face around them.
        const sorted = Array.from(W).sort((a, b) => a - b);
        const thr = (sorted[Math.floor(sorted.length * 0.1)] + sorted[Math.floor(sorted.length * 0.8)]) / 2;
        const lab = new Int32Array(w * h);
        let best = null, n = 0;
        for (let p = 0; p < w * h; p++) {
            if (lab[p] || W[p] >= thr) continue;
            n++;
            const px = [], st = [p];
            lab[p] = n;
            while (st.length) {
                const q = st.pop(); px.push(q);
                const qx = q % w, qy = (q / w) | 0;
                if (qx > 0 && !lab[q - 1] && W[q - 1] < thr) { lab[q - 1] = n; st.push(q - 1); }
                if (qx < w - 1 && !lab[q + 1] && W[q + 1] < thr) { lab[q + 1] = n; st.push(q + 1); }
                if (qy > 0 && !lab[q - w] && W[q - w] < thr) { lab[q - w] = n; st.push(q - w); }
                if (qy < h - 1 && !lab[q + w] && W[q + w] < thr) { lab[q + w] = n; st.push(q + w); }
            }
            if (px.length < 15 * s * s) continue;
            let sx = 0, sy = 0, t = 1e9, b = -1, l = 1e9, r = -1;
            for (const q of px) {
                const x = q % w, y = (q / w) | 0;
                sx += x; sy += y;
                if (y < t) t = y; if (y > b) b = y; if (x < l) l = x; if (x > r) r = x;
            }
            const d = Math.abs(sy / px.length - h / 2) + 0.5 * Math.abs(sx / px.length - w / 2);
            if (!best || d < best.d) best = { d, px, t, b, l, r };
        }
        if (!best) return null;

        const { t, b, l, r } = best;
        const mx = x0 + (l + r) / 2, my = y0 + (t + b) / 2;
        if (!again && (Math.abs(mx - cx) > 2 * s || Math.abs(my - cy) > 2 * s)) {
            return pillAt(img, Math.round(mx), Math.round(my), s, true);
        }

        // The pill is the dark ring plus whatever it encloses (the digits).
        const pw = r - l + 1, ph = b - t + 1;
        const ring = new Uint8Array(pw * ph);
        for (const q of best.px) ring[(((q / w) | 0) - t) * pw + (q % w) - l] = 1;
        const outside = new Uint8Array(pw * ph);
        const st = [];
        for (let x = 0; x < pw; x++) st.push(x, (ph - 1) * pw + x);
        for (let y = 0; y < ph; y++) st.push(y * pw, y * pw + pw - 1);
        while (st.length) {
            const q = st.pop();
            if (outside[q] || ring[q]) continue;
            outside[q] = 1;
            const x = q % pw, y = (q / pw) | 0;
            if (x > 0) st.push(q - 1); if (x < pw - 1) st.push(q + 1);
            if (y > 0) st.push(q - pw); if (y < ph - 1) st.push(q + pw);
        }
        const dark = [];
        let hi = 0;
        for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
            const v = W[(t + y) * w + l + x];
            if (ring[y * pw + x]) dark.push(v);
            if (!outside[y * pw + x] && v > hi) hi = v;
        }
        dark.sort((a, b2) => a - b2);
        const lo = dark[dark.length >> 1];
        if (hi - lo < 60) return null;   // a lock icon, or nothing
        // Digits as 0..1 ink, so the blur around a stroke counts for half.
        const G = [];
        for (let y = 0; y < ph; y++) {
            const row = [];
            for (let x = 0; x < pw; x++) {
                const v = outside[y * pw + x] ? 0 : (W[(t + y) * w + l + x] - lo) / (hi - lo);
                row.push(Math.max(0, Math.min(1, v)));
            }
            G.push(row);
        }
        return G;
    }

    // Split the digits into glyphs at empty columns.
    function glyphsOf(G) {
        const h = G.length, w = h ? G[0].length : 0;
        const colOn = [];
        for (let x = 0; x < w; x++) { let on = 0; for (let y = 0; y < h; y++) on = Math.max(on, G[y][x]); colOn.push(on > 0.5); }
        const out = [];
        for (let x = 0; x < w;) {
            if (!colOn[x]) { x++; continue; }
            let e = x;
            while (e + 1 < w && colOn[e + 1]) e++;
            let t = h, b = -1;
            for (let y = 0; y < h; y++) for (let c = x; c <= e; c++) if (G[y][c] > 0.5) { if (y < t) t = y; if (y > b) b = y; }
            const gw = e - x + 1, gh = b - t + 1;
            if (gh >= 3) out.push({ l: x, t, w: gw, h: gh, px: G.slice(t, b + 1).map((row) => row.slice(x, e + 1)) });
            x = e + 1;
        }
        return out;
    }

    // Distance from a glyph to each digit (lower is closer).
    function scores(g) {
        const res = {};
        if (g.w * 2 <= g.h) {   // narrow: only "1" is that thin
            for (let d = 0; d <= 9; d++) res[d] = d === 1 ? 0 : 2;
            return res;
        }
        // Average the glyph down to the font's 4x5 grid.
        const cell = [];
        for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
            const ya = y * g.h / FH, yb = (y + 1) * g.h / FH, xa = x * g.w / FW, xb = (x + 1) * g.w / FW;
            let sum = 0, area = 0;
            for (let py = Math.floor(ya); py < Math.ceil(yb); py++) for (let px = Math.floor(xa); px < Math.ceil(xb); px++) {
                const a = (Math.min(yb, py + 1) - Math.max(ya, py)) * (Math.min(xb, px + 1) - Math.max(xa, px));
                if (a <= 0) continue;
                sum += g.px[py][px] * a; area += a;
            }
            cell.push(area ? sum / area : 0);
        }
        // 1 - correlation, so a faint or blurred glyph still matches its shape.
        const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
        const mc = mean(cell);
        for (const tpl of TEMPLATES) {
            const mt = mean(tpl.px);
            let num = 0, da = 0, db = 0;
            for (let i = 0; i < cell.length; i++) {
                const a = cell[i] - mc, b = tpl.px[i] - mt;
                num += a * b; da += a * a; db += b * b;
            }
            res[tpl.d] = 1 - (da && db ? num / Math.sqrt(da * db) : 0);
        }
        res[1] = 2;
        return res;
    }

    // Glyphs -> level 1..30, using what a level can be: one digit 1-9, or 10-30.
    // Also returns the runner-up's cost, to tell a clear read from a guess.
    function levelOf(glyphs) {
        const cands = [];
        if (glyphs.length === 1) {
            const s = scores(glyphs[0]);
            for (let d = 1; d <= 9; d++) cands.push({ lv: d, cost: s[d] });
        } else if (glyphs.length === 2) {
            const a = scores(glyphs[0]), b = scores(glyphs[1]);
            for (let lv = 10; lv <= 30; lv++) cands.push({ lv, cost: a[Math.floor(lv / 10)] + b[lv % 10] });
        } else return null;
        cands.sort((x, y) => x.cost - y.cost);
        return { lv: cands[0].lv, cost: cands[0].cost, next: cands[1].cost };
    }

    // Read every node, given where the title is. Returns { [tier]: [lv|null per slot] }
    // where 0 = locked / no pill and null = a pill that could not be read.
    function readBoard(img, anchor) {
        const s = anchor.s || 1;
        const out = {};
        let pills = 0, unread = 0, cost = 0;
        for (const [tier, pts] of Object.entries(LAYOUT)) {
            out[tier] = pts.map(([dx, dy]) => {
                const G = pillAt(img, Math.round(anchor.x + dx * s), Math.round(anchor.y + (dy + PILL_DY) * s), s);
                if (!G) return 0;
                pills++;
                const r = levelOf(glyphsOf(G));
                if (!r || r.cost > 1.6 || r.next - r.cost < 0.06) { unread++; return null; }
                cost += r.cost;
                return r.lv;
            });
        }
        return { levels: out, pills, unread, cost };
    }

    // A picture taken at another size (a scaled window, a resized screenshot) is
    // brought back to 100% around the board first: the digits are only 5px tall,
    // so reading them at an odd scale goes wrong far more often than resampling.
    // Area-averaged, over the board only; returns the board as its own picture.
    function normalize(img, anchor) {
        const s = anchor.s || 1;
        if (Math.abs(s - 1) < 0.04) return { img, anchor: { ...anchor, s: 1 } };
        const ch = img.channels || (img.data.length / (img.width * img.height));
        const bx = anchor.x - 30 * s, by = anchor.y - 30 * s;
        const W = 520, H = 600;
        const data = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const xa = bx + x * s, xb = xa + s, ya = by + y * s, yb = ya + s;
            let r = 0, g = 0, b = 0, area = 0;
            for (let py = Math.floor(ya); py < Math.ceil(yb); py++) {
                if (py < 0 || py >= img.height) continue;
                const fy = Math.min(yb, py + 1) - Math.max(ya, py);
                for (let px = Math.floor(xa); px < Math.ceil(xb); px++) {
                    if (px < 0 || px >= img.width) continue;
                    const a = fy * (Math.min(xb, px + 1) - Math.max(xa, px));
                    if (a <= 0) continue;
                    const i = (py * img.width + px) * ch;
                    r += img.data[i] * a; g += img.data[i + 1] * a; b += img.data[i + 2] * a; area += a;
                }
            }
            const o = (y * W + x) * 4;
            if (area) { data[o] = r / area; data[o + 1] = g / area; data[o + 2] = b / area; }
            data[o + 3] = 255;
        }
        return { img: { width: W, height: H, data, channels: 4 }, anchor: { x: 30, y: 30, s: 1 } };
    }

    // The title box from OCR can be a few pixels off; try nearby positions and
    // keep the one where the most pills read cleanly.
    function refine(img, anchor) {
        let best = null;
        for (let dy = -6; dy <= 6; dy++) for (let dx = -4; dx <= 4; dx += 2) {
            const a = { ...anchor, x: anchor.x + dx, y: anchor.y + dy };
            const res = readBoard(img, a);
            const score = res.pills * 10 - res.unread * 3 - res.cost * 5;
            if (!best || score > best.score) best = { score, a };
        }
        return best.a;
    }

    // The title from OCR word boxes: "HEXA" followed by "Matrix" on the same line.
    function findAnchor(words) {
        for (let i = 0; i < words.length; i++) {
            const a = words[i];
            if (!/^HEXA$/i.test(a.t)) continue;
            const m = words.find((w) => /^Matri[xk]$/i.test(w.t) && w.x0 > a.x1 && w.x0 - a.x1 < (a.x1 - a.x0) && Math.abs((w.y0 + w.y1) - (a.y0 + a.y1)) < (a.y1 - a.y0));
            if (!m) continue;
            return { x: a.x0, y: a.y0, s: (m.x1 - a.x0) / TITLE_W };
        }
        return null;
    }

    /* ---------- the whole pipeline ---------- */
    let tessLoading = null, worker = null;
    function loadTesseract() {
        if (root.Tesseract) return Promise.resolve(root.Tesseract);
        if (tessLoading) return tessLoading;
        tessLoading = new Promise((ok, ng) => {
            const s = document.createElement('script');
            s.src = TESS_URL;
            s.onload = () => ok(root.Tesseract);
            s.onerror = () => { tessLoading = null; ng(new Error('文字認識の読み込みに失敗しました')); };
            document.head.appendChild(s);
        });
        return tessLoading;
    }
    async function getWorker() {
        if (worker) return worker;
        const T = await loadTesseract();
        worker = await T.createWorker('eng');
        await worker.setParameters({ tessedit_pageseg_mode: '11' });
        return worker;
    }

    // Greyscale copy for the title search (the title is white on dark blue).
    function greyCanvas(img) {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        const out = ctx.createImageData(img.width, img.height);
        const d = img.data, o = out.data;
        for (let i = 0; i < d.length; i += 4) {
            const v = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
            o[i] = o[i + 1] = o[i + 2] = v; o[i + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
        return c;
    }

    async function locate(img) {
        const w = await getWorker();
        const { data } = await w.recognize(greyCanvas(img), {}, { blocks: true });
        const words = [];
        for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const x of l.words || []) {
            words.push({ t: x.text, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 });
        }
        return findAnchor(words);
    }

    // anchor: reuse a previous position (live reading); found again when it fails.
    // anchor is where the title was found, in the picture's own pixels.
    function readAt(img, anchor, search) {
        const n = normalize(img, anchor);
        const a = search ? refine(n.img, n.anchor) : n.anchor;
        const res = readBoard(n.img, a);
        // Hand back the refined position in the original picture's pixels.
        const s = anchor.s || 1;
        const back = n.img === img ? a : { x: anchor.x + (a.x - n.anchor.x) * s, y: anchor.y + (a.y - n.anchor.y) * s, s };
        return { ...res, anchor: back };
    }
    async function read(img, anchor) {
        if (anchor) {
            const res = readAt(img, anchor, false);
            if (res.pills >= 2 && !res.unread) return res;
        }
        const found = await locate(img);
        if (!found) return { anchor: null, levels: null };
        return readAt(img, found, true);
    }

    // Pixels of an image file / blob / video frame.
    async function pixelsOf(src) {
        let bmp = src;
        if (src instanceof Blob) bmp = await createImageBitmap(src);
        const w = bmp.videoWidth || bmp.width, h = bmp.videoHeight || bmp.height;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0, w, h);
        const id = ctx.getImageData(0, 0, w, h);
        return { width: w, height: h, data: id.data };
    }

    const api = { LAYOUT, readBoard, refine, normalize, readAt, findAnchor, pillAt, glyphsOf, levelOf, read, pixelsOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.hexaReader = api;
})(typeof window !== 'undefined' ? window : globalThis);
