// Community — Discord名とメイプルのキャラクターを紐づける名簿。
// 1つのDiscord名にキャラを何体でもぶら下げられる。手で入れるのはキャラ名と所属ギルドだけで、
// レベル・職・キャラ画像はキャラ名から Nexon のランキングAPI（script.js の _fetchRanking 経由）で取る。
(function () {
    'use strict';

    const UI_KEY = 'gms-community-ui';        // 画面の状態（この端末だけ）
    const LEGACY_KEY = 'gms-community-v1';    // 名簿がローカル専用だった頃の保存先
    const VERSION = 1;

    // メンバーの識別色。名簿カードとギルド別ビューで同じ色を使う。
    const COLORS = [
        '#a5b4fc', '#67e8f9', '#fda4af', '#fcd34d', '#86efac',
        '#c4b5fd', '#f9a8d4', '#5eead4', '#fdba74', '#93c5fd'
    ];
    const NO_GUILD = '__none__';

    /* ---------- tiny helpers ---------- */
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);
    const now = () => new Date().toISOString();
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fmtDate = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d)) return '—';
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
    };

    // ランキングAPIの jobName ("Arch Mage (I/L)") を CLASS_DATA の職に突き合わせる。
    // 職アイコンは表示しないので、使うのは編集モーダルの職セレクトを合わせる id だけ。
    function jobInfo(jobName) {
        if (typeof CLASS_DATA === 'undefined' || !jobName) return null;
        const t = norm(jobName);
        // 改名された職は CLASS_ALIASES で旧エントリのidへ読み替える。
        const aliasId = (window.CLASS_ALIASES || {})[t];
        for (const [group, list] of Object.entries(CLASS_DATA)) {
            const hit = list.find((j) => (aliasId ? j.id === aliasId : norm(j.name) === t));
            if (hit) return Object.assign({}, hit, { group });
        }
        return null;
    }
    const jobList = () => (typeof CLASS_DATA === 'undefined' ? []
        : Object.entries(CLASS_DATA).flatMap(([g, l]) => l.map((j) => Object.assign({}, j, { group: g }))));

    // 名簿は「全員を更新」で何十体もまとめて叩くので、まず同一オリジンの /api
    // （worker.js の Nexon 中継）を試す。script.js の _fetchRanking は公開プロキシを
    // 先に試すため1体あたり十数秒待たされることがあり、フォールバックに回す。
    async function fetchRanking(name) {
        try {
            const ctl = new AbortController();
            const tid = setTimeout(() => ctl.abort(), 12000);
            const res = await fetch('/api?name=' + encodeURIComponent(name), { signal: ctl.signal });
            clearTimeout(tid);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data && data.error) throw new Error(data.error);
            return data;
        } catch (e) {
            if (window.app && typeof window.app._fetchRanking === 'function') {
                const res = await window.app._fetchRanking(name);
                return res.data;
            }
            throw e;
        }
    }

    // 見つかれば {name, level, job, jobId, imgURL, worldID, fetchedAt}、居なければ null。
    async function lookupCharacter(name) {
        const data = await fetchRanking(name);
        const ranks = data && data.ranks;
        if (!Array.isArray(ranks) || !ranks.length) return null;
        const hit = ranks.find((r) => norm(r.characterName) === norm(name)) || ranks[0];
        const j = jobInfo(hit.jobName);
        return {
            name: hit.characterName || name,
            level: Number(hit.level) || 0,
            job: hit.jobName || '',
            jobId: j ? j.id : '',
            imgURL: hit.characterImgURL || '',
            worldID: hit.worldID == null ? null : hit.worldID,
            fetchedAt: now()
        };
    }

    /* ---------- styles ---------- */
    // モーダルは .cm の外（body直下）に出すので、共通ルールは .cm-veil にも効かせる。
    const CSS = `
.cm,.cm-veil{--bg:#020617;--sf:#0f172a;--sf2:#0b1324;--ln:#1e293b;--ln2:#334155;--tx:#e2e8f0;--mu:#8b98ad;
--ac:#818cf8;--ok:#4ade80;--warn:#fbbf24;--red:#f87171;
color:var(--tx);font-family:"IBM Plex Sans JP","Hiragino Sans","Yu Gothic UI",system-ui,sans-serif;font-size:13px;line-height:1.5}
.cm{padding:0 0 24px}
.cm *,.cm-veil *{box-sizing:border-box}
.cm .wrap{max-width:1480px}
.cm .head{display:flex;align-items:baseline;gap:12px;margin:0 0 8px}
.cm .head .stat{margin-left:auto;color:var(--mu);font-size:11.5px;font-family:"IBM Plex Mono",ui-monospace,monospace;white-space:nowrap}
.cm .meg{display:flex;align-items:center;gap:6px;flex:1 1 100%;min-width:0;padding-top:5px;border-top:1px solid var(--ln)}
.cm h1{font-size:18px;font-weight:700;margin:0;color:#fff;white-space:nowrap}
.cm .sub{color:var(--mu);margin:0;font-size:11.5px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm .spacer{flex:1}

.cm input,.cm select,.cm textarea,.cm-veil input,.cm-veil select,.cm-veil textarea{
background:var(--bg);border:1px solid var(--ln2);border-radius:0;color:var(--tx);
padding:3px 7px;font:inherit;font-size:12.5px;outline:none;min-width:0}
.cm input:focus,.cm select:focus,.cm textarea:focus,
.cm-veil input:focus,.cm-veil select:focus,.cm-veil textarea:focus{border-color:var(--ac)}
.cm input::placeholder,.cm-veil input::placeholder{color:#5b6480}
.cm button,.cm-veil button{background:var(--sf2);border:1px solid var(--ln2);border-radius:0;
color:var(--tx);padding:3px 9px;font:inherit;font-size:12.5px;cursor:pointer;
display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.cm button:hover,.cm-veil button:hover{border-color:var(--ac)}
.cm button:disabled,.cm-veil button:disabled{opacity:.45;cursor:not-allowed}
.cm .primary,.cm-veil .primary{background:#4f46e5;border-color:#6366f1;color:#fff;font-weight:700}
.cm .primary:hover,.cm-veil .primary:hover{background:#6366f1}
.cm .danger:hover,.cm-veil .danger:hover{border-color:var(--red);color:var(--red)}
.cm .icon,.cm-veil .icon{padding:3px;border-radius:0;color:var(--mu)}
.cm .icon:hover{color:var(--tx)}

.cm .bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:var(--sf);
border:1px solid var(--ln);border-radius:0;padding:5px 8px;margin-bottom:8px}
.cm .bar .add{display:flex;gap:6px}
.cm .bar #cm-new-member{width:130px}
.cm .bar #cm-new-display{width:120px}
.cm .bar #cm-q{width:210px}

.cm .bar.me{margin-top:-6px;padding:7px 12px}
.cm .bar .melabel{font-size:11px;color:var(--mu);font-weight:700}
.cm .bar #cm-me{min-width:140px}
.cm .menote{color:var(--mu);font-size:11px}
.cm .sync{font-size:10.5px;color:var(--mu);border:1px solid var(--ln);border-radius:0;
padding:1px 6px;white-space:nowrap;margin-left:auto}
.cm .sync.synced{border-color:#2f5d43;color:#86efac}
.cm .sync.saving{border-color:#4a5480;color:#c9d2f0}
.cm .sync.local{border-color:var(--ln);color:var(--mu)}
.cm .sync.conflict,.cm .sync.needkey,.cm .sync.error{border-color:#7a3b3b;color:#fca5a5}

.cm .tabs{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--ln);margin-bottom:16px}
.cm .tab{background:none;border:0;border-bottom:2px solid transparent;border-radius:0;
color:var(--mu);padding:8px 14px;font-size:12.5px;font-weight:700}
.cm .tab:hover{color:var(--tx)}
.cm .tab.on{color:#fff;border-bottom-color:var(--ac);background:rgba(129,140,248,.08)}
.cm .tabs .stat{margin-left:auto;color:var(--mu);font-size:11.5px;font-family:ui-monospace,monospace}

.cm .empty{color:var(--mu);text-align:center;padding:24px 12px;border:1px dashed var(--ln);border-radius:0}
.cm .tab .badge{background:var(--warn);color:#241a00;border-radius:999px;font-size:9.5px;
font-weight:700;padding:0 5px;margin-left:6px;vertical-align:1px}
.cm .tab .badge:empty{display:none}
.cm .todo{margin-bottom:12px}
.cm .todo .eyebrow{font-size:11px;font-weight:600;
color:var(--mu);margin:0 0 4px;display:flex;align-items:center;gap:8px}
.cm .todo .cnt{font-family:ui-monospace,monospace;letter-spacing:0;color:var(--tx);
background:var(--sf2);border:1px solid var(--ln);border-radius:0;padding:0 6px}
.cm .todobar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}
.cm .todobar .spacer{flex:1}
.cm .todobar select,.cm .todobar input{min-width:170px}
.cm .cfoot select{flex:1;min-width:0;font-size:11px;padding:3px 6px}

.cm .mcard{background:var(--sf);border:1px solid var(--ln);border-radius:0;margin-bottom:6px;overflow:hidden}
.cm .mhead{display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:pointer;background:#111a2e}
.cm .mhead:hover{background:rgba(129,140,248,.05)}
.cm .mdot{width:8px;height:8px;border-radius:50%;flex:none}
.cm .mname{font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none;max-width:260px}
.cm .mname .alias{font-weight:400;color:var(--mu);font-size:12px;margin-left:7px}
.cm .mmeta{color:var(--mu);font-size:11.5px;font-family:ui-monospace,monospace;white-space:nowrap;flex:none}
.cm .gtags{display:flex;gap:4px;flex-wrap:wrap;overflow:hidden}
.cm .chip{background:var(--sf2);border:1px solid var(--ln2);border-radius:0;
padding:0 6px;font-size:10.5px;color:var(--mu);white-space:nowrap;
display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.cm .ccard .chip{background:var(--sf)}
.cm .chip.on{border-color:#4a5480;color:#c9d2f0}
.cm .mbtns{display:flex;gap:4px;flex:none}
.cm .caret{transition:transform .15s ease;color:var(--mu);display:inline-flex}
.cm .mcard.closed .caret{transform:rotate(-90deg)}
.cm .mcard.closed .cbody{display:none}
.cm .cbody{border-top:1px solid var(--ln);padding:6px 8px 6px}

/* メンバーを開いた先はキャラのカードを並べる。キャラ画像を主役にしたいので
   アバターは88px、その右に 名前 / Lv+職 / ギルド / 操作 を積む。 */
.cm .cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px}
.cm .ccard{display:grid;grid-template-columns:56px minmax(0,1fr);gap:8px;
background:var(--sf2);border:1px solid var(--ln);border-radius:0;padding:4px}
.cm .ccard:hover{border-color:#4f46e5}
.cm .avatar{position:relative;width:56px;height:56px;border-radius:0;background:var(--bg);
border:1px solid var(--ln);overflow:hidden;flex:none}
.cm .avatar img.face{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.cm .avatar .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#3d4767}
.cm .cinfo{display:flex;flex-direction:column;min-width:0;padding-top:1px}
.cm .cname{font-size:13.5px;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm .cmeta{display:flex;align-items:baseline;gap:8px;min-width:0;margin-top:1px}
.cm .cmeta .job{color:var(--mu);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm .cfoot{display:flex;align-items:center;gap:6px;margin-top:auto;min-width:0}
.cm .cfoot .chip{min-width:0;flex:0 1 auto}
.cm .flag{background:rgba(129,140,248,.16);color:#c7cdfb;border-radius:0;
font-size:9.5px;padding:1px 5px;margin-left:6px;letter-spacing:.06em;vertical-align:1px}
.cm .lv{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;font-size:11.5px;color:var(--mu)}
.cm .lv b{color:#fff;font-size:14px;font-weight:700}
.cm .lv.none b{color:var(--warn)}
.cm .cbtns{display:flex;gap:2px;justify-content:flex-end;margin-left:auto;flex:none}
.cm .ccard .cbtns{opacity:.5;transition:opacity .12s ease}
.cm .ccard:hover .cbtns,.cm .ccard:focus-within .cbtns{opacity:1}

.cm .addrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px;
padding-top:6px;border-top:1px solid var(--ln)}
.cm .addrow input[data-cm="nc-name"]{width:160px}
.cm .addrow input[data-cm="nc-guild"]{width:130px}
.cm .addrow .hint{color:var(--mu);font-size:11px}

.cm .tblwrap{overflow-x:auto;background:var(--sf);border:1px solid var(--ln);border-radius:0}
.cm table{width:100%;border-collapse:collapse;min-width:840px}
.cm th{text-align:left;font-size:11px;color:#64748b;
font-weight:600;padding:5px 8px;border-bottom:1px solid var(--ln2);white-space:nowrap}
.cm th.sortable{cursor:pointer;user-select:none}
.cm th.sortable:hover{color:var(--tx)}
.cm th .dir{color:var(--ac);margin-left:3px}
.cm td{padding:2px 8px;height:34px;border-bottom:1px solid #172036;vertical-align:middle}
.cm tbody tr:nth-child(even){background:#0c1428}
.cm tbody tr:last-child td{border-bottom:0}
.cm tbody tr:hover{background:#18223a}
.cm td.num{font-family:"IBM Plex Mono",ui-monospace,monospace;font-weight:600;color:#fff;font-variant-numeric:tabular-nums;text-align:right}
.cm td .who{display:flex;align-items:center;gap:7px}
.cm .handle{color:var(--mu);font-size:10.5px;margin-left:6px}
.cm td .who .mdot{width:7px;height:7px}
.cm .thumb{position:relative;width:28px;height:28px;border-radius:0;background:var(--bg);
border:1px solid var(--ln);overflow:hidden}
.cm .thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}

.cm .gwrap{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:6px}
.cm .gcard{background:var(--sf);border:1px solid var(--ln);border-top:2px solid #4f46e5;border-radius:0;padding:6px 10px}
.cm .gcard h3{margin:0 0 2px;font-size:14px;font-weight:700}
.cm .gcard .gstat{color:var(--mu);font-size:11.5px;font-family:"IBM Plex Mono",ui-monospace,monospace;margin-bottom:4px}
.cm .gcard ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.cm .gcard li{display:flex;align-items:center;gap:7px;font-size:12px}
.cm .gcard li .lvs{margin-left:auto;font-family:ui-monospace,monospace;color:var(--mu);font-size:11.5px}
.cm .gcard li img{width:18px;height:18px;border-radius:0;object-fit:contain;flex:none}
.cm .gcard li .who{color:var(--mu);font-size:11px}

.cm-veil{position:fixed;inset:0;background:rgba(6,8,16,.74);display:flex;align-items:center;
justify-content:center;padding:20px;z-index:60}
.cm-veil.top{z-index:70}
.cm-veil .modal{background:var(--sf);border:1px solid var(--ln2);border-top:2px solid #6366f1;border-radius:0;width:100%;
max-width:440px;padding:14px 16px;box-shadow:0 24px 60px rgba(0,0,0,.55);max-height:88vh;overflow:auto}
.cm-veil .modal.wide{max-width:880px}
.cm-veil h2{font-size:15px;margin:0 0 10px;font-weight:700}
.cm-veil .fld{margin-bottom:11px}
.cm-veil .fld label{display:block;color:var(--mu);font-size:10.5px;font-weight:600;margin-bottom:2px}
.cm-veil .fld input,.cm-veil .fld select,.cm-veil .fld textarea{width:100%}
.cm-veil .pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cm-veil .chk{display:flex;align-items:center;gap:7px;font-size:12.5px;cursor:pointer}
.cm-veil .chk input{width:14px;height:14px;accent-color:var(--ac)}
.cm-veil .foot{display:flex;gap:8px;margin-top:18px;align-items:center}
.cm-veil .foot .grow{flex:1}
.cm-veil .note{color:var(--mu);font-size:11.5px;margin:10px 0 0;line-height:1.7}
.cm-veil .msg{font-size:12.5px;line-height:1.8;margin:0}
.cm-veil textarea{width:100%;min-height:180px;font-family:ui-monospace,monospace;font-size:11.5px;
resize:vertical;white-space:pre;overflow:auto}
.cm-veil .io{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.cm-veil .col-h{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--mu);
font-weight:700;margin-bottom:6px}
.cm-veil .row{display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap}
@media(max-width:720px){.cm-veil .io{grid-template-columns:1fr}}
@media(prefers-reduced-motion:no-preference){.cm-veil .modal{animation:cm-pop .16s ease-out}}
@keyframes cm-pop{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}

.cm-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:80;
background:#0f172a;border:1px solid #334155;color:#e2e8f0;border-radius:0;
padding:9px 16px;font-size:12.5px;box-shadow:0 12px 34px rgba(0,0,0,.5);
font-family:"IBM Plex Sans JP","Hiragino Sans","Yu Gothic UI",system-ui,sans-serif}
.cm-toast.ok{border-color:#4ade80;color:#bbf7d0}
.cm-toast.warn{border-color:#fbbf24;color:#fde68a}
.cm-toast.err{border-color:#f87171;color:#fecaca}

@media(max-width:640px){
.cm .cgrid{grid-template-columns:1fr}
}
`;

    const DEFAULT_UI = () => ({ tab: 'roster', q: '', guild: '', sortKey: 'level', sortDir: 'desc', closed: [] });
    const CS = () => window.communityStore;

    // 管理者だけが使う導線（名簿の一括登録・JSON取り込み・全消去）を出すかどうか。
    // 名簿は全員で共有しているので、これらは普段の画面には出さない。
    const ADMIN = new URLSearchParams(location.search).get('admin') === '1';

    const community = {
        // 名簿の実体は communityStore（= 共有DB）が持つ。ここが持つのは画面の状態だけで、
        // state.members はストアへの窓口。読むとストアの配列、代入すると丸ごと差し替え。
        state: {
            ui: DEFAULT_UI(),
            get members() { return CS() ? CS().members() : []; },
            set members(v) { if (CS()) CS().replaceAll(v); }
        },
        root: null,
        busy: false,
        selfSaving: false,

        /* ================= lifecycle ================= */
        async init(rootId) {
            this.root = document.getElementById(rootId || 'community-root');
            if (!this.root) return;
            this.loadUi();
            this.root.innerHTML = this.shell();
            this.bind();
            this.render();                       // まずローカルの中身で描く
            if (!CS()) return;
            await CS().ready();                  // 共有DBから読み直す
            // 他の人の更新やポーリングで描き直す。自分の保存のときは
            // 呼び出し側が描き直すので、ここでは何もしない
            // （入力中のフォーカスを飛ばさないため）。
            CS().onChange(() => { if (!this.selfSaving) this.render(); });
            this.render();
        },

        loadUi() {
            try {
                const raw = localStorage.getItem(UI_KEY) || localStorage.getItem(LEGACY_KEY);
                if (!raw) return;
                const s = JSON.parse(raw);
                const ui = s && (s.ui || s);
                if (ui && typeof ui === 'object') this.state.ui = Object.assign(DEFAULT_UI(), ui);
                // 検索語は持ち越さない。検索欄は空で描くので、残すと
                // 「絞り込まれているのに検索欄は空」という状態になる。
                this.state.ui.q = '';
            } catch (e) { /* 壊れた保存データは無視して既定で始める */ }
        },

        // 直前に加えた名簿の変更をローカル保存し、共有DBへ送る。
        // 画面状態は別枠でこちらのブラウザにだけ残す。
        save() {
            try { localStorage.setItem(UI_KEY, JSON.stringify({ ui: this.state.ui })); }
            catch (e) { /* 容量超過などは画面状態なので黙って諦める */ }
            const cs = CS();
            if (!cs) return;
            // commit は他のアプリ（Planner / Scheduler）へ通知も出す。
            // こちらは呼び出し側が描き直すので、自分の通知は無視させる。
            this.selfSaving = true;
            cs.commit();   // 整形 → ローカル保存 → 共有DBへ → 通知
            this.selfSaving = false;
            const ids = new Set(this.state.members.map((m) => m.id));
            this.state.ui.closed = (this.state.ui.closed || []).filter((id) => ids.has(id));
        },

        /* ================= derived ================= */
        memberById(id) { return this.state.members.find((m) => m.id === id) || null; },
        findChar(cid) {
            for (const m of this.state.members) {
                const c = m.characters.find((x) => x.id === cid);
                if (c) return { member: m, char: c };
            }
            return null;
        },
        // 全キャラを Discord 情報つきの平らな配列にする。
        allChars() {
            return this.state.members.flatMap((m) => m.characters.map((c) => Object.assign({}, c, {
                memberId: m.id, discordName: m.discordName,
                who: m.displayName || m.discordName, colorIdx: m.colorIdx
            })));
        },
        guilds() {
            const set = new Set();
            this.allChars().forEach((c) => { if (c.guild) set.add(c.guild); });
            return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
        },
        color(m) { return COLORS[(m && m.colorIdx || 0) % COLORS.length]; },

        matches(c) {
            const { q, guild } = this.state.ui;
            if (guild === NO_GUILD) { if (c.guild) return false; }
            else if (guild && c.guild !== guild) return false;
            const t = q.trim().toLowerCase();
            if (!t) return true;
            return [c.name, c.guild, c.job, c.discordName, c.who, c.note]
                .some((v) => String(v || '').toLowerCase().includes(t));
        },
        // 名簿カードの並びは一覧タブのソート設定とは切り離す。名簿は「その人の手駒」を
        // 見る画面なので、メインを先頭に、あとはレベルの高い順で固定。
        sortForRoster(list) {
            return list.slice().sort((a, b) =>
                (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0) ||
                (b.level || 0) - (a.level || 0) ||
                String(a.name).localeCompare(String(b.name)));
        },
        sortChars(list) {
            const { sortKey, sortDir } = this.state.ui;
            const dir = sortDir === 'asc' ? 1 : -1;
            const key = (c) => {
                if (sortKey === 'level') return c.level || 0;
                if (sortKey === 'updated') return c.updatedAt || '';
                return String(c[sortKey] === undefined ? c.name : c[sortKey] || '').toLowerCase();
            };
            return list.slice().sort((a, b) => {
                const ka = key(a), kb = key(b);
                if (ka < kb) return -dir;
                if (ka > kb) return dir;
                return String(a.name).localeCompare(String(b.name));
            });
        },

        /* ================= render ================= */
        shell() {
            return '<style>' + CSS + '</style>' +
                '<div class="cm"><div class="wrap">' +
                '<div class="head"><h1>Community Members</h1>' +
                '<p class="sub">Discord名にキャラクターを紐づけた名簿。キャラ名を入れると レベル・職・画像 をランキングAPIから取得します（ギルドは手入力）。</p>' +
                '<span class="stat" id="cm-stat"></span></div>' +
                '<div class="bar">' +
                // Discord名は「誰か」を決める識別子、表示名は各ツールに出る呼び名。
                // 別物なので入口で両方受け取る（表示名は後から編集でも可）。
                '<div class="add">' +
                '<input id="cm-new-member" type="text" placeholder="Discord名" autocomplete="off" spellcheck="false">' +
                '<input id="cm-new-display" type="text" placeholder="表示名（任意）" autocomplete="off">' +
                '<button class="primary" data-cm="add-member"><i data-lucide="user-plus" class="w-3.5 h-3.5"></i>メンバー追加</button>' +
                '</div>' +
                '<span class="spacer"></span>' +
                '<input id="cm-q" type="search" placeholder="キャラ名 / Discord名 / ギルド / 職" data-cm="q" autocomplete="off">' +
                '<select id="cm-guild" data-cm="guild-filter" title="ギルドで絞り込む"></select>' +
                '<button data-cm="refresh-all" id="cm-refresh-all" title="登録済みキャラのレベル・職・画像を取り直す">' +
                '<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>全員を更新</button>' +
                '<button data-cm="open-data"><i data-lucide="database" class="w-3.5 h-3.5"></i>データ</button>' +
                // 「自分は誰か」は名簿以外の3アプリ（Planner / Scheduler / Leaderboard）が
                // 参照する。ここで選ぶとこの端末に覚える。
                '<span class="meg"><span class="melabel">自分</span>' +
                '<select id="cm-me" data-cm="me" title="この端末の持ち主。Planner・Scheduler・Leaderboardの初期選択に使います"></select>' +
                '<span id="cm-me-note" class="menote"></span>' +
                '<span id="cm-sync" class="sync"></span></span>' +
                '</div>' +
                '<div id="cm-body"></div>' +
                '<datalist id="cm-guild-list"></datalist>' +
                '</div></div>';
        },

        // タブは上部バー（index.html の community-nav）に置いている。
        setTab(tab) { this.state.ui.tab = tab; this.save(); this.render(); },
        syncNav() {
            for (const id of ['roster', 'list', 'guild', 'todo']) {
                const b = document.getElementById('cnav-' + id);
                if (!b) continue;
                const on = this.state.ui.tab === id;
                b.classList.toggle('nav-active', on);
                b.classList.toggle('nav-inactive', !on);
            }
        },

        render() {
            if (!this.root) return;
            const ui = this.state.ui;
            this.syncNav();
            const all = this.allChars();
            const stat = this.root.querySelector('#cm-stat');
            if (stat) {
                stat.textContent = `${this.state.members.length} メンバー / ${all.length} キャラ / ${this.guilds().length} ギルド`;
            }
            // 未割り当てタブのバッジ（人に未割り当て＋ギルド未設定の合計）
            const badge = document.getElementById('cm-todo-badge');
            if (badge) {
                const todo = (CS() ? CS().pending().length : 0) + all.filter((c) => !c.guild).length;
                badge.textContent = todo ? String(todo) : '';
            }
            // ギルド絞り込みとギルド入力補完は登録内容から作り直す。
            const gs = this.guilds();
            const sel = this.root.querySelector('#cm-guild');
            if (sel) {
                const keep = ui.guild;
                sel.innerHTML = '<option value="">全ギルド</option>' +
                    gs.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('') +
                    `<option value="${NO_GUILD}">ギルド未設定</option>`;
                sel.value = gs.includes(keep) || keep === NO_GUILD ? keep : '';
                if (sel.value !== keep) ui.guild = sel.value;
            }
            const dl = this.root.querySelector('#cm-guild-list');
            if (dl) dl.innerHTML = gs.map((g) => `<option value="${esc(g)}">`).join('');

            this.renderMeBar();
            this.renderBody();
        },

        // 「自分」の選択と共有DBの状態。
        renderMeBar() {
            const cs = CS();
            const meSel = this.root.querySelector('#cm-me');
            const meNote = this.root.querySelector('#cm-me-note');
            const me = cs ? cs.me() : null;
            if (meSel) {
                meSel.innerHTML = '<option value="">（未選択）</option>' +
                    this.state.members.map((m) =>
                        `<option value="${m.id}" ${me && me.id === m.id ? 'selected' : ''}>${esc(CS().labelWithHandle(m))}</option>`).join('');
            }
            if (meNote) {
                meNote.textContent = me
                    ? `${me.characters.length}キャラ・Plannerのデータはこの名前ごとに分かれます`
                    : '選ぶと Planner / Scheduler / Leaderboard で自分の行が最初に出ます';
            }
            const sync = this.root.querySelector('#cm-sync');
            if (sync && cs) {
                const mode = cs.sync.mode;
                sync.className = 'sync ' + mode;
                sync.textContent = cs.syncLabel() + (cs.sync.message ? ' · ' + cs.sync.message : '');
                sync.title = cs.sync.updatedAt ? '最終更新 ' + fmtDate(cs.sync.updatedAt) : '';
            }
        },

        renderBody() {
            const body = this.root && this.root.querySelector('#cm-body');
            if (!body) return;
            const tab = this.state.ui.tab;
            body.innerHTML = tab === 'list' ? this.viewTable()
                : tab === 'guild' ? this.viewGuilds()
                    : tab === 'todo' ? this.viewTodo()
                        : this.viewRoster();
            if (window.lucide) window.lucide.createIcons();
        },

        avatar(c) {
            return '<div class="avatar">' + (c.imgURL
                ? `<img class="face" src="${esc(c.imgURL)}" alt="" loading="lazy">`
                : '<span class="ph"><i data-lucide="user" class="w-6 h-6"></i></span>') + '</div>';
        },

        charCard(c) {
            const lv = c.level > 0
                ? `<span class="lv">Lv.<b>${c.level}</b></span>`
                : '<span class="lv none">Lv.<b>--</b></span>';
            return `<div class="ccard" data-cid="${c.id}">
    ${this.avatar(c)}
    <div class="cinfo">
        <div class="cname">${esc(c.name)}${c.isMain ? '<span class="flag">MAIN</span>' : ''}</div>
        <div class="cmeta">${lv}<span class="job">${esc(c.job || '職 未取得')}</span></div>
        <div class="cfoot">
            <span class="chip${c.guild ? ' on' : ''}">${esc(c.guild || 'ギルド未設定')}</span>
            <div class="cbtns">
                <button class="icon" data-cm="refresh-char" title="APIで取り直す"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i></button>
                <button class="icon" data-cm="edit-char" title="編集"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                <button class="icon danger" data-cm="del-char" title="削除"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </div>
        </div>
    </div>
</div>`;
        },

        viewRoster() {
            if (!this.state.members.length) {
                return '<div class="empty">まだ誰も登録されていません。<br>上の「Discord名」に名前を入れて<b>メンバー追加</b>から始めてください。</div>';
            }
            const closed = new Set(this.state.ui.closed);
            const filtering = !!(this.state.ui.q.trim() || this.state.ui.guild);
            const cards = this.state.members.map((m) => {
                const chars = m.characters.map((c) => Object.assign({}, c, {
                    discordName: m.discordName, who: m.displayName || m.discordName
                }));
                const shown = this.sortForRoster(chars.filter((c) => this.matches(c)));
                // 絞り込み中に1体も残らないメンバーはカードごと隠す。
                if (filtering && !shown.length) return '';
                const gs = Array.from(new Set(m.characters.map((c) => c.guild).filter(Boolean)));
                const max = m.characters.reduce((a, c) => Math.max(a, c.level || 0), 0);
                const isClosed = closed.has(m.id);
                return `<div class="mcard${isClosed ? ' closed' : ''}" data-mid="${m.id}">
    <div class="mhead" data-cm="toggle">
        <span class="caret"><i data-lucide="chevron-down" class="w-4 h-4"></i></span>
        <span class="mdot" style="background:${this.color(m)}"></span>
        <span class="mname">${esc(m.displayName || m.discordName)}${m.displayName ? '<span class="alias">@' + esc(m.discordName) + '</span>' : ''}</span>
        <span class="mmeta">${m.characters.length}キャラ${max ? ' / 最高 Lv.' + max : ''}</span>
        <span class="gtags">${gs.slice(0, 4).map((g) => '<span class="chip">' + esc(g) + '</span>').join('')}${gs.length > 4 ? '<span class="chip">+' + (gs.length - 4) + '</span>' : ''}</span>
        <span class="spacer"></span>
        <span class="mbtns">
            <button class="icon" data-cm="refresh-member" title="このメンバーのキャラを更新"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i></button>
            <button class="icon" data-cm="edit-member" title="Discord名・表示名を編集"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
            <button class="icon danger" data-cm="del-member" title="メンバーごと削除"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </span>
    </div>
    <div class="cbody">
        ${shown.length ? '<div class="cgrid">' + shown.map((c) => this.charCard(c)).join('') + '</div>'
                        : '<div class="empty" style="padding:18px">キャラ未登録</div>'}
        <div class="addrow">
            <input type="text" data-cm="nc-name" placeholder="キャラ名" autocomplete="off" spellcheck="false">
            <input type="text" data-cm="nc-guild" placeholder="所属ギルド（任意）" list="cm-guild-list" autocomplete="off">
            <button class="primary" data-cm="add-char"><i data-lucide="plus" class="w-3.5 h-3.5"></i>追加して取得</button>
            <span class="hint">レベル・職・画像はキャラ名から自動取得</span>
        </div>
    </div>
</div>`;
            }).join('');
            return cards || '<div class="empty">条件に合うキャラがいません。</div>';
        },

        viewTable() {
            const rows = this.sortChars(this.allChars().filter((c) => this.matches(c)));
            if (!rows.length) return '<div class="empty">条件に合うキャラがいません。</div>';
            const { sortKey, sortDir } = this.state.ui;
            const th = (key, label, cls) => {
                const on = sortKey === key;
                return `<th class="sortable ${cls || ''}" data-cm="sort" data-key="${key}">${label}${on ? '<span class="dir">' + (sortDir === 'asc' ? '▲' : '▼') + '</span>' : ''}</th>`;
            };
            return `<div class="tblwrap"><table>
    <thead><tr>
        <th style="width:46px"></th>
        ${th('name', 'キャラ名')}
        ${th('level', 'Lv', 'num')}
        ${th('job', '職')}
        ${th('guild', 'ギルド')}
        ${th('who', 'メンバー')}
        ${th('updated', '更新')}
        <th style="width:104px"></th>
    </tr></thead>
    <tbody>${rows.map((c) => `<tr data-cid="${c.id}">
        <td><div class="thumb">${c.imgURL ? `<img src="${esc(c.imgURL)}" alt="" loading="lazy">` : ''}</div></td>
        <td><b>${esc(c.name)}</b>${c.isMain ? '<span class="flag">MAIN</span>' : ''}</td>
        <td class="num">${c.level > 0 ? c.level : '--'}</td>
        <td>${esc(c.job || '—')}</td>
        <td>${esc(c.guild || '—')}</td>
        <td><div class="who"><span class="mdot" style="background:${COLORS[(c.colorIdx || 0) % COLORS.length]}"></span>
            <span>${esc(c.who)}${c.who !== c.discordName ? '<span class="handle">@' + esc(c.discordName) + '</span>' : ''}</span></div></td>
        <td class="num" style="color:var(--mu)">${fmtDate(c.updatedAt)}</td>
        <td><div class="cbtns">
            <button class="icon" data-cm="refresh-char" title="APIで取り直す"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i></button>
            <button class="icon" data-cm="edit-char" title="編集"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
            <button class="icon danger" data-cm="del-char" title="削除"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div></td>
    </tr>`).join('')}</tbody>
</table></div>`;
        },

        // 取り込み後の後始末をする画面。
        //   ① 持ち主が決まっていないキャラ（キャラ名だけの一括登録で入ったもの）
        //   ② ギルドが空のキャラ（人ごとにまとめて設定できる）
        viewTodo() {
            const cs = CS();
            const pending = cs ? cs.pending() : [];
            const noGuild = this.allChars().filter((c) => !c.guild);

            const memberOpts = (sel) => '<option value="">（割り当て先を選ぶ）</option>' +
                this.state.members.map((m) =>
                    `<option value="${m.id}" ${sel === m.id ? 'selected' : ''}>${esc(CS().labelWithHandle(m))}</option>`).join('');

            const me = cs && cs.me();
            const secA = `<section class="todo">
    <p class="eyebrow">人に未割り当てのキャラ <span class="cnt">${pending.length}</span></p>
    ${pending.length ? `
    <div class="todobar">
        <select data-cm="pend-bulk-member">${memberOpts(me ? me.id : '')}</select>
        <button data-cm="pend-assign-all">表示中をすべてこの人に割り当てる</button>
        <span class="spacer"></span>
        <button class="danger" data-cm="pend-clear">未割り当てをすべて削除</button>
    </div>
    <div class="cgrid">${pending.map((c) => `<div class="ccard" data-pid="${c.id}">
        ${this.avatar(c)}
        <div class="cinfo">
            <div class="cname">${esc(c.name)}</div>
            <div class="cmeta">${c.level > 0 ? `<span class="lv">Lv.<b>${c.level}</b></span>` : '<span class="lv none">Lv.<b>--</b></span>'}<span class="job">${esc(c.job || '職 未取得')}</span></div>
            <div class="cfoot">
                <select data-cm="pend-member">${memberOpts('')}</select>
                <div class="cbtns">
                    <button class="icon danger" data-cm="pend-del" title="削除"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </div>
        </div>
    </div>`).join('')}</div>`
                    : '<div class="empty" style="padding:22px">未割り当てのキャラはありません。</div>'}
</section>`;

            const byMember = new Map();
            noGuild.forEach((c) => {
                if (!byMember.has(c.memberId)) byMember.set(c.memberId, []);
                byMember.get(c.memberId).push(c);
            });
            const secB = `<section class="todo">
    <p class="eyebrow">ギルド未設定のキャラがいる人 <span class="cnt">${byMember.size}</span></p>
    ${byMember.size ? `
    <div class="todobar">
        <input type="text" data-cm="guild-bulk-name" placeholder="設定するギルド名" list="cm-guild-list" value="${esc(this.guilds()[0] || '')}">
        <button data-cm="guild-fill-all">未設定のキャラすべてに入れる</button>
    </div>
    <div class="gwrap">${Array.from(byMember.entries()).map(([mid, list]) => {
                const m = this.memberById(mid);
                return `<div class="gcard" data-mid="${mid}">
        <h3>${esc(CS().label(m))}</h3>
        <div class="gstat">ギルド未設定 ${list.length}体 / 全${m.characters.length}体</div>
        <ul>${list.map((c) => `<li><span>${esc(c.name)}</span><span class="lvs">${c.level > 0 ? 'Lv.' + c.level : 'Lv.--'}</span></li>`).join('')}</ul>
        <div class="todobar" style="margin-top:9px">
            <input type="text" data-cm="guild-one-name" placeholder="ギルド名" list="cm-guild-list">
            <button data-cm="guild-fill-one">この人に入れる</button>
        </div>
    </div>`;
            }).join('')}</div>`
                    : '<div class="empty" style="padding:22px">ギルド未設定のキャラはいません。</div>'}
</section>`;

            return secA + secB;
        },

        viewGuilds() {
            const rows = this.allChars().filter((c) => this.matches(c));
            if (!rows.length) return '<div class="empty">条件に合うキャラがいません。</div>';
            const map = new Map();
            rows.forEach((c) => {
                const g = c.guild || '(ギルド未設定)';
                if (!map.has(g)) map.set(g, []);
                map.get(g).push(c);
            });
            const groups = Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ja'));
            return '<div class="gwrap">' + groups.map(([g, list]) => {
                const members = new Set(list.map((c) => c.memberId)).size;
                const max = list.reduce((a, c) => Math.max(a, c.level || 0), 0);
                const withLv = list.filter((c) => c.level > 0);
                const avg = withLv.length ? Math.round(withLv.reduce((a, c) => a + c.level, 0) / withLv.length) : 0;
                const sorted = list.slice().sort((a, b) => (b.level || 0) - (a.level || 0));
                return `<div class="gcard">
    <h3>${esc(g)}</h3>
    <div class="gstat">${list.length}キャラ / ${members}人${max ? ' · 最高 Lv.' + max : ''}${avg ? ' · 平均 Lv.' + avg : ''}</div>
    <ul>${sorted.map((c) => `<li>
        <span>${esc(c.name)}</span>
        <span class="who">${esc(c.who)}</span>
        <span class="lvs">${c.level > 0 ? 'Lv.' + c.level : 'Lv.--'}</span>
    </li>`).join('')}</ul>
</div>`;
            }).join('') + '</div>';
        },

        /* ================= events ================= */
        bind() {
            const r = this.root;

            r.addEventListener('click', (e) => {
                const t = e.target.closest('[data-cm]');
                if (!t || !r.contains(t)) return;
                const act = t.dataset.cm;
                const card = t.closest('[data-mid]');
                const mid = card && card.dataset.mid;
                const row = t.closest('[data-cid]');
                const cid = row && row.dataset.cid;

                if (act === 'add-member') this.addMember();
                else if (act === 'tab') { this.state.ui.tab = t.dataset.tab; this.save(); this.render(); }
                else if (act === 'sort') this.setSort(t.dataset.key);
                else if (act === 'refresh-all') this.refreshMany(this.allChars().map((c) => c.id), t);
                else if (act === 'open-data') this.openData();
                else if (act === 'toggle') {
                    // ヘッダー内のボタンを押したときは開閉しない。
                    if (e.target.closest('.mbtns')) return;
                    this.toggleCard(mid);
                }
                else if (act === 'edit-member') this.openMemberModal(mid);
                else if (act === 'del-member') this.delMember(mid);
                else if (act === 'refresh-member') {
                    const m = this.memberById(mid);
                    if (m) this.refreshMany(m.characters.map((c) => c.id), t);
                }
                else if (act === 'pend-del') this.pendingRemove(t.closest('[data-pid]').dataset.pid);
                else if (act === 'pend-assign-all') this.pendingAssignAll();
                else if (act === 'pend-clear') this.pendingClear();
                else if (act === 'guild-fill-all') this.fillGuild(null);
                else if (act === 'guild-fill-one') this.fillGuild(t.closest('[data-mid]'));
                else if (act === 'add-char') this.addChar(card);
                else if (act === 'edit-char') this.openCharModal(cid);
                else if (act === 'del-char') this.delChar(cid);
                else if (act === 'refresh-char') this.refreshMany([cid], t);
            });

            r.addEventListener('input', (e) => {
                const t = e.target.closest('[data-cm]');
                if (!t) return;
                if (t.dataset.cm === 'q') { this.state.ui.q = t.value; this.renderBody(); }
            });

            r.addEventListener('change', (e) => {
                const t = e.target.closest('[data-cm]');
                if (!t) return;
                if (t.dataset.cm === 'pend-member') {
                    // 1体ずつの割り当て。選んだ瞬間にその人へ移す。
                    const pid = t.closest('[data-pid]').dataset.pid;
                    if (t.value) this.pendingAssign(pid, t.value);
                }
                else if (t.dataset.cm === 'guild-filter') { this.state.ui.guild = t.value; this.save(); this.renderBody(); }
                else if (t.dataset.cm === 'me') {
                    if (CS()) CS().setMe(t.value);
                    this.renderMeBar();
                    const m = this.memberById(t.value);
                    this.toast(m ? `自分を ${m.displayName || m.discordName} にしました` : '自分の指定を外しました', 'ok');
                }
            });

            r.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                const t = e.target.closest('[data-cm], #cm-new-member, #cm-new-display');
                if (!t) return;
                const k = (t.id === 'cm-new-member' || t.id === 'cm-new-display') ? 'new-member' : t.dataset.cm;
                if (k === 'new-member') { e.preventDefault(); this.addMember(); }
                else if (k === 'nc-name' || k === 'nc-guild') { e.preventDefault(); this.addChar(t.closest('[data-mid]')); }
            });
        },

        setSort(key) {
            const ui = this.state.ui;
            if (ui.sortKey === key) ui.sortDir = ui.sortDir === 'asc' ? 'desc' : 'asc';
            else { ui.sortKey = key; ui.sortDir = key === 'level' || key === 'updated' ? 'desc' : 'asc'; }
            this.save();
            this.renderBody();
        },

        toggleCard(mid) {
            const closed = new Set(this.state.ui.closed);
            if (closed.has(mid)) closed.delete(mid); else closed.add(mid);
            this.state.ui.closed = Array.from(closed);
            this.save();
            const card = this.root.querySelector(`[data-mid="${mid}"]`);
            if (card) card.classList.toggle('closed', closed.has(mid));
        },

        /* ================= member actions ================= */
        addMember() {
            const input = this.root.querySelector('#cm-new-member');
            const dispInput = this.root.querySelector('#cm-new-display');
            const name = (input.value || '').trim();
            const display = ((dispInput && dispInput.value) || '').trim();
            if (!name) { this.toast('Discord名を入力してください', 'warn'); input.focus(); return; }
            if (this.state.members.some((m) => m.discordName.toLowerCase() === name.toLowerCase())) {
                this.toast('同じDiscord名がすでにあります', 'warn'); return;
            }
            this.state.members.push({
                id: uid('m'), discordName: name, displayName: display, note: '',
                colorIdx: this.state.members.length % COLORS.length, createdAt: now(), characters: []
            });
            input.value = '';
            if (dispInput) dispInput.value = '';
            this.save();
            this.render();
            this.toast(`${display || name} を追加しました`, 'ok');
            input.focus();
        },

        async delMember(mid) {
            const m = this.memberById(mid);
            if (!m) return;
            const ok = await this.confirm(
                `${m.displayName || m.discordName} をキャラ ${m.characters.length} 体ごと削除します。よろしいですか？`, '削除する');
            if (!ok) return;
            this.state.members = this.state.members.filter((x) => x.id !== mid);
            this.save();
            this.render();
            this.toast(`${m.displayName || m.discordName} を削除しました`, 'ok');
        },

        /* ================= 未割り当ての後始末 ================= */
        // 未割り当てキャラを人へ移す。名簿本体に入った時点で他のアプリからも見える。
        pendingAssign(pid, memberId) {
            const cs = CS();
            const m = this.memberById(memberId);
            if (!cs || !m) return;
            let moved = null;
            cs.mutate((members, pending) => {
                const i = pending.findIndex((c) => c.id === pid);
                if (i < 0) return;
                moved = pending.splice(i, 1)[0];
                moved.isMain = !m.characters.length;
                m.characters.push(moved);
            });
            if (moved) this.toast(`${moved.name} を ${cs.label(m)} に割り当てました`, 'ok');
            this.render();
        },

        pendingAssignAll() {
            const cs = CS();
            const sel = this.root.querySelector('[data-cm="pend-bulk-member"]');
            const m = this.memberById(sel && sel.value);
            if (!m) { this.toast('割り当て先を選んでください', 'warn'); return; }
            let n = 0;
            cs.mutate((members, pending) => {
                n = pending.length;
                pending.splice(0).forEach((c) => {
                    c.isMain = !m.characters.length;
                    m.characters.push(c);
                });
            });
            this.render();
            this.toast(`${n}体を ${cs.label(m)} に割り当てました`, 'ok');
        },

        async pendingRemove(pid) {
            const cs = CS();
            const c = cs.pending().find((x) => x.id === pid);
            if (!c) return;
            const ok = await this.confirm(`「${c.name}」を未割り当てから削除します。よろしいですか？`, '削除する');
            if (!ok) return;
            cs.mutate((members, pending) => {
                const i = pending.findIndex((x) => x.id === pid);
                if (i >= 0) pending.splice(i, 1);
            });
            this.render();
        },

        async pendingClear() {
            const cs = CS();
            const n = cs.pending().length;
            if (!n) return;
            const ok = await this.confirm(`未割り当ての${n}体をすべて削除します。よろしいですか？`, 'すべて削除');
            if (!ok) return;
            cs.mutate((members, pending) => { pending.splice(0); });
            this.render();
            this.toast(`${n}体を削除しました`, 'ok');
        },

        // ギルド未設定のキャラにギルド名を入れる。card を渡すとその人だけ。
        fillGuild(card) {
            const input = card
                ? card.querySelector('[data-cm="guild-one-name"]')
                : this.root.querySelector('[data-cm="guild-bulk-name"]');
            const name = ((input && input.value) || '').trim();
            if (!name) { this.toast('ギルド名を入力してください', 'warn'); if (input) input.focus(); return; }
            const mid = card ? card.dataset.mid : null;
            let n = 0;
            CS().mutate((members) => {
                members.forEach((m) => {
                    if (mid && m.id !== mid) return;
                    m.characters.forEach((c) => { if (!c.guild) { c.guild = name; n++; } });
                });
            });
            this.render();
            this.toast(`${n}体に「${name}」を設定しました`, 'ok');
        },

        /* ================= character actions ================= */
        async addChar(card) {
            if (!card) return;
            const m = this.memberById(card.dataset.mid);
            if (!m) return;
            const nameEl = card.querySelector('[data-cm="nc-name"]');
            const guildEl = card.querySelector('[data-cm="nc-guild"]');
            const btn = card.querySelector('[data-cm="add-char"]');
            const name = (nameEl.value || '').trim();
            const guild = (guildEl.value || '').trim();
            if (!name) { this.toast('キャラ名を入力してください', 'warn'); nameEl.focus(); return; }

            const dup = this.allChars().find((c) => norm(c.name) === norm(name));
            if (dup) {
                const ok = await this.confirm(
                    `「${dup.name}」は ${dup.who} にすでに登録されています。それでも追加しますか？`, '追加する');
                if (!ok) return;
            }

            const char = {
                id: uid('c'), name, guild, level: 0, job: '', jobId: '',
                imgURL: '', worldID: null, isMain: !m.characters.length,
                note: '', fetchedAt: '', updatedAt: now()
            };
            m.characters.push(char);
            this.save();

            // 先に名簿へ載せてから取得する。API が落ちていても登録は残る。
            const label = btn ? btn.innerHTML : '';
            if (btn) { btn.disabled = true; btn.textContent = '取得中…'; }
            let found = false;
            try {
                found = await this.applyLookup(char);
            } catch (e) {
                this.toast('APIに繋がりませんでした: ' + e.message, 'err');
            }
            if (btn) { btn.disabled = false; btn.innerHTML = label; }
            nameEl.value = '';
            guildEl.value = '';
            this.save();
            this.render();
            this.toast(found
                ? `${char.name} (Lv.${char.level} ${char.job}) を追加しました`
                : `${name} を追加しました（ランキングに見つからないため レベル/職 は手入力してください）`,
                found ? 'ok' : 'warn');
            const again = this.root.querySelector(`[data-mid="${m.id}"] [data-cm="nc-name"]`);
            if (again) again.focus();
        },

        async delChar(cid) {
            const hit = this.findChar(cid);
            if (!hit) return;
            const ok = await this.confirm(`「${hit.char.name}」を名簿から削除します。よろしいですか？`, '削除する');
            if (!ok) return;
            hit.member.characters = hit.member.characters.filter((c) => c.id !== cid);
            if (hit.char.isMain && hit.member.characters.length) hit.member.characters[0].isMain = true;
            this.save();
            this.render();
            this.toast(`${hit.char.name} を削除しました`, 'ok');
        },

        // 一括登録ツール(community_import.js)から使う。名前を渡すと
        // {name, level, job, jobId, imgURL, ...} か null が返る。
        lookup(name) { return lookupCharacter(name); },

        // API の結果をキャラに反映する。見つからなければ触らずに false。
        async applyLookup(char) {
            const info = await lookupCharacter(char.name);
            if (!info) return false;
            char.name = info.name || char.name;
            char.level = info.level;
            char.job = info.job;
            char.jobId = info.jobId;
            if (info.imgURL) char.imgURL = info.imgURL;
            char.worldID = info.worldID;
            char.fetchedAt = info.fetchedAt;
            char.updatedAt = now();
            return true;
        },

        // 複数キャラをまとめて取り直す。ボタンに進捗を出し、APIを叩く間隔を少し空ける。
        async refreshMany(ids, btn) {
            if (this.busy) { this.toast('更新中です', 'warn'); return; }
            const targets = ids.map((id) => this.findChar(id)).filter(Boolean);
            if (!targets.length) { this.toast('更新するキャラがいません', 'warn'); return; }
            this.busy = true;
            const label = btn ? btn.innerHTML : '';
            let ok = 0, miss = 0, err = 0;
            for (let i = 0; i < targets.length; i++) {
                if (btn) btn.innerHTML = `更新中 ${i + 1}/${targets.length}`;
                if (btn) btn.disabled = true;
                try {
                    if (await this.applyLookup(targets[i].char)) ok++; else miss++;
                } catch (e) {
                    err++;
                    console.warn('[Community] refresh failed:', targets[i].char.name, e.message);
                }
                if (i < targets.length - 1) await sleep(280);
            }
            this.busy = false;
            if (btn) { btn.disabled = false; btn.innerHTML = label; }
            this.save();
            this.render();
            const parts = [`${ok}体を更新`];
            if (miss) parts.push(`${miss}体は見つからず`);
            if (err) parts.push(`${err}体は通信エラー`);
            this.toast(parts.join(' / '), err ? 'err' : miss ? 'warn' : 'ok');
        },

        /* ================= modals ================= */
        // 自前のモーダル。iframe内では window.confirm が常に false を返すので使わない。
        openVeil(html, cls) {
            const veil = document.createElement('div');
            veil.className = 'cm-veil' + (cls ? ' ' + cls : '');
            veil.innerHTML = '<style>' + CSS + '</style>' + html;
            document.body.appendChild(veil);
            if (window.lucide) window.lucide.createIcons();
            return veil;
        },

        confirm(message, okLabel) {
            return new Promise((resolve) => {
                const veil = this.openVeil(`<div class="modal" style="max-width:400px">
    <h2>確認</h2>
    <p class="msg">${esc(message)}</p>
    <div class="foot"><span class="grow"></span>
        <button data-x="cancel">キャンセル</button>
        <button class="primary" data-x="ok">${esc(okLabel || 'OK')}</button>
    </div>
</div>`, 'top');
                const close = (v) => { document.removeEventListener('keydown', onKey); veil.remove(); resolve(v); };
                const onKey = (e) => {
                    if (e.key === 'Escape') close(false);
                    else if (e.key === 'Enter') close(true);
                };
                veil.addEventListener('click', (e) => {
                    if (e.target === veil) return close(false);
                    const b = e.target.closest('[data-x]');
                    if (b) close(b.dataset.x === 'ok');
                });
                document.addEventListener('keydown', onKey);
                const ok = veil.querySelector('[data-x="ok"]');
                if (ok) ok.focus();
            });
        },

        openMemberModal(mid) {
            const m = this.memberById(mid);
            if (!m) return;
            const swatches = COLORS.map((c, i) =>
                `<button type="button" data-x="color" data-i="${i}" title="色 ${i + 1}"
    style="width:22px;height:22px;padding:0;border-radius:50%;background:${c};border:2px solid ${i === m.colorIdx ? '#fff' : 'transparent'}"></button>`).join('');
            const veil = this.openVeil(`<div class="modal">
    <h2>メンバーの編集</h2>
    <div class="fld"><label>Discord名（識別用）</label><input data-x="discord" type="text" value="${esc(m.discordName)}" spellcheck="false"></div>
    <div class="fld"><label>表示名（各ツールに出る呼び名／未設定ならDiscord名）</label><input data-x="display" type="text" value="${esc(m.displayName)}"></div>
    <div class="fld"><label>メモ</label><input data-x="note" type="text" value="${esc(m.note)}" placeholder="加入日・役職など"></div>
    <div class="fld"><label>色</label><div class="row">${swatches}</div></div>
    <div class="foot"><span class="grow"></span>
        <button data-x="cancel">キャンセル</button>
        <button class="primary" data-x="save">保存</button>
    </div>
</div>`);
            let colorIdx = m.colorIdx;
            const close = () => { document.removeEventListener('keydown', onKey); veil.remove(); };
            // 確認モーダル(.top)が上に出ている間は、そちらのEscapeを横取りしない。
            const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.cm-veil.top')) close(); };
            document.addEventListener('keydown', onKey);
            veil.addEventListener('click', (e) => {
                if (e.target === veil) return close();
                const b = e.target.closest('[data-x]');
                if (!b) return;
                if (b.dataset.x === 'color') {
                    colorIdx = Number(b.dataset.i);
                    veil.querySelectorAll('[data-x="color"]').forEach((s, i) => {
                        s.style.borderColor = i === colorIdx ? '#fff' : 'transparent';
                    });
                } else if (b.dataset.x === 'cancel') close();
                else if (b.dataset.x === 'save') {
                    const name = veil.querySelector('[data-x="discord"]').value.trim();
                    if (!name) { this.toast('Discord名は必須です', 'warn'); return; }
                    if (this.state.members.some((x) => x.id !== m.id && x.discordName.toLowerCase() === name.toLowerCase())) {
                        this.toast('同じDiscord名がすでにあります', 'warn'); return;
                    }
                    m.discordName = name;
                    m.displayName = veil.querySelector('[data-x="display"]').value.trim();
                    m.note = veil.querySelector('[data-x="note"]').value.trim();
                    m.colorIdx = colorIdx;
                    this.save();
                    this.render();
                    close();
                    this.toast('保存しました', 'ok');
                }
            });
        },

        openCharModal(cid) {
            const hit = this.findChar(cid);
            if (!hit) return;
            const c = hit.char;
            const jobs = jobList();
            const jobOpts = ['<option value="">（未設定 / その他）</option>'].concat(
                Object.entries(
                    jobs.reduce((acc, j) => { (acc[j.group] = acc[j.group] || []).push(j); return acc; }, {})
                ).map(([g, list]) => `<optgroup label="${esc(g)}">` +
                    list.map((j) => `<option value="${esc(j.id)}" ${norm(j.name) === norm(c.job) ? 'selected' : ''}>${esc(j.name)}</option>`).join('') +
                    '</optgroup>')
            ).join('');
            const memberOpts = this.state.members.map((m) =>
                `<option value="${m.id}" ${m.id === hit.member.id ? 'selected' : ''}>${esc(CS().labelWithHandle(m))}</option>`).join('');

            const veil = this.openVeil(`<div class="modal">
    <h2>キャラクターの編集</h2>
    <div class="fld"><label>キャラ名</label><input data-x="name" type="text" value="${esc(c.name)}" spellcheck="false"></div>
    <div class="pair">
        <div class="fld"><label>所属ギルド</label><input data-x="guild" type="text" value="${esc(c.guild)}" list="cm-guild-list"></div>
        <div class="fld"><label>レベル</label><input data-x="level" type="number" min="0" max="300" value="${c.level || 0}"></div>
    </div>
    <div class="fld"><label>職</label><select data-x="job">${jobOpts}</select></div>
    <div class="fld"><label>紐づくDiscord名</label><select data-x="member">${memberOpts}</select></div>
    <div class="fld"><label>メモ</label><input data-x="note" type="text" value="${esc(c.note)}"></div>
    <label class="chk"><input type="checkbox" data-x="main" ${c.isMain ? 'checked' : ''}>メインキャラにする</label>
    <p class="note">最終取得: ${fmtDate(c.fetchedAt)}${c.level ? '' : '（ランキング未取得。レベル・職は手入力できます）'}</p>
    <div class="foot">
        <button data-x="refetch"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>APIで取り直す</button>
        <span class="grow"></span>
        <button data-x="cancel">キャンセル</button>
        <button class="primary" data-x="save">保存</button>
    </div>
</div>`);
            const close = () => { document.removeEventListener('keydown', onKey); veil.remove(); };
            // 確認モーダル(.top)が上に出ている間は、そちらのEscapeを横取りしない。
            const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.cm-veil.top')) close(); };
            document.addEventListener('keydown', onKey);
            veil.addEventListener('click', async (e) => {
                if (e.target === veil) return close();
                const b = e.target.closest('[data-x]');
                if (!b) return;
                if (b.dataset.x === 'cancel') return close();
                if (b.dataset.x === 'refetch') {
                    const name = veil.querySelector('[data-x="name"]').value.trim();
                    if (!name) { this.toast('キャラ名を入力してください', 'warn'); return; }
                    c.name = name;
                    b.disabled = true;
                    const label = b.innerHTML;
                    b.textContent = '取得中…';
                    try {
                        const found = await this.applyLookup(c);
                        if (found) {
                            veil.querySelector('[data-x="level"]').value = c.level;
                            const sel = veil.querySelector('[data-x="job"]');
                            if (sel) sel.value = c.jobId || '';
                            this.save();
                            this.render();
                            this.toast(`Lv.${c.level} ${c.job} を取得しました`, 'ok');
                        } else {
                            this.toast('ランキングに見つかりませんでした', 'warn');
                        }
                    } catch (err) {
                        this.toast('APIに繋がりませんでした: ' + err.message, 'err');
                    }
                    b.disabled = false;
                    b.innerHTML = label;
                    if (window.lucide) window.lucide.createIcons();
                    return;
                }
                if (b.dataset.x === 'save') {
                    const name = veil.querySelector('[data-x="name"]').value.trim();
                    if (!name) { this.toast('キャラ名は必須です', 'warn'); return; }
                    c.name = name;
                    c.guild = veil.querySelector('[data-x="guild"]').value.trim();
                    c.level = Math.max(0, Math.min(300, Number(veil.querySelector('[data-x="level"]').value) || 0));
                    c.note = veil.querySelector('[data-x="note"]').value.trim();
                    const jobId = veil.querySelector('[data-x="job"]').value;
                    const j = jobs.find((x) => x.id === jobId);
                    c.job = j ? j.name : '';
                    c.jobId = j ? j.id : '';
                    const isMain = veil.querySelector('[data-x="main"]').checked;
                    c.updatedAt = now();

                    // 別のDiscord名へ付け替え
                    const toId = veil.querySelector('[data-x="member"]').value;
                    let owner = hit.member;
                    if (toId !== hit.member.id) {
                        const to = this.memberById(toId);
                        if (to) {
                            hit.member.characters = hit.member.characters.filter((x) => x.id !== c.id);
                            to.characters.push(c);
                            owner = to;
                            if (!hit.member.characters.some((x) => x.isMain) && hit.member.characters.length) {
                                hit.member.characters[0].isMain = true;
                            }
                        }
                    }
                    // メインは1人1体
                    owner.characters.forEach((x) => { if (x !== c) x.isMain = isMain ? false : x.isMain; });
                    c.isMain = isMain;
                    if (!owner.characters.some((x) => x.isMain) && owner.characters.length) {
                        owner.characters[0].isMain = true;
                    }
                    this.save();
                    this.render();
                    close();
                    this.toast('保存しました', 'ok');
                }
            });
        },

        /* ================= data in/out ================= */
        exportJSON() {
            return JSON.stringify({ version: VERSION, members: this.state.members }, null, 2);
        },

        exportCSV() {
            const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
            const head = ['Discord名', '表示名', 'キャラ名', 'ギルド', 'レベル', '職', 'メイン', '最終更新'];
            const lines = [head.map(q).join(',')];
            this.state.members.forEach((m) => {
                m.characters.forEach((c) => {
                    lines.push([m.discordName, m.displayName, c.name, c.guild, c.level || '',
                        c.job, c.isMain ? 'main' : '', fmtDate(c.updatedAt)].map(q).join(','));
                });
            });
            return '﻿' + lines.join('\r\n');   // Excel向けにBOM付き
        },

        exportText() {
            const all = this.allChars();
            const out = [`■ コミュニティ名簿（${this.state.members.length}人 / ${all.length}キャラ）`, ''];
            this.state.members.forEach((m) => {
                // 貼る先がDiscordなので、表示名のあとに @Discord名 も残しておく。
                out.push(m.displayName && m.displayName !== m.discordName
                    ? `${m.displayName}（@${m.discordName}）`
                    : `@${m.discordName}`);
                if (!m.characters.length) { out.push('  ・（キャラ未登録）'); }
                m.characters.slice().sort((a, b) => (b.level || 0) - (a.level || 0)).forEach((c) => {
                    const bits = [c.name];
                    bits.push(c.level ? 'Lv.' + c.level : 'Lv.--');
                    if (c.job) bits.push(c.job);
                    if (c.guild) bits.push('[' + c.guild + ']');
                    out.push('  ・' + bits.join(' '));
                });
                out.push('');
            });
            return out.join('\n');
        },

        download(text, filename, mime) {
            const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        },

        async copy(text) {
            try {
                await navigator.clipboard.writeText(text);
                this.toast('コピーしました', 'ok');
            } catch (e) {
                this.toast('コピーできませんでした。テキストを選択して手動でコピーしてください', 'warn');
            }
        },

        importJSON(raw) {
            const parsed = JSON.parse(raw);
            const members = Array.isArray(parsed) ? parsed : parsed && parsed.members;
            if (!Array.isArray(members)) throw new Error('members の配列が見つかりません');
            this.state.members = members;   // ストアが整形・保存・共有まで面倒を見る
            this.save();
            this.render();
        },

        openData() {
            const stamp = new Date().toISOString().slice(0, 10);
            // 名簿を丸ごと置き換える操作（JSON取り込み・スプレッドシート取り込み・全消去）は
            // 共有データを一撃で壊せるので、普段の画面には出さない。URL に ?admin=1 を
            // 付けたときだけ現れる。
            const admin = ADMIN;
            const veil = this.openVeil(`<div class="modal${admin ? ' wide' : ''}">
    <h2>データ</h2>
    <p class="note" style="margin-top:0">名簿はコミュニティ全員で共有しています。書き出しは自由に使ってください。</p>
    <div class="${admin ? 'io' : ''}">
        <div>
            <div class="col-h">書き出し</div>
            <div class="row">
                <button class="primary" data-x="dl-json"><i data-lucide="download" class="w-3.5 h-3.5"></i>JSON</button>
                <button data-x="dl-csv"><i data-lucide="download" class="w-3.5 h-3.5"></i>CSV</button>
                <button data-x="copy-json"><i data-lucide="copy" class="w-3.5 h-3.5"></i>コピー</button>
                <button data-x="copy-text"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Discord用テキスト</button>
            </div>
            <textarea data-x="out" readonly>${esc(this.exportJSON())}</textarea>
        </div>
        ${admin ? `<div>
            <div class="col-h">読み込み（管理用）</div>
            <div class="row">
                <input type="file" data-x="file" accept="application/json">
                <button data-x="load"><i data-lucide="upload" class="w-3.5 h-3.5"></i>貼り付けたJSONを読み込む</button>
            </div>
            <textarea data-x="in" placeholder="ここにJSONを貼り付けて「貼り付けたJSONを読み込む」"></textarea>
            <p class="note">読み込むと共有の名簿が置き換わります。</p>
        </div>` : ''}
    </div>
    <div class="foot">
        ${admin ? '<button class="danger" data-x="wipe">すべて消す</button>' +
                  '<button data-x="bulk"><i data-lucide="table" class="w-3.5 h-3.5"></i>スプレッドシートから一括登録</button>' : ''}
        <button data-x="bulk-chars"><i data-lucide="list-plus" class="w-3.5 h-3.5"></i>キャラを一括追加</button>
        <span class="grow"></span>
        <button data-x="close">閉じる</button>
    </div>
</div>`);
            const close = () => { document.removeEventListener('keydown', onKey); veil.remove(); };
            // 確認モーダル(.top)が上に出ている間は、そちらのEscapeを横取りしない。
            const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.cm-veil.top')) close(); };
            document.addEventListener('keydown', onKey);
            const out = veil.querySelector('[data-x="out"]');
            const inp = veil.querySelector('[data-x="in"]');

            if (admin) veil.querySelector('[data-x="file"]').addEventListener('change', (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                const fr = new FileReader();
                fr.onload = () => { inp.value = String(fr.result || ''); };
                fr.readAsText(f);
            });

            veil.addEventListener('click', async (e) => {
                if (e.target === veil) return close();
                const b = e.target.closest('[data-x]');
                if (!b || b.tagName === 'TEXTAREA' || b.tagName === 'INPUT') return;
                const x = b.dataset.x;
                if (x === 'close') close();
                else if (x === 'bulk') {
                    if (!admin) return;
                    if (window.communityImport) window.communityImport.open();
                    else this.toast('一括登録ツールが読み込まれていません', 'err');
                }
                else if (x === 'bulk-chars') {
                    if (window.communityImport) window.communityImport.openChars();
                    else this.toast('一括登録ツールが読み込まれていません', 'err');
                }
                else if (x === 'dl-json') this.download(this.exportJSON(), `community-${stamp}.json`, 'application/json');
                else if (x === 'dl-csv') this.download(this.exportCSV(), `community-${stamp}.csv`, 'text/csv');
                else if (x === 'copy-json') this.copy(this.exportJSON());
                else if (x === 'copy-text') { out.value = this.exportText(); this.copy(out.value); }
                else if (x === 'load') {
                    if (!admin) return;
                    const raw = inp.value.trim();
                    if (!raw) { this.toast('JSONを貼り付けてください', 'warn'); return; }
                    const ok = await this.confirm('現在の名簿を、貼り付けたJSONで置き換えます。よろしいですか？', '置き換える');
                    if (!ok) return;
                    try {
                        this.importJSON(raw);
                        out.value = this.exportJSON();
                        inp.value = '';
                        this.toast(`${this.state.members.length}人 / ${this.allChars().length}キャラを読み込みました`, 'ok');
                    } catch (err) {
                        this.toast('読み込めませんでした: ' + err.message, 'err');
                    }
                } else if (x === 'wipe' && admin) {
                    const ok = await this.confirm('名簿をすべて削除します。元に戻せません。よろしいですか？', 'すべて消す');
                    if (!ok) return;
                    this.state.members = [];
                    this.state.ui.closed = [];
                    this.save();
                    this.render();
                    out.value = this.exportJSON();
                    this.toast('名簿を空にしました', 'ok');
                }
            });
        },

        /* ================= toast ================= */
        toast(msg, kind) {
            document.querySelectorAll('.cm-toast').forEach((t) => t.remove());
            const t = document.createElement('div');
            t.className = 'cm-toast' + (kind ? ' ' + kind : '');
            t.setAttribute('role', 'status');
            t.textContent = msg;
            document.body.appendChild(t);
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => t.remove(), 3200);
        }
    };

    window.community = community;
})();
