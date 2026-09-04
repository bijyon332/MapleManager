-- =========================================================
--  Boss Scheduler — D1 schema
--
--  編成データ一式（メンバー / キャラ / 希望 / PT）を1行のJSONとして持つ。
--  データ全体で数十KB、書き込むのは数人、読むのは全員という使い方なので、
--  テーブルを分けるより「スナップショット1行 + バージョン番号」の方が
--  APIもクライアントも単純で、競合の扱いもはっきりする。
--
--  version は楽観ロック。更新する側は「自分が読んだ version」を送り、
--  その間に誰かが保存していたら 409 を返して上書きを防ぐ。
--
--  適用:
--    npx wrangler d1 execute maplemanager-scheduler --remote --file=./schema.sql
--    npx wrangler d1 execute maplemanager-scheduler --local  --file=./schema.sql
-- =========================================================

CREATE TABLE IF NOT EXISTS scheduler_state (
  id          TEXT    PRIMARY KEY,           -- 常に 'current'（将来シーズンを分けるなら増やす）
  version     INTEGER NOT NULL DEFAULT 0,    -- 保存のたびに +1
  data        TEXT    NOT NULL,              -- JSON（seasons / members / wishes / parties）
  updated_at  TEXT    NOT NULL,              -- ISO8601
  updated_by  TEXT                           -- 更新した人の表示名（任意）
);

-- 空の初期レコード。まだ誰も保存していない状態を表す。
INSERT OR IGNORE INTO scheduler_state (id, version, data, updated_at, updated_by)
VALUES ('current', 0, '{"version":4,"seasons":[],"members":[],"wishes":[],"parties":[]}', datetime('now'), NULL);

-- 誰がいつ何を保存したかの履歴。事故ったときに戻せるようにしておく。
-- 1行あたり数十KBなので、古いものは適当な時点で消してよい。
CREATE TABLE IF NOT EXISTS scheduler_history (
  version     INTEGER PRIMARY KEY,
  data        TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  updated_by  TEXT
);
