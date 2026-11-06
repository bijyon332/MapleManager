/* =========================================================
 *  Party Scouter（簡易PT火力換算）
 *  3人PTで倒したボス1体の討伐時間から、ほかのボスを同じ3人で倒すと約何分かかるかを出す（bi 依頼 2026-11-06）。
 *
 *  考え方は Scouter の「簡易換算」タブ（EXスウのソロタイムから）の3人版:
 *    - ボスカットの率は火力に比例し、率 100% でちょうど制限時間、時間は率に反比例とみる
 *      （Scouter の実測補正と同じ。EXスウ 100% = 30分）。
 *    - 討伐時間 → PT の率 → 3で割って1人あたりの率 → 1人あたりの火力。3人とも同じ火力とみなす。
 *    - その火力で scouter_bosscut.js の表（要求値・easyRate・Lv差・フォース差）を出し、3倍して各ボスの PT の率にする。
 *      推定時間 ＝ 制限時間 ÷ PT の率（＝ 入力した時間 × 入力ボスの率 ÷ そのボスの率）。
 *    - パーティ前提のボス（partyBossCut）の率は人数の数え方が違う（上限3人はソロに 2.7、上限6人は 5.1 要る）ので、
 *      ソロのボスと同じ物差し（ソロの最低ライン 0.9）に直してから比べる。
 *    - Lv・フォースは PT で1組（bi 決定。一番低い人の値を入れる想定）。職業ごとの時間補正とシンボルは入れない。
 *    - 3人で入れないボス（EXスウ＝2人まで、Destiny・Champion＝ソロ）は出さない。
 *  制限時間は GMS v.272（2026-11-11）から主要ボスが20分（HP 2/3）になるので、それ以降は 20分、それまでは 30分で数える。
 *  入力はこのブラウザに保存する（mm-party-scouter）。
 * ========================================================= */

const partyScouter = (() => {
    'use strict';

    const STORE_KEY = 'mm-party-scouter';
    const PARTY = 3;
    const ICON = 'assets/scouter/boss/';
    // 20分化の切り替え（GMS v.272 のメンテ明け、2026-11-12 0:00 JST ごろ）。
    const LIMIT_SWITCH = Date.parse('2026-11-11T15:00:00Z');
    const limitMin = () => (Date.now() >= LIMIT_SWITCH ? 20 : 30);
    // 目安にならないマスは出さない: 1分を切るもの（楽すぎる）と、制限時間の3倍を超えるもの（3人ではまず無理）。
    const HIDE_UNDER_MIN = 1, HIDE_OVER_LIMIT = 3;

    const COLS = [['Easy'], ['Normal'], ['Hard', 'Chaos'], ['Extreme']];
    // 並びは Scouter のボスカット表と同じ（ユピテル〜セレン→スウ→暗黒の魔法使い、ほかは編集画面の順）。
    const ORDER = ['Jupiter', 'Baldrix', 'Bellona', 'Malefic Star', 'Limbo', 'First Adversary', 'Kaling', 'Kalos the Guardian',
        'Chosen Seren', 'Lotus', 'Black Mage'];
    const DIFF_COLOR = { easy: '#9ca3af', normal: '#22d3ee', hard: '#f87171', chaos: '#ca8a04', extreme: '#ef4444' };

    let rootEl = null;
    let state = { boss: 'seren', diff: 'Hard', sec: '', level: '', arcane: '', sacred: '' };

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '').replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))); return Number.isFinite(n) ? n : 0; };
    const fmtTime = (min) => {
        const sec = Math.round(min * 60);
        if (sec >= 100 * 60) return '99:59+';
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    };

    function load() {
        try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); if (s && typeof s === 'object') state = { ...state, ...s }; } catch (e) { /* 読めなければ初期値 */ }
    }
    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても計算はできる */ }
    }

    function bossOf(ko) {
        const list = window.BOSS_MASTER || [];
        const k = ko === '가엔슬' ? '가디언 엔젤 슬라임' : ko;
        return list.find((b) => b.ko && (b.ko === k || b.ko.endsWith(' ' + k))) || null;
    }
    const bossName = (ko) => { const b = bossOf(ko); return b ? (b.short || b.ja) : ko; };
    const rank = (ko) => {
        const order = [...ORDER, ...(window.BOSS_REGISTER_ORDER || []).filter((en) => !ORDER.includes(en))];
        const b = bossOf(ko), i = b ? order.indexOf(b.en) : -1;
        return i < 0 ? 99 : i;
    };
    const DIFF_RANK = { Easy: 0, Normal: 1, Hard: 2, Chaos: 2, Extreme: 3 };

    // 3人で行けるボス・難易度（表の行）。
    function table() {
        const B = typeof scouterBossCut !== 'undefined' ? scouterBossCut : null;
        if (!B) return [];
        return B.GMS_BOSSES.filter((b) => (b.partyLimit || 6) >= PARTY && b.difficulty !== 'Destiny' && b.difficulty !== 'Champion');
    }
    // ボスの選択肢（表の順）と、そのボスの難易度（易しい順）。
    function bossChoices() {
        const by = {};
        for (const b of table()) (by[b.name] = by[b.name] || { name: b.name, ko: b.boss, diffs: [] }).diffs.push(b.difficulty);
        const list = Object.values(by).sort((x, y) => rank(x.ko) - rank(y.ko));
        list.forEach((x) => x.diffs.sort((a, b) => DIFF_RANK[a] - DIFF_RANK[b]));
        return list;
    }

    // パーティ前提のボスの率を、ソロのボスと同じ物差しに直す（ソロに要る率 ÷ ソロの最低ライン 0.9）。
    const soloScale = (row) => (!row.isPartyBoss ? 1 : row.partyLimit === 3 ? 2.7 / 0.9 : 5.1 / 0.9);

    // 計算。返り値 { cells, stat, limit, partyRate } か { error }。
    function compute(s) {
        const B = typeof scouterBossCut !== 'undefined' ? scouterBossCut : null;
        const K = typeof scouterKinoko !== 'undefined' ? scouterKinoko : null;
        if (!B || !K || !K.SPLINE_380) return { error: '計算の準備ができていません。ページを再読み込みしてください。' };
        const level = num(s.level), sec = num(s.sec);
        if (!(level > 0) || !(sec > 0)) return { error: 'empty' };
        const sp3 = K.SPLINE_300, sp8 = K.SPLINE_380;
        const zero = { cridmgeff1: 0, atkeff1: 0, dmgeff1: 0, mainStateff1: 0, atkPereff1: 0 };
        const us = { stat: { level: String(level), arcaneForce: String(num(s.arcane)), authenticForce: String(num(s.sacred)), myClass: '' } };
        // 仮の火力（換算主ステ S0）で1回出す。率は火力に比例するので、あとは倍率を掛けるだけ。
        const S0 = 100000, d3 = B.splineEval(sp3, S0), d8 = B.splineEval(sp8, S0);
        const out = B.computeBossCuts({
            calculatedHexaDamage_300: d3, calculatedHexaDamage_380: d8, calculatedHexaDamage_kaling: d8, calculatedDamage_380: d8,
            spline_300: sp3, spline_380: sp8, specEfficiency: zero, elixir: 3,
            ascent_const: 0, ignoreDefConst_300: 1, ignoreDefConst_380: 1, genePassConst: 1,
        }, us, { table: table() });
        if (out.error) return { error: '計算できませんでした。' };
        const ref = out.rows.find((r) => r.name === s.boss && r.difficulty === s.diff);
        if (!ref) return { error: 'ボスを選んでください。' };
        if (ref.label === '입장 불가능') return { error: `この Lv では ${bossName(ref.boss)} ${ref.difficulty} に入れません。` };
        const base = ref.clearRate / soloScale(ref);
        if (!(base > 0)) return { error: 'フォースが足りず計算できません。' };

        const limit = limitMin();
        const partyRate = limit / (sec / 60);          // PT の率（ソロのボスの物差し）
        const k = partyRate / PARTY / base;            // 1人あたりの火力の倍率（S0 に対して）
        const stat = B.splineInverse(sp8, d8 * k);     // 1人あたりの推定 HEXA換算（防御率 380%）
        const cells = out.rows.map((r) => {
            const rate = PARTY * k * r.clearRate / soloScale(r);
            const isRef = r === ref;
            return {
                ko: r.boss, n: r.name, d: r.difficulty, est: r.estimate, party: r.isPartyBoss, limitN: r.partyLimit,
                lv: r.label === '입장 불가능', rate, t: isRef ? sec / 60 : (rate > 0 ? limit / rate : Infinity), ref: isRef,
            };
        });
        return { cells, stat, limit, partyRate };
    }

    /* ---------- 描画 ---------- */
    function init(id) {
        rootEl = document.getElementById(id);
        load();
        render();
    }
    function render() {
        if (!rootEl) return;
        const choices = bossChoices();
        let cur = choices.find((c) => c.name === state.boss);
        if (!cur && choices.length) { cur = choices[0]; state.boss = cur.name; }
        if (cur && !cur.diffs.includes(state.diff)) state.diff = cur.diffs[cur.diffs.length - 1];
        const field = (label, html) => `<label class="sc-q-f"><span>${label}</span>${html}</label>`;
        const inp = (key, ph = '0') => `<input data-ps="${key}" inputmode="numeric" class="input input-xs w-full font-mono text-right ${num(state[key]) ? 'font-bold' : 'text-base-content/35'}" value="${esc(state[key])}" placeholder="${ph}">`;
        rootEl.innerHTML = `<div class="card card-sm bg-base-100 border border-base-content/10 overflow-hidden"><div class="sc-body sc-resbody">
                <div class="sc-side">
                    <h3><i data-lucide="users"></i>3人PTの討伐タイム</h3>
                    <div class="sc-q-grid">
                        ${field('ボス', `<select data-ps="boss" class="select select-xs w-full">${choices.map((c) => `<option value="${esc(c.name)}" ${c.name === state.boss ? 'selected' : ''}>${esc(bossName(c.ko))}</option>`).join('')}</select>`)}
                        ${field('難易度', `<select data-ps="diff" class="select select-xs w-full">${(cur ? cur.diffs : []).map((d) => `<option value="${d}" ${d === state.diff ? 'selected' : ''}>${d}</option>`).join('')}</select>`)}
                        ${field('討伐時間（秒）', inp('sec', '秒'))}
                        <div class="sc-q-f"><span>&nbsp;</span><b class="ps-mmss" id="ps-mmss">${mmssText()}</b></div>
                    </div>
                    <h3 class="mt-3"><i data-lucide="sliders-horizontal"></i>PT の Lv・フォース<small>一番低い人の値</small></h3>
                    <div class="sc-q-grid">
                        ${field('Lv', inp('level'))}
                        <span></span>
                        ${field('アーケインフォース', inp('arcane'))}
                        ${field('オーセンティックフォース', inp('sacred'))}
                    </div>
                    <div id="ps-sum">${sumHTML()}</div>
                </div>
                <div class="sc-cutpage" id="ps-out">${outHTML()}</div>
            </div></div>`;
        if (window.lucide) lucide.createIcons();
    }
    const mmssText = () => { const sec = num(state.sec); return sec > 0 ? fmtTime(sec / 60) : ''; };
    function sumHTML() {
        const q = compute(state);
        const ok = !q.error;
        return `<div class="sc-q-sum">
                <div title="20分化（GMS v.272）からは主要ボスの制限時間が20分"><span>制限時間</span><b>${limitMin()}分</b></div>
                <div title="討伐時間から逆算した、1人あたりの防御率 380% の HEXA換算の目安（3人とも同じ火力とみなす）"><span>1人あたり推定 HEXA換算</span><b class="sc-q-big">${ok ? Math.round(q.stat).toLocaleString() : '—'}</b></div>
            </div>`;
    }
    function outHTML() {
        const q = compute(state);
        if (q.error) return `<div class="sc-res-empty">${q.error === 'empty' ? 'Lv と討伐時間を入れると出ます。' : esc(q.error)}</div>`;
        const L = q.limit;
        const cls = (c) => (c.lv || c.t > L ? 'c-no' : c.t <= L / 2 ? 'c-solo2' : c.t <= L * 0.75 ? 'c-solo1' : 'c-solo0');
        const by = {};
        for (const c of q.cells) {
            if (!c.ref && !c.lv && (c.t < HIDE_UNDER_MIN || c.t > L * HIDE_OVER_LIMIT)) continue;
            (by[c.ko] = by[c.ko] || []).push(c);
        }
        const count = {};
        for (const cs of Object.values(by)) for (const c of cs) if (!c.lv) count[cls(c)] = (count[cls(c)] || 0) + 1;   // Lv不足は数えない
        const legend = [['c-solo2', `〜${L / 2}分`], ['c-solo1', `〜${L * 0.75}分`], ['c-solo0', `〜${L}分`], ['c-no', '時間切れ']];
        const cell = (c) => {
            if (!c) return '<td class="sc-bc-none"></td>';
            const k = cls(c), over = !c.lv && c.t > L;
            const bar = c.lv ? 0 : Math.max(0, Math.min(100, c.t / L * 100));
            const tip = `${c.d}: 3人で約 ${fmtTime(c.t)}${c.ref ? '（入力したボス）' : ''}${c.party ? `（パーティ前提のボス。最大${c.limitN}人）` : ''}${c.est ? '（GMS の値が無いので推測値）' : ''}`;
            return `<td class="sc-bc ${k} ${c.ref ? 'ps-ref' : ''}" data-ps="pick" data-boss="${esc(c.n)}" data-diff="${esc(c.d)}" title="${esc(c.lv ? `${c.d}: Lv が足りません` : tip)}">
                <div class="sc-bc-in">
                    <span class="sc-bc-ic"><img src="${ICON}${esc(c.d.toLowerCase())}_${esc(c.n)}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">${c.party ? '<i>PT</i>' : ''}${c.est ? '<i class="sc-bc-est">推測</i>' : ''}<small style="color:${DIFF_COLOR[c.d.toLowerCase()] || '#cbd5e1'}">${esc(c.d)}</small></span>
                    <span class="sc-bc-t"><b>${c.lv ? '—' : fmtTime(c.t)}</b>${c.lv ? '<em>Lv不足</em>' : over ? '<em>時間切れ</em>' : c.ref ? '<em>入力</em>' : ''}</span>
                </div>
                <span class="sc-bc-bar"><span style="width:${bar.toFixed(1)}%"></span></span>
            </td>`;
        };
        const body = Object.keys(by).sort((x, y) => rank(x) - rank(y)).map((ko) => `<tr>
                <th><b>${esc(bossName(ko))}</b></th>
                ${COLS.map((ds) => cell(by[ko].find((c) => ds.includes(c.d)))).join('')}
            </tr>`).join('');
        return `<h3 class="sc-bc-h"><i data-lucide="timer"></i>3人PTの推定討伐時間</h3>
            <div class="sc-bc-head"><div class="sc-bc-legend">${legend.map(([c, t]) => `<span class="${c}"><i></i>${t}<b>${count[c] || 0}</b></span>`).join('')}</div></div>
            <table class="sc-bctbl ps-tbl">
                <thead><tr><th></th>${COLS.map((ds) => `<th>${ds.join(' / ')}</th>`).join('')}</tr></thead>
                <tbody>${body}</tbody>
            </table>`;
    }
    // 打っている間は表と左の数字だけ書き換える（入力欄を作り直すとフォーカスが外れる）。
    function refresh() {
        if (!rootEl) return;
        const out = rootEl.querySelector('#ps-out'), sum = rootEl.querySelector('#ps-sum'), mm = rootEl.querySelector('#ps-mmss');
        if (out) out.innerHTML = outHTML();
        if (sum) sum.innerHTML = sumHTML();
        if (mm) mm.textContent = mmssText();
        if (window.lucide) lucide.createIcons();
    }

    function bind() {
        document.addEventListener('input', (ev) => {
            const el = ev.target;
            if (!rootEl || !rootEl.contains(el) || el.tagName !== 'INPUT') return;
            const key = el.dataset.ps;
            if (!['sec', 'level', 'arcane', 'sacred'].includes(key)) return;
            state[key] = el.value.trim();
            el.classList.toggle('font-bold', num(state[key]) > 0);
            el.classList.toggle('text-base-content/35', !(num(state[key]) > 0));
            save();
            refresh();
        });
        document.addEventListener('change', (ev) => {
            const el = ev.target;
            if (!rootEl || !rootEl.contains(el) || el.tagName !== 'SELECT') return;
            if (el.dataset.ps === 'boss') state.boss = el.value;
            else if (el.dataset.ps === 'diff') state.diff = el.value;
            else return;
            save();
            render();
        });
        // 表のマスを押すと、そのボスを入力のボスにする。時間はそのマスの推定時間を入れるので、表はそのまま（実測に直して使う）。
        document.addEventListener('click', (ev) => {
            const td = ev.target.closest && ev.target.closest('[data-ps="pick"]');
            if (!td || !rootEl || !rootEl.contains(td)) return;
            const q = compute(state);
            const c = !q.error && q.cells.find((x) => x.n === td.dataset.boss && x.d === td.dataset.diff);
            if (!c || c.lv || c.ref) return;
            state.boss = c.n;
            state.diff = c.d;
            state.sec = String(Math.round(c.t * 60));
            save();
            render();
        });
    }
    bind();

    return { init, render, compute };
})();
