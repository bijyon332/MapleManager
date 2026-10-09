// Scouter Reader — reads the GMS (English) Character Info → STAT window out of a
// screenshot or a shared screen.
//
// Two things are read:
//   - the stat window itself: rows of "LABEL  value  LABEL  value" (DAMAGE 89.00%,
//     BOSS DAMAGE 252.00%, COOLDOWN REDUCTION 0 sec / 6% …), plus Combat Power and Lv.
//   - the hover tooltip of STR / DEX / INT / LUK / HP / Attack Power / Magic ATT,
//     whose [Applied Value] block gives "Base Value", "% Value" and
//     "% Value Not Applied" — the three numbers MapleScouter wants per stat.
//   - the HYPER STATS window: rows of "Critical Rate  [+]  Lv. 7" and "POINT 10".
//     The single digits after "Lv." are mostly dropped in sparse-text mode, so once
//     the rows are found the column of numbers is cut out and read again as digits.
//
// The whole picture is turned into black text on white (the window's text is light
// on a mid-grey panel), enlarged 2x and handed to Tesseract.js in sparse-text mode,
// then words are put back into rows by their height on screen.
// parse() works on plain word boxes so it can be tried outside a page.
(function (root) {
    'use strict';

    // Same release as gear_reader.js, so a page that has both loads it once.
    const TESS_VER = '7.0.0';
    const TESS_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESS_VER}/dist/tesseract.min.js`;
    const SCALE = 2;
    const LIGHT = 160;   // luminance above this counts as text

    /* ---------- labels in the stat window ---------- */
    // Written as the window spells them (upper case). Longer labels first where one
    // starts with another, so "DAMAGE RANGE" is not read as "DAMAGE".
    const LABELS = [
        ['DAMAGE RANGE', 'range'],
        ['NORMAL ENEMY DAMAGE', 'normalDmg'],
        ['ADDITIONAL STATUS DAMAGE', 'statusDmg'],
        ['IGNORE ELEMENTAL RESISTANCE', 'ignoreElem'],
        ['SUMMONS DURATION INCREASE', 'summonDur'],
        ['COOLDOWN NOT APPLIED', 'resetCool'],
        ['COOLDOWN REDUCTION', 'cool'],
        ['CRITICAL DAMAGE', 'criticalDmg'],
        ['CRITICAL RATE', 'critical'],
        ['FINAL DAMAGE', 'finalDmg'],
        ['BOSS DAMAGE', 'bossDmg'],
        ['IGNORE DEFENSE', 'ignoreDef'],
        ['ATTACK POWER', 'att'],
        ['MAGIC ATT', 'matt'],
        ['BUFF DURATION', 'buffDuration'],
        ['ARCANE POWER', 'arcane'],
        ['SACRED POWER', 'sacred'],
        ['STAR FORCE', 'starForce'],
        ['DAMAGE', 'dmg'],
        ['STR', 'str'], ['DEX', 'dex'], ['INT', 'int'], ['LUK', 'luk'], ['HP', 'hp'], ['MP', 'mp'],
    ].map(([text, key]) => ({ key, words: text.split(' ') }));

    // Tooltip titles, and what the tooltip's description says when the title is missed.
    const TITLES = [
        [/^STR$/, 'str'], [/^DEX$/, 'dex'], [/^INT$/, 'int'], [/^LUK$/, 'luk'],
        [/^(MAX\s*)?HP$/i, 'hp'], [/^Attack\s*Power$/i, 'att'], [/^Magic\s*ATT$/i, 'matt'],
    ];
    const DESCRIBES = [
        [/Warrior/i, 'str'], [/Bowman/i, 'dex'], [/Magician/i, 'int'], [/Thie[fv]/i, 'luk'],
        [/Attack\s*Power\s*of/i, 'att'], [/Magic\s*ATT\s*of/i, 'matt'],
    ];

    const letters = (s) => String(s).replace(/[^A-Za-z]/g, '');
    function editDist(a, b) {
        const d = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            let prev = d[0];
            d[0] = i;
            for (let j = 1; j <= b.length; j++) {
                const t = d[j];
                d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
                prev = t;
            }
        }
        return d[b.length];
    }
    // A label word as the window writes it: upper case, a misread letter allowed on long words.
    function isWord(raw, want) {
        const w = letters(raw);
        if (!w || w !== w.toUpperCase()) return false;
        if (w === want) return true;
        return want.length >= 5 && Math.abs(w.length - want.length) <= 1 && editDist(w, want) <= 1;
    }

    // "91,118,726" "+ 89.00%" "0sec/6%" "1,350" → numbers in order.
    function numbersOf(s) {
        const t = String(s).replace(/[oO](?=[\d.,%]|sec)|(?<=[\d.,])[oO]/gi, '0').replace(/(?<=\d)[lI|](?=\d)/g, '1');
        return (t.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((x) => Number(x.replace(/,/g, '')));
    }

    /* ---------- words → rows ---------- */
    function rowsOf(words) {
        const ws = words.filter((w) => w.t && w.t.trim()).slice().sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
        const rows = [];
        for (const w of ws) {
            const cy = (w.y0 + w.y1) / 2, h = Math.max(6, w.y1 - w.y0);
            const r = rows.find((r) => Math.abs(r.cy - cy) <= Math.max(4, h * 0.45));
            if (r) { r.words.push(w); r.cy = (r.cy * (r.words.length - 1) + cy) / r.words.length; }
            else rows.push({ cy, words: [w] });
        }
        rows.forEach((r) => r.words.sort((a, b) => a.x0 - b.x0));
        rows.sort((a, b) => a.cy - b.cy);
        return rows;
    }

    // Which label starts at word k of a row, if any.
    function labelAt(ws, k) {
        for (const L of LABELS) {
            if (k + L.words.length > ws.length) continue;
            if (!L.words.every((want, i) => isWord(ws[k + i].t, want))) continue;
            // Labels sit on one line with ordinary word gaps.
            const span = L.words.length > 1 ? ws[k + L.words.length - 1].x0 - ws[k].x1 : 0;
            if (span > 40 * L.words.length) continue;
            return L;
        }
        return null;
    }

    /* ---------- the stat window ---------- */
    // What a value is made of: "91,118,726", "+ 89.00%", "0 sec / 6%", "0sec/6%".
    const VALUE_WORD = /^(\W{0,2}[\dO.,]+%?|\W{0,2}[\dO][\d.,]*sec\/?[\dO.,]*%?|sec|\/|%|\W)$/i;
    function readWindow(rows) {
        const out = {};
        for (const r of rows) {
            const ws = r.words;
            for (let k = 0; k < ws.length; k++) {
                const L = labelAt(ws, k);
                if (!L) continue;
                // The value: the words after the label, up to the next label.
                let j = k + L.words.length, text = '';
                // The ▲ next to a stat raised by a buff reads as a word of its own ("+").
                while (j < ws.length && /^\W{1,2}$/.test(ws[j].t) && j + 1 < ws.length && ws[j + 1].x0 - ws[j].x1 < 20) j++;
                const first = ws[j];
                // Hyper Stats rows ("Damage  Lv.12"), and labels a tooltip has covered the
                // value of (the row then goes on with tooltip text), have no value here.
                if (!first || !/^\W{0,2}(\d|O(sec|[\d.,]))/i.test(first.t) || first.x0 - ws[k + L.words.length - 1].x1 > 260) { k = j - 1; continue; }
                while (j < ws.length && !labelAt(ws, j) && VALUE_WORD.test(ws[j].t)) { text += ' ' + ws[j].t; j++; }
                const nums = numbersOf(text);
                if (nums.length && out[L.key] === undefined) {
                    if (L.key === 'cool') { out.coolSec = /sec/i.test(text) || nums.length > 1 ? nums[0] : 0; out.coolPer = nums.length > 1 ? nums[1] : (/%/.test(text) ? nums[0] : 0); out[L.key] = true; }
                    else out[L.key] = nums[0];
                }
                k = j - 1;
            }
            // "Combat Power   167,791,294"
            const line = ws.map((w) => w.t).join(' ');
            const cp = line.match(/Combat\s*Power\s+([\d,]{5,})/i);
            if (cp && out.combatPower === undefined) out.combatPower = Number(cp[1].replace(/,/g, ''));
            const lv = line.match(/(?:\bL|\b)v\.?\s*(\d{3})\b/);
            if (lv && Number(lv[1]) >= 100 && Number(lv[1]) <= 300 && out.level === undefined) out.level = Number(lv[1]);
        }
        delete out.cool;
        return out;
    }

    /* ---------- the hover tooltip ---------- */
    // The tooltip gives each number twice: in [Applied Value] ("Base Value : 4012",
    // "% Value : 89%", "% Value Not Applied : 0"), and again as the lines under
    // [Base Value] / [% Value] / [% Value Not Applied], which add up to it.
    // The mouse cursor sits on the tooltip and often hides a label or a colon, and a
    // half-hidden colon reads as "1" (": 89%" → "189%"), so both places are read and
    // checked against each other.
    const KINDS = ['base', 'per', 'abs'];
    // "[% Value Not Applied]", "Base Value]" (a bracket is often lost), "[Applied Value]".
    function headOf(t) {
        if (!/Valu\w*\s*\]|Appl\w*\s*\]|^\W*\[\s*(Base|%|Appl|Valu)/i.test(t)) return null;
        if (/Not\s*Appl/i.test(t)) return 'abs';
        if (/%/.test(t)) return 'per';
        if (/Base/i.test(t)) return 'base';
        if (/Appl/i.test(t)) return 'applied';
        return 'unknown';
    }
    // The number on a "Name : 123" line. Without a colon, a leading "1" may be the colon.
    function itemOf(t) {
        const fix = (x) => x.replace(/[oO](?=[\d.,%])|(?<=[\d.,])[oO]/g, '0').replace(/(?<=\d)[lI|](?=\d)/g, '1');
        const strs = (x) => fix(x).match(/\d[\d,]*(?:\.\d+)?/g) || [];
        const val = (x) => Number(x.replace(/,/g, ''));
        if (/:/.test(t)) {
            const m = strs(t.split(/:/).slice(1).join(':'));
            return m.length ? { n: val(m[0]) } : null;
        }
        const m = strs(t.split(/Valu\w*|Appl\w*/i).pop());
        if (!m.length) return null;
        const x = m[m.length - 1];
        const alt = /^1[\d,]/.test(x) ? val(x.slice(1).replace(/^,/, '')) : undefined;
        return { n: val(x), alt };
    }
    // Every total the lines can make, trying each doubtful "1" both ways.
    function sumsOf(items) {
        let sums = new Set([0]);
        for (const it of items) {
            const next = new Set();
            for (const s of sums) { next.add(s + it.n); if (it.alt !== undefined) next.add(s + it.alt); }
            sums = next.size > 256 ? new Set([...next].slice(0, 256)) : next;
        }
        return sums;
    }
    // Floats from "12.5%" lines add up with rounding noise.
    const same = (a, b) => Math.abs(a - b) < 0.05;
    // Candidates for one number, most likely first: an [Applied Value] reading the lines
    // agree with, then the [Applied Value] reading, then what a whole block adds up to.
    function candsOf(applied, sec) {
        const a = applied ? [applied.n, applied.alt].filter((v) => v !== undefined) : [];
        const sums = sec && sec.items.length ? [...sumsOf(sec.items)].map((v) => Math.round(v * 100) / 100) : [];
        const hits = a.filter((c) => sums.some((s) => same(s, c)));
        const out = [];
        for (const v of [...hits, ...a, ...(sec && sec.closed ? sums : [])]) if (!out.some((o) => same(o, v))) out.push(v);
        // Only the lines, and they can add up more than one way: not to be taken unchecked.
        out.sure = a.length > 0 || out.length === 1;
        return out;
    }
    // The stat window shows the result: floor(Base × (1 + %/100)) + Not Applied.
    const finalOf = (b, p, a) => Math.floor(b * (1 + p / 100) + 1e-6) + a;
    function settle(t, shown) {
        const c = { base: t.cands.base, per: t.cands.per, abs: t.cands.abs.length ? t.cands.abs : [0] };
        let best = null;
        if (shown > 0 && c.base.length) {
            const pers = c.per.length ? c.per : [];
            for (let i = 0; i < c.base.length; i++) for (let k = 0; k < c.abs.length; k++) {
                for (let j = 0; j < pers.length; j++) {
                    if (Math.abs(finalOf(c.base[i], pers[j], c.abs[k]) - shown) <= 1 && (!best || i + j + k < best.rank)) best = { rank: i + j + k, base: c.base[i], per: pers[j], abs: c.abs[k] };
                }
                // % hidden altogether: work it out from the result.
                if (!pers.length && !best) {
                    const p = Math.round(((shown - c.abs[k]) / c.base[i] - 1) * 100);
                    if (p >= 0 && Math.abs(finalOf(c.base[i], p, c.abs[k]) - shown) <= 1) best = { rank: i + k, base: c.base[i], per: p, abs: c.abs[k] };
                }
            }
        }
        const first = (l) => (l.sure === false ? undefined : l[0]);
        if (!best) best = { base: first(c.base), per: first(c.per), abs: c.abs.sure === false ? undefined : c.abs[0] };
        // Without Base or % the read is no good (a live read then tries the next frame).
        if (best.base === undefined || best.per === undefined || best.abs === undefined) return null;
        return { stat: t.stat, base: best.base, per: best.per, abs: best.abs };
    }

    function readTooltip(rows) {
        const lineOf = (r) => r.words.map((w) => w.t).join(' ');
        // Where the tooltip is: "Base Value : 4012" (capital B — the description above
        // says "base value" too), or else the [Applied Value] heading.
        let at = rows.findIndex((r) => /Base\s*Valu\w*\s*[:;.]?\s*\d/.test(lineOf(r)));
        let first = at >= 0 ? (rows[at].words.find((w) => /^Base/.test(w.t)) || rows[at].words[0]) : null;
        let head = -1;
        if (at < 0) {
            head = rows.findIndex((r) => /Appl\w*\s*Valu/i.test(lineOf(r)) && !/Not/i.test(lineOf(r)));
            if (head < 0) return null;
            first = rows[head].words.find((w) => /Appl/i.test(w.t)) || rows[head].words[0];
        }
        const x0 = first.x0 - 30, x1 = first.x0 + 270;   // the tooltip is ~260px wide at 100% UI
        const textOf = (r) => r.words.filter((w) => w.x0 >= x0 && w.x1 <= x1).map((w) => w.t).join(' ');

        // Line pitch inside the tooltip, from the lines below the anchor.
        const from = at >= 0 ? at : head;
        const ys = rows.slice(from, from + 16).filter((r) => textOf(r).trim()).map((r) => r.cy);
        const gaps = ys.slice(1).map((y, i) => y - ys[i]).filter((g) => g > 4).sort((p, q) => p - q);
        const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 15;
        if (at < 0) at = head + 1;
        const baseY = head >= 0 ? rows[head].cy + pitch : rows[at].cy;

        // [Applied Value]: Base, %, % Not Applied, one a line in that order. A line whose
        // label the cursor hides is placed by its height.
        const applied = {};
        for (let i = head >= 0 ? head + 1 : at; i < rows.length; i++) {
            const t = textOf(rows[i]);
            const slot = Math.round((rows[i].cy - baseY) / pitch);
            if (slot > 2 || (slot > 0 && headOf(t))) break;
            const it = itemOf(t);
            if (!it || slot < 0) continue;
            const kind = /Not\s*Appl/i.test(t) ? 'abs' : /%\s*Valu/i.test(t) ? 'per' : /Base/.test(t) ? 'base' : KINDS[slot];
            if (!applied[kind]) applied[kind] = it;
        }

        // The breakdown blocks below. A block counts as whole when the next heading is seen.
        const secs = {};
        let cur = null;
        for (let i = at + 1; i < Math.min(rows.length, at + 40); i++) {
            const t = textOf(rows[i]);
            const h = headOf(t);
            if (h) {
                if (cur) cur.closed = true;
                cur = KINDS.includes(h) && !secs[h] ? (secs[h] = { items: [], closed: false }) : null;
                continue;
            }
            if (!cur) continue;
            const it = itemOf(t);
            if (it) cur.items.push(it);
        }

        const cands = {};
        for (const k of KINDS) cands[k] = candsOf(applied[k], secs[k]);

        // Title: the top line of the tooltip box, above the description.
        let stat = null;
        const above = rows.slice(Math.max(0, at - 14), at);
        for (const r of above) {
            const t = textOf(r).trim();
            const m = TITLES.find(([re]) => re.test(t));
            if (m) { stat = m[1]; break; }
        }
        if (!stat) {
            const desc = above.map(textOf).join(' ');
            const m = DESCRIBES.find(([re]) => re.test(desc));
            if (m) stat = m[1];
        }
        return stat ? { stat, cands } : null;
    }

    /* ---------- the HYPER STATS window ---------- */
    // As the window writes them (mixed case), letters only, lower case.
    const HYPER_LABELS = [
        ['str', 'str'], ['dex', 'dex'], ['int', 'int'], ['luk', 'luk'], ['hp', 'hp'], ['mp', 'mp'],
        ['dftf', 'df'], ['dftfpp', 'df'], ['criticalrate', 'cr'], ['criticaldamage', 'cd'], ['ignoredefense', 'ied'],
        ['damage', 'dmg'], ['bossdamage', 'boss'], ['normaldamage', 'normal'], ['statusresistance', 'status'],
        ['attackpowermagicatt', 'att'], ['expobtained', 'exp'], ['arcanepower', 'arcane'],
    ];
    const LV_WORD = /^L?[vV][.,:]?(\d{0,2})$/;
    function hyperLabel(ws) {
        // Leading words may be stray marks or the edge of another window ("a EXP Obtained").
        for (let k = 0; k < ws.length; k++) {
            const t = ws.slice(k).map((w) => letters(w.t)).join('').toLowerCase();
            if (!t) continue;
            let best = null;
            for (const [want, key] of HYPER_LABELS) {
                const d = want.length <= 3 ? (t === want ? 0 : 9) : editDist(t, want);
                const ok = want.length <= 3 ? d === 0 : d <= Math.floor(want.length / 4);
                if (ok && (!best || d < best.d)) best = { d, key };
            }
            if (best) return best.key;
        }
        return null;
    }
    function readHyper(rows) {
        const found = [];
        let point;
        for (const r of rows) {
            const ws = r.words;
            for (let i = 1; i < ws.length; i++) {
                const m = ws[i].t.match(LV_WORD);
                if (!m) continue;
                const near = ws.slice(0, i).filter((w) => w.x1 <= ws[i].x0 && w.x0 >= ws[i].x0 - 200);
                const key = near.length ? hyperLabel(near) : null;
                if (!key || found.some((x) => x.key === key)) continue;
                let lv = m[1] !== '' ? Number(m[1]) : undefined;
                const next = ws[i + 1];
                if (lv === undefined && next && next.x0 - ws[i].x1 < 20 && /^\d{1,2}$/.test(next.t)) lv = Number(next.t);
                found.push({ key, cy: r.cy, x: ws[i].x0, lv: lv !== undefined && lv <= 15 ? lv : undefined });
                break;
            }
            const p = ws.findIndex((w) => /^POINTS?$/i.test(w.t));
            if (p >= 0 && ws[p + 1] && /^\d{1,4}$/.test(ws[p + 1].t) && point === undefined) point = Number(ws[p + 1].t);
        }
        if (found.length < 5) return null;
        // One window: keep the rows that share the most common "Lv." column.
        const xs = found.map((f) => Math.round(f.x / 8));
        const mode = xs.sort((a, b) => xs.filter((v) => v === b).length - xs.filter((v) => v === a).length)[0];
        const rowsIn = found.filter((f) => Math.abs(f.x / 8 - mode) <= 1.5).sort((a, b) => a.cy - b.cy);
        if (rowsIn.length < 5) return null;
        const gaps = rowsIn.slice(1).map((f, i) => f.cy - rowsIn[i].cy).sort((a, b) => a - b);
        const mid = gaps[Math.floor(gaps.length / 2)];
        const pitch = mid > 10 ? mid : 22;   // 22px a row at 100% UI
        const x = rowsIn.reduce((s, f) => s + f.x, 0) / rowsIn.length;
        return { rows: rowsIn, pitch, x, point };
    }

    function parse(words) {
        const rows = rowsOf(words);
        const window = readWindow(rows);
        const t = readTooltip(rows);
        // The stat's own row in the window, when the tooltip has not covered it.
        return { window, tooltip: t && settle(t, window[t.stat]), hyper: readHyper(rows) };
    }

    // Lines of digits read from the cut-out column → levels, by the nearest row.
    function hyperLevels(h, lines) {
        const levels = {};
        for (const f of h.rows) {
            const ln = lines.filter((l) => Math.abs(l.cy - f.cy) <= h.pitch / 2).sort((a, b) => Math.abs(a.cy - f.cy) - Math.abs(b.cy - f.cy))[0];
            const n = ln && /^\d{1,2}$/.test(ln.t) ? Number(ln.t) : undefined;
            const lv = n !== undefined && n <= 15 ? n : f.lv;
            if (lv !== undefined) levels[f.key] = lv;
        }
        return levels;
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

    // Black text on white, enlarged.
    function prepare(img) {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        const out = ctx.createImageData(img.width, img.height);
        const d = img.data, o = out.data;
        for (let i = 0; i < d.length; i += 4) {
            const v = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) > LIGHT ? 0 : 255;
            o[i] = o[i + 1] = o[i + 2] = v; o[i + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
        const big = document.createElement('canvas');
        big.width = img.width * SCALE; big.height = img.height * SCALE;
        big.getContext('2d').drawImage(c, 0, 0, big.width, big.height);
        return big;
    }

    async function read(img) {
        const w = await getWorker();
        const { data } = await w.recognize(prepare(img), {}, { blocks: true });
        const words = [];
        for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const x of l.words || []) {
            words.push({ t: x.text, x0: x.bbox.x0 / SCALE, y0: x.bbox.y0 / SCALE, x1: x.bbox.x1 / SCALE, y1: x.bbox.y1 / SCALE });
        }
        const res = parse(words);
        if (res.hyper) {
            const h = res.hyper;
            let lines = [];
            try { lines = await readDigits(w, img, h); } catch (e) { console.error(e); }
            res.hyper = { levels: hyperLevels(h, lines), point: h.point };
        }
        return res;
    }

    // The numbers after "Lv." (16〜46px to the right of it at 100% UI), as one column of digits.
    const DIGIT_SCALE = 3;
    async function readDigits(w, img, h) {
        const s = h.pitch / 22;
        const x0 = Math.max(0, Math.round(h.x + 16 * s)), x1 = Math.min(img.width, Math.round(h.x + 46 * s));
        const y0 = Math.max(0, Math.round(h.rows[0].cy - h.pitch / 2)), y1 = Math.min(img.height, Math.round(h.rows[h.rows.length - 1].cy + h.pitch / 2));
        if (x1 <= x0 || y1 <= y0) return [];
        const c = document.createElement('canvas');
        c.width = x1 - x0; c.height = y1 - y0;
        const ctx = c.getContext('2d');
        const out = ctx.createImageData(c.width, c.height);
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
            const i = ((y0 + y) * img.width + x0 + x) * 4, o = (y * c.width + x) * 4;
            const v = (0.3 * img.data[i] + 0.59 * img.data[i + 1] + 0.11 * img.data[i + 2]) > LIGHT ? 0 : 255;
            out.data[o] = out.data[o + 1] = out.data[o + 2] = v; out.data[o + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
        const big = document.createElement('canvas');
        big.width = c.width * DIGIT_SCALE; big.height = c.height * DIGIT_SCALE;
        big.getContext('2d').drawImage(c, 0, 0, big.width, big.height);
        await w.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '0123456789' });
        try {
            const { data } = await w.recognize(big, {}, { blocks: true });
            const lines = [];
            for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
                lines.push({ t: l.text.trim(), cy: y0 + (l.bbox.y0 + l.bbox.y1) / 2 / DIGIT_SCALE });
            }
            return lines;
        } finally {
            await w.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '' });
        }
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

    const api = { parse, rowsOf, numbersOf, hyperLevels, read, pixelsOf, getWorker };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.scouterReader = api;
})(typeof window !== 'undefined' ? window : globalThis);
