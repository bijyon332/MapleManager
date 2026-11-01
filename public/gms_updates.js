/* =========================================================
 *  Journal（サイドバーの Information。旧 News。キーは updates のまま）
 *  GMS・KMS のアップデート告知の和訳と、Bijyon が書いたコラムを、回ごとに読めるようにする。
 *  上部バーの「GMS」「KMS」（パッチ情報）と、少し離した「Column」で切り替え、その一覧（新しい順の縦の並び）が出る。
 *  行を押すとその回のページが出る。
 *  回のページは「目次＋全訳」の1枚（要約は作らない）。目次から各節へ飛び、各節の「↑ 目次へ」で戻る。
 *  書き方のルールは .claude/skills/news-translation/SKILL.md。
 *  上部バーは index.html の #updates-nav。
 *
 *  URL（script.js のハッシュ方式に乗せる）:
 *    /#updates/<id>                      その回
 *    /#updates/gms | kms | column        その一覧（/#updates だけなら GMS の一覧）
 *    /journal/<id>                       人に渡す用。worker.js が Discord などのプレビュー用の
 *                                        タグ（タイトル・概要・カバー画像）を返してから /#updates/<id> へ送る。
 *  回の id を後から変えると、配った URL が開けなくなる（一覧に戻るだけ）ので変えない。
 *
 *  回の一覧は public/updates/list.json（worker.js もプレビューのためにここを読む）。
 *  上ほど新しい。一覧はこの並び順で出す（date の順ではない）。1件の形:
 *    id        public/updates/<id>/ の名前。URL にもなる
 *    region    'GMS' | 'KMS' | 'COLUMN'。上部バーのどれに出すか
 *    date      告知の日付（'2026-10-17'）
 *    kind      一覧のバッジ（'GMS Update' など）
 *    title / subtitle / period / summary   一覧とプレビューに出す文
 *    cover     一覧のサムネイルとプレビューの画像（'updates/<id>/img-02.jpg'）。なくてもよい
 *
 *  新しい回を足すとき:
 *    1. python3 -I tools/import_gms_update.py <和訳.html> <id>
 *       → public/updates/<id>/content.html と画像が出来る
 *    2. list.json の先頭に1件足す。過去の回は消さない。
 *
 *  コラムの回も同じ形（public/updates/<id>/content.html）。region は 'COLUMN'、id は col- で始める。
 *  kind は 'Column'、subtitle は 'by Bijyon'、period は空でよい。cover がなければ一覧はペンのアイコンになる。
 * ========================================================= */

const gmsUpdates = {
    LIST: [],          // public/updates/list.json の中身
    REGIONS: { gms: 'GMS', kms: 'KMS', column: 'COLUMN' },   // URL の名前 -> region

    root: null,
    region: 'GMS',     // 'GMS' | 'KMS' | 'COLUMN'。一覧に出す地域（COLUMN はコラム）
    current: null,     // 開いている回の id。null なら一覧
    _html: {},         // id -> content.html の Promise
    _ready: false,     // list.json を読み終えたか
    _shown: false,     // 一度でも画面を出したか

    async init(rootId, sub) {
        this.root = document.getElementById(rootId);
        // 中身の目次や「↑ 目次へ」は #d-… / #toc のリンク。URL のハッシュはアプリの切り替えに
        // 使っているので書き換えさせず、ここで受けてページ内を動かす。
        this.root.addEventListener('click', (ev) => {
            const a = ev.target.closest('a[href^="#"]');
            if (!a || !this.root.contains(a)) return;
            ev.preventDefault();
            this.jump(a.getAttribute('href').slice(1));
        });
        this.root.innerHTML = `<div class="text-center py-20 text-base-content/50 text-xs">読み込み中…</div>`;
        try {
            const res = await fetch('updates/list.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(`一覧を読み込めませんでした (${res.status})`);
            this.LIST = await res.json();
        } catch (e) {
            console.error(e);
            this.root.innerHTML = `<div class="text-center py-20 text-base-content/50 text-xs">${this.esc(e.message)}</div>`;
            return;
        }
        this._ready = true;
        this.route(sub);
    },

    // URL の #updates/ より後ろ（'' | 'gms' | 'kms' | 'column' | 回の id）の画面にする。
    // 履歴は積まない（URL の方が先に変わっているので）。知らない id は一覧に戻して URL も直す。
    route(sub) {
        if (!this._ready) return;
        const key = String(sub || '').replace(/\/+$/, '');
        const u = this.LIST.find(x => x.id === key);
        const current = u ? u.id : null;
        const region = u ? u.region : (this.REGIONS[key.toLowerCase()] || 'GMS');
        // 戻る・進むでは popstate と hashchange の両方が来る。同じ画面なら描き直さない（スクロールを保つ）。
        if (this._shown && current === this.current && region === this.region) { this.syncUrl(true); return; }
        this.current = current;
        this.region = region;
        this._shown = true;
        this.render();
        this.syncUrl(true);
    },

    // 今の画面を表す #updates/ の後ろ。script.js の appUrl がサイドバーから開くときにも使う。
    subpath() {
        if (!this._ready) return '';
        return this.current || Object.keys(this.REGIONS).find(k => this.REGIONS[k] === this.region);
    },

    // 今の画面に URL を合わせる。replace は route から（履歴を積まずに直すだけ）。
    syncUrl(replace) {
        if (window.app?.currentApp !== 'updates') return;
        const url = app.appUrl('updates');
        if (url === location.pathname + location.search + location.hash) return;
        if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
    },

    // 人に渡す用の URL（worker.js がプレビューを付けて /#updates/<id> へ送る）
    shareUrl(id) { return `${location.origin}/journal/${encodeURIComponent(id)}`; },

    async copyLink(btn) {
        const url = this.shareUrl(this.current);
        let ok = false;
        try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
            // http や古いブラウザで clipboard が使えないとき
            const ta = document.createElement('textarea');
            ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { ok = document.execCommand('copy'); } catch (e2) {}
            ta.remove();
        }
        if (!ok) { window.prompt('この URL をコピーしてください', url); return; }
        btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i>コピーしました`;
        if (window.lucide) lucide.createIcons();
        clearTimeout(this._copyTimer);
        this._copyTimer = setTimeout(() => {
            if (!btn.isConnected) return;
            btn.innerHTML = `<i data-lucide="link" class="w-4 h-4"></i>リンクをコピー`;
            if (window.lucide) lucide.createIcons();
        }, 2000);
    },

    render() {
        if (this.current) this.renderUpdate(); else this.renderList();
        this.syncNav();
    },

    // 上部バーの名前と、一覧の上の見出し・説明
    tabLabel(region) { return region === 'COLUMN' ? 'Column' : region; },

    listIntro(region) {
        return region === 'COLUMN'
            ? 'Bijyon が調べたことや検証したことを置いておく場所です。'
            : `${region} のアップデート告知の和訳などです。新しい順に並んでいます。手動で載せているので、すべての告知があるわけではありません。`;
    },

    esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    renderList() {
        const list = this.LIST.filter(u => u.region === this.region);
        const rows = list.map(u => `
            <li><button type="button" onclick="gmsUpdates.open('${u.id}')" class="news-row">
                ${u.cover ? `<img src="${this.esc(u.cover)}" alt="" loading="lazy" class="news-thumb">`
                    : `<div class="news-thumb news-thumb-column"><i data-lucide="pen-line" class="w-8 h-8"></i></div>`}
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 text-xs">
                        <span class="font-mono text-base-content/60">${this.esc(u.date.replace(/-/g, '/'))}</span>
                        <span class="badge badge-sm ${u.region === 'COLUMN' ? 'badge-warning' : 'badge-primary'} badge-soft">${this.esc(u.kind)}</span>
                        <span class="text-primary font-bold">${this.esc(u.period)}</span>
                    </div>
                    <div class="text-base font-bold text-white leading-snug mt-1">${this.esc(u.title)}
                        <span class="text-xs font-normal text-base-content/60 ml-1">${this.esc(u.subtitle)}</span></div>
                    <div class="text-sm text-base-content/75 mt-1 line-clamp-2">${this.esc(u.summary)}</div>
                </div>
                <i data-lucide="chevron-right" class="w-5 h-5 text-base-content/40 shrink-0"></i>
            </button></li>`).join('');
        this.root.innerHTML = `
            <div class="max-w-4xl mx-auto">
                <h2 class="text-lg font-bold text-white mb-1">Journal <span class="${this.region === 'COLUMN' ? 'text-warning' : 'text-primary'}">${this.tabLabel(this.region)}</span></h2>
                <p class="text-xs text-base-content/60 mb-4">${this.listIntro(this.region)}</p>
                ${list.length ? `<ul class="news-list">${rows}</ul>`
                    : `<div class="news-list text-center py-12 text-sm text-base-content/50">まだありません。</div>`}
            </div>`;
        if (window.lucide) lucide.createIcons();
        this.scrollTop();
    },

    loadContent(id) {
        if (this._html[id]) return this._html[id];
        const p = fetch(`updates/${id}/content.html`).then(res => {
            if (!res.ok) throw new Error(`読み込めませんでした: ${id} (${res.status})`);
            return res.text();
        });
        p.catch(() => { delete this._html[id]; });
        return this._html[id] = p;
    },

    async renderUpdate() {
        const id = this.current;
        const u = this.LIST.find(x => x.id === id);
        this.root.innerHTML = `<div class="text-center py-20 text-base-content/50 text-xs">読み込み中…</div>`;
        let html;
        try {
            html = await this.loadContent(id);
        } catch (e) {
            console.error(e);
            this.root.innerHTML = `<div class="text-center py-20 text-base-content/50 text-xs">${this.esc(e.message)}</div>`;
            return;
        }
        if (this.current !== id) return;   // 読み込み中に一覧へ戻った
        this.root.innerHTML = `
            <div class="gms-update max-w-5xl mx-auto">
                <button type="button" onclick="gmsUpdates.showRegion('${u.region}')" class="news-back btn btn-ghost btn-sm gap-1.5 -ml-3 mb-2 text-base-content/70">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i>${this.esc(this.tabLabel(u.region))} の一覧へ
                </button>
                <div class="mb-4 flex items-end gap-4">
                    <div class="min-w-0 flex-1">
                        ${u.period ? `<div class="text-xs font-bold text-primary">${this.esc(u.period)}</div>` : ''}
                        <h2 class="text-xl font-bold text-white leading-tight">${this.esc(u.title)}</h2>
                        <div class="text-xs text-base-content/60">${this.esc(u.subtitle)}</div>
                    </div>
                    <button type="button" onclick="gmsUpdates.copyLink(this)" class="btn btn-soft ${u.region === 'COLUMN' ? 'btn-warning' : 'btn-primary'} btn-sm gap-1.5 shrink-0">
                        <i data-lucide="link" class="w-4 h-4"></i>リンクをコピー
                    </button>
                </div>
                ${html}
            </div>`;
        if (window.lucide) lucide.createIcons();
        this.scrollTop();
    },

    open(id) {
        this.current = id;
        this.region = this.LIST.find(x => x.id === id)?.region || this.region;
        this.render();
        this.syncUrl(false);
    },

    // 上部バーの GMS／KMS／Column。回を開いているときに押すと、その一覧に戻る。
    showRegion(region) {
        if (!this._ready) return;
        this.region = region;
        this.current = null;
        this.render();
        this.syncUrl(false);
    },

    // 目次の項目は d-…、各節の「↑ 目次へ」は toc。そこまで送って一瞬枠を付ける。
    jump(id) {
        const el = this.root.querySelector(`[id="${CSS.escape(id)}"]`);
        if (!el) { this.scrollTop(); return; }
        el.scrollIntoView({ block: 'start' });
        el.classList.add('jump-target');
        setTimeout(() => el.classList.remove('jump-target'), 1600);
    },

    scrollTop() {
        const main = this.root.closest('main');
        if (main) main.scrollTop = 0;
    },

    // 上部バー。今の地域（回を開いているときはその回の地域）を選択中にする。
    syncNav() {
        const nav = document.getElementById('updates-nav');
        if (!nav) return;
        nav.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('tab-active', b.dataset.tab === this.region));
    },
};
