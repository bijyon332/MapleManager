---
name: news-translation
description: GMS・KMS のアップデート告知などを和訳して BijyonTools の Journal（旧 News、public/updates/）に1回分として載せるときに使う。目次＋全訳の1ページで作り、要約は作らない。
---

# news-translation

GMS 公式のアップデート告知（Inkwell's Note、パッチノート、イベント告知など）や
KMS 公式の告知（업데이트 안내、패치노트、이벤트 공지など）を和訳し、
サイドバー Information の **Journal**（旧 News）に1回分として載せる。Journal は上部バーの「GMS」「KMS」で地域ごとに分かれる（離れた「Column」は bi のコラムで、和訳とは別）。
和訳は bi が「この回を載せて」と指示したときだけ手で足す。GMS アップデート監視ルーティンとは連動しない。

## 形式のルール（bi 決定、2026-10-18）

- 1回分は **目次＋全訳の1ページ**。要約や「要約／詳細」のタブは作らない（review-html-pair スキルの形は使わない）。
- ページの先頭に目次（`id="toc"`）を置き、各項目から該当する節へ飛べるようにする。
- 各節の見出しの右に「↑ 目次へ」（`href="#toc"`）を置き、目次へ戻れるようにする。
- 一覧の行に出す1〜2行の説明は `public/gms_updates.js` の `LIST` の `summary` に書く（ページの中身とは別）。
- 各回は `LIST` の `region` に `'GMS'` か `'KMS'` を持ち、その地域のタブにだけ出る。
- 過去の回は消さない。新しい回は `LIST` の先頭に足す。

## 訳し方

- 原文を省略せずに全部訳す。原文にない事実・数値・感想は足さない。
- 固有名詞（ワールド名・システム名・イベント名など）は、公式の日本語表記がなければ英語のまま残す。
  職業名・ボス名など日本で定着した呼び名があるものはそちらを使う（例: ベローナ、メイリン、レテ）。
- 日付・期間・条件（レベル・ワールド・回数）は原文どおり正確に。表は `table` にする。
- 挿絵は原文（またはスクショ）から切り出し、元の位置に `figure` で入れる。
- 文体は「です・ます」。

### KMS の回

- 韓国語の原文から直接訳す（英語を挟まない）。
- 職業名・ボス名・システム名は、GMS や日本で定着した呼び名があればそれを使い、なければ韓国語の読みをカタカナにして、
  初出だけ原語を括弧で添える（例: 「ユピテル（유피테르）」）。
- `kind` は `'KMS Update'` など、id は `kms-` で始める（例: `kms-2026-winter-xxx`）。

## HTML の作り

取り込みスクリプトは `<main>` の中身だけを使う。`<head>` は手元で確認するためだけのもので、
daisyUI 5 + Tailwind 4 の CDN を読み、`data-theme="maple"` 相当の暗い配色で見られれば十分。

```html
<main>
<!-- ===================== 目次＋全訳 ===================== -->
<section>
  <ul id="toc" class="menu menu-sm bg-base-100 rounded-box mb-6 w-full">
    <li class="menu-title">目次</li>
    <li><a href="#d-intro">はじめに</a></li>
    <li><a href="#d-xxx">節の短い名前</a></li>
  </ul>

  <div class="space-y-5">
  <article id="d-intro" class="card bg-base-100 shadow-sm detail-sec"><div class="card-body">
    <h2 class="card-title">節の見出し <a class="toc-back link text-sm font-normal" href="#toc">↑ 目次へ</a></h2>
    <figure class="my-3"><img src="data:image/jpeg;base64,…" alt="" loading="lazy" class="mx-auto rounded-lg max-w-full h-auto"></figure>
    <p>本文…</p>
    <h3 class="font-bold mt-3">小見出し</h3>
    <ul><li>…</li></ul>
    <div class="overflow-x-auto"><table class="table table-sm">…</table></div>
  </div></article>
  </div>
</section>

<footer class="mt-10 text-xs opacity-70 border-t border-base-300 pt-4">
  原文：<告知名>（GMS公式）／和訳作成：<ISO 8601 日時>
</footer>
</main>
```

- 節の id は `d-` で始まる小文字英数字とハイフン（例: `d-quanah`、`d-qol-equip`）。目次と節で1対1に対応させる。
- 見出しは全部 `h2.card-title`、節の中の小見出しは `h3`。
- 色は daisyUI のセマンティックカラーだけ。独自の CSS は書かない（Journal 用の見た目は `public/style.css` の `.gms-update` にある）。

## 載せる手順

1. 上の形で和訳 HTML を作る（画像は data:URI で埋め込んでよい）。
2. 取り込む。id は `年-季節-短い名前` のような英小文字・数字・ハイフン（例: `2026-winter-maplayer-one`）。
   ```
   python3 -I tools/import_gms_update.py <和訳.html> <id>
   ```
   → `public/updates/<id>/content.html` と `img-NN.*` が出来る。最後に出る「要確認」（目次のリンク切れ、
   「↑ 目次へ」のない節、id の重複）がなくなるまで直す。
3. `public/gms_updates.js` の `LIST` の先頭に1件足す（`id` `region` `date` `kind` `title` `subtitle` `period` `cover` `summary`）。
   `cover` は一覧のサムネイルにする画像（`updates/<id>/img-NN.jpg`）。
4. 画面で確かめる: 該当する地域のタブの一覧に出る、回が開く、目次から各節へ飛ぶ、「↑ 目次へ」で戻る。
   スクショを撮って返信に添付する（プロジェクトのルール）。
