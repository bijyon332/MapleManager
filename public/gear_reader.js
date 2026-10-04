// Gear Reader — reads an item tooltip out of a MapleStory (GMS, English) screenshot.
// The tooltip is found by its row of star-force stars (or, for items without
// stars, by the "Required Level" line), cropped, enlarged, turned into black
// text on white and handed to Tesseract.js. Flame values are told apart from
// star-force values by colour (green vs yellow), so colours are read from the
// original screenshot rather than the cleaned-up crop.
// Works on plain { width, height, data } pixel buffers so it can run outside a page.
(function (root) {
    'use strict';

    // Pinned so the worker, core and language files all come from the same release.
    const TESS_VER = '7.0.0';
    const TESS_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESS_VER}/dist/tesseract.min.js`;

    /* ---------- finding the tooltip ---------- */
    // At 100% UI scale a star is 7px wide and they sit 10.8px apart.
    const STAR_PITCH = 10.8;
    const isYellow = (d, i) => d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 90 && d[i] - d[i + 2] > 130;

    function yellowRuns(img, y, x0 = 0, x1 = img.width) {
        const { data: d, width: W } = img;
        const out = [];
        let s = -1;
        for (let x = x0; x <= x1; x++) {
            const v = x < x1 && isYellow(d, (y * W + x) * 4);
            if (v && s < 0) s = x;
            if (!v && s >= 0) { out.push([s, x]); s = -1; }
        }
        return out;
    }

    // Five lit stars in a row: same width, evenly spaced. Stars fill from the
    // left, so the first block of five is always the leftmost one on the row.
    function starBlockAt(runs, k) {
        const g = runs.slice(k, k + 5);
        if (g.length < 5) return null;
        const ws = g.map((r) => r[1] - r[0]);
        const w = ws.slice().sort((a, b) => a - b)[2];
        if (w < 3 || Math.max(...ws) - Math.min(...ws) > Math.max(2, w * 0.4)) return null;
        const ps = g.slice(1).map((r, i) => r[0] - g[i][0]);
        const p = (ps[0] + ps[1] + ps[2] + ps[3]) / 4;
        if (p < w * 1.2 || p > w * 2.3) return null;
        // Yellow text (potential lines, chat) also comes in even runs, but much smaller.
        if (p / STAR_PITCH < 0.6 || p / STAR_PITCH > 2.5) return null;
        if (Math.max(...ps) - Math.min(...ps) > Math.max(2, p * 0.2)) return null;
        return { x0: g[0][0], w, s: p / STAR_PITCH };
    }

    // Every tooltip on screen (comparison tooltips come in pairs), top row of stars.
    function findStarRows(img) {
        const found = [];
        for (let y = 0; y < img.height - 3; y++) {
            const runs = yellowRuns(img, y);
            for (let k = 0; k + 5 <= runs.length; k++) {
                const b = starBlockAt(runs, k);
                if (!b) continue;
                // A real star row is a few pixels tall; a stray line of sparks isn't.
                const below = yellowRuns(img, y + Math.max(1, Math.round(b.s * 2)), b.x0 - 3, b.x0 + Math.round(60 * b.s));
                if (below.length < 4) continue;
                // Lower rows of the same tooltip, and the 2nd/3rd block of five on its top row.
                const near = found.find((f) => b.x0 - f.x0 > -12 * f.s && b.x0 - f.x0 < 200 * f.s && y - f.y < 40 * f.s);
                if (!near) found.push({ ...b, y });
                k += 4;
            }
        }
        return found.map((f) => ({ ...f, cx: f.x0 + 87 * f.s }));
    }

    // Lit stars over the two rows (15 per row).
    function countStars(img, t) {
        const span = [Math.max(0, t.x0 - 3), Math.min(img.width, Math.round(t.x0 + 180 * t.s))];
        const best = (y0, y1) => {
            let n = 0;
            for (let y = y0; y <= y1; y++) {
                if (y < 0 || y >= img.height) continue;
                n = Math.max(n, yellowRuns(img, y, ...span).filter((r) => r[1] - r[0] >= t.w - 2).length);
            }
            return Math.min(15, n);
        };
        const r1 = best(t.y, t.y + Math.round(3 * t.s));
        if (r1 < 15) return r1;
        return r1 + best(t.y + Math.round(15 * t.s), t.y + Math.round(22 * t.s));
    }

    /* ---------- cropping for the OCR ---------- */
    // Tooltip region around its centre line, enlarged so the text is ~3x its
    // 100%-scale size, light text -> black on white.
    function cropRect(img, t) {
        const x0 = Math.max(0, Math.round(t.cx - 150 * t.s));
        const x1 = Math.min(img.width, Math.round(t.cx + 150 * t.s));
        const y0 = Math.max(0, Math.round(t.y - 8 * t.s));
        const y1 = Math.min(img.height, Math.round(t.y + 760 * t.s));
        return { x0, y0, w: x1 - x0, h: y1 - y0, f: 3 / t.s };
    }
    function binarize(img, r) {
        const { data: d, width: W } = img;
        const ow = Math.round(r.w * r.f), oh = Math.round(r.h * r.f);
        const out = new Uint8ClampedArray(ow * oh * 4);
        const lum = (x, y) => {
            const i = (y * W + x) * 4;
            return Math.max(d[i], d[i + 1], d[i + 2]);
        };
        for (let oy = 0; oy < oh; oy++) {
            const sy = r.y0 + (oy + 0.5) / r.f - 0.5;
            const yA = Math.max(r.y0, Math.floor(sy)), yB = Math.min(r.y0 + r.h - 1, yA + 1), fy = Math.max(0, sy - yA);
            for (let ox = 0; ox < ow; ox++) {
                const sx = r.x0 + (ox + 0.5) / r.f - 0.5;
                const xA = Math.max(r.x0, Math.floor(sx)), xB = Math.min(r.x0 + r.w - 1, xA + 1), fx = Math.max(0, sx - xA);
                const v = (lum(xA, yA) * (1 - fx) + lum(xB, yA) * fx) * (1 - fy) + (lum(xA, yB) * (1 - fx) + lum(xB, yB) * fx) * fy;
                const o = (oy * ow + ox) * 4, c = v > 110 ? 0 : 255;
                out[o] = out[o + 1] = out[o + 2] = c; out[o + 3] = 255;
            }
        }
        return { width: ow, height: oh, data: out };
    }

    // Colour of the text inside a box of the enlarged crop, read from the original.
    function colorAt(img, r, bb) {
        const { data: d, width: W } = img;
        const x0 = Math.floor(r.x0 + bb.x0 / r.f), x1 = Math.ceil(r.x0 + bb.x1 / r.f);
        const y0 = Math.floor(r.y0 + bb.y0 / r.f), y1 = Math.ceil(r.y0 + bb.y1 / r.f);
        let green = 0, yellow = 0, white = 0;
        for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++) {
            for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
                const i = (y * W + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
                if (Math.max(R, G, B) < 120) continue;
                if (G > 140 && B > 110 && R < G - 50) green++;
                else if (R > 160 && G > 140 && B < R - 70) yellow++;
                else if (Math.abs(R - G) < 30 && Math.abs(G - B) < 30) white++;
            }
        }
        if (green >= 3 && green >= yellow) return 'green';
        if (yellow >= 3 && yellow > green) return 'yellow';
        return 'white';
    }

    /* ---------- reading the text ---------- */
    const SUBTYPE = [
        // [pattern, kind] — matched against the right-hand tags ("Armor / Bottom").
        [/\bface\s*acc/i, 'face'], [/\beye\s*(acc|dec)/i, 'eye'], [/\bear\s*rings?\b|\bearrings?\b/i, 'ear'],
        [/\bpendant\b/i, 'pendant'], [/\bring\b/i, 'ring'], [/\bbelt\b/i, 'belt'], [/\bshoulder/i, 'shoulder'],
        [/\bemblem\b/i, 'emblem'], [/\bbadge\b/i, 'badge'], [/\bpocket/i, 'pocket'], [/\bheart\b/i, 'heart'],
        [/\boverall\b/i, 'overall'], [/\bhat\b/i, 'hat'], [/\btop\b/i, 'top'], [/\bbottom\b/i, 'bottom'],
        [/\bshoes?\b/i, 'shoe'], [/\bgloves?\b/i, 'glove'], [/\bcape\b/i, 'cape'],
        [/\bsub\s*wea|\bsecondary\b|\bimugi\b|\bkodachi\b|\bgem\b|\bshield\b|\bkatara\b|\bmedallion|\brosary\b|\biron chain\b|\bmagic book\b|\barrow fletching\b|\bbow thimble\b|\bdagger scabbard\b|\bcharm\b|\bwrist band\b|\bfar sight\b|\bpowder keg\b|\bmass\b|\bdocument\b|\bmagic marble\b|\barrowhead\b|\bjewel\b|\bfox marble\b|\bcore controller\b|\bchess piece\b|\btransmitter\b|\bornament\b|\bspellbook\b|\bsoul ring\b|\bmagnum\b|\bfan tassel\b|\bhilt\b|\brelic\b|\bbracelet\b|\bweapon belt\b|\bnovel\b|\bwing\b/i, 'sub'],
        [/\bweapon\b|\bsword\b|\baxe\b|\bmace\b|\bspear\b|\bpolearm\b|\bdagger\b|\bclaw\b|\bbow\b|\bcrossbow\b|\bwand\b|\bstaff\b|\bgun\b|\bknuckle\b|\bcannon\b|\bcane\b|\bkatana\b|\bfan\b|\bscepter\b|\bgauntlet\b|\bchain\b|\bblade\b|\bshining rod\b|\bpsy-?limiter\b|\bchakram\b|\bhand cannon\b|\bbreath shooter\b|\bwhip blade\b|\bdesperado\b|\bwhispershot\b|\blong sword\b|\bheavy sword\b|\bbladecaster\b|\britual fan\b|\bmemorial staff\b|\bancient bow\b|\bdual bowguns\b|\benergy sword\b|\barm cannon\b|\bsoul shooter\b/i, 'weapon'],
    ];
    const GRADE_WORD = { rare: 'R', epic: 'E', unique: 'U', legendary: 'L' };

    // Words -> lines in reading order, from Tesseract's block output.
    function linesOf(data) {
        const out = [];
        for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
            out.push({ text: l.text.replace(/\s+$/, ''), bbox: l.bbox, words: (l.words || []).map((w) => ({ text: w.text, bbox: w.bbox })) });
        }
        out.sort((a, b) => a.bbox.y0 - b.bbox.y0);
        return out;
    }

    const STAT_LINE = [
        [/^STR\b/i, 'str'], [/^DEX\b/i, 'dex'], [/^INT\b/i, 'int'], [/^LUK\b/i, 'luk'],
        [/^Max\s*HP\b/i, 'hp'], [/^Max\s*MP\b/i, 'mp'],
        [/^A\w*\s*Power\b/i, 'att'], [/^Magic\s*A/i, 'matt'],
        [/^All\s*Stat/i, 'allStat'], [/^Boss\s*Dam/i, 'boss'], [/^Dam/i, 'dmg'],
    ];
    const POT_LINE = [
        [/Critical\s*Dam/i, 'crit'], [/Boss/i, 'boss'], [/Ignore|Monster\s*DEF/i, 'ied'],
        [/Magic\s*A/i, 'matt'], [/A\w*\s*Power|\bATT\b/i, 'att'], [/All\s*Stat/i, 'all'],
        [/\bSTR\b/i, 'str'], [/\bDEX\b/i, 'dex'], [/\bINT\b/i, 'int'], [/\bLUK\b/i, 'luk'],
        [/^\W*Dam/i, 'dmg'],
    ];
    const numOf = (s) => {
        const m = String(s).replace(/[oO]/g, '0').replace(/[lI|]/g, '1').match(/(\d+)/);
        return m ? Number(m[1]) : null;
    };

    // `color(bbox)` says what colour a word is ('green' = flame).
    // "Required" as OCR spells it ("Recuired", "Renuired", "Requlred"): within two letters.
    function nearWord(t, word) {
        const a = t.toLowerCase().replace(/[^a-z]/g, ''), b = word;
        if (Math.abs(a.length - b.length) > 2) return false;
        const d = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            let prev = d[0];
            d[0] = i;
            for (let j = 1; j <= b.length; j++) {
                const t2 = d[j];
                d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
                prev = t2;
            }
        }
        return d[b.length] <= 2;
    }
    const isReq = (t) => /^R/i.test(t) && nearWord(t, 'required');
    const isReqLevel = (t) => {
        const ws = t.split(/\s+/);
        return ws.some((x, k) => isReq(x) && ws[k + 1] && /^L[eo]v/i.test(ws[k + 1])) || /Requ\w*\s*Lev/i.test(t);
    };

    function parse(lines, color) {
        const res = { name: '', kind: '', level: 0, grade: '', pot: [], flame: {} };
        const iReq = lines.findIndex((l) => isReqLevel(l.text));
        const head = iReq >= 0 ? lines.slice(0, iReq) : lines.slice(0, 8);

        // The name is the tallest wordy line above "Required".
        // The star row reads as capitals ("RRARE AARN"), so a name needs lower case too.
        const TAG = /\b(Armor|Accessory|Weapon|Secondary|Hat|Top|Bottom|Overall|Shoes|Gloves|Cape|Shoulder|Belt|Pendant|Earrings?|Ring|Emblem|Badge|Pocket|Heart|Face|Eye)\b/gi;
        let best = null;
        for (const l of head) {
            const letters = (l.text.match(/[A-Za-z]/g) || []).length;
            const lower = (l.text.match(/[a-z]/g) || []).length;
            if (letters < 4 || letters < l.text.replace(/\s/g, '').length * 0.7 || lower < letters * 0.4) continue;
            // A type tag with star garbage beside it ("SP Ls! Sub Weapon") is not a name.
            const rest = l.text.replace(TAG, '').replace(/\bSub\b/gi, '');
            if ((rest.match(/[A-Za-z]/g) || []).length < 4 || !/[A-Za-z]{3}/.test(rest)) continue;
            // Item names are Capitalised Words ("AbsoLab", "Two-handed", "Mitra's Rage:").
            const words = l.text.split(/\s+/).filter(Boolean);
            if (words.filter((w) => /^[A-Z][A-Za-z'\-:]+$/.test(w)).length < words.length * 0.6) continue;
            if (/tradable|combat|power|increase|currently|equipped|one-of|unique equip|required/i.test(l.text)) continue;
            const h = Math.max(...l.words.map((w) => w.bbox.y1 - w.bbox.y0));
            if (!best || h > best.h + 1) best = { h, text: l.text };
        }
        res.name = best ? best.text.replace(/^[^A-Za-z]+|[^A-Za-z')]+$/g, '') : '';

        // Item type from the tags on the right; the name is the fallback.
        const tags = head.map((l) => l.text).join(' ');
        for (const [re, kind] of SUBTYPE) if (re.test(tags)) { res.kind = kind; break; }
        if (!res.kind) for (const [re, kind] of SUBTYPE) if (re.test(res.name)) { res.kind = kind; break; }

        if (iReq >= 0) {
            const m = lines[iReq].text.replace(/[oO]/g, '0').match(/L\w?\.?\s*(\d{2,3})/);
            if (m) res.level = Number(m[1]);
        }

        // Stat lines: "STR +323 (50 +159 +114)" — the green number is the flame.
        let iPot = -1;
        for (let i = Math.max(0, iReq); i < lines.length; i++) {
            const l = lines[i];
            const pm = l.text.match(/Potential\s*:?\s*(Rare|Epic|Unique|Legendary)/i);
            if (pm && !/Additional/i.test(l.text)) { iPot = i; res.grade = GRADE_WORD[pm[1].toLowerCase()]; break; }
            const t = l.text.replace(/^[^A-Za-z]+/, '');
            const st = STAT_LINE.find(([re]) => re.test(t));
            if (!st || !/\(/.test(l.text)) continue;
            const open = l.words.findIndex((w) => w.text.includes('('));
            if (open < 0) continue;
            for (const w of l.words.slice(open)) {
                // "(0+42)" can come back as one word; only numbers after a "+" count.
                const parts = w.text.split('+').slice(1);
                if (!parts.length) continue;
                const n = numOf(parts[parts.length - 1]);
                if (n != null && color(w.bbox) === 'green') res.flame[st[1]] = (res.flame[st[1]] || 0) + n;
            }
        }

        // Potential: the three lines under "Potential : Legendary".
        if (iPot >= 0) {
            for (const l of lines.slice(iPot + 1)) {
                if (res.pot.length >= 3 || /Potential|Can't|Check the|enhancement/i.test(l.text)) break;
                const t = l.text.replace(/^[^A-Za-z]+/, '');
                const v = numOf((t.match(/\+\s*([\dOolI|]+)/) || [])[1] || '');
                if (!/[A-Za-z]/.test(t)) continue;
                const hit = POT_LINE.find(([re]) => re.test(t));
                res.pot.push({ k: hit ? hit[1] : 'etc', v: v || 0, pct: /%/.test(t), text: t });
            }
        }
        return res;
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
        await worker.setParameters({ tessedit_pageseg_mode: '6' });
        return worker;
    }
    const toCanvas = (img) => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
        return c;
    };

    // Items without stars: find "Required Level" at native size to place the box.
    // The whole screen has several columns of text, so this pass uses automatic layout.
    async function findByText(img, w, conv) {
        await w.setParameters({ tessedit_pageseg_mode: '3' });
        try {
            const out = spotsOfText(linesOf((await w.recognize(await conv(img), {}, { blocks: true })).data));
            if (out.length) return out;
            // Busy backgrounds can hide the line; try once more in black and white.
            const bin = binarize(img, { x0: 0, y0: 0, w: img.width, h: img.height, f: 1 });
            return spotsOfText(linesOf((await w.recognize(await conv(bin), {}, { blocks: true })).data));
        } finally { await w.setParameters({ tessedit_pageseg_mode: '6' }); }
    }
    function spotsOfText(lines) {
        const out = [];
        for (const l of lines) {
            const i = l.words.findIndex((x, k) => isReq(x.text) && l.words[k + 1] && /^L[eo]v/i.test(l.words[k + 1].text));
            if (i < 0) continue;
            const bb = l.words[i].bbox;
            // "Required" is 11px tall at 100% UI scale; the stars sit 175px above it.
            const s = Math.max(0.6, (bb.y1 - bb.y0) / 11);
            if (out.some((o) => Math.abs(o.x0 - bb.x0) < 40 * s)) continue;
            out.push({ x0: bb.x0, y: Math.max(0, Math.round(bb.y0 - 175 * s)), s, w: 7 * s, cx: bb.x0 + 145 * s, noStars: true });
        }
        return out;
    }

    async function readTooltip(img, opts = {}) {
        const w = opts.worker || await getWorker();
        const out = await readSpots(img, w, findStarRows(img), opts);
        // No stars (emblems, some secondaries), or something star-like that wasn't a tooltip.
        if (!out.length && !opts.starsOnly) return readSpots(img, w, await findByText(img, w, opts.toImage || toCanvas), opts);
        return out;
    }

    async function readSpots(img, w, spots, opts) {
        const out = [];
        for (const t of spots.slice(0, 2)) {
            const r = cropRect(img, t);
            const bin = binarize(img, r);
            const src = opts.toImage ? await opts.toImage(bin) : toCanvas(bin);
            const { data } = await w.recognize(src, {}, { blocks: true });
            const lines = linesOf(data);
            const res = parse(lines, (bb) => colorAt(img, r, bb));
            res.stars = t.noStars ? 0 : countStars(img, t);
            res.equipped = lines.some((l) => /Currently\s*Equipped/i.test(l.text));
            res.raw = lines.map((l) => l.text).join('\n');
            if (res.level) out.push(res);
        }
        // With a pair on screen, the one being hovered is the one not marked equipped.
        if (out.length > 1) {
            const hovered = out.filter((x) => !x.equipped);
            if (hovered.length) return hovered;
        }
        return out;
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

    const api = { findStarRows, countStars, cropRect, binarize, colorAt, linesOf, parse, readTooltip, pixelsOf, getWorker };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.gearReader = api;
})(typeof window !== 'undefined' ? window : globalThis);
