# BijyonTools

リポジトリ名は MapleManager。サイト上の表示名は BijyonTools（2026-10-09 改名）。

MapleStory (GMS) の身内向け管理ツール。週ボスのPT編成、コミュニティ名簿、育成計画をひとつの画面にまとめたもの。

Cloudflare Worker + 静的アセットとして配信している。ビルド工程は無く、`public/` に置いた素の HTML / JS / CSS がそのまま配られる。Tailwind 4（ブラウザ内でコンパイルする `@tailwindcss/browser`）・daisyUI 5・Chart.js・lucide は CDN から読む。daisyUI のテーマ `maple` は `public/style.css` の先頭にある。

## 画面の構成

`public/index.html` が全体のシェルで、左のサイドバーでアプリを切り替える。
サイドバーは下の Collapse ボタンで「アイコン + 名前」と「アイコンだけ」を切り替えられ、状態は端末ごとに localStorage に残る。
開いているアプリは URL のハッシュに出る（`/#hexa`、`/#scheduler` など。Character Manager だけはハッシュ無し）。
ハッシュ名は下の APPS のキーそのままなので、表示名を変えても既存の共有リンクを壊さないようキーは変えないこと。

| グループ | アプリ | キー | 実体 |
| --- | --- | --- | --- |
| Information | Journal（旧 News） | `updates` | `public/gms_updates.js`（GMS・KMSのアップデート告知の和訳と、Bijyon のコラム。上部バーの GMS／KMS と、少し離した Column で切り替え、その一覧（新しい順）が出る。コラムは `region: 'COLUMN'`、id は `col-` で始める。選んだ回は目次＋全訳の1ページで、目次から各節へ飛び、各節の「↑ 目次へ」で戻る。和訳の書き方は `.claude/skills/news-translation/SKILL.md`。各回の本文と画像は `public/updates/<id>/`。新しい回は `python3 -I tools/import_gms_update.py <和訳.html> <id>` で取り込み、`public/updates/list.json` の先頭に1件足す。過去の回は消さない。各回は `/#updates/<id>` で開け、回のページの「リンクをコピー」で渡す `/journal/<id>` は `worker.js` が Discord などのプレビュー（タイトル・概要・カバー画像）を返してから `/#updates/<id>` へ送る。一覧は `/#updates/gms`・`kms`・`column`） |
| Information | Guide | `guide` | `public/guide.js`（使い方ガイド。アプリ一覧・基本の操作・アプリごとの説明とスクショ・よくある質問。スクショは `public/assets/guide/`。アプリを足したり画面を大きく変えたりしたら、文とスクショも直す） |
| Event | Libae's Gear | `libae` | `public/libae_gear.js`（Event World: Quanah の装備「Libae's Supercharged」6部位の [Hologram] スキルラインとジュエルを登録し、スキルの合計 Lv（装備は1スキル Lv.3 まで、ジュエル込みで Master Level 8）、ジュエルのステータス合計、Lv.5 までのジュエル強化の残り素材と Dust 換算を出す。上部バーの 装備管理／所有ピース／ジュエル強化／資料 で切り替え。目標ライン（18ラインの配分、初期値は isophi の 3L Set Solver の最適配分）に対して装備ラインを 寄与／超過／対象外 で判定し、所有ピースからは各部位1つずつ選んで目標に合う組み合わせを、自前のみ（ピースの「自前」チェック）と全部の2通りで探す（基準はジョブ攻撃5種を各1以上→目標の埋まり最大→超過最少の順、採用／候補／不要）。数値はクライアントデータ、スキル効果は PTS 時点の情報で、定数はファイル先頭。保存はブラウザの `libae-gear-public-v1`・`libae-jewel-settings-public-v1`・`libae-skill-target-public-v1`・`libae-owned-pieces-public-v1`（単体版と同じキー）、JSON の書き出し・読み込みも単体版と同じ形（本家アプリの書き出しも読める）。Event グループは期間限定のイベント用のアプリを置く） |
| Event | Ultima EXP Plan | `ultima` | `public/exp_ultima.js`（ミッション・ウルティマ GMS 2026-11-11〜2027-02-09 専用のアカウント計画。計算と画面は `public/exp_plan.js` の `expPlan` を引き継いだもので、保存は別（`mm-exp-ultima::<Planner の「自分」>`、初回だけアカウント計画の中身を写す）。ウルティマのバフ（エテリオン・レリック・特殊訓練）と Sunny Sunday のモンパを内蔵し、イベントバフ一覧の分を足すかはスイッチ。チャレンジャーパス・モメンタムパス・モメンタムパス PLUS の購入と受け取るキャラ、補給報告（無料）の受け取るキャラを選ぶと、報酬（上級EXP交換券・農場チケット・秘薬・サウナ券）がその日から入る。中身と日付は GMS v.272 のパッチノートによるもの（モメンタムの2つは v.272 にないので KMS 実績からの見込み）で、ファイル先頭の `PASSES`・`BUFFS`・`ULTIMA_SUPPLY` に持つ。上級EXP交換券の量は `public/exp_data.js` の `expCouponExp`。イベントが終わったら APPS とサイドバーの行を外す） |
| Tools | Character Manager | `planner` | `public/script.js` |
| Tools | HEXA Tracker | `hexa` | `public/hexa_tracker.js`、`public/hexa_reader.js`（進捗入力の「ゲーム画面から読み取り」。HEXA Matrix の画面をスクショ・ライブ共有から読む。タイトルの位置だけ Tesseract.js で探し、ノードは固定の位置、Lvの小さな数字は形の照合で読む） |
| Tools | Upgrade Priority | `gear` | `public/gear_priority.js`（サイドバーは仮の入力。キャラごとの入力は Character Manager のカードの UPGRADE から開く）、`public/gear_reader.js`（ゲーム画面のスクショ・ライブ共有から装備のツールチップを読む。Tesseract.js を jsDelivr から読み込む） |
| Tools | Scouter | `scouter` | `public/scouter.js`（MapleScouter の換算主ステをキャラごとに保存。2026-10-25 から計算は kinokohub（JMS 向けの MapleScouter 互換）で、Worker の `/kinoko` が中継。入力の変換と GMS・Heroic の補正（ダメージ+18%、Heroic は攻撃力・魔力+5と最終ダメージ+45%）は `public/scouter_kinoko.js`。サイドバーの Scouter はキャラに紐付けない仮入力の画面、キャラごとの入力は Character Manager のカードの SCOUTER から開く。HEXA は手入力で、HEXA Tracker から取り込める。バフ・リンク・シードのアイコンは `public/assets/scouter/`）、`public/scouter_bosscut.js`（ボスカット。MapleScouter の結果ページと同じ表と式。EXスウのソロ実測タイムからの補正倍率は `scouter.js` 側でキャラごとに保存して全ボスに掛ける）、`public/scouter_reader.js`（ステータス画面とSTRなどのツールチップ、ハイパーステータス画面をスクショ・ライブ共有から読む。Tesseract.js を jsDelivr から読み込む）、`public/scouter_hyper.js`（ハイパー最適化タブ。入力のステータスから今のハイパー分を引き、ボス相手のダメージが一番伸びる振り方を探す。伸びは結果のスペック効率から出す（無ければ手元の式）。クリティカル率は条件で決めた Lv に固定。項目ごとの効果とポイントの表もここ）、`public/scouter_hexastat.js`（HEXAステ最適化タブ。Lv は今のまま、各枠の種類を選び直したときに一番伸びる置き方を全通り試して出す。伸びは結果のスペック効率から出す。各 Lv の値とルールは gms-upgrade-tracker の表） |
| Tools | Party Scouter | `ptscouter` | `public/party_scouter.js`（3人PTで倒したボス1体の討伐時間から、ほかのボスの推定討伐時間を出す。討伐時間→PT の率→1人あたりの火力を逆算し、Scouter のボスカット表（`public/scouter_bosscut.js`、換算の曲線は `public/scouter_kinoko.js`）を3人分にして時間に戻す。Lv・フォースは PT で1組、3人とも同じ火力、職業ごとの時間補正とシンボルは入れない。制限時間は GMS v.272（2026-11-11）から20分、それまで30分。入力はブラウザの `mm-party-scouter`） |
| Tools | EXP Simulator | `exp` | `public/exp_sim.js`、`public/exp_plan.js`（アカウント計画・イベントバフ） |
| Tools | Symbol Planner | `symbol` | `public/symbol_planner.js`（アーケイン・オーセンティックシンボルが最大になる日の予測。サイドバーはキャラに紐付けない仮入力、キャラごとは Character Manager のカードの SYMBOL から開く。上部バーの 進捗／早見表／イベント（早見表は Lv が上がる日ごとに、上がるシンボルとその時点のフォース合計・シンボル Lv 合計）。今の Lv・経験値から、デイリー・週課（アーケインのみ、月曜リセット）・イベントの分を UTC の日付で1日ずつ足す。必要数・メル・獲得量の初期値は whackybeanz の Symbols（GMS、2026-02-17 更新）で、ファイル先頭の `SYMBOLS`。イベントは全キャラ共通で、対象に「1日ごと」か開始日に「1回」N個を足す。保存はブラウザの `mm-symbol-planner`（キャラごと、カードのバー用の `pct` も）と `mm-symbol-events`） |
| Tools | Cheat Sheet | `cheatsheet` | `public/cheatsheet.js` |
| Tools | KMS Videos | `kmsvideos` | `public/kms_videos.js` |
| Monitoring | EXP Tracker | `ranks` | `public/ranks.js` |
| Community | Party Builder | `scheduler` | `public/boss_scheduler.html`（同一オリジンの iframe） |
| Community | Community Members | `community` | `public/community.js`, `public/community_import.js` |
| DEV（開発中） | Gear Cost Calculator | `cost` | `public/cost_calc.js` |
| DEV（開発中） | Weapon Liberation | `liberation` | `public/liberation_calc.js` ほか |
| DEV（開発中） | Job Art Position | `jobart` | `public/job_art_tool.js`（値は `public/job_art.js`） |
| 管理用（`?admin=1` のときだけ表示） | Usage | `usage` | `public/usage_stats.js` |

### アプリの読み込み

全アプリの定義は `public/script.js` の `APPS` テーブルにある（HTML断片・JS・CDN・初期化処理）。
起動時に読むのは `boss_master.js` / `config.js` / `community_store.js` / `class_data.js` / `script.js` だけで、
各アプリのHTML断片（`exp_sim.html`、`ranks.html`）とJSは、そのアプリを初めて開いたときに読む。
HEXA だけは Character Manager の進捗バッジに要るので、起動直後に裏で先読みする。

新しいアプリを足すときは `APPS` に1エントリ足す。HTMLは断片ファイルにして `html:`、JSは `scripts:` に書き、
`index.html` にはナビのボタンと空の `#view-*` だけを置く。

ボスの定義（名前の日英韓表記・結晶価格・最大人数・画像・入場Lv・必要フォース）は `public/boss_master.js` の1か所にある。
Character Manager・Party Builder・Cheat Sheet はここから必要な列だけを読むので、新ボスや価格の変更はこのファイルだけ直せばよい。
各難易度の `id` と Party Builder 用の `party.id` は保存データのキーなので変えないこと。

コミュニティ名簿（Discord名 → キャラの対応）は `public/community_store.js` が一手に持っていて、
Community Members / Party Builder / Character Manager / EXP Tracker の4つが同じものを見る。
保存先はローカル (localStorage) と共有DB (D1) の二段で、APIが無い環境でもローカルだけで動く。

## Worker のルート

`worker.js` が次を処理し、それ以外は `public/` の静的アセットにフォールバックする。

| ルート | 内容 |
| --- | --- |
| `GET /maplehub?name=&region=na\|eu` | MapleBot / MapleHub の経験値履歴の中継。2026-10 時点で先方の Bot 対策により取得できないため未使用 |
| `POST /kinoko` | kinokohub（kinokohub.net/api/mainStatsConverter）の換算計算の中継。本文は `{basicStats, buffStats}`。先方は他オリジンからの呼び出しを許していないので中継する。非公開APIなので先方の都合で動かなくなることがある |
| `POST /scouter` | MapleScouter（api.maplescouter.com/api/calc/dmg）の換算計算の中継。本文は `{userStat}`。2026-10-25 時点で先方の Bot 対策により 403 になるため未使用（`public/scouter.js` の `ENGINE` を戻せば使える） |
| `GET /api?name=&region=na\|eu` | Nexon GMS ランキングAPI中継（現在レベルとEXPのスナップショット）。EXP Tracker はこれを1日1回呼んで各ブラウザに日次記録を貯める |
| `GET/PUT /api/community` | コミュニティ名簿の共有スナップショット |
| `GET/PUT /api/scheduler` | 週ボスの希望とPT編成 |
| `POST /api/hit` | アプリを開いた回数を数える。本文は `{app, vid}`（vid はブラウザごとのランダムID）。プレビューとローカルは数えない |
| `GET /api/usage?days=` | その集計（日別・アプリ別の回数と利用ブラウザ数） |
| `GET /journal/<id>` | Journal の回を人に渡す用の URL。`public/updates/list.json` からその回のタイトル・概要・カバー画像を Discord などのプレビュー用タグにして返し、ブラウザは `/#updates/<id>` へ送る。知らない id はそのまま送り先へ（画面側で一覧に戻る） |

`functions/` には Cloudflare Pages Functions 時代の同等コードが残っているが、
今の Worker + 静的アセット構成では **読まれていない**（`worker.js` 冒頭のコメント参照）。

## セットアップ

Node.js 20 以上。

```sh
npm ci
```

`wrangler` はバージョンを固定して `devDependencies` に入れてある。グローバルに入れる必要はない。

## ローカルで動かす

```sh
npm run dev
```

`wrangler dev` はローカルの D1 を使う。実体は `.wrangler/` の下（gitignore 済み）。
最初に一度スキーマを流しておく。

```sh
npm run db:local
```

編集キーをローカルで試したいときは `.dev.vars` に書く（コミットしないこと）。

```
SCHEDULER_EDIT_KEY=適当な文字列
```

## 配信する

```sh
npm run deploy
```

配信するのは `public/` の中だけ（`wrangler.jsonc` の `assets.directory`）。
ルートを丸ごと配ると `worker.js` や `.wrangler/` まで公開されてしまうので変えないこと。

設定だけ確かめたいときは `npx wrangler deploy --dry-run` で、デプロイせずにバインディングを確認できる。

## 共有データ (D1)

D1 データベース `maplemanager-scheduler` に、共有するものを2つ持っている。
どちらも「JSONスナップショット1行 + version」という形で、version による楽観ロックで上書き事故を防ぐ。
テーブル定義と設計意図は `schema.sql` に書いてある。

- `community_state` … コミュニティ名簿
- `scheduler_state` … 週ボスの希望とPT編成

ほかに利用状況の集計（`usage_daily` / `usage_visitors`）がある。こちらは回数とブラウザIDのハッシュだけで、
名前・キャラ・IP は持たない。テーブルは Worker が最初の記録のときに作る。

**本番の D1 には実データ（PT編成とメンバー情報）が入っている。** `--remote` を付けるコマンドは
そのデータベースを直接触るので注意すること。

```sh
npm run db:remote   # 本番に schema.sql を流す
```

`schema.sql` は `CREATE TABLE IF NOT EXISTS` と `INSERT OR IGNORE` だけなので、
既にデータが入った状態でそのまま流してよい。

書き込みに鍵をかけるには secret を設定する。設定しなければ誰でも保存できる（身内にだけURLを配る前提）。
名簿と編成で鍵は共通。

```sh
npx wrangler secret put SCHEDULER_EDIT_KEY
```

## HEXA のデータ

HEXA ノードのテーブルとアイコンは外部サイトから生成している。手で書き換えない。

```sh
npm run hexa:gen     # public/hexa_data.js を再生成
npm run hexa:icons   # データ + 32x32 アイコン一式を取り直す
```

## チェック

```sh
npm run check
```

`tools/check_hexa.js` が、全ノードにアイコンがあるか、コストテーブルが公表値と合うか、
優先度プランナーが参考実装と同じ並びを出すかを検証する。HEXA 周りを触ったら通しておくこと。

## 覚えておくこと

- Character Manager の編集画面のボスの並びは `public/boss_master.js` の `BOSS_REGISTER_ORDER`。難易度で最大人数が変わるボスは、その難易度に `max` を書く（スウ Extreme は2人）。
- Erel Light には GMS の HEXA ノードテーブルがまだ無い（Erda Link 側のため）。ランキングや曲線の対象外になっている。
