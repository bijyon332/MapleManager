#!/usr/bin/env python3
"""GMS Updates に1回分のアップデートを取り込む。

和訳HTML（要約 data-panel="summary" と全訳 data-panel="detail" を持つ1枚もの）から
<main> の中身だけを抜き出し、埋め込み画像（data:URI）を別ファイルに書き出して
public/updates/<id>/ に置く。一覧への登録は public/gms_updates.js の LIST に手で1行足す。

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


if __name__ == '__main__':
    main()
