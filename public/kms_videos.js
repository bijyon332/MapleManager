/* =========================================================
 *  KMS Videos
 *  KMSの職業ごとに YouTube の検索リンクを作る。押すと YouTube の検索結果が開く。
 *  検索語は「職業名（略称 OR 正式名）＋キーワード＋after:日付」。
 *  入力欄は見出しの下に置き、値はブラウザに覚えさせる。
 *  新職業の追加や略称の変更は GROUPS を直すだけでよい。
 *  after: と OR は YouTube の公式ヘルプには無い演算子で、効かないこともある。
 * ========================================================= */

const kmsVideos = {
    STORE_KEY: 'mm-kms-videos',

    // [日本名, 正式名（韓国）, 略称リスト]。略称だけで検索する職業は正式名を null にする。
    GROUPS: [
        { name: '冒険家', jobs: [
            ['ヒーロー', '히어로', ['히어로']],
            ['パラディン', '팔라딘', ['팔라']],
            ['ダークナイト', '다크나이트', ['닼나']],
            ['アークメイジ（火毒）', null, ['불독']],
            ['アークメイジ（氷雷）', null, ['썬콜']],
            ['ビショップ', '비숍', ['비숍']],
            ['ボウマスター', '보우마스터', ['보마']],
            ['クロスボウマスター', '신궁', ['신궁']],
            ['パスファインダー', '패스파인더', ['패파']],
            ['ナイトロード', '나이트로드', ['나로']],
            ['シャドー', '섀도어', ['섀도어']],
            ['デュアルブレイド', '듀얼블레이드', ['듀블']],
            ['バイパー', '바이퍼', ['바이퍼']],
            ['キャプテン', '캡틴', ['캡틴']],
            ['キャノンシューター', '캐논슈터', ['캐슈']],
        ] },
        { name: 'シグナス騎士団', jobs: [
            ['ミハイル', '미하일', ['미하일']],
            ['ソウルマスター', '소울마스터', ['소마']],
            ['フレイムウィザード', '플레임위자드', ['플위']],
            ['ウィンドシューター', '윈드브레이커', ['윈브']],
            ['ナイトウォーカー', '나이트워커', ['나워']],
            ['ストライカー', '스트라이커', ['스커']],
        ] },
        { name: '英雄', jobs: [
            ['アラン', '아란', ['아란']],
            ['エヴァン', '에반', ['에반']],
            ['ルミナス', '루미너스', ['루미']],
            ['メルセデス', '메르세데스', ['메르']],
            ['ファントム', '팬텀', ['팬텀']],
            ['隠月', '은월', ['은월']],
        ] },
        { name: 'レジスタンス・デーモン', jobs: [
            ['ブラスター', '블래스터', ['블래']],
            ['バトルメイジ', '배틀메이지', ['배메']],
            ['ワイルドハンター', '와일드헌터', ['와헌']],
            ['メカニック', '메카닉', ['메카']],
            ['ゼノン', '제논', ['제논']],
            ['デーモンスレイヤー', '데몬슬레이어', ['데슬']],
            ['デーモンアヴェンジャー', '데몬어벤져', ['데벤']],
        ] },
        { name: 'ノヴァ', jobs: [
            ['カイザー', '카이저', ['카이저']],
            ['カイン', '카인', ['카인']],
            ['カデナ', '카데나', ['카데나']],
            ['エンジェリックバスター', '엔젤릭버스터', ['엔버']],
        ] },
        { name: 'レフ', jobs: [
            ['アデル', '아델', ['아델']],
            ['イリウム', '일리움', ['일리움']],
            ['カーリー', '칼리', ['칼리']],
            ['アーク', '아크', ['아크']],
        ] },
        { name: 'アニマ', jobs: [
            ['ララ', '라라', ['라라']],
            ['虎影', '호영', ['호영']],
            ['レン', '렌', ['렌']],
        ] },
        { name: 'その他', jobs: [
            ['ゼロ', '제로', ['제로']],
            ['キネシス', '키네시스', ['키네']],
            ['レテ', '레테', ['레테']],
        ] },
    ],

    // キーワードの候補。value が '' なら付けない、'custom' なら自由入力欄の値を使う。
    KEYWORDS: [
        { value: '극딜', label: '극딜（極ディール）' },
        { value: '스킬코어', label: '스킬코어（6次コア）' },
        { value: '밸런스 패치', label: '밸런스 패치（調整）' },
        { value: '딜사이클', label: '딜사이클（スキル回し）' },
        { value: '리뷰', label: '리뷰（レビュー）' },
        { value: 'custom', label: '自由入力' },
        { value: '', label: 'なし' },
    ],

    // YouTube の sp パラメータ。1つしか付けられないので、アップロード日を「新しい順」より優先する。
    UPLOAD: [
        { value: '', label: '指定なし' },
        { value: 'EgIIBA%3D%3D', label: '今月' },
        { value: 'EgIIBQ%3D%3D', label: '今年' },
    ],
    SP_SORT_DATE: 'CAI%3D',

    DEFAULTS: { after: '2026-09-17', keyword: '극딜', custom: '', upload: '', orMode: true, sortDate: false },

    init(rootId) {
        this.root = document.getElementById(rootId);
        this.state = { ...this.DEFAULTS, ...this.load() };
        const total = this.GROUPS.reduce((n, g) => n + g.jobs.length, 0);
        this.root.innerHTML = `
            <div class="flex items-baseline gap-3 mb-3 flex-wrap">
                <h1 class="text-[18px] font-bold text-white">KMS Videos</h1>
                <span class="text-xs text-slate-500">KMSの職業ごとの YouTube 検索リンク（${total}職）。押すと検索結果が新しいタブで開きます。</span>
            </div>
            <div id="kmsv-controls" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 mb-3 border border-slate-800 bg-slate-900/60"></div>
            <div id="kmsv-list"></div>
            <p class="text-[10px] text-slate-500 mt-1">after: と OR は YouTube の公式ヘルプに無い演算子で、効かないことがあります。
                効いていないときは OR統合をオフにするか、アップロード日「今年」＋新しい順で投稿日を確かめてください。</p>`;
        this.renderControls();
        this.render();
    },

    load() {
        try { return JSON.parse(localStorage.getItem(this.STORE_KEY)) || {}; } catch { return {}; }
    },
    save() {
        try { localStorage.setItem(this.STORE_KEY, JSON.stringify(this.state)); } catch { /* 保存できなくても動く */ }
    },

    // 1職業ぶんの検索語。OR統合がオンなら1つ、オフなら名前ごとに分ける。
    queries([, official, abbrs]) {
        const names = [...new Set([...abbrs, official].filter(Boolean))];
        const s = this.state;
        const keyword = s.keyword === 'custom' ? s.custom.trim() : s.keyword;
        const tail = [keyword, s.after ? `after:${s.after}` : ''].filter(Boolean).join(' ');
        const heads = s.orMode ? [names.join(' OR ')] : names;
        return heads.map(h => [h, tail].filter(Boolean).join(' '));
    },

    url(query) {
        const sp = this.state.upload || (this.state.sortDate ? this.SP_SORT_DATE : '');
        return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${sp ? `&sp=${sp}` : ''}`;
    },

    esc(s) {
        return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    },

    // 見出しの下の入力欄。値が変わるたびに表を描き直す（入力欄は描き直さない）。
    renderControls() {
        const nav = document.getElementById('kmsv-controls');
        const s = this.state;
        const opts = (list, cur) => list.map(o => `<option value="${this.esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${o.label}</option>`).join('');
        nav.innerHTML = `
            <label class="kmsv-ctl">この日以降<input type="date" id="kmsv-after" value="${s.after}"></label>
            <label class="kmsv-ctl">キーワード<select id="kmsv-keyword">${opts(this.KEYWORDS, s.keyword)}</select>
                <input type="text" id="kmsv-custom" placeholder="自由入力" value="${this.esc(s.custom)}" class="w-28"></label>
            <label class="kmsv-ctl">アップロード日<select id="kmsv-upload">${opts(this.UPLOAD, s.upload)}</select></label>
            <label class="kmsv-ctl cursor-pointer"><input type="checkbox" id="kmsv-or" ${s.orMode ? 'checked' : ''}>OR統合</label>
            <label class="kmsv-ctl cursor-pointer"><input type="checkbox" id="kmsv-sort" ${s.sortDate ? 'checked' : ''}>新しい順</label>`;
        const bind = (id, key, prop = 'value') => nav.querySelector(id).addEventListener('input', e => {
            this.state[key] = e.target[prop];
            this.save();
            this.render();
        });
        bind('#kmsv-after', 'after');
        bind('#kmsv-keyword', 'keyword');
        bind('#kmsv-custom', 'custom');
        bind('#kmsv-upload', 'upload');
        bind('#kmsv-or', 'orMode', 'checked');
        bind('#kmsv-sort', 'sortDate', 'checked');
    },

    render() {
        const custom = document.getElementById('kmsv-custom');
        if (custom) custom.disabled = this.state.keyword !== 'custom';
        const sections = this.GROUPS.map(g => {
            const rows = g.jobs.map(job => {
                const links = this.queries(job).map(q =>
                    `<a href="${this.url(q)}" target="_blank" rel="noopener" class="kmsv-link">${this.esc(q)}</a>`).join('');
                return `<tr class="border-t border-slate-800">
                    <td class="px-2 py-1 whitespace-nowrap align-top w-[46%]">
                        <span class="text-slate-100 font-bold">${job[0]}</span>
                        <span class="text-slate-500 text-[10px] ml-1">${job[1] || job[2].join('・')}</span>
                    </td>
                    <td class="px-2 py-1">${links}</td>
                </tr>`;
            }).join('');
            return `<section class="border border-slate-800 bg-slate-900/60 break-inside-avoid mb-3">
                <h2 class="px-2 py-1 text-xs font-bold text-indigo-300 border-b border-slate-700 flex justify-between">
                    <span>${g.name}</span><span class="text-slate-500 font-normal tabular-nums">${g.jobs.length}</span>
                </h2>
                <table class="w-full text-[12px]"><tbody>${rows}</tbody></table>
            </section>`;
        }).join('');
        document.getElementById('kmsv-list').innerHTML = `<div class="kmsv-cols">${sections}</div>`;
    }
};
