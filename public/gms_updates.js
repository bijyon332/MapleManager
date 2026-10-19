/* =========================================================
 *  News（サイドバーの Information。キーは updates のまま）
 *  GMS・KMS のアップデート告知の和訳などを、回ごとに読めるようにする。
 *  上部バーの「GMS」「KMS」で地域を切り替え、その地域のニュース一覧（新しい順の縦の並び）が出る。
 *  行を押すとその回のページが出る。
 *  回のページは「目次＋全訳」の1枚（要約は作らない）。目次から各節へ飛び、各節の「↑ 目次へ」で戻る。
 *  書き方のルールは .claude/skills/news-translation/SKILL.md。
 *  上部バーは index.html の #updates-nav。
 *
 *  新しい回を足すとき:
 *    1. python3 -I tools/import_gms_update.py <和訳.html> <id>
 *       → public/updates/<id>/content.html と画像が出来る
 *    2. 下の LIST の先頭に1件足す（上ほど新しい）。region に 'GMS' か 'KMS'。過去の回は消さない。
 * ========================================================= */

const gmsUpdates = {
    LIST: [
        {
            id: '2026-winter-maplayer-one',
            region: 'GMS',               // 'GMS' | 'KMS'。上部バーのどちらに出すか
            date: '2026-10-17',          // 告知の日付。一覧はこの順ではなく LIST の並び順で出す
            kind: 'GMS Update',          // 一覧のバッジ
            title: 'Inkwell\'s Note: Maplayer One',
            subtitle: '2026年冬アップデート プレビュー',
            period: '2026/11/11〜',
            cover: 'updates/2026-winter-maplayer-one/img-02.jpg',
            summary: '冬アップデートのプレビュー。新イベントワールド Quanah、新職業レテ、HEXA第3弾、新ボス2体（ベローナ・メイリン）、QoL改善。',
        },
    ],

    root: null,
    region: 'GMS',     // 'GMS' | 'KMS'。一覧に出す地域
    current: null,     // 開いている回の id。null なら一覧
    _html: {},         // id -> content.html の Promise

    init(rootId) {
        this.root = document.getElementById(rootId);
        // 中身の目次や「↑ 目次へ」は #d-… / #toc のリンク。URL のハッシュはアプリの切り替えに
        // 使っているので書き換えさせず、ここで受けてページ内を動かす。
        this.root.addEventListener('click', (ev) => {
            const a = ev.target.closest('a[href^="#"]');
            if (!a || !this.root.contains(a)) return;
            ev.preventDefault();
            this.jump(a.getAttribute('href').slice(1));
        });
        this.render();
    },

    render() {
        if (this.current) this.renderUpdate(); else this.renderList();
        this.syncNav();
    },

    esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    renderList() {
        const list = this.LIST.filter(u => u.region === this.region);
        const rows = list.map(u => `
            <li><button type="button" onclick="gmsUpdates.open('${u.id}')" class="news-row">
                <img src="${this.esc(u.cover)}" alt="" loading="lazy" class="news-thumb">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 text-xs">
                        <span class="font-mono text-base-content/60">${this.esc(u.date.replace(/-/g, '/'))}</span>
                        <span class="badge badge-sm badge-primary badge-soft">${this.esc(u.kind)}</span>
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
                <h2 class="text-lg font-bold text-white mb-1">News <span class="text-primary">${this.region}</span></h2>
                <p class="text-xs text-base-content/60 mb-4">${this.region} のアップデート告知の和訳などです。新しい順に並んでいます。手動で載せているので、すべての告知があるわけではありません。</p>
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
                    <i data-lucide="arrow-left" class="w-4 h-4"></i>${this.esc(u.region)} の一覧へ
                </button>
                <div class="mb-4">
                    <div class="text-xs font-bold text-primary">${this.esc(u.period)}</div>
                    <h2 class="text-xl font-bold text-white leading-tight">${this.esc(u.title)}</h2>
                    <div class="text-xs text-base-content/60">${this.esc(u.subtitle)}</div>
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
    },

    // 上部バーの GMS／KMS。回を開いているときに押すと、その地域の一覧に戻る。
    showRegion(region) {
        this.region = region;
        this.current = null;
        this.render();
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
