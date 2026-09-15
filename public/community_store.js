// community_store.js — コミュニティ名簿の共有ストア。
//
// 「Discord名 → その人のキャラ」という対応を1か所で持ち、
//   Community（名簿の編集）
//   Boss Scheduler（名簿のキャラに週ボスの希望を出す）
//   GMS Planner（名簿のキャラを取り込んで週ボスを管理する）
//   EXP Leaderboard（メンバーを選んでキャラをまとめて追加する）
// の4つが同じものを見るようにするための土台。
//
// 保存はローカル(localStorage)と共有DB(D1 /api/community)の二段。
// APIが無い環境（静的に開いた場合など）でもローカルだけで今までどおり動く。
// 競合は Boss Scheduler と同じく「読んだ version を送り、サーバ側で一致した
// ときだけ更新」で防ぐ。
//
// 使う側は基本これだけ:
//   await communityStore.ready();
//   communityStore.members();            // 名簿
//   communityStore.characters();         // 全キャラ（memberId/discordName付き）
//   communityStore.me();                 // このブラウザの持ち主（未設定なら null）
//   communityStore.mutate((members) => { ... });   // 変更して保存＋共有
//   communityStore.onChange(render);     // 他の人の更新でも呼ばれる
(function () {
    'use strict';

    // Boss Scheduler はホスト(index.html)の iframe で動く。同一オリジンなので、
    // 親に既にストアがあればその実体を使い回す。iframeと親で別々に持つと、
    // 片方の保存がもう片方から見て「他の人が先に保存した」ことになり、
    // 何もしていないのに競合が出る。
    try {
        if (window.parent !== window && window.parent.communityStore) {
            window.communityStore = window.parent.communityStore;
            return;
        }
    } catch (e) { /* クロスオリジンで親を見られない場合は自前で持つ */ }

    const LOCAL_KEY = 'gms-community-roster';
    const LEGACY_KEY = 'gms-community-v1';        // Communityアプリがローカル専用だった頃の保存先
    const ME_KEY = 'gms-community-me';            // このブラウザの持ち主（メンバーid）
    const EDIT_KEY_STORAGE = 'boss-scheduler-edit-key';  // 編集キーは編成と共通
    const API = '/api/community';
    const SCHEDULER_API = '/api/scheduler';
    const VERSION = 1;
    const PUSH_DELAY = 1200;      // 連続操作をまとめる
    const POLL_INTERVAL = 60000;  // 他の人の更新を拾う間隔

    // 編成と同じ ?view=1 で閲覧専用。共有DBへは書かない。
    const VIEW_ONLY = new URLSearchParams(location.search).get('view') === '1';

    const COLORS = [
        '#a5b4fc', '#67e8f9', '#fda4af', '#fcd34d', '#86efac',
        '#c4b5fd', '#f9a8d4', '#5eead4', '#fdba74', '#93c5fd'
    ];

    const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);
    const now = () => new Date().toISOString();
    const readLS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const writeLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 容量超過などは無視 */ } };

    // キャラ1体ぶんの整形。Community 側の項目（guild/level/job/imgURL）と
    // Boss Scheduler 側の項目（combatPower/hexa/isActive）を両方持つ1つの形にまとめる。
    function normalizeChar(c, seen) {
        if (!c.id || seen.has(c.id)) c.id = uid('c');
        seen.add(c.id);
        c.name = String(c.name || '').trim();
        c.guild = String(c.guild || '').trim();
        c.level = Number(c.level) || 0;
        c.job = String(c.job || '');
        c.jobId = String(c.jobId || '');
        c.imgURL = String(c.imgURL || '');
        c.note = String(c.note || '');
        if (c.combatPower == null) c.combatPower = 0;
        if (c.hexa == null) c.hexa = 0;
        if (c.isActive == null) c.isActive = true;
        if (c.isMain == null) c.isMain = false;
        if (!c.updatedAt) c.updatedAt = now();
        return c;
    }

    // 欠損フィールドの補完と参照の掃除。ローカル読み込み後・取り込み後に必ず通す。
    function normalize(members) {
        const seen = new Set();
        const out = (Array.isArray(members) ? members : []).filter((m) => m && typeof m === 'object');
        out.forEach((m, i) => {
            if (!m.id || seen.has(m.id)) m.id = uid('m');
            seen.add(m.id);
            m.discordName = String(m.discordName || '').trim() || '(no name)';
            m.displayName = String(m.displayName || '').trim();
            m.note = String(m.note || '');
            if (m.colorIdx == null) m.colorIdx = i % COLORS.length;
            if (m.isActive == null) m.isActive = true;
            if (!m.createdAt) m.createdAt = now();
            if (!Array.isArray(m.characters)) m.characters = [];
            m.characters = m.characters.filter((c) => c && typeof c === 'object');
            m.characters.forEach((c) => normalizeChar(c, seen));
            // メインは1人1体。複数立っていたら先頭だけ残す。
            const mains = m.characters.filter((c) => c.isMain);
            if (mains.length > 1) mains.slice(1).forEach((c) => { c.isMain = false; });
            if (!mains.length && m.characters.length) m.characters[0].isMain = true;
        });
        return out;
    }

    // 持ち主が決まっていないキャラ。キャラ名だけの一括登録で入り、
    // Community の「未割り当て」タブから人へ割り当てる。
    // 他のアプリ（Scheduler / Planner / Leaderboard）からは見えない。
    function normalizePending(list, members) {
        const seen = new Set(
            (members || []).flatMap((m) => [m.id].concat(m.characters.map((c) => c.id))));
        return (Array.isArray(list) ? list : [])
            .filter((c) => c && typeof c === 'object' && String(c.name || '').trim())
            .map((c) => { c.isMain = false; return normalizeChar(c, seen); });
    }

    const store = {
        members_: [],
        pending_: [],   // 持ち主が未定のキャラ
        loaded: false,
        loading: null,
        listeners: [],
        sync: {
            mode: 'local',   // local | synced | saving | conflict | needkey | error
            version: 0,
            updatedAt: null,
            updatedBy: null,
            message: ''
        },
        timer: 0,
        inFlight: false,
        pendingPush: false,   // 送信中にさらに変更があった
        lastPushed: null,
        polling: 0,
        VIEW_ONLY,
        COLORS,
        uid,
        now,

        /* ---------- 読み書き ---------- */
        members() { return this.members_; },
        // 人に割り当てられていないキャラ。名簿の「未割り当て」タブだけが扱う。
        pending() { return this.pending_; },
        characters() {
            return this.members_.flatMap((m) => m.characters.map((c) => Object.assign({}, c, {
                memberId: m.id,
                discordName: m.discordName,
                who: m.displayName || m.discordName,
                colorIdx: m.colorIdx
            })));
        },
        memberById(id) { return this.members_.find((m) => m.id === id) || null; },
        charById(id) {
            for (const m of this.members_) {
                const c = m.characters.find((x) => x.id === id);
                if (c) return { member: m, char: c };
            }
            return null;
        },
        color(m) { return COLORS[((m && m.colorIdx) || 0) % COLORS.length]; },
        // 画面に出す名前は表示名。Discord名は「誰か」を決める識別子で、
        // 名簿の管理画面と、Discordへ貼るテキストにだけ出す。
        // 表示名が未設定の人は Discord名 をそのまま呼び名にする。
        label(m) { return m ? (m.displayName || m.discordName) : ''; },
        handle(m) { return m ? m.discordName : ''; },
        // 表示名を出したうえで、別名のときだけ Discord名 を添える。
        labelWithHandle(m) {
            if (!m) return '';
            return m.displayName && m.displayName !== m.discordName
                ? `${m.displayName}（@${m.discordName}）`
                : m.discordName;
        },

        // このブラウザの持ち主。Planner のデータ分けと、各アプリの初期選択に使う。
        me() { return this.memberById(readLS(ME_KEY)); },
        setMe(memberId) {
            writeLS(ME_KEY, memberId || '');
            this.emit();
        },

        /* ---------- 変更 ---------- */
        // members を直接いじって保存する。戻り値は fn の戻り値。
        mutate(fn) {
            const r = fn(this.members_, this.pending_);
            this.commit();
            return r;
        },
        // 整形 → ローカル保存 → 共有DBへ → 購読者へ通知。
        // 通知を出すのは、名簿を直したときに Planner や Scheduler が
        // 自分で気づいて追随できるようにするため。自分で描き直す画面は
        // onChange 側で「自分の保存なら無視する」ようにしておくこと。
        commit() {
            this.members_ = normalize(this.members_);
            this.pending_ = normalizePending(this.pending_, this.members_);
            this.saveLocal();
            this.schedulePush();
            this.emit();
        },
        // 取り込みなどで丸ごと差し替えるとき。
        replaceAll(members, pending) {
            this.members_ = normalize(members);
            if (pending !== undefined) this.pending_ = pending;
            this.pending_ = normalizePending(this.pending_, this.members_);
            this.saveLocal();
            this.schedulePush();
            this.emit();
        },

        saveLocal() {
            writeLS(LOCAL_KEY, JSON.stringify({ version: VERSION, members: this.members_, pending: this.pending_ }));
        },

        onChange(cb) { if (typeof cb === 'function') this.listeners.push(cb); },
        // iframe を作り直すと、そこで登録された購読者は死んだ画面を触って例外を出す。
        // 一度失敗したものは外して、生きている購読者だけ残す。
        emit() {
            const alive = [];
            this.listeners.forEach((cb) => {
                try { cb(); alive.push(cb); } catch (e) { console.warn('[communityStore] listener removed:', e); }
            });
            this.listeners = alive;
        },

        /* ---------- 起動 ---------- */
        // 何度呼んでも読み込みは一度だけ。
        ready() {
            if (this.loading) return this.loading;
            this.loading = this.boot();
            return this.loading;
        },

        async boot() {
            this.loadLocal();
            await this.pull({ initial: true });
            this.loaded = true;
            this.startPolling();
            return this;
        },

        loadLocal() {
            let members = null;
            let pending = null;
            try {
                const raw = readLS(LOCAL_KEY);
                if (raw) {
                    const p = JSON.parse(raw);
                    if (p && Array.isArray(p.members)) { members = p.members; pending = p.pending; }
                }
            } catch (e) { /* 壊れていたら次の候補へ */ }
            // Communityアプリがローカル専用だった頃のデータを引き継ぐ。
            if (!members) {
                try {
                    const raw = readLS(LEGACY_KEY);
                    if (raw) {
                        const p = JSON.parse(raw);
                        if (p && Array.isArray(p.members)) members = p.members;
                    }
                } catch (e) { /* 無ければ空で始める */ }
            }
            this.members_ = normalize(members || []);
            this.pending_ = normalizePending(pending || [], this.members_);
        },

        setMode(mode, message) {
            this.sync.mode = mode;
            this.sync.message = message || '';
            this.emit();
        },

        // 起動時と、他の人の更新を拾うとき。サーバに中身があればそれを正とする。
        async pull(opts) {
            const initial = opts && opts.initial;
            let body;
            try {
                const res = await fetch(API, { cache: 'no-store' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                body = await res.json();
            } catch (e) {
                // APIが無い/落ちている環境ではローカルだけで動かす。
                if (initial) this.setMode('local', '共有DBに繋がらないため、この端末だけで保存します');
                return false;
            }

            this.sync.version = body.version || 0;
            this.sync.updatedAt = body.updatedAt;
            this.sync.updatedBy = body.updatedBy;

            const remote = body.data && Array.isArray(body.data.members) ? body.data.members : null;
            const remoteHasData = remote && remote.length;
            const localHasData = this.members_.length;

            if (remoteHasData) {
                this.members_ = normalize(remote);
                this.pending_ = normalizePending(body.data.pending || [], this.members_);
                this.saveLocal();
                this.lastPushed = this.payloadString();
                this.setMode('synced');
                return true;
            }

            // サーバが空。編成側に旧いメンバーが残っていれば、それを名簿の出発点にする。
            if (initial && !localHasData) {
                const moved = await this.importFromScheduler({ quiet: true });
                if (moved) return true;
            }

            this.setMode('synced');
            // サーバが空でこちらに中身があるなら、こちらを初期データとして送る。
            if (localHasData && !VIEW_ONLY) this.push();
            return true;
        },

        payloadString() {
            return JSON.stringify({ version: VERSION, members: this.members_, pending: this.pending_ });
        },

        schedulePush() {
            if (VIEW_ONLY) return;
            if (this.sync.mode === 'local' || this.sync.mode === 'conflict') return;
            if (this.payloadString() === this.lastPushed) return;
            clearTimeout(this.timer);
            this.timer = setTimeout(() => { this.timer = 0; this.push(); }, PUSH_DELAY);
        },

        async push() {
            if (VIEW_ONLY) return;
            if (this.sync.mode === 'local' || this.sync.mode === 'conflict') return;
            if (this.inFlight) { this.pendingPush = true; return; }
            this.inFlight = true;
            this.setMode('saving');

            const payload = this.payloadString();
            const key = readLS(EDIT_KEY_STORAGE) || '';
            let res, body;
            try {
                res = await fetch(API, {
                    method: 'PUT',
                    headers: Object.assign({ 'Content-Type': 'application/json' },
                        key ? { 'X-Edit-Key': key } : {}),
                    body: JSON.stringify({
                        version: this.sync.version,
                        data: JSON.parse(payload),
                        updatedBy: this.label(this.me())
                    })
                });
                body = await res.json();
            } catch (e) {
                this.inFlight = false;
                this.setMode('error', '保存に失敗しました（通信エラー）');
                return;
            }
            this.inFlight = false;

            if (res.ok) {
                this.sync.version = body.version;
                this.sync.updatedAt = body.updatedAt;
                this.sync.updatedBy = body.updatedBy;
                this.lastPushed = payload;
                this.setMode('synced');
                if (this.pendingPush) { this.pendingPush = false; this.schedulePush(); }
                return;
            }
            if (res.status === 401) {
                this.setMode('needkey', '編集キーが必要です');
                return;
            }
            if (res.status === 409) {
                this.sync.version = body.version || this.sync.version;
                this.sync.updatedAt = body.updatedAt || this.sync.updatedAt;
                this.sync.updatedBy = body.updatedBy;
                this.setMode('conflict', '他の人が先に保存しています');
                return;
            }
            this.setMode('error', (body && body.error) || '保存に失敗しました');
        },

        // 競合したときは、サーバ側を正として読み直す（こちらの変更は捨てる）。
        async resolveConflict() {
            this.sync.mode = 'synced';
            await this.pull();
        },

        startPolling() {
            if (this.polling) return;
            this.polling = setInterval(async () => {
                if (this.sync.mode !== 'synced') return;
                if (this.inFlight || this.timer) return;
                try {
                    const res = await fetch(API, { cache: 'no-store' });
                    if (!res.ok) return;
                    const body = await res.json();
                    if (!body || body.version === this.sync.version) return;
                    this.sync.version = body.version;
                    this.sync.updatedAt = body.updatedAt;
                    this.sync.updatedBy = body.updatedBy;
                    if (body.data && Array.isArray(body.data.members)) {
                        this.members_ = normalize(body.data.members);
                        this.pending_ = normalizePending(body.data.pending || [], this.members_);
                        this.saveLocal();
                        this.lastPushed = this.payloadString();
                        this.emit();
                    }
                } catch (e) { /* 次の周期で拾う */ }
            }, POLL_INTERVAL);
        },

        /* ---------- Boss Scheduler からの移行 ---------- */
        // 名簿を作る前の編成データには members が入っている。キャラの id は
        // 希望・PT編成から参照されているので、そのまま持ってくる。
        async importFromScheduler(opts) {
            const quiet = opts && opts.quiet;
            let body;
            try {
                const res = await fetch(SCHEDULER_API, { cache: 'no-store' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                body = await res.json();
            } catch (e) {
                if (!quiet) throw e;
                return 0;
            }
            const members = body && body.data && Array.isArray(body.data.members) ? body.data.members : [];
            if (!members.length) return 0;

            const byName = new Map(this.members_.map((m) => [m.discordName.toLowerCase(), m]));
            const known = new Set(this.characters().map((c) => c.id));
            let added = 0;
            members.forEach((sm) => {
                const hit = byName.get(String(sm.discordName || '').toLowerCase());
                if (hit) {
                    (sm.characters || []).forEach((sc) => {
                        if (known.has(sc.id)) return;
                        if (hit.characters.some((c) => c.name.toLowerCase() === String(sc.name || '').toLowerCase())) return;
                        hit.characters.push(Object.assign({}, sc));
                        added++;
                    });
                } else {
                    this.members_.push(Object.assign({}, sm, { characters: (sm.characters || []).map((c) => Object.assign({}, c)) }));
                    added += (sm.characters || []).length || 1;
                }
            });
            if (!added) return 0;
            this.members_ = normalize(this.members_);
            this.saveLocal();
            this.setMode('synced');
            if (!VIEW_ONLY) await this.push();
            this.emit();
            return added;
        },

        /* ---------- UI 用 ---------- */
        syncLabel() {
            const s = this.sync;
            if (s.mode === 'synced') return '共有中';
            if (s.mode === 'saving') return '保存中…';
            if (s.mode === 'local') return 'この端末のみ';
            if (s.mode === 'conflict') return '競合';
            if (s.mode === 'needkey') return '編集キー必要';
            return 'エラー';
        }
    };

    window.communityStore = store;
})();
