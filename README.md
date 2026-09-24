# MapleManager

MapleStory (GMS) の身内向け管理ツール。週ボスのPT編成、コミュニティ名簿、育成計画をひとつの画面にまとめたもの。

Cloudflare Worker + 静的アセットとして配信している。ビルド工程は無く、`public/` に置いた素の HTML / JS / CSS がそのまま配られる。Tailwind・Chart.js・lucide は CDN から読む。

## 画面の構成

`public/index.html` が全体のシェルで、左のサイドバーでアプリを切り替える。
サイドバーは下の Collapse ボタンで「アイコン + 名前」と「アイコンだけ」を切り替えられ、状態は端末ごとに localStorage に残る。
開いているアプリは URL のハッシュに出る（`/#hexa`、`/#scheduler` など。Character Manager だけはハッシュ無し）。
ハッシュ名は下の APPS のキーそのままなので、表示名を変えても既存の共有リンクを壊さないようキーは変えないこと。

| グループ | アプリ | キー | 実体 |
| --- | --- | --- | --- |
| Tools | Character Manager | `planner` | `public/script.js` |
| Tools | HEXA Tracker | `hexa` | `public/hexa_tracker.js` |
| Tools | Upgrade Priority | `gear` | `public/gear_priority.js` |
| Tools | Cheat Sheet | `cheatsheet` | `public/cheatsheet.js` |
| Monitoring | EXP Tracker | `ranks` | `public/ranks.js` |
| Community | Party Builder | `scheduler` | `public/boss_scheduler.html`（同一オリジンの iframe） |
| Community | Community Members | `community` | `public/community.js`, `public/community_import.js` |
| DEV（開発中） | EXP Simulator | `exp` | `public/exp_sim.js` |
| DEV（開発中） | Gear Cost Calculator | `cost` | `public/cost_calc.js` |
| DEV（開発中） | Weapon Liberation | `liberation` | `public/liberation_calc.js` ほか |

### アプリの読み込み

全アプリの定義は `public/script.js` の `APPS` テーブルにある（HTML断片・JS・CDN・初期化処理）。
起動時に読むのは `config.js` / `community_store.js` / `class_data.js` / `script.js` だけで、
各アプリのHTML断片（`exp_sim.html`、`ranks.html`）とJSは、そのアプリを初めて開いたときに読む。
HEXA だけは Character Manager の進捗バッジに要るので、起動直後に裏で先読みする。

新しいアプリを足すときは `APPS` に1エントリ足す。HTMLは断片ファイルにして `html:`、JSは `scripts:` に書き、
`index.html` にはナビのボタンと空の `#view-*` だけを置く。

コミュニティ名簿（Discord名 → キャラの対応）は `public/community_store.js` が一手に持っていて、
Community Members / Party Builder / Character Manager / EXP Tracker の4つが同じものを見る。
保存先はローカル (localStorage) と共有DB (D1) の二段で、APIが無い環境でもローカルだけで動く。

## Worker のルート

`worker.js` が次を処理し、それ以外は `public/` の静的アセットにフォールバックする。

| ルート | 内容 |
| --- | --- |
| `GET /maplehub?name=&region=na\|eu` | MapleHub のキャラAPI中継（専用ヘッダが要るのでブラウザから直接叩けない） |
| `GET /api?name=` | Nexon GMS ランキングAPI中継（現在レベルとEXPのスナップショット） |
| `GET/PUT /api/community` | コミュニティ名簿の共有スナップショット |
| `GET/PUT /api/scheduler` | 週ボスの希望とPT編成 |

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

- タスク機能 (Daily/Weekly) は `public/script.js` の `TASKS_ENABLED: false` で停止中。復活させるときはここを `true` に戻す。
- Erel Light には GMS の HEXA ノードテーブルがまだ無い（Erda Link 側のため）。ランキングや曲線の対象外になっている。
