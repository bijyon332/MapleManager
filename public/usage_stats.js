/* =========================================================
 *  Usage（管理用、?admin=1 のときだけサイドバーに出る）
 *  アプリごとの開いた回数と利用ブラウザ数を、worker.js の /api/usage から出す。
 *  数えているのは script.js の trackOpen（アプリを開くたびに /api/hit）。
 *  利用ブラウザ数はブラウザごとのランダムIDで数えるので、だいたいの人数の目安。
 *  同じ人でも PC とスマホなら2つ、履歴を消せば別に数える。
 * ========================================================= */

const usageStats = {
    PERIODS: [7, 30, 90],
    STORE_KEY: 'mm-usage-days',

    root: null,
    days: 30,
    data: null,
    error: '',

    init(rootId) {
        this.root = document.getElementById(rootId);
        try { this.days = Number(localStorage.getItem(this.STORE_KEY)) || 30; } catch (e) {}
        if (!this.PERIODS.includes(this.days)) this.days = 30;
        this.root.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-days]');
            if (!b) return;
            this.days = Number(b.dataset.days);
            try { localStorage.setItem(this.STORE_KEY, String(this.days)); } catch (e) {}
            this.load();
        });
        this.load();
    },

    async load() {
        this.render();
        try {
            const res = await fetch(`/api/usage?days=${this.days}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.data = await res.json();
            this.error = '';
        } catch (e) {
            this.data = null;
            this.error = `読み込めませんでした（${e.message}）`;
        }
        this.render();
    },

    // サイドバーの表示名をそのまま使う。サイドバーに無いもの（消したアプリ等）はキーのまま。
    appName(key) {
        const el = document.querySelector(`#app-${CSS.escape(key)} .nav-label`);
        return el ? el.textContent.trim() : key;
    },
    // アイコンもサイドバーのものを複製する（HEXA のように lucide に無い手描きもあるため）。
    appIcon(key) {
        const el = document.querySelector(`#app-${CSS.escape(key)} svg, #app-${CSS.escape(key)} i`);
        if (!el) return '<span class="w-4 h-4 inline-block"></span>';
        const c = el.cloneNode(true);
        c.setAttribute('class', 'w-4 h-4 shrink-0 text-base-content/60');
        return c.outerHTML;
    },

    // 期間の日付を新しい順に（記録のない日も 0 で出す）。
    dayList(from, to) {
        const out = [];
        for (let t = Date.parse(to + 'T00:00:00Z'); t >= Date.parse(from + 'T00:00:00Z'); t -= 86400e3) {
            out.push(new Date(t).toISOString().slice(0, 10));
        }
        return out;
    },

    bar(v, max, cls) {
        const w = max ? Math.max(v ? 2 : 0, Math.round(v / max * 100)) : 0;
        return `<div class="h-2 rounded-full bg-base-content/10 w-full"><div class="h-2 rounded-full ${cls}" style="width:${w}%"></div></div>`;
    },

    render() {
        const periodBtns = this.PERIODS.map(d => `
            <button type="button" data-days="${d}" class="btn btn-sm join-item ${d === this.days ? 'btn-primary' : ''}">${d}日</button>`).join('');
        const head = `
            <div class="flex items-center gap-3">
                <div class="join">${periodBtns}</div>
                ${this.data ? `<span class="text-sm text-base-content/60">${this.data.from} 〜 ${this.data.to}（JST）</span>` : ''}
            </div>`;

        if (this.error || !this.data) {
            this.root.innerHTML = `<div class="max-w-5xl mx-auto space-y-4">${head}
                <div class="text-sm ${this.error ? 'text-error' : 'text-base-content/60'}">${this.error || '読み込み中…'}</div></div>`;
            return;
        }

        const d = this.data;
        const site = d.daily.filter(r => r.app === '*');
        const apps = d.daily.filter(r => r.app !== '*');
        const periodBrowsers = Object.fromEntries(d.period.map(r => [r.app, r.browsers]));

        // アプリ別
        const byApp = {};
        apps.forEach(r => { byApp[r.app] = (byApp[r.app] || 0) + r.opens; });
        const appRows = Object.entries(byApp).sort((a, b) => b[1] - a[1]);
        const maxOpens = Math.max(0, ...appRows.map(r => r[1]));
        const totalOpens = appRows.reduce((s, r) => s + r[1], 0);

        // 日別
        const dayOpens = {}, dayBrowsers = {};
        apps.forEach(r => { dayOpens[r.day] = (dayOpens[r.day] || 0) + r.opens; });
        site.forEach(r => { dayBrowsers[r.day] = r.browsers; });
        const days = this.dayList(d.from, d.to);
        const maxDay = Math.max(0, ...days.map(x => dayOpens[x] || 0));
        const today = dayBrowsers[d.to] || 0;

        const stat = (label, value, cls) => `
            <div class="stat py-3">
                <div class="stat-title">${label}</div>
                <div class="stat-value text-3xl ${cls}">${value.toLocaleString()}</div>
            </div>`;

        this.root.innerHTML = `
            <div class="max-w-5xl mx-auto space-y-4">
                ${head}
                <div class="stats stats-horizontal bg-base-100 border border-base-content/10 w-full">
                    ${stat('開いた回数', totalOpens, 'text-primary')}
                    ${stat('利用ブラウザ数', periodBrowsers['*'] || 0, 'text-secondary')}
                    ${stat('今日の利用ブラウザ数', today, 'text-white')}
                </div>

                <div class="grid gap-4 lg:grid-cols-2 items-start">
                    <section class="card bg-base-100 border border-base-content/10"><div class="card-body p-4">
                        <h3 class="card-title text-base">アプリ別</h3>
                        <table class="table table-sm">
                            <thead><tr><th>アプリ</th><th class="text-right">回数</th><th class="w-1/3"></th><th class="text-right">ブラウザ</th></tr></thead>
                            <tbody>${appRows.length ? appRows.map(([key, n]) => `
                                <tr>
                                    <td class="whitespace-nowrap"><span class="inline-flex items-center gap-2">${this.appIcon(key)}${this.appName(key)}</span></td>
                                    <td class="text-right font-bold text-white tabular-nums">${n.toLocaleString()}</td>
                                    <td>${this.bar(n, maxOpens, 'bg-primary')}</td>
                                    <td class="text-right tabular-nums">${(periodBrowsers[key] || 0).toLocaleString()}</td>
                                </tr>`).join('') : '<tr><td colspan="4" class="text-base-content/50">まだ記録がありません</td></tr>'}
                            </tbody>
                        </table>
                    </div></section>

                    <section class="card bg-base-100 border border-base-content/10"><div class="card-body p-4">
                        <h3 class="card-title text-base">日別</h3>
                        <table class="table table-sm">
                            <thead><tr><th>日付</th><th class="text-right">回数</th><th class="w-1/3"></th><th class="text-right">ブラウザ</th></tr></thead>
                            <tbody>${days.map(x => {
                                const wd = '日月火水木金土'[new Date(x + 'T00:00:00Z').getUTCDay()];
                                const n = dayOpens[x] || 0;
                                return `<tr class="${n ? '' : 'text-base-content/40'}">
                                    <td class="whitespace-nowrap tabular-nums">${x.slice(5).replace('-', '/')}（${wd}）</td>
                                    <td class="text-right font-bold tabular-nums ${n ? 'text-white' : ''}">${n.toLocaleString()}</td>
                                    <td>${this.bar(n, maxDay, 'bg-primary')}</td>
                                    <td class="text-right tabular-nums">${(dayBrowsers[x] || 0).toLocaleString()}</td>
                                </tr>`;
                            }).join('')}
                            </tbody>
                        </table>
                    </div></section>
                </div>
            </div>`;
        if (window.lucide) lucide.createIcons();
    },
};
