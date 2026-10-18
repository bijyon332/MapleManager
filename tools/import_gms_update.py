#!/usr/bin/env python3
"""News に1回分のアップデートを取り込む。

和訳HTML（目次 id="toc" と全訳の節 id="d-…" を持つ1枚もの。書き方は
.claude/skills/news-translation/SKILL.md）から <main> の中身だけを抜き出し、埋め込み画像
（data:URI）を別ファイルに書き出して public/updates/<id>/ に置く。
要約（data-panel="summary"）が入っていたら捨て、全訳側のタブ用の印と「← 要約へ」も外す。
最後に目次のリンク切れと「↑ 目次へ」のない節を調べて表示する。
一覧への登録は public/gms_updates.js の LIST に手で1行足す。

    python3 -I tools/import_gms_update.py <和訳.html> <id>
    例: python3 -I tools/import_gms_update.py maplayer-one-ja.html 2026-winter-maplayer-one
"""
import base64
import pathlib
import re
import sys

EXT = {'jpeg': 'jpg', 'jpg': 'jpg', 'png': 'png', 'webp': 'webp', 'gif': 'gif'}


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, uid = pathlib.Path(sys.argv[1]), sys.argv[2]
    if not re.fullmatch(r'[a-z0-9-]+', uid):
        sys.exit('id は英小文字・数字・ハイフンだけにする')
    html = src.read_text(encoding='utf-8')
    m = re.search(r'<main[^>]*>(.*)</main>', html, re.S)
    if not m:
        sys.exit('<main> が見つからない')
    body = m.group(1).strip()
    # News の回は目次＋全訳の1ページ。要約が混じっていたら外す。
    body = re.sub(r'<section data-panel="summary".*?</section>\s*', '', body, flags=re.S)
    body = re.sub(r'<section data-panel="detail"[^>]*>', '<section>', body)
    body = re.sub(r'\s*<a [^>]*href="#s-[^"]*"[^>]*>[^<]*</a>', '', body)

    out = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'updates' / uid
    out.mkdir(parents=True, exist_ok=True)
    n = 0

    def save(mt):
        nonlocal n
        n += 1
        name = f'img-{n:02d}.{EXT.get(mt.group(1), mt.group(1))}'
        (out / name).write_bytes(base64.b64decode(mt.group(2)))
        return f'src="updates/{uid}/{name}"'

    body = re.sub(r'src="data:image/([a-z]+);base64,([A-Za-z0-9+/=]+)"', save, body)
    (out / 'content.html').write_text(body + '\n', encoding='utf-8')
    print(f'{out / "content.html"} と画像 {n} 枚を書き出しました')
    for w in check(body):
        print('要確認:', w)


def check(body):
    ids = re.findall(r'\sid="([^"]+)"', body)
    warns = [f'id の重複: {i}' for i in sorted({i for i in ids if ids.count(i) > 1})]
    if 'toc' not in ids:
        warns.append('目次（id="toc"）がない')
    warns += [f'リンク切れ: #{h}' for h in re.findall(r'href="#([^"]+)"', body) if h not in ids]
    for sid, head in re.findall(r'<article id="(d-[^"]+)"[^>]*>.*?(<h2.*?</h2>)', body, re.S):
        if 'href="#toc"' not in head:
            warns.append(f'「↑ 目次へ」がない節: {sid}')
    return warns


if __name__ == '__main__':
    main()
