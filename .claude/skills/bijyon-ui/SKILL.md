---
name: bijyon-ui
description: BijyonTools（MapleManager）に新しいアプリや画面を足すとき、既存の画面の見た目・導線を直すときに使う。docs/ui-guide.md の型と共通の約束に合わせて組み、スクショで確かめる手順。
---

# bijyon-ui

BijyonTools の画面を作る・直すときの手順。考え方と決まりの本体は `docs/ui-guide.md`。先にそれを読む。

## 1. 利用場面シートを書く（新しいアプリのとき）

作る前に次を書いて bi に確認する。既存の画面を直すときも、主役が変わるなら書く。

```
アプリ:      （表示名とキー）
誰が:
いつ:
何をしに:
主役:        （その画面で一番大きく見せるもの）
頻度:
型:          ハブ／入力→結果／入力→結果（タブ）／参照表／読み物／ボード
キャラ:      カードから開いたときだけ紐付ける／使わない
置き場所:    サイドバーのグループ（Information・Event・Tools・Monitoring・Community・DEV）
```

## 2. 型を選んで組む

- 型ごとの骨組みは `docs/ui-guide.md` の 2。
- 列ごとに `.mm-face` を1つ置き、中を `.mm-sec`（見出しは `.mm-sec-h`）で区切る。箱の中に箱を作らない。
- 結果の場所は入力前から表の形を出す（例: `scouter.js` の `cutSkeletonHTML`、`party_scouter.js` の `skeletonHTML`）。
- 入力が多いなら Input／Result のタブに分け、「計算する」で Result へ移して一番上から見せる（`scouter.js` の `cur.jump`）。
- 一度決めたら触らない設定は `details.mm-sec` で畳み、見出しの横に要約を出す（`gear_priority.js` の `optsSummary`）。
- タブ名は英語、本文は日本語（固有名は英語）。
- アプリは `public/script.js` の `APPS` に1エントリ足す（HTML 断片は `html:`、JS は `scripts:`）。`index.html` はナビのボタンと空の `#view-*` だけ。

## 3. 文字を減らす

- アプリ名の見出し＋説明文は置かない。
- 画面の別の場所（タブ・選択中のボタン・列名・ボタン名）が同じことを言っていたら消す。
- 位置・色・形・状態で表せるなら文字にしない。
- 一度読めば覚える使い方・計算の前提は Guide（`public/guide.js` の各アプリの `steps`）へ移す。
- 特殊な入力の補足（Scouter の Wild Hunter 欄など）は残す。

## 4. スクショで確かめる

1. `public/` を配信する: `cd public && python3 -m http.server 8787 --bind 127.0.0.1`（バックグラウンドで）。
2. `node tools/shoot-all.js <出力先> [ファイル名の正規表現]` で全アプリ・全タブを仮のキャラで撮る。CDN（Tailwind・daisyUI・lucide）は curl で取って差し替える。
3. 撮った画像を自分で見て、`docs/ui-guide.md` の 5 のチェックを全部確かめる。特に:
   - 並んだ面・カードの上端と高さがそろっている。
   - ラベルが2行に折れて入力欄がずれていない（長いラベルは短くする）。
   - 文字の上下中央、ハイライトの中の中央。
   - スクロールの前後、モーダルのタブを切り替えたときの大きさ。
4. 直した画面のスクショを、新しいファイル名で返信に添付する（bi が毎回求める）。

## 5. 仕上げ

- README のアプリ表と Guide の説明・スクショを直す。
- 新しく決まったことは `docs/ui-guide.md` の 6 に日付つきで足す。
- プレビュー環境（`*.bijyontools.workers.dev`）は本番と同じ D1 につながっている可能性が高いので、Party Builder・Community Members で保存しない。
