# BijyonTools（MapleManager）

MapleStory GMS 向けの身内用ツール集。構成とアプリの一覧は README.md。担当は bi、やり取りは日本語。

## 画面を作る・直すとき

- `docs/ui-guide.md` の考え方・型・共通の約束に合わせる。手順は `.claude/skills/bijyon-ui/SKILL.md`。
- 要点: 1列＝1面（`.mm-face` の中を `.mm-sec` で区切り、箱の中に箱を作らない）、見出しは `.mm-sec-h` の1書式、アプリ名の見出し＋説明文は置かない、結果は空でも表の形を出す、本文は日本語・タブ名と固有名は英語。
- 画面を変えたら、スクショ（`tools/shoot-all.js`）を自分で見て崩れを直してから、新しいファイル名で返信に添付する。

## いつもの決まり

- 新しいアプリは `public/script.js` の `APPS` に1エントリ足す（`index.html` はナビと空の `#view-*` だけ）。足したら README のアプリ表と Guide（`public/guide.js`）も直す。
- アプリの改修は PR で。Journal の更新（`public/updates/`）だけは main に直接コミットしてよい。和訳は `.claude/skills/news-translation/SKILL.md`。
- プレビュー（`*.bijyontools.workers.dev`）は本番と同じ D1 につながっている可能性が高い。Party Builder・Community Members で保存しない。`wrangler` の `--remote` は実データに触る。
- ボスの定義は `public/boss_master.js` の1か所。保存データのキー（`APPS` のキー、ボスの `id` など）は変えない。
