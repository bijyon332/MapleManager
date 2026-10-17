/* =========================================================
 *  GMS Updates
 *  GMS のアップデート告知の和訳を、回ごとに読めるようにする。
 *  開くとまず一覧（メニュー）が出て、カードを押すとその回の要約／全訳が出る。
 *  上部バーの「一覧」「要約」「全訳」は index.html の #updates-nav。
 *
 *  新しい回を足すとき:
 *    1. python3 -I tools/import_gms_update.py <和訳.html> <id>
 *       → public/updates/<id>/content.html と画像が出来る
 *    2. 下の LIST の先頭に1件足す（上ほど新しい）。過去の回は消さない。
 * ========================================================= */

const gmsUpdates = {
    LIST: [
        {
            id: '2026-winter-maplayer-one',
            title: 'Maplayer One',
            subtitle: '2026年冬アップデート プレビュー（INKWELL\'S NOTE）',
            period: '2026/11/11〜',
            cover: 'updates/2026-winter-maplayer-one/img-02.jpg',
            tags: ['新イベントワールド Quanah', '新職業 レテ', 'HEXA第3弾', '新ボス2体', 'QoL'],
        },
    ],

    root: null,
    current: null,     // 開いている回の id。null なら一覧
    tab: 'summary',    // 'summary' | 'detail'
    _html: {},         // id -> content.html の Promise

    init(rootId) {
        this.root = document.getElementById(rootId);
        // 中身の「← 要約へ」や目次は #s-… / #d-… のリンク。URL のハッシュはアプリの切り替えに
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
        const cards = this.LIST.map(u => `
            <button type="button" onclick="gmsUpdates.open('${u.id}')"
                class="card bg-base-100 border border-base-content/10 shadow-sm text-left overflow-hidden
                       hover:border-primary/60 hover:-translate-y-0.5 transition">
                <figure class="aspect-[16/9] bg-base-300"><img src="${this.esc(u.cover)}" alt="" loading="lazy"
                    class="w-full h-full object-cover object-[50%_75%]"></figure>
                <div class="card-body p-4 gap-1.5">
                    <div class="text-xs font-bold text-primary">${this.esc(u.period)}</div>
                    <h3 class="text-lg font-bold text-white leading-tight">${this.esc(u.title)}</h3>
                    <div class="text-xs text-base-content/60">${this.esc(u.subtitle)}</div>
                    <div class="flex flex-wrap gap-1 mt-1">
                        ${(u.tags || []).map(t => `<span class="badge badge-sm badge-ghost">${this.esc(t)}</span>`).join('')}
                    </div>
                </div>
            </button>`).join('');
        this.root.innerHTML = `
            <div class="max-w-5xl mx-auto">
                <h2 class="text-lg font-bold text-white mb-1">GMS Updates</h2>
                <p class="text-xs text-base-content/60 mb-4">GMS のアップデート告知の和訳です。読みたい回を選んでください。</p>
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${cards}</div>
            </div>`;
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
                <div class="mb-4">
                    <div class="text-xs font-bold text-primary">${this.esc(u.period)}</div>
                    <h2 class="text-xl font-bold text-white leading-tight">${this.esc(u.title)}</h2>
                    <div class="text-xs text-base-content/60">${this.esc(u.subtitle)}</div>
                </div>
                ${html}
            </div>`;
        this.showTab(this.tab);
        this.scrollTop();
    },

    open(id) {
        this.current = id;
        this.tab = 'summary';
        this.render();
    },

    backToList() {
        this.current = null;
        this.render();
    },

    setTab(tab) {
        if (!this.current) return;
        this.tab = tab;
        this.showTab(tab);
        this.syncNav();
        this.scrollTop();
    },

    showTab(tab) {
        this.root.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
    },

    // s-… は要約、d-… は全訳の中。タブを合わせてからそこまで送る。
    jump(id) {
        const tab = (id === 'detail' || id.startsWith('d-')) ? 'detail' : 'summary';
        if (tab !== this.tab) { this.tab = tab; this.showTab(tab); this.syncNav(); }
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

    // 上部バー。一覧のときは要約／全訳を畳み、「一覧」を選択中にする。
    syncNav() {
        const nav = document.getElementById('updates-nav');
        if (!nav) return;
        nav.querySelectorAll('[data-tab]').forEach(b => {
            const t = b.dataset.tab;
            b.classList.toggle('tab-active', this.current ? t === this.tab : t === 'list');
            if (t !== 'list') b.classList.toggle('hidden', !this.current);
        });
    },
};
