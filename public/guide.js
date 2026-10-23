/* =========================================================
 *  Guide（サイドバーの Information）
 *  BijyonTools の使い方を1ページで見せる。上にアプリの一覧、下にアプリごとの説明とスクショ。
 *  スクショは public/assets/guide/。画面を大きく変えたら撮り直してここの文も直す。
 *  アプリを足したり改名したりしたら APPS_GUIDE も直す。
 * ========================================================= */

const guide = {
    SHOT_DATE: '2026年10月23日',

    // key は script.js の APPS のキー（「開く」ボタンと、今使えない印の確認に使う）。
    APPS_GUIDE: [
        { group: 'Information', icon: 'info', apps: [
            { key: 'updates', name: 'Journal', one: 'GMS と KMS のアップデート告知の和訳と、Bijyon が書いたコラムを、回ごとに読めます。和訳は手動で載せているので、すべての告知があるわけではありません。',
              steps: ['上のヘッダーの「GMS」「KMS」で地域を選び、一覧から読みたい回を押すと、その回の和訳が開きます。',
                      '少し離れた「Column」には、Bijyon が調べたことや検証したことを置いています。',
                      '上の目次の項目を押すとその節へ移動し、各節の見出し右の「↑ 目次へ」で目次に戻れます。',
                      '回のページ左上の「← GMS の一覧へ」（KMS・Column の回ならそれぞれの一覧）か、ヘッダーのボタンで一覧に戻ります。過去の回も残っています。'] },
            { key: 'guide', name: 'Guide', one: 'このページです。各アプリの使い方をまとめています。',
              steps: ['上の一覧のアプリ名を押すと、そのアプリの説明へ移動します。',
                      '説明の右上の「開く」で、そのアプリを開けます。'] },
        ] },
        { group: 'Tools', icon: 'wrench', apps: [
            { key: 'planner', name: 'Character Manager', one: '自分のキャラを登録して、週ボス・月ボスの消し込みと今週の獲得メルをまとめて管理します。',
              steps: ['Dashboard の最後にある「Add Character」でキャラを追加します。キャラ名を入れるとランキングから Lv・職業を取ってきます。',
                      'カード左の立ち絵を押すと「Edit Character」が出るので、行くボスの難易度と人数を選びます。結晶価格と獲得メルは自動で計算されます。',
                      '週ボスを回ったら、カードの週ボス欄をクリックすると<b>まとめて消し込み</b>できます（COMPLETE 表示。もう一度押すと戻せます）。月ボスも同じです。',
                      '画面右上に、ワールドごとの今週の合計メルと結晶数（上限180個）が出ます。',
                      'カード下の帯から、そのキャラの <b>HEXA</b>（HEXA Tracker）・<b>UPGRADE</b>（Upgrade Priority）・<b>SCOUTER</b> を直接開けます。',
                      '「Characters」の一覧では、行の右のアイコンで編集・取り直し（ランキングAPI）・非表示・削除ができます。'],
              shots: [['01-character-manager', 'Dashboard。1キャラ1枚のカードで、右上が獲得メル、ボスアイコンが今週の予定']],
              tip: '「System」では結晶の上限やサーバー名を変えられます。' },
            { key: 'hexa', name: 'HEXA Tracker', one: 'HEXAスキルの今のレベルを記録して、残りのフラグメントと「次にどれを上げると一番伸びるか」を出します。',
              steps: ['Character Manager のカードの「HEXA」から開くと、そのキャラの記録になります。',
                      '「進捗入力」で各スキルの今のレベルを入れます。ゲーム画面のスクショからも読み取れます。',
                      '「強化順マップ」で、フラグメントあたりの伸びが大きい順に強化の手順が並びます（マス表示・タイムライン表示も可）。',
                      '「効率カーブ」では、フラグメントをどれだけ入れると最終ダメージがどこまで伸びるかをグラフで見られます。',
                      'サイドバーの HEXA Tracker では、職業ごとの効率ランキング（コスパの良い職）を見られます。'],
              notes: ['効率ランキングの「必要欠片」は、全取得時の最終ダメージの選んだ割合（20%〜95%）に届くまでに要るソルエルダフラグメントが少ない順です。「分岐点」は、1レベルの効率が全体平均まで落ちる地点までの量です。',
                      '「到達率」は、選んだ数の欠片を使ったときに、全取得時の最終ダメージの何％まで届くかの高い順です。',
                      'どちらも未強化の盤面から「最終ダメージ / 欠片」が最大の順に振った場合です。消費リソースは正確な値、最終ダメージはノード係数からの推定値です。',
                      'トラッカーの職業カードは、入力済みなら紫の地に進捗、未入力なら暗く表示されます。押すと進捗入力・強化順・効率カーブが開きます。'],
              shots: [['02-hexa-character', 'キャラごとの強化順マップ。上から順に上げると効率が良い'],
                      ['03-hexa-ranking', '職業別の HEXA 効率ランキング']] },
            { key: 'gear', name: 'Upgrade Priority', one: '今の装備から「次に何を強化するのが一番お得か」を、メルあたりの伸びが大きい順に並べます。',
              steps: ['Character Manager のカードの「UPGRADE」から開くと、そのキャラの装備として保存されます（サイドバーから開くとキャラに紐付かない仮入力）。',
                      '部位ごとにスターフォース・潜在・転生の今の状態を入れます。<b>ゲーム画面のスクショ</b>を貼り付けると装備のツールチップを読み取れます。',
                      '右の一覧に、強化候補が効率の良い順に出ます。計算から外したい部位はチェックを外します。'],
              notes: ['リブート／シャイニングスターフォース前提で、潜在はレジェンダリー基準です。',
                      'スクショは Ctrl+V で貼り付けるか、画面にドラッグしても読み取れます。',
                      '一覧の左のチェックで「やる予定」の行を選ぶと、合計の期待メルが出ます。行の下のバーは1スコアあたりの単価で、長いほど割高です。',
                      'スターフォースは破壊で★が戻るため、0→18・18→20・20→21・21→22、以降は1★ずつをひとまとまりとして扱い、その区切りまで到達する期待額を出しています（再登坂込み、予備装備は0メソ扱い）。潜在はKMSの行ごとの確率（Lv160以上は値+1%）で3行の組み合わせを全部数えています。手袋以外は節目（2ライン → 3ライン（オール含み） → 3ライン（オール抜き） → レジェンダリー2ライン → レジェンダリー3ライン。武器・補助武器は攻撃力%をメイン、ボスダメをオールとして数える）を1段ずつ目標にし、届くまで回す期待個数と、届いたときの平均スコアで見ています。届いても今よりスコアが下がりやすい段は飛ばします。手袋は今の3行の合計スコアを上回るまで回します。転生は黒転生（結果を選べる）で同じように、今を上回るまでの期待回数で見ています。'],
              shots: [['04-upgrade-priority', '左で装備を入れ、右に伸ばす順番が出る']],
              tip: '設定の「キューブはブライト固定」をオンにすると、潜在はブライトキューブだけで計算します。' },
            { key: 'scouter', name: 'Scouter', one: 'MapleScouter の換算主ステ（HEXA換算）とボスカットを、キャラごとに保存して見られます。',
              steps: ['Character Manager のカードの「SCOUTER」から開きます（サイドバーの Scouter はキャラに紐付かない仮入力）。',
                      '「入力」でステータス画面の数値を入れます。<b>スクショ読み取り</b>・<b>ライブ読み取り</b>で、ゲーム画面から自動で読み込めます。',
                      '「結果」で HEXA換算とボスカット表が出ます。マスはボスごとの到達率と判定（ソロ余裕・ソロ可・パーティー可 など）です。',
                      'ボスカット表は「画像をコピー」「画像を保存」で、Discord にそのまま貼れる画像にできます。',
                      '「ハイパー最適化」で、ボス相手のダメージが一番伸びるハイパーステータスの振り方を計算できます。'],
              notes: ['「全キャラ共通」の枠（リンクスキル・Wild Hunter のユニオン）は全キャラで同じ値を使います。シードリングなどほかの欄はキャラごとです。',
                      'スクショは貼り付け・ドロップでも読めます。バフアイテムは押すと On / Off が切り替わります。',
                      'ハイパー最適化の「クリ率のバフ上乗せ」は、ボス戦でステータス画面の値より上がるクリティカル率です（シャープアイズを入れていない場合など）。クリティカル率が 100% に届かない分は期待値で計算します。',
                      'ダメージにかからない項目（一般モンスターダメージ・獲得経験値・アーケインフォースなど）は、固定しない限り 0 にします。所持ポイントはキャラの Lv から出します。'],
              shots: [['05-scouter-bosscut', '結果タブ。左が HEXA換算、右がボスカット表'],
                      ['06-scouter-hyper', 'ハイパー最適化タブ。今のレベルを入れて「ハイパーを計算する」']] },
            { key: 'cheatsheet', name: 'Cheat Sheet', one: 'ボスの入場レベル・必要フォース、レベル差やフォース差での与ダメ、シンボル、結晶価格をまとめた早見表です。',
              steps: ['サイドバーから開くだけです。見たい表までスクロールします。'],
              shots: [['07-cheat-sheet', 'ボスの入場条件と必要フォース、レベル差の与ダメ']] },
            { key: 'kmsvideos', name: 'KMS Videos', one: 'KMS の職業ごとに YouTube の検索リンクを並べたページです。最新パッチ後の動画を探すのに使えます。',
              steps: ['上の日付で「この日以降」の動画に絞れます。キーワードも足せます。',
                      '青い検索語を押すと、その条件で YouTube の検索結果が新しいタブで開きます。'],
              shots: [['08-kms-videos', '職業ごとの検索リンク']] },
        ] },
        { group: 'Monitoring', icon: 'trending-up', apps: [
            { key: 'ranks', name: 'EXP Tracker', one: '登録したキャラの経験値を毎日自動で取って、伸び方を表で見られます。',
              steps: ['「名簿から追加」で Community Members のキャラを追加します。キャラ名で検索して足すこともできます。',
                      '「リーダーボード」で昨日の獲得EXP・7日平均・14日平均などを比べられます。',
                      '「推移」でキャラごとのグラフと、次の Lv や目標 Lv に届く日の予想を見られます。'],
              notes: ['データは MapleBot から自動で取っています（日次スナップショット）。取った日の分はこのブラウザに貯まります。',
                      '推移の左の一覧でキャラを押すと、グラフに出す・出さないが切り替わります。'],
              shots: [['09-exp-tracker', 'リーダーボード。キャラごとの日次EXPと平均、到達予想']] },
        ] },
        { group: 'Community', icon: 'users', apps: [
            { key: 'scheduler', name: 'Party Builder', one: '週ボスの参加希望を集めて、難易度ごとに PT を組んで公開します。みんなで同じデータを見ます。',
              steps: ['「Members」で自分のキャラと、行きたいボス・難易度（参加希望）を登録します。',
                      '「Builder」で、希望を出しているキャラを PT の枠にドラッグして編成します（編成担当向け）。',
                      '「Dashboard」で、自分が入っている PT と全体の編成を確認できます。「画像で出力」で Discord 用の画像にもできます。'],
              notes: ['Builder では、希望者のカードを押して選び、PT の「ここに追加」で入れます。ドラッグでも動かせます。難しい難易度から先に組むと取りこぼしが減ります。',
                      'PT から外すときは、PT のメンバーをドラッグすると希望者の欄の下に受け口が出るので、そこに離します。',
                      'PT を組まずにソロやサブキャラで行く人は「ソロもしくはサブキャラ」の枠に入れます。',
                      'Dashboard の全体の編成は、ふだんは公開した PT だけです。「下書きも表示」にチェックすると下書きも出ます。'],
              shots: [['10-party-builder', 'Dashboard。上が自分の所属PT、下が全体の編成']] },
            { key: 'community', name: 'Community Members', one: 'メンバーとキャラの名簿です。Party Builder・EXP Tracker・Character Manager がこの名簿を使います。',
              steps: ['「メンバー追加」で表示名を入れて登録します。',
                      'キャラ名を入れると、Lv・職業を自動で取ってきます。メインキャラには MAIN を付けます。',
                      '上のタブで「名簿」「キャラ一覧」「ギルド別」「未割り当て」を切り替えられます。'],
              notes: ['Discord名にキャラを紐づけた名簿です。キャラ名を入れると Lv・職業・画像をランキングAPIから取ります（ギルドは手入力）。',
                      '「自分」で自分の名前を選ぶと、Character Manager のデータがその名前ごとに分かれます。',
                      'ギルドの札は、メンバーのキャラが複数のギルドに分かれているときだけキャラごとに出ます。'],
              shots: [['11-community-members', '名簿。メンバーごとにキャラが並ぶ']] },
        ] },
    ],

    BASICS: [
        '左のサイドバーでアプリを切り替えます。下の「Collapse」でアイコンだけに畳めます。',
        'アプリの中の画面切り替え（例: Dashboard / Characters / System）は上のヘッダーにあります。',
        '開いているアプリは URL に出ます（例: …/#hexa）。その URL を送れば、そのアプリを直接開けます。',
        'キャラや装備の入力は<b>そのブラウザに保存</b>されます（別の PC やスマホとは共有されません）。PT 編成と名簿だけはみんなで共有です。',
        'サイドバーで名前の右に △ が付いているアプリは、今うまく使えない状態です。マウスを乗せると理由が出ます。',
    ],

    FAQ: [
        ['別の PC やスマホでも同じデータを見たい', 'キャラ・装備・HEXA などの入力はブラウザごとの保存です。共有されるのは Party Builder と Community Members だけです。'],
        ['開発中（DEV）のアプリは？', 'サイドバー下の DEV 欄は作りかけのツールです。使えますが、内容は変わることがあります。'],
        ['要望・不具合は？', 'Discord のチャンネルまでどうぞ。'],
    ],

    root: null,

    init(rootId) {
        this.root = document.getElementById(rootId);
        // 一覧のアプリ名から説明へ。URL のハッシュはアプリの切り替えに使っているので触らない。
        this.root.addEventListener('click', (ev) => {
            const a = ev.target.closest('[data-jump]');
            if (!a) return;
            ev.preventDefault();
            const el = document.getElementById('guide-' + a.dataset.jump);
            if (el) el.scrollIntoView({ block: 'start' });
        });
        this.render();
    },

    unavailable(key) {
        const entry = window.app && app.APPS && app.APPS[key];
        return entry && entry.unavailable;
    },

    render() {
        const groups = this.APPS_GUIDE;
        const listRows = groups.map(g => g.apps.map((a, i) => `
            <tr>
                ${i === 0 ? `<th rowspan="${g.apps.length}" class="align-top text-base-content/60 font-normal whitespace-nowrap">
                    <span class="inline-flex items-center gap-1.5"><i data-lucide="${g.icon}" class="w-3.5 h-3.5"></i>${g.group}</span></th>` : ''}
                <td class="whitespace-nowrap"><a href="#" data-jump="${a.key}" class="link link-hover font-bold text-white">${a.name}</a>
                    ${this.unavailable(a.key) ? '<span class="text-warning text-xs ml-1" title="今うまく使えません">△</span>' : ''}</td>
                <td class="text-base-content/80">${a.one}</td>
            </tr>`).join('')).join('');

        const sections = groups.map(g => g.apps.map(a => this.section(a)).join('')).join('');

        this.root.innerHTML = `
            <div class="guide max-w-5xl mx-auto space-y-5">
                <div>
                    <h2 class="text-xl font-bold text-white">BijyonTools 使い方ガイド</h2>
                    <p class="text-sm text-base-content/70 mt-1">MapleStory GMS 向けの身内用ツール集です。ブラウザで開くだけで使えます（ログイン不要）。</p>
                </div>

                <section class="card bg-base-100 border border-base-content/10"><div class="card-body">
                    <h3 class="card-title text-base">何ができるの？</h3>
                    <table class="table table-sm guide-table"><tbody>${listRows}</tbody></table>
                </div></section>

                <section class="card bg-base-100 border border-base-content/10"><div class="card-body">
                    <h3 class="card-title text-base">基本の操作</h3>
                    <ul class="guide-ul">${this.BASICS.map(t => `<li>${t}</li>`).join('')}</ul>
                    <p class="text-xs text-base-content/50 mt-2">※ 画面は${this.SHOT_DATE}時点のものです。キャラの立ち絵の部分は「キャラ画像」の仮の絵にしています。</p>
                </div></section>

                ${sections}

                <section id="guide-faq" class="card bg-base-100 border border-base-content/10"><div class="card-body">
                    <h3 class="card-title text-base">よくある質問</h3>
                    <dl class="space-y-3">${this.FAQ.map(([q, a]) => `
                        <div><dt class="font-bold text-white">Q. ${q}</dt><dd class="text-sm text-base-content/80 mt-0.5">A. ${a}</dd></div>`).join('')}
                    </dl>
                </div></section>
            </div>`;
        if (window.lucide) lucide.createIcons();
    },

    section(a) {
        const warn = this.unavailable(a.key);
        return `
            <section id="guide-${a.key}" class="card bg-base-100 border border-base-content/10 guide-sec"><div class="card-body">
                <div class="flex items-start gap-3">
                    <div class="flex-1 min-w-0">
                        <h3 class="text-lg font-bold text-white">${a.name}</h3>
                        <p class="font-bold text-primary mt-0.5">${a.one}</p>
                    </div>
                    ${a.key === 'guide' ? '' : `<button type="button" class="btn btn-sm btn-primary btn-soft shrink-0" onclick="app.switchApp('${a.key}')">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>開く</button>`}
                </div>
                ${warn ? `<div class="alert alert-warning alert-soft text-sm py-2 mt-2">△ 今うまく使えません: ${warn}</div>` : ''}
                ${(a.shots || []).map(([f, cap]) => `
                    <div class="mt-3">
                        <img src="assets/guide/${f}.jpg" alt="${cap}" loading="lazy" class="rounded-lg border border-base-content/10 w-full h-auto">
                        <div class="text-xs text-base-content/50 text-center mt-1.5">${cap}</div>
                    </div>`).join('')}
                <h4 class="font-bold text-white text-sm mt-3">使い方</h4>
                <ol class="guide-ol">${a.steps.map(s => `<li>${s}</li>`).join('')}</ol>
                ${a.tip ? `<p class="text-sm text-base-content/80 mt-2"><i data-lucide="lightbulb" class="w-4 h-4 inline -mt-0.5 text-warning"></i> ${a.tip}</p>` : ''}
                ${a.notes ? `<ul class="list-disc pl-5 mt-2 space-y-1 text-[12px] text-base-content/60 leading-relaxed">${a.notes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
            </div></section>`;
    },
};
