/* =========================================================
 *  Guide（サイドバーの Information）
 *  BijyonTools の使い方を1ページで見せる。上にアプリの一覧、下にアプリごとの説明とスクショ。
 *  スクショは public/assets/guide/。画面を大きく変えたら撮り直してここの文も直す。
 *  アプリを足したり改名したりしたら APPS_GUIDE も直す。
 * ========================================================= */

const guide = {
    SHOT_DATE: '2026年10月18日',

    // key は script.js の APPS のキー（「開く」ボタンと、今使えない印の確認に使う）。
    APPS_GUIDE: [
        { group: 'Information', icon: 'info', apps: [
            { key: 'updates', name: 'Journal', one: 'GMS と KMS のアップデート告知の和訳と、Bijyon が書いたコラムを、回ごとに読めます。和訳は手動で載せているので、すべての告知があるわけではありません。',
              steps: ['上のヘッダーの「GMS」「KMS」で地域を選び、一覧から読みたい回を押すと、その回の和訳が開きます。',
                      '少し離れた「Column」には、Bijyon が調べたことや検証したことを置いています。',
                      '上の目次の項目を押すとその節へ移動し、各節の見出し右の「↑ 目次へ」で目次に戻れます。',
                      '回のページ右上の「リンクをコピー」で、その回だけを開くリンクをコピーできます。Discord に貼ると、タイトルと画像付きで表示されます。',
                      '回のページ左上の「← GMS の一覧へ」（KMS・Column の回ならそれぞれの一覧）か、ヘッダーのボタンで一覧に戻ります。過去の回も残っています。'] },
            { key: 'guide', name: 'Guide', one: 'このページです。各アプリの使い方をまとめています。',
              steps: ['上の一覧のアプリ名を押すと、そのアプリの説明へ移動します。',
                      '説明の右上の「開く」で、そのアプリを開けます。'] },
        ] },
        { group: 'Event', icon: 'party-popper', apps: [
            { key: 'libae', name: "Libae's Gear", one: 'Event World: Quanah の装備「Libae\'s Supercharged」6部位のスキルラインとジュエルを登録して、スキルの合計レベル・ジュエルのステータス・ジュエル強化の残り素材を出します。',
              steps: ['「装備管理」で部位ごとに [Hologram] スキルライン（最大3つ）を選び、「＋ ソケット」でジュエルの色と Lv、能力を入れます。プリズマティックジュエルはスキルかステータスを2行選べます。',
                      '右の列に、スキルごとの合計 Lv（装備＋ジュエル。藍色が装備、ピンクがジュエル）と、ジュエルで増えるステータスの合計が出ます。装備のラインは1スキル Lv.3 まで、ジュエル込みの上限（Master Level）は Lv.8 です。',
                      '「ジュエルを一括で」の Lv を押すと、装着中のジュエルを全部その Lv にします（空きソケットはそのまま）。',
                      '「ジュエル強化」で、Lv.5 までに要る素材の残りを、全体・色別・装備ごとに見られます。素材は同じ色のジュエルだけ使え、足りない分を Dust で買う量（カラー 500、プリズマティック 3,000）も出ます。',
                      '強化コストが変わったら、「ジュエル強化」の下の「ジュエル設定」で直せます。「資料」にスキル・ジュエルの仕様と出典をまとめています。'],
              shots: [['14-libae-gear', '装備管理。左が6部位のスキルラインとジュエル、右がスキルの合計 Lv']],
              tip: '入力はこのブラウザに保存されます。別の端末に移すときは、下の「データ」で JSON を保存して、移した先で読み込みます。スキルの効果は PTS（10/29〜11/1）時点の情報です。' },
            { key: 'ultima', name: 'Ultima EXP Plan', one: 'ミッション・ウルティマの期間（11/11〜2/9）に、イベントのバフとパス・補給報告の報酬込みで、アカウントのキャラがいつどの Lv になるかを計算します。',
              steps: ['使い方は EXP Simulator の「アカウント計画」と同じです。初めて開いたときは、アカウント計画の中身（選んだキャラ・やること・持ち物）を写して始めます。ここで変えてもアカウント計画は変わりません。',
                      '「パスと補給報告」で、チャレンジャーパス・モメンタムパス・モメンタムパス PLUS それぞれ、買うものを押し、受け取るキャラを選びます（モメンタムの2つは KMS の実績からの見込みです）。無料分は買わなくても入ります。補給報告（毎日のログイン）は無料で、受け取るキャラだけ選びます。',
                      'もらった上級EXP交換券・農場チケット・秘薬・サウナ券は、もらった日からそのキャラが使います（農場は入れる Lv になったら、秘薬は上限 Lv から逆算した Lv で、交換券はもらった日に、サウナ券はアカウントの1日のサウナ時間の空きで）。',
                      'ウルティマのバフ（エテリオン・レリックと特殊訓練）と Sunny Sunday のモンパは最初から入っています。EXP Simulator のイベントバフ一覧の分も足すときは「イベントバフ一覧の分も足す」を押します（ウルティマの分を読み込んでいると二重になります）。',
                      '目標 Lv を入れたキャラは、右の「パスと狩りの時間で変わる到達日」で、5の倍数の Lv ごとに、パスの組み合わせ（1種・2種・3種）を買うと無料だけのときより何日早く届くかと、1日の狩りの時間を変えたときの到達日を見られます。',
                      'Challenger の欄の下の「クアナに移すキャラ」でキャラを1体選び、デイリー・週課をやる上限（Lv か日付）を決めると、そのキャラは上限に届いた日で計算を止めます。次の日からは「後を継ぐキャラ」（この計画の中だけの仮のキャラ）が同じデイリー・モンパ・MPE・エピダン・週課を引き継ぎます。後を継ぐキャラの Lv・バーニング・狩り・目標はそこで入れます。',
                      '右の下の表で、週ごとのバフと受け取りを確認できます。「前提」に受け取りの日付や計算の決めごとをまとめています。'],
              shots: [['16-ultima-exp-plan', 'パスを買ったときの計画。左上がパス、右が期日の Lv と推移']],
              tip: 'チャレンジャーパス・補給報告・バフは GMS v.272 のパッチノートによります。モメンタムパス・PLUS は KMS からの見込みで、GMS で分かったら直します。狩りに乗る EXP（EXPパスの +20% など）は、狩りの「EXP +%」に入れてください。' },
        ] },
        { group: 'Tools', icon: 'wrench', apps: [
            { key: 'planner', name: 'Character Manager', one: '自分のキャラを登録して、週ボス・月ボスの消し込みと今週の獲得メルをまとめて管理します。',
              steps: ['Dashboard の最後にある「Add Character」でキャラを追加します。キャラ名を入れるとランキングから Lv・職業を取ってきます。',
                      'カード左の立ち絵を押すと「Edit Character」が出るので、行くボスの難易度と人数を選びます。結晶価格と獲得メルは自動で計算されます。',
                      'Arthur のレンタル装備を借りるなら、同じ画面の <b>RENTAL</b> 列で借りる装備のアイコンを押します。1回目のレンタル費（メル）が週の獲得メルから引かれます。週リセットをまたいで借りたときは「週跨ぎ」にチェックすると半額で引きます。',
                      '週ボスを回ったら、カードの週ボス欄をクリックすると<b>まとめて消し込み</b>できます（COMPLETE 表示。もう一度押すと戻せます）。月ボスも同じです。',
                      '画面右上に、ワールドごとの今週の合計メルと結晶数（上限180個）が出ます。',
                      'カード下の帯から、そのキャラの <b>HEXA</b>（HEXA Tracker）・<b>UPGRADE</b>（Upgrade Priority）・<b>SCOUTER</b> を直接開けます。'],
              shots: [['01-character-manager', 'Dashboard。1キャラ1枚のカードで、右上が獲得メル、ボスアイコンが今週の予定']],
              tip: '「System」では結晶の上限やサーバー名を変えられます。' },
            { key: 'hexa', name: 'HEXA Tracker', one: 'HEXAスキルの今のレベルを記録して、残りのフラグメントと「次にどれを上げると一番伸びるか」を出します。',
              steps: ['Character Manager のカードの「HEXA」から開くと、そのキャラの記録になります。',
                      '「進捗入力」で各スキルの今のレベルを入れます。ゲーム画面のスクショからも読み取れます。',
                      '「強化順マップ」で、フラグメントあたりの伸びが大きい順に強化の手順が並びます（マス表示・タイムライン表示も可）。',
                      '「効率カーブ」では、フラグメントをどれだけ入れると最終ダメージがどこまで伸びるかをグラフで見られます。',
                      'サイドバーの HEXA Tracker では、職業ごとの効率ランキング（コスパの良い職）を見られます。'],
              shots: [['02-hexa-character', 'キャラごとの強化順マップ。上から順に上げると効率が良い'],
                      ['03-hexa-ranking', '職業別の HEXA 効率ランキング']] },
            { key: 'gear', name: 'Upgrade Priority', one: '今の装備から「次に何を強化するのが一番お得か」を、メルあたりの伸びが大きい順に並べます。',
              steps: ['Character Manager のカードの「UPGRADE」から開くと、そのキャラの装備として保存されます（サイドバーから開くとキャラに紐付かない仮入力）。',
                      '部位ごとにスターフォース・潜在・転生の今の状態を入れます。<b>ゲーム画面のスクショ</b>を貼り付けると装備のツールチップを読み取れます。',
                      '右の一覧に、強化候補が効率の良い順に出ます。計算から外したい部位はチェックを外します。'],
              shots: [['04-upgrade-priority', '左で装備を入れ、右に伸ばす順番が出る']],
              tip: '設定の「キューブはブライト固定」をオンにすると、潜在はブライトキューブだけで計算します。' },
            { key: 'scouter', name: 'Scouter', one: 'MapleScouter と同じ換算主ステ（HEXA換算）とボスカットを、キャラごとに保存して見られます。',
              steps: ['Character Manager のカードの「SCOUTER」から開きます（サイドバーの Scouter はキャラに紐付かない仮入力）。',
                      '「入力」でステータス画面の数値を入れます。<b>スクショ読み取り</b>・<b>ライブ読み取り</b>で、ゲーム画面から自動で読み込めます。',
                      '「結果」で HEXA換算とボスカット表が出ます。マスはボスごとの到達率と判定（ソロ余裕・ソロ可・パーティー可 など）です。',
                      '計算と実際の手応えがずれる職業は、ボスカット表の上の「EXスウ ソロ」に倒した時間を秒数で（例 10分30秒なら 630）入れると、その比で全ボスの％を補正します（EXスウ 100% = 30分として計算）。補正は再計算しても残り、「実測補正」のトグルでオン・オフできます。',
                      'ボスカット表は「画像をコピー」「画像を保存」で、Discord にそのまま貼れる画像にできます。',
                      '「簡易換算」は Lv・フォース・シンボルと EXスウのソロタイム（秒）だけで、全ボスのボスカットをその場で出します。EXスウのタイムから火力を逆算した目安で、計算元が対応していない職業（シア・エレルライト）でも使えます。',
                      '「ハイパー最適化」で、ボス相手のダメージが一番伸びるハイパーステータスの振り方を計算できます。クリティカル率は右の「クリティカル率に振る Lv」で自分で決め、その分を差し引いた残りのポイントで計算します（ボス防御率は 380%）。先に「入力」で「計算する」をしておくと、計算元のスペック効率（職業のスキルの防御率無視なども込み）で選びます。',
                      '「HEXAステ最適化」で、今のHEXAステータスの種類と Lv を入れて「HEXAステを計算する」を押すと、Lv はそのまま種類だけ選び直すなら各枠に何を入れると一番伸びるかが出ます。先に「入力」で「計算する」をしておくと、計算元のスペック効率で選びます。'],
              shots: [['05-scouter-bosscut', '結果タブ。左が HEXA換算、右がボスカット表'],
                      ['06-scouter-hyper', 'ハイパー最適化タブ。今のレベルを入れて「ハイパーを計算する」。クリティカル率は右の条件で Lv を決める'],
                      ['12-scouter-hexastat', 'HEXAステ最適化タブ。今の種類と Lv を入れて「HEXAステを計算する」と、右の列に各枠のおすすめが出る']],
              tip: '計算は kinokohub（MapleScouter 互換の換算）に GMS・Heroic の補正を足した推定値です。MapleScouter との差はおおむね ±0.5%。' },
            { key: 'ptscouter', name: 'Party Scouter', one: '3人PTで倒したボス1体の討伐時間から、同じ3人でほかのボスを倒すと約何分かかるかを出します。',
              steps: ['左で倒したボスと難易度を選び、3人での討伐時間を秒数で入れます（例 10分30秒なら 630）。',
                      'PT の Lv・アーケインフォース・オーセンティックフォースを入れます。3人の中で一番低い人の値を入れてください。',
                      '右の表に、ボスごとの推定討伐時間が出ます。入れたボスは黄色の枠です。制限時間を超えるものは「時間切れ」になります。',
                      '表のマスを押すと、そのボスを基準にできます（時間はそのマスの推定値が入るので、実際のタイムに直して使います）。'],
              shots: [['13-party-scouter', '左に3人PTのタイム、右にほかのボスの推定討伐時間']],
              tip: 'Scouter のボスカットを3人分にした目安です。3人とも同じ火力とみなし、職業ごとの差やシンボルは入れていません。制限時間は 11/11 のアップデートから20分（それまでは30分）で数えます。' },
            { key: 'exp', name: 'EXP Simulator', one: 'デイリー・モンパ・エピダンなどで、いつどの Lv になるかを計算します。アカウント全体の経験値の割り振りも組めます。',
              steps: ['上の「1キャラ」で、1キャラの Lv・やること・持ち物から、目標 Lv に届く日と日ごとの伸びを出します。',
                      '「アカウント計画」で、Character Manager のキャラから育てるキャラを選び、キャラごとにデイリー・モンパ・MPE・エピダン・農場チケット・秘薬を割り振ります。狩り（1時間の討伐数・1日の時間・ステータス画面の経験値 +N%）、トレジャーハンター（1日に開ける箱の数、10箱まで。Lv260 から、1箱は自分の Lv の敵 14,361.95 体分の期待値、EXP のバフは乗らない）と放置マップ（VIP サウナ、アカウント共有の時間と1日に使う時間、最大8時間）も足せます。右に期日の Lv と推移が出ます。',
                      'デイリーの地域・エピダンなど、ワールドやアカウントで1回しか受け取れないものは、ほかのキャラが選ぶと選べなくなります。Kronos と Challenger は上で切り替えます。',
                      '「イベントバフ」に、モンパ+50% のような期間つきのイベントを入れると、計算に反映されます。重なった期間は足し算です。「共有用にコピー」で一覧を Discord に貼り、受け取った人は「読み込み」で取り込めます。'],
              shots: [['15-exp-simulator', 'アカウント計画。左でキャラごとにやることを選び、右に期日の Lv と推移']],
              tip: '計画とイベントバフはそのブラウザに保存されます。秘薬は全部使い切って上限 Lv になるように、上限 Lv から本数分さかのぼった Lv で使い始めます。' },
            { key: 'cheatsheet', name: 'Cheat Sheet', one: 'ボスの入場レベル・必要フォース、レベル差やフォース差での与ダメ、シンボル、結晶価格をまとめた早見表です。',
              steps: ['サイドバーから開くだけです。見たい表までスクロールします。'],
              shots: [['07-cheat-sheet', 'ボスの入場条件と必要フォース、レベル差の与ダメ']] },
            { key: 'kmsvideos', name: 'KMS Videos', one: 'KMS の職業ごとに YouTube の検索リンクを並べたページです。最新パッチ後の動画を探すのに使えます。',
              steps: ['上の日付で「この日以降」の動画に絞れます。キーワードも足せます。',
                      '職業名を押すと、その条件で YouTube の検索結果が開きます。'],
              shots: [['08-kms-videos', '職業ごとの検索リンク']] },
        ] },
        { group: 'Monitoring', icon: 'trending-up', apps: [
            { key: 'ranks', name: 'EXP Tracker', one: '登録したキャラの経験値を毎日自動で取って、伸び方を表で見られます。',
              steps: ['「名簿から追加」で Community Members のキャラを追加します。キャラ名で検索して足すこともできます。',
                      '「リーダーボード」で昨日の獲得EXP・7日平均・14日平均などを比べられます。',
                      '「推移」でキャラごとのグラフと、次の Lv や目標 Lv に届く日の予想を見られます。'],
              shots: [['09-exp-tracker', 'リーダーボード。キャラごとの日次EXPと平均、到達予想']] },
        ] },
        { group: 'Community', icon: 'users', apps: [
            { key: 'scheduler', name: 'Party Builder', one: '週ボスの参加希望を集めて、難易度ごとに PT を組んで公開します。みんなで同じデータを見ます。',
              steps: ['「Members」で自分のキャラと、行きたいボス・難易度（参加希望）を登録します。',
                      '「Builder」で、希望を出しているキャラを PT の枠にドラッグして編成します（編成担当向け）。',
                      '「Dashboard」で、自分が入っている PT と全体の編成を確認できます。「画像で出力」で Discord 用の画像にもできます。'],
              shots: [['10-party-builder', 'Dashboard。上が自分の所属PT、下が全体の編成']] },
            { key: 'community', name: 'Community Members', one: 'メンバーとキャラの名簿です。Party Builder・EXP Tracker・Character Manager がこの名簿を使います。',
              steps: ['「メンバー追加」で表示名を入れて登録します。',
                      'キャラ名を入れると、Lv・職業を自動で取ってきます。メインキャラには MAIN を付けます。',
                      '上のタブで「名簿」「キャラ一覧」「ギルド別」「未割り当て」を切り替えられます。'],
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
            </div></section>`;
    },
};
