/* =========================================================
 *  Quanah Tools の「6次進捗」タブ（2026-11-24 bi 依頼）
 *  ダッシュボードの登録キャラ1つを選び、6次（HEXA）スキルの Lv を日付ごとに記録して、
 *  記録のペースから開始日〜終了日の推移を予測する。
 *
 *  - キャラの選択は上部ヘッダー（#quanah-hexa-head、このタブのときだけ出す）。
 *  - 記録はダッシュボードのキャラの HEXA Tracker のデータ（hexaTracker.data['char:<id>']）に入れる（bi 指定）。
 *      history: [{ date: 'YYYY-MM-DD', levels: { skillKey: Lv } }]  同じ日付は1件にまとめる（上書き）
 *      histOpt: { start, end, pace }  予測の設定
 *    一番新しい記録の Lv は HEXA Tracker の「今の Lv」（levels）にも書く。記録を直す・消すと、
 *    その時点で一番新しい記録の Lv に合わせ直す。入力欄は HEXA Tracker の今の Lv から始まる。
 *    職業の結び付け（classId）、進捗から外したノード、ソルヤヌスの集計、目標、討伐時間・CT の補正も
 *    HEXA Tracker と共通。
 *  - 盤面・コスト・最終ダメージ・強化順は HEXA Tracker（hexa_tracker.js）の計算をそのまま使う。
 *    3rd Skill Core（GMS 未実装）は入力・集計に出さない。
 *  - 予測: 「1日あたりの欠片」を直近7日間の平均（記録のない日は前後の記録を直線で結んで補完）で出し（bi 指定。手入力の欄は作らない、bi 指定）、
 *    開始日以前の最新の記録からそのペースで欠片が増えるとして終了日まで伸ばす。開始日は最初の記録より前にもでき、
 *    その間はペースから逆算する。記録が1日分しかないときは、最初の記録より前の開始日を欠片0の点として足す（bi 決定）。
 *    増えた欠片は HEXA Tracker の強化順マップと同じ順（並び・上限・討伐時間の補正も同じ設定）で振ったとして、
 *    どのスキルがいつ何 Lv になるかを出す（振り順）。開始日を過去にすると、その後の記録と予測を見比べられる。
 *    強化順マップそのもの（効率順／マス／タイムライン）は HEXA Tracker の画面をこの上に開いて見る。
 *  - このタブだけの保存はヘッダーで選んだキャラ（localStorage mm-quanah-hexa の sel）。
 * ========================================================= */

const quanahHexa = (() => {
    'use strict';

    const LS = 'mm-quanah-hexa';
    const DEFAULT_END = '2027-02-09';
    const PACE_DAYS = 7;   // ペースを出す期間（直近1週間、bi 指定）
    const DEPS = ['hexa_data.js', 'hexa_lethe.js', 'hexa_third.js', 'hexa_tracker.js'];
    const CHART_SRC = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';

    let store = null;
    let root = null;
    let chart = null;
    let loading = null;
    // 入力欄の状態（保存はしない）。editing = 編集中の記録の日付（新規は null）
    let draft = null;     // { charId, date, levels, editing }
    let delAsk = null;    // 削除の確認中の日付
    let msg = null;       // { text, ok }

    /* ---------- 日付 ---------- */
    const pad = (n) => String(n).padStart(2, '0');
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const okDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const dayNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
    const fromDay = (n) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
    const WD = ['日', '月', '火', '水', '木', '金', '土'];
    const short = (s) => { const [, m, d] = s.split('-').map(Number); return `${m}/${d}`; };
    const withWd = (s) => `${short(s)}（${WD[new Date(dayNum(s) * 86400000).getUTCDay()]}）`;
    const fmt = (n) => Math.round(n).toLocaleString();
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ---------- 保存 ---------- */
    function load() {
        if (store) return store;
        let s = null;
        try { s = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { s = null; }
        store = s && typeof s === 'object' ? s : {};
        return store;
    }
    function save() { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) { setMsg('保存できませんでした', false); } }
    function setMsg(text, ok = true) { msg = { text, ok }; }

    function chars() { return (window.app && window.app.data && window.app.data.characters) || []; }
    function selChar() {
        const list = chars();
        if (!list.length) return null;
        return list.find((c) => String(c.id) === String(load().sel)) || list[0];
    }
    // HEXA Tracker のキャラのデータ。records は history の並べ直したもの、opt は予測の設定
    function entry(charId) {
        const tid = 'char:' + charId;
        // まだ HEXA Tracker に無いキャラは、保存するまでデータを作らない
        const t = H().data[tid] ? H().ensureEntry(tid) : { levels: {}, targets: {}, excluded: {}, _new: true };
        const records = (Array.isArray(t.history) ? t.history : []).filter((r) => r && okDate(r.date) && r.levels)
            .sort((a, b) => a.date.localeCompare(b.date));
        return { tid, t, records, opt: t.histOpt || {} };
    }
    function attach(e) { if (e.t._new) { delete e.t._new; H().data[e.tid] = e.t; } }
    function saveEntry(e) {
        attach(e);
        if (e.records.length) e.t.history = e.records; else delete e.t.history;
        const o = {}; ['start', 'end'].forEach((k) => { if (e.opt[k] != null && e.opt[k] !== '') o[k] = e.opt[k]; });
        if (Object.keys(o).length) e.t.histOpt = o; else delete e.t.histOpt;
        H().saveData();
    }
    // 一番新しい記録の Lv を HEXA Tracker の今の Lv にする（目標が下回ったら引き上げる）
    function syncLevels(e, skills) {
        const last = e.records[e.records.length - 1];
        if (!last) return;
        skills.forEach((s) => {
            const lv = lvOf(last.levels, s);
            e.t.levels[s.key] = lv;
            if (typeof e.t.targets[s.key] === 'number' && e.t.targets[s.key] < lv) e.t.targets[s.key] = lv;
        });
    }

    /* ---------- HEXA の計算（hexa_tracker.js を使う） ---------- */
    const H = () => (typeof hexaTracker !== 'undefined' ? hexaTracker : null);
    function classIdOf(char) {
        const t = H().data['char:' + char.id];
        if (t && t.classId && H().getClassSkills(t.classId)) return t.classId;
        return H().resolveClassId(char.job);
    }
    // 入力に出すノード（3rd Skill Core は GMS 未実装なので出さない）
    function boardSkills(classId) {
        const cls = H().getClassSkills(classId);
        return cls ? H().boardOrder(cls.skills.filter((s) => s.type !== 'third')) : [];
    }
    // 集計に入るか（HEXA Tracker と同じ: 進捗から外したノードは入れない、ソルヤヌスはチェックがオンのときだけ）
    let curTid = null;
    const counts = (s) => !H().isExcluded(curTid, s) && (H().countsForDamage(s) || H().janusIn(curTid, s));
    const dmg = (s) => !H().isExcluded(curTid, s) && H().countsForDamage(s);
    function lvOf(levels, s) { return Math.max(H().minLevel(s), Math.min(30, Number((levels || {})[s.key]) || 0)); }
    function fullLevels(levels, skills) { const o = {}; skills.forEach((s) => { o[s.key] = lvOf(levels, s); }); return o; }
    function stats(levels, skills) {
        const out = { frag: 0, erda: 0, fd: 0, fragMax: 0, fdMax: 0 };
        for (const s of skills) {
            if (!counts(s)) continue;
            const lv = lvOf(levels, s);
            out.frag += H().fragAt(s, lv); out.erda += H().erdaAt(s, lv); out.fragMax += H().fragAt(s, 30);
            if (dmg(s)) { out.fd += H().fdAt(s, lv); out.fdMax += H().fdAt(s, 30); }
        }
        out.pct = out.fragMax > 0 ? out.frag / out.fragMax * 100 : 0;
        return out;
    }

    // 記録の Lv から、強化順マップと同じ順（並び・上限・討伐時間の補正も HEXA Tracker の設定どおり）に1 Lv ずつ並べる
    function chain(classId, skills, levels) {
        const ds = skills.filter(dmg);
        const from = {}, to = {};
        ds.forEach((s) => {
            from[s.key] = lvOf(levels, s);
            to[s.key] = H().planCap === 'max' ? 30 : Math.max(from[s.key], H().targetOf(curTid, s));
        });
        if (H().isProvisional(classId)) {
            const steps = H().fixedSteps(H().getClassSkills(classId).order, ds, from, to);
            const out = [];
            steps.forEach((st) => { for (let n = st.from + 1; n <= st.to; n++) out.push({ skill: st.skill, from: n - 1, frag: H().fragAt(st.skill, n) - H().fragAt(st.skill, n - 1), erda: H().erdaAt(st.skill, n) - H().erdaAt(st.skill, n - 1), fd: 0 }); });
            return out;
        }
        return H().planSingles(ds, from, to, H().prioritySort === 'erda', H().fightMults(curTid, classId));
    }

    // 日付なしの振り順（予測が出せないとき用）。同じスキルの続きは1行に
    function orderFrom(classId, skills, levels) {
        const out = [];
        for (const st of chain(classId, skills, levels)) {
            const last = out[out.length - 1];
            if (last && last.skill.key === st.skill.key && last.to === st.from) { last.to++; continue; }
            out.push({ skill: st.skill, from: st.from, to: st.from + 1 });
        }
        return out;
    }

    /* ---------- 予測 ---------- */
    function forecast(e, classId, skills) {
        const recs = e.records.map((r) => ({ date: r.date, levels: r.levels, st: stats(r.levels, skills) }));
        if (!recs.length) return { recs, ok: false, why: '記録がまだありません。記録が2件以上（日付違い）になると予測を出します。', order: orderFrom(classId, skills, e.t.levels) };
        const end = okDate(e.opt.end) ? e.opt.end : DEFAULT_END;
        const start = okDate(e.opt.start) ? e.opt.start : recs[recs.length - 1].date;
        // 開始日が最初の記録より前なら、開始日を欠片0の点（6次を始めた日など）とみなし、全部の記録を使う（bi 決定）。
        // 起点 = 開始日以前で一番新しい記録（欠片0とみなすときは一番新しい記録）
        const zeroStart = start < recs[0].date;
        const base = zeroStart ? recs : recs.filter((r) => r.date <= start);
        const anchor = base[base.length - 1];
        const daysOf = (rs) => new Set(rs.map((r) => r.date)).size;
        // ペース: 直近7日間の平均（bi 指定）。記録が飛んでいる日は前後の記録（と開始日の欠片0）を直線で結んで埋め、
        // (起点の欠片 − 7日前の欠片) ÷ 7 で出す。7日前が最初の点より前なら、最初の点からの平均にする。
        let pts = base.map((r) => ({ n: dayNum(r.date), f: r.st.frag }));
        if (zeroStart) pts = [{ n: dayNum(start), f: 0 }, ...pts];
        // 埋めた値（直線補間）
        const fillAt = (n) => {
            if (n <= pts[0].n) return pts[0].f;
            for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i];
                if (n <= b.n) return b.n === a.n ? b.f : a.f + (b.f - a.f) * (n - a.n) / (b.n - a.n);
            }
            return pts[pts.length - 1].f;
        };
        let auto = null, paceFromN = null, paceToN = null;
        if (pts[pts.length - 1].n > pts[0].n) {
            paceToN = pts[pts.length - 1].n;
            paceFromN = Math.max(pts[0].n, paceToN - PACE_DAYS);
            auto = (fillAt(paceToN) - fillAt(paceFromN)) / (paceToN - paceFromN);
        }
        const pace = auto;
        const out = { recs, start, end, anchor, pace, paceFrom: paceFromN != null ? fromDay(paceFromN) : null, paceTo: paceToN != null ? fromDay(paceToN) : null, paceDays: paceToN != null ? paceToN - paceFromN : 0, zeroStart, fillAt, fragMax: anchor.st.fragMax, order: orderFrom(classId, skills, anchor.levels) };
        if (end <= start) return { ...out, ok: false, why: '終了日を開始日より後にしてください。' };
        if (zeroStart && end <= anchor.date) return { ...out, ok: false, why: `終了日を一番新しい記録（${short(anchor.date)}）より後にしてください。` };
        if (pace == null) return { ...out, ok: false, why: daysOf(recs) < 2 ? '日付の違う記録が2件以上あるか、開始日を最初の記録より前（6次を始めた日など、欠片0とみなします）にするとペースを出して予測します。' : `開始日（${short(start)}）までに日付の違う記録が2件ないため、ペースを出せません。開始日を後ろにするか、最初の記録より前（欠片0とみなします）にしてください。` };
        if (!(pace > 0)) return { ...out, ok: false, why: `${short(fromDay(paceFromN))}〜${short(fromDay(paceToN))} の間に欠片が増えていないため、予測できません。` };

        // 強化順に振ったとき、各段が何日目に届くか
        const singles = chain(classId, skills, anchor.levels);
        const a0 = dayNum(anchor.date), endN = dayNum(end), startN = dayNum(start);
        let cum = 0;
        const levels = fullLevels(anchor.levels, skills);
        const atStart = { ...levels };
        const steps = [];
        for (const st of singles) {
            cum += st.frag;
            const d = a0 + Math.ceil(cum / pace - 1e-9);
            if (d > endN) break;
            levels[st.skill.key] = st.from + 1;
            if (d <= startN) atStart[st.skill.key] = st.from + 1;
            const last = steps[steps.length - 1];
            if (last && last.skill.key === st.skill.key && last.to === st.from && last.day === d) { last.to++; continue; }
            // 同じスキルの続きは、届いた日が違っても1行にまとめ、最後の日を出す
            if (last && last.skill.key === st.skill.key && last.to === st.from && (last.day > startN) === (d > startN)) { last.to++; last.day = d; continue; }
            steps.push({ skill: st.skill, from: st.from, to: st.from + 1, day: d });
        }
        // 起点より前（開始日を欠片0とみなしたとき）は記録を直線で結んだ値、起点から後はペースで進めた値
        const fragAt = (n) => n < a0 ? fillAt(n) : Math.min(anchor.st.fragMax, anchor.st.frag + pace * (n - a0));
        let stStart = stats(atStart, skills);
        if (zeroStart) stStart = { ...stStart, frag: 0, pct: 0, fd: null };
        // 完了予定日: 強化順マップの上限（目標値まで／Lv30 まで）まで振り終わる日。終了日より後でも出す
        const chainFrag = singles.reduce((a, st) => a + st.frag, 0);
        const finishDay = singles.length ? a0 + Math.ceil(chainFrag / pace - 1e-9) : null;
        return { ...out, ok: true, steps, finishDay, finishCap: H().planCap === 'max' ? '全スキル Lv30' : '目標値', levelsEnd: levels, levelsStart: atStart, stStart, stEnd: stats(levels, skills), fragAt, startN, endN, a0 };
    }

    /* ---------- 画面 ---------- */
    const ready = () => !!(H() && typeof HEXA_CLASS_SKILLS !== 'undefined');
    function ensureDeps() {
        if (ready()) return Promise.resolve();
        if (loading) return loading;
        const ld = (src) => (window.app && app.loadScript ? app.loadScript(src) : Promise.reject(new Error('no loader')));
        loading = (async () => {
            if (!window.Chart) await ld(CHART_SRC).catch(() => {});
            for (const src of DEPS) await ld(src);
            if (H()) H().ensureLoaded();
        })();
        loading.catch(() => { loading = null; });
        return loading;
    }

    function mount(el) {
        root = el || root;
        if (!root) return;
        syncHead(true);
        if (!ready()) {
            root.innerHTML = '<div class="lg-root"><p class="lg-empty p-4">読み込み中…</p></div>';
            ensureDeps().then(() => { if (root && root.isConnected && active) mount(); })
                .catch(() => { root.innerHTML = '<div class="lg-root"><p class="lg-empty p-4 text-error">HEXA のデータを読み込めませんでした。開き直してください。</p></div>'; });
            return;
        }
        root.innerHTML = `<div class="lg-root">${html()}</div>`;
        if (window.lucide) lucide.createIcons();
        drawChart();
    }
    let active = false;
    function setActive(on) { active = on; if (!on) { syncHead(false); if (chart) { chart.destroy(); chart = null; } } }
    function refresh() { if (active) mount(); }
    // 日付欄は打っている途中でも change が来るので、少し待ってから描き直し、同じ欄にフォーカスを戻す
    let soonTimer = null;
    function refreshSoon(key) {
        clearTimeout(soonTimer);
        soonTimer = setTimeout(() => {
            refresh();
            const el = root && root.querySelector(`input[data-qh="${key}"]`); if (el) el.focus();
        }, 700);
    }

    // ヘッダーのキャラ選択
    function syncHead(show) {
        const head = document.getElementById('quanah-hexa-head');
        if (!head) return;
        head.classList.toggle('hidden', !show);
        head.classList.toggle('flex', !!show);
        if (!show) return;
        const sel = head.querySelector('select'); if (!sel) return;
        const list = chars(), cur = selChar();
        const groups = {};
        list.forEach((c) => { const k = c.server === 'CHALLENGER' ? 'Challenger' : 'Kronos'; (groups[k] = groups[k] || []).push(c); });
        sel.innerHTML = list.length
            ? Object.entries(groups).map(([g, cs]) => `<optgroup label="${g}">${cs.map((c) => `<option value="${esc(c.id)}" ${cur && String(c.id) === String(cur.id) ? 'selected' : ''}>${esc(c.name)}${c.level ? `（Lv ${esc(c.level)}${c.job ? ` ${esc(c.job)}` : ''}）` : ''}</option>`).join('')}</optgroup>`).join('')
            : '<option value="">キャラが登録されていません</option>';
        sel.disabled = !list.length;
        const img = head.querySelector('img');
        if (img) { const src = cur ? (cur.classImage || '') : ''; img.src = src; img.classList.toggle('hidden', !src); }
    }
    function pickChar(id) { load().sel = id; save(); draft = null; delAsk = null; msg = null; refresh(); }

    function draftFor(char, e, skills) {
        if (draft && draft.charId === String(char.id)) return draft;
        // 一番新しい記録が今日のものなら、それを直す形で開く
        const td = today(), last = e.records[e.records.length - 1], rec = last && last.date === td ? last : null;
        // （auto: 自分で「編集」を押したのではないので、日付を変えたら新しい記録として扱う）
        // Lv は HEXA Tracker の今の Lv（HEXA Tracker 側で上げた分もそのまま入る）
        draft = rec ? { charId: String(char.id), date: td, levels: fullLevels(e.t.levels, skills), editing: td, auto: true }
            : { charId: String(char.id), date: td, levels: fullLevels(e.t.levels, skills), editing: null };
        return draft;
    }
    // 入力中の日付より前で一番新しい記録（増えた Lv の表示用）
    function prevRecord(e, date, skip) { const r = e.records.filter((x) => x.date < date && x.date !== skip); return r[r.length - 1] || null; }

    function html() {
        const char = selChar();
        if (!char) return `<div class="card card-sm bg-base-100 border border-base-content/10"><div class="card-body"><p class="lg-empty">ダッシュボード（Character Manager）にキャラを登録すると、ここで6次スキルの進捗を記録できます。</p></div></div>`;
        const e = entry(String(char.id));
        curTid = e.tid;
        const classId = classIdOf(char);
        const head = classPicker(char, e, classId);
        if (!classId) return `<div class="card card-sm bg-base-100 border border-base-content/10"><div class="card-body gap-2">${head}<p class="lg-empty">このキャラの職業を HEXA の職業に結び付けられませんでした。上で職業を選んでください。</p></div></div>`;
        const skills = boardSkills(classId);
        const d = draftFor(char, e, skills);
        const fc = forecast(e, classId, skills);
        const msgHTML = msg ? `<div class="text-[12px] font-bold ${msg.ok ? 'text-success' : 'text-error'}">${esc(msg.text)}</div>` : '';
        return `<div class="qh-grid">
            <div class="flex flex-col gap-3 min-w-0">
                ${formHTML(char, e, classId, skills, d, head, msgHTML)}
                ${listHTML(e, fc, skills)}
            </div>
            <div class="qh-side flex flex-col gap-3 min-w-0">${forecastHTML(e, fc, skills, classId)}</div>
        </div>`;
    }

    function classPicker(char, e, classId) {
        const info = classId ? H().getClassInfo(classId) : null;
        let opts = '';
        for (const [gid, list] of Object.entries(window.CLASS_DATA || {})) {
            const hs = list.filter((c) => H().getClassSkills(c.id));
            if (!hs.length) continue;
            opts += `<optgroup label="${esc(H().GROUP_LABELS[gid] || gid)}">${hs.map((c) => `<option value="${esc(c.id)}" ${c.id === classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`;
        }
        return `<div class="flex items-center gap-2 min-w-0">
            ${info && info.path ? `<img src="${esc(info.path)}" class="w-6 h-6 object-contain shrink-0" alt="">` : ''}
            <select class="select select-xs w-44" data-qh="class" title="HEXA の職業（ダッシュボードの職業から自動で選びます）">${classId ? '' : '<option value="">職業を選ぶ</option>'}${opts}</select>
        </div>`;
    }

    function formHTML(char, e, classId, skills, d, head, msgHTML) {
        const prev = prevRecord(e, d.date, d.editing);
        const exists = e.records.some((r) => r.date === d.date && r.date !== d.editing);
        const st = stats(d.levels, skills);
        const tiers = H().TIERS.map((t) => {
            const ss = skills.filter((s) => s.tier === t.id);
            if (!ss.length) return '';
            return `<div class="lg-inset qh-tier"><div class="text-[11px] font-black tracking-wider uppercase mb-1" style="color:${t.color}">${t.label}</div>
                <ul class="flex flex-col">${ss.map((s) => {
                    const lv = lvOf(d.levels, s), pv = prev ? lvOf(prev.levels, s) : null;
                    const up = pv != null && lv > pv ? `<span class="qh-up">+${lv - pv}</span>` : pv != null && lv < pv ? `<span class="qh-down">${lv - pv}</span>` : '<span class="qh-up qh-zero">+0</span>';
                    const icon = H().getSkillIcon(s);
                    // ソルヤヌスは右端のチェックで欠片・HEXA% の集計に入れる（HEXA Tracker の進捗入力と同じチェック）
                    const janus = H().isJanus(s), on = counts(s);
                    const box = janus ? `<input type="checkbox" class="checkbox checkbox-xs" data-qh="janus" data-key="${esc(s.key)}" ${on ? 'checked' : ''}
                        title="${on ? '欠片・HEXA% の集計から外す' : '欠片・HEXA% の集計に入れる（最終ダメージと振り順には入れません）'}" aria-label="${esc(s.name)} を集計に入れる">` : '<span></span>';
                    const hint = on ? (janus ? '\n欠片・HEXA% の集計に入れています（最終ダメージと振り順には入れません）' : '')
                        : janus ? '\n右のチェックをオンにすると、欠片・HEXA% の集計に入れます（HEXA Tracker と共通）' : '\n最終ダメージがないため、欠片・HEXA% の集計には入れていません';
                    return `<li class="qh-row ${on ? '' : 'opacity-60'}" title="${esc(s.name)}${hint}">
                        ${icon ? `<img src="${esc(icon)}" class="w-6 h-6 object-contain" loading="lazy" alt="">` : '<span class="w-6 h-6"></span>'}
                        <span class="truncate text-[13px]">${esc(s.name)}</span>
                        ${up}
                        <select class="select select-xs w-16 font-mono" data-qh="lv" data-key="${esc(s.key)}">${levelOpts(H().minLevel(s), lv)}</select>
                        ${box}
                    </li>`;
                }).join('')}</ul></div>`;
        }).join('');
        const title = d.auto ? `今日 ${withWd(d.editing)} の記録を更新` : d.editing ? `<span class="text-warning">${withWd(d.editing)} の記録を編集中</span>` : '記録を追加';
        return `<div class="card card-sm bg-base-100 border border-base-content/10 overflow-hidden">
            <div class="lg-equip-head"><span>RECORD <span class="text-base-content/55 font-bold ml-1">${title}</span></span>${head}</div>
            <div class="p-3 flex flex-col gap-3">
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label class="flex items-center gap-2 text-[12px] font-bold text-base-content/70">日付
                        <input type="date" class="input input-sm w-40 font-mono" data-qh="date" value="${esc(d.date)}"></label>
                    <div class="flex items-baseline gap-4 font-mono">
                        <span class="lg-k">欠片 <b class="text-[18px] text-violet-300">${fmt(st.frag)}</b></span>
                        <span class="lg-k">HEXA <b class="text-[18px] text-white">${st.pct.toFixed(1)}%</b></span>
                        ${H().isProvisional(classId) ? '' : `<span class="lg-k">最終ダメージ <b class="text-[18px] text-emerald-300">+${st.fd.toFixed(1)}%</b></span>`}
                    </div>
                    <div class="ml-auto flex items-center gap-2">
                        ${d.editing && !d.auto ? '<button type="button" class="btn btn-sm btn-ghost" data-qh="cancel">やめる</button>' : ''}
                        <button type="button" class="btn btn-sm btn-primary" data-qh="save"><i data-lucide="${d.editing ? 'save' : 'plus'}" class="w-4 h-4"></i>${d.editing ? '保存する' : '記録する'}</button>
                    </div>
                </div>
                ${exists ? `<div class="text-[12px] text-warning">${withWd(d.date)} の記録がすでにあります。${d.editing ? '保存' : '記録'}するとその記録を置き換えます。</div>` : ''}
                ${msgHTML}
                <div class="qh-tiers">${tiers}</div>
                <div class="text-[11px] text-base-content/45">${prev ? `+数字は ${withWd(prev.date)} の記録から増えた Lv です。` : '最初の記録です。'}${d.editing && !d.auto ? '' : d.auto ? '日付を変えると新しい記録になります。一番新しい記録の Lv は HEXA Tracker の Lv にも入ります。' : '入力欄は HEXA Tracker の今の Lv から始まり、記録すると HEXA Tracker の Lv も更新します。'}</div>
            </div>
        </div>`;
    }
    function levelOpts(from, sel) { let h = ''; for (let v = from; v <= 30; v++) h += `<option value="${v}" ${v === sel ? 'selected' : ''}>${v}</option>`; return h; }

    function listHTML(e, fc, skills) {
        const recs = fc.recs.slice().reverse();
        const rows = recs.map((r, i) => {
            const older = recs[i + 1];
            const gap = older ? dayNum(r.date) - dayNum(older.date) : 0;
            const df = older ? r.st.frag - older.st.frag : 0;
            const ups = older ? skills.filter((s) => lvOf(r.levels, s) !== lvOf(older.levels, s)).map((s) => `${esc(s.name)} ${lvOf(older.levels, s)}→${lvOf(r.levels, s)}`).join('\n') : '';
            const editing = draft && !draft.auto && draft.editing === r.date;
            const ask = delAsk === r.date;
            return `<tr class="${editing ? 'qh-editing' : ''}">
                <td class="font-mono whitespace-nowrap">${withWd(r.date)}</td>
                <td class="text-right font-mono text-violet-300 font-bold">${fmt(r.st.frag)}</td>
                <td class="text-right font-mono">${r.st.pct.toFixed(1)}%</td>
                <td class="text-right font-mono text-emerald-300">${r.st.fdMax > 0 ? `+${r.st.fd.toFixed(1)}%` : '—'}</td>
                <td class="text-right font-mono text-base-content/70" ${ups ? `title="${ups}"` : ''}>${older ? `+${fmt(df)} <span class="text-base-content/40">/ ${gap}日</span>` : '<span class="text-base-content/35">—</span>'}</td>
                <td class="text-right font-mono text-base-content/70">${older && gap > 0 ? fmt(df / gap) : '<span class="text-base-content/35">—</span>'}</td>
                <td class="text-right whitespace-nowrap">${ask
                    ? `<span class="text-[11px] text-error mr-1">消しますか？</span><button type="button" class="btn btn-xs btn-error" data-qh="del-yes" data-date="${r.date}">削除</button><button type="button" class="btn btn-xs btn-ghost" data-qh="del-no">やめる</button>`
                    : `<button type="button" class="btn btn-xs btn-ghost" data-qh="edit" data-date="${r.date}"><i data-lucide="pencil" class="w-3 h-3"></i>編集</button><button type="button" class="btn btn-xs btn-ghost text-error/80" data-qh="del" data-date="${r.date}" aria-label="${short(r.date)} の記録を削除"><i data-lucide="trash-2" class="w-3 h-3"></i></button>`}</td>
            </tr>`;
        }).join('');
        return `<div class="card card-sm bg-base-100 border border-base-content/10 overflow-hidden">
            <div class="lg-equip-head"><span>HISTORY <span class="text-base-content/55 font-bold ml-1">記録一覧</span></span>
                <span class="flex items-center gap-1">
                    <span class="badge badge-sm font-mono mr-1">${fc.recs.length} 件</span>
                    <button type="button" class="btn btn-xs btn-ghost" data-qh="export" ${fc.recs.length ? '' : 'disabled'}><i data-lucide="download" class="w-3 h-3"></i>JSON 保存</button>
                    <label class="btn btn-xs btn-ghost"><i data-lucide="upload" class="w-3 h-3"></i>読み込み<input type="file" accept="application/json,.json" class="hidden" data-qh="import"></label>
                </span></div>
            ${fc.recs.length ? `<div class="overflow-x-auto"><table class="table table-sm qh-table">
                <thead><tr><th>日付</th><th class="text-right">欠片</th><th class="text-right">HEXA</th><th class="text-right">最終ダメージ</th><th class="text-right">前回から</th><th class="text-right">欠片/日</th><th></th></tr></thead>
                <tbody>${rows}</tbody></table></div>` : '<p class="lg-empty p-3">まだ記録がありません。上で Lv を入れて「記録する」を押してください。</p>'}
        </div>`;
    }

    function forecastHTML(e, fc, skills, classId) {
        const startVal = fc.start || (okDate(e.opt.start) ? e.opt.start : today());
        const endVal = fc.end || (okDate(e.opt.end) ? e.opt.end : DEFAULT_END);
        const settings = `<div class="grid grid-cols-2 gap-2">
                <label class="flex flex-col gap-1"><span class="lg-k">開始日</span>
                    <input type="date" class="input input-sm font-mono w-full" data-qh="start" value="${esc(startVal)}"></label>
                <label class="flex flex-col gap-1"><span class="lg-k">終了日</span>
                    <input type="date" class="input input-sm font-mono w-full" data-qh="end" value="${esc(endVal)}"></label>
            </div>
            <div class="flex items-center gap-2 flex-wrap text-[11px] text-base-content/50">
                ${okDate(e.opt.start) ? '<button type="button" class="btn btn-xs btn-ghost px-1.5" data-qh="start-auto">開始日を最新の記録に戻す</button>' : '<span>開始日は最新の記録の日です</span>'}
            </div>
`;
        let body;
        const orderRows = (list) => list.map((st, i) => `<li class="qh-step">
                    <span class="font-mono text-[11px] text-base-content/40 w-6 text-right shrink-0">${i + 1}</span>
                    ${H().getSkillIcon(st.skill) ? `<img src="${esc(H().getSkillIcon(st.skill))}" class="w-5 h-5 object-contain shrink-0" loading="lazy" alt="">` : ''}
                    <span class="truncate text-[12px]">${esc(st.skill.name)}</span>
                    <span class="ml-auto font-mono text-[12px] whitespace-nowrap">${st.from} → <b class="text-white">${st.to}</b></span>
                </li>`).join('');
        const orderHead = (note) => `<div class="lg-h"><i data-lucide="list-ordered"></i>振り順<span class="text-[11px] font-normal text-base-content/45">${note}</span></div>`;
        if (!fc.ok) body = `<p class="lg-empty">${esc(fc.why)}</p>
                <div>${orderHead('HEXA Tracker の強化順マップと同じ順')}
                    ${fc.order && fc.order.length ? `<ul class="qh-steps custom-scrollbar">${orderRows(fc.order)}</ul>` : '<p class="lg-empty">上げられるスキルはありません。</p>'}</div>`;
        else {
            const noFd = H().isProvisional(classId);
            const s0 = fc.stStart, s1 = fc.stEnd;
            const cell = (label, a, b, cls) => `<div class="lg-stat"><span>${label}</span><b class="${cls}">${b}</b><small>${a} から</small></div>`;
            // 完了予定日（強化順マップの上限まで振り終わる日）
            const fy = fc.finishDay != null ? fromDay(fc.finishDay) : null;
            const capNote = `<div class="qh-finish ${fy && fc.finishDay <= fc.endN ? 'qh-finish-in' : ''}" title="今のペースのまま、強化順マップの上限（${fc.finishCap}、HEXA Tracker の「上限」の設定）まで振り終わる日">
                <span class="lg-k">完了予定日（${fc.finishCap}まで）</span>
                ${fy ? `<b>${fy.slice(0, 4)}/${withWd(fy)}</b><span class="text-[11px] text-base-content/50">${fc.finishDay <= fc.endN ? '終了日までに届く見込み' : `終了日の ${fc.finishDay - fc.endN} 日後`}</span>`
                    : '<b class="text-success">完了済み</b>'}
            </div>`;
            const daysN = fc.endN - fc.startN;
            let prevLabel = null;
            const stepRows = fc.steps.map((st) => {
                const before = st.day <= fc.startN;
                const icon = H().getSkillIcon(st.skill);
                // 日付は変わった行にだけ出す
                const label = before ? '開始日まで' : withWd(fromDay(st.day));
                const show = label !== prevLabel; prevLabel = label;
                return `<li class="qh-step ${before ? 'opacity-50' : ''} ${show ? 'qh-newday' : ''}">
                    <span class="qh-day">${show ? label : ''}</span>
                    ${icon ? `<img src="${esc(icon)}" class="w-5 h-5 object-contain shrink-0" loading="lazy" alt="">` : ''}
                    <span class="truncate text-[12px]">${esc(st.skill.name)}</span>
                    <span class="ml-auto font-mono text-[12px] whitespace-nowrap">${st.from} → <b class="text-white">${st.to}</b></span>
                </li>`;
            }).join('');
            body = `<div class="text-[11px] text-base-content/55">${withWd(fc.anchor.date)} の記録から <b class="text-white">${fmt(fc.pace)}</b> 欠片/日 で進んだ場合（${short(fc.paceFrom)}〜${short(fc.paceTo)} の${fc.paceDays}日間の平均、記録のない日は前後の記録から補完${fc.zeroStart ? `。開始日 ${short(fc.start)} は欠片0として、最初の記録まで日割りで埋めています` : ''}）。${withWd(fc.start)}〜${withWd(fc.end)}（${daysN}日）で <b class="text-violet-300">+${fmt(s1.frag - s0.frag)}</b> 欠片。</div>
                <div class="grid ${noFd ? 'grid-cols-2' : 'grid-cols-3'} gap-2">
                    ${cell(`欠片（${short(fc.end)}）`, fmt(s0.frag), fmt(s1.frag), 'text-violet-300')}
                    ${cell(`HEXA（${short(fc.end)}）`, `${s0.pct.toFixed(1)}%`, `${s1.pct.toFixed(1)}%`, '')}
                    ${noFd ? '' : cell(`最終ダメージ（${short(fc.end)}）`, s0.fd == null ? '—' : `+${s0.fd.toFixed(1)}%`, `+${s1.fd.toFixed(1)}%`, 'text-emerald-300')}
                </div>
                ${capNote}
                <div class="qh-chart"><canvas id="qh-chart"></canvas></div>
                <div>
                    ${orderHead('強化順マップと同じ順で振った場合の届く日')}
                    ${stepRows ? `<ul class="qh-steps custom-scrollbar">${stepRows}</ul>` : '<p class="lg-empty">終了日までに上がるスキルはありません。</p>'}
                </div>`;
        }
        return `<div class="card card-sm bg-base-100 border border-base-content/10 overflow-hidden">
            <div class="lg-equip-head"><span>FORECAST <span class="text-base-content/55 font-bold ml-1">予測と振り順</span></span>
                <button type="button" class="btn btn-xs btn-ghost" data-qh="map" title="HEXA Tracker の強化順マップ（効率順／マス／タイムライン）をこの上に開きます"><i data-lucide="map" class="w-3 h-3"></i>強化順マップを開く</button></div>
            <div class="p-3 flex flex-col gap-3">${settings}${body}</div>
        </div>`;
    }

    function drawChart() {
        if (chart) { chart.destroy(); chart = null; }
        const cv = root && root.querySelector('#qh-chart');
        if (!cv || !window.Chart) return;
        const char = selChar(); if (!char) return;
        const e = entry(String(char.id)); curTid = e.tid;
        const classId = classIdOf(char); if (!classId) return;
        const fc = forecast(e, classId, boardSkills(classId));
        if (!fc.ok) return;
        const first = Math.min(dayNum(fc.recs[0].date), fc.startN);
        const last = Math.max(fc.endN, dayNum(fc.recs[fc.recs.length - 1].date));
        const labels = [], actual = [], pred = [];
        const byDay = new Map(fc.recs.map((r) => [dayNum(r.date), r.st.frag]));
        if (fc.zeroStart) byDay.set(fc.startN, 0);
        for (let n = first; n <= last; n++) {
            labels.push(fromDay(n));
            actual.push(byDay.has(n) ? byDay.get(n) : null);
            pred.push(n >= Math.max(fc.startN, fc.a0) && n <= fc.endN ? Math.round(fc.fragAt(n)) : null);
        }
        const max = fc.fragMax;
        chart = new Chart(cv, {
            type: 'line',
            data: { labels: labels.map(short), datasets: [
                { label: '記録', data: actual, borderColor: '#a78bfa', backgroundColor: '#a78bfa', pointRadius: 3, borderWidth: 2, spanGaps: true, tension: 0 },
                { label: '予測', data: pred, borderColor: '#818cf8', borderDash: [6, 4], pointRadius: 0, borderWidth: 2, spanGaps: false, tension: 0 },
            ] },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#cbd5e1', boxWidth: 10, font: { size: 11 } } },
                    tooltip: { callbacks: {
                        title: (items) => withWd(labels[items[0].dataIndex]),
                        label: (ctx) => ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${fmt(ctx.parsed.y)} 欠片（${max > 0 ? (ctx.parsed.y / max * 100).toFixed(1) : 0}%）`,
                    } },
                },
                scales: {
                    x: { ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } }, grid: { color: 'rgba(148,163,184,0.08)' } },
                    y: { min: 0, ticks: { color: '#94a3b8', font: { size: 10 }, callback: (v) => Number(v).toLocaleString() }, grid: { color: 'rgba(148,163,184,0.12)' } },
                },
            },
        });
    }

    /* ---------- 操作 ---------- */
    function upsert(e, date, levels, replace) {
        if (replace && replace !== date) e.records = e.records.filter((r) => r.date !== replace);
        const had = e.records.some((r) => r.date === date);
        e.records = e.records.filter((r) => r.date !== date);
        e.records.push({ date, levels: { ...levels } });
        e.records.sort((a, b) => a.date.localeCompare(b.date));
        return had;
    }

    function current() {
        const char = selChar(); if (!char) return null;
        const e = entry(String(char.id)); curTid = e.tid;
        const classId = classIdOf(char);
        return { char, e, classId, skills: classId ? boardSkills(classId) : [] };
    }

    function onChange(el) {
        const k = el.dataset.qh; const c = current(); if (!c) return;
        msg = null;
        if (k === 'class') {
            attach(c.e); if (el.value) c.e.t.classId = el.value; else delete c.e.t.classId;
            draft = null; H().saveData(); refresh(); return;
        }
        if (!c.classId) return;
        if (k === 'janus') {
            attach(c.e);
            if (!c.e.t.costIn) c.e.t.costIn = {};
            if (el.checked) c.e.t.costIn[el.dataset.key] = true; else delete c.e.t.costIn[el.dataset.key];
            H().saveData();
            setMsg(el.checked ? 'ソルヤヌスを欠片・HEXA% の集計に入れました（HEXA Tracker も同じ設定になります）' : 'ソルヤヌスを欠片・HEXA% の集計から外しました（HEXA Tracker も同じ設定になります）');
            refresh(); return;
        }
        if (k === 'lv') { draft.levels[el.dataset.key] = Number(el.value) || 0; draft.dirty = true; refresh(); return; }
        if (k === 'date') {
            if (okDate(el.value)) { draft.date = el.value; draft.userDate = true; if (draft.auto && draft.date !== draft.editing) { draft.editing = null; draft.auto = false; } }
            refreshSoon('date'); return;
        }
        if (k === 'start' || k === 'end') { if (okDate(el.value)) c.e.opt[k] = el.value; else delete c.e.opt[k]; saveEntry(c.e); refreshSoon(k); return; }
        if (k === 'import') {
            const file = el.files && el.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(String(reader.result || ''));
                    if (!data || data.app !== 'mm-quanah-hexa' || !Array.isArray(data.records)) throw new Error('bad');
                    let n = 0;
                    data.records.forEach((r) => { if (r && okDate(r.date) && r.levels && typeof r.levels === 'object') { upsert(c.e, r.date, fullLevels(r.levels, c.skills), null); n++; } });
                    syncLevels(c.e, c.skills); saveEntry(c.e); draft = null; setMsg(`${n} 件読み込みました（同じ日付の記録はファイルの方で置き換え）`);
                } catch (err) { setMsg('読み込めませんでした。このタブで保存した JSON を選んでください。', false); }
                refresh();
            };
            reader.readAsText(file);
            el.value = '';
        }
    }

    function onClick(el) {
        const k = el.dataset.qh; const c = current(); if (!c || !c.classId) return;
        msg = null;
        if (k === 'save') {
            const replaced = upsert(c.e, draft.date, fullLevels(draft.levels, c.skills), draft.editing);
            syncLevels(c.e, c.skills); saveEntry(c.e);
            setMsg(draft.editing && !draft.auto ? `${withWd(draft.date)} の記録を直しました` : draft.auto ? `${withWd(draft.date)} の記録を更新しました` : replaced ? `${withWd(draft.date)} の記録を置き換えました` : `${withWd(draft.date)} を記録しました`);
            draft = null; delAsk = null;
        } else if (k === 'cancel') { draft = null; }
        else if (k === 'edit') {
            const r = c.e.records.find((x) => x.date === el.dataset.date); if (!r) return;
            draft = { charId: String(c.char.id), date: r.date, levels: fullLevels(r.levels, c.skills), editing: r.date }; delAsk = null;
            const main = root && root.closest('main'); if (main) main.scrollTop = 0;
        } else if (k === 'del') { delAsk = el.dataset.date; }
        else if (k === 'del-no') { delAsk = null; }
        else if (k === 'del-yes') {
            const d = el.dataset.date;
            c.e.records = c.e.records.filter((r) => r.date !== d); syncLevels(c.e, c.skills); saveEntry(c.e);
            if (draft && draft.editing === d) draft = null;
            delAsk = null; setMsg(`${withWd(d)} の記録を消しました`);
        } else if (k === 'start-auto') { delete c.e.opt.start; saveEntry(c.e); }
        else if (k === 'map') { openMap(c.char.id); return; }
        else if (k === 'export') {
            const data = { app: 'mm-quanah-hexa', version: 1, name: c.char.name, classId: c.classId, records: c.e.records };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `quanah-hexa-${String(c.char.name).replace(/[^\w-]+/g, '_')}.json`;
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            setMsg('JSON を保存しました');
        } else return;
        refresh();
    }

    // HEXA Tracker の強化順マップをこの上に開く。閉じたら（進捗入力で Lv を変えたかもしれないので）描き直す
    function openMap(charId) {
        const ch = chars().find((c) => String(c.id) === String(charId)); if (!ch) return;
        H().modalTab = 'map';
        H().openForCharacter(ch.id);
        const overlay = document.getElementById('hexa-modal-overlay'); if (!overlay) return;
        const obs = new MutationObserver(() => {
            if (document.getElementById('hexa-modal-overlay')) return;
            obs.disconnect(); draft = null; refresh();
        });
        obs.observe(document.body, { childList: true });
    }

    // 日付が変わったら（開いたまま日をまたいだとき）、入力欄の日付を今日に合わせる（bi 指定）。
    // 自分で日付を入れた・「編集」で開いた記録はそのまま。Lv を変えていたら Lv は残して日付だけ今日の新しい記録にする
    let lastToday = today();
    function checkDay() {
        const td = today();
        if (td === lastToday) return;
        lastToday = td;
        if (!draft || draft.userDate || (draft.editing && !draft.auto)) return;
        if (draft.dirty) { draft.date = td; draft.editing = null; draft.auto = false; }
        else draft = null;
        refresh();
    }
    setInterval(checkDay, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
    window.addEventListener('focus', checkDay);

    function bind(el) {
        el.addEventListener('change', (ev) => { const t = ev.target; if (active && t.dataset && t.dataset.qh) onChange(t); });
        el.addEventListener('click', (ev) => { const t = ev.target.closest && ev.target.closest('button[data-qh]'); if (active && t && el.contains(t)) onClick(t); });
    }

    return { mount, setActive, bind, pickChar, refresh };
})();
window.quanahHexa = quanahHexa;
