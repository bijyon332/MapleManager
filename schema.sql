-- =========================================================
--  MapleManager — D1 schema
--
--  共有するものは2つ。どちらも1行のJSONスナップショットとして持つ。
--
--    community_state … コミュニティ名簿（Discord名 → キャラの対応）
--                      Community / Boss Scheduler / GMS Planner /
--                      EXP Leaderboard が共通で参照する「軸」。
--    scheduler_state … 週ボスの希望とPT編成
--
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
--  （どちらも CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE なので、
--    既にデータが入っている状態でそのまま流して構わない）
-- =========================================================

-- ---------------------------------------------------------
--  コミュニティ名簿
-- ---------------------------------------------------------
-- data の形:
--   { "version": 1,
--     "members": [ { "id", "discordName", "displayName", "note", "colorIdx",
--                    "characters": [ { "id", "name", "guild", "level", "job",
--                                      "jobId", "imgURL", "isMain",
--                                      "combatPower", "hexa", "isActive",
--                                      "note", "updatedAt" } ] } ] }
--
-- キャラの id は Boss Scheduler の希望・PT編成から参照されるので、
-- 一度振ったら変えないこと。
CREATE TABLE IF NOT EXISTS community_state (
  id          TEXT    PRIMARY KEY,           -- 常に 'current'
  version     INTEGER NOT NULL DEFAULT 0,    -- 保存のたびに +1
  data        TEXT    NOT NULL,              -- JSON（members）
  updated_at  TEXT    NOT NULL,              -- ISO8601
  updated_by  TEXT                           -- 更新した人の表示名（任意）
);

-- 空の初期レコード。無くても最初の保存時に worker.js が作るので、
-- CREATE TABLE だけ流しても動く。
INSERT OR IGNORE INTO community_state (id, version, data, updated_at, updated_by)
VALUES ('current', 0, '{"version":1,"members":[]}', datetime('now'), NULL);

CREATE TABLE IF NOT EXISTS community_history (
  version     INTEGER PRIMARY KEY,
  data        TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  updated_by  TEXT
);

-- ---------------------------------------------------------
--  週ボスの希望とPT編成
-- ---------------------------------------------------------
-- members は community_state へ移したので、こちらは seasons / wishes / parties
-- のみを持つ。古い保存データに members が残っていても、読み込み側が名簿へ
-- 移行してから捨てるので害はない。
CREATE TABLE IF NOT EXISTS scheduler_state (
  id          TEXT    PRIMARY KEY,           -- 常に 'current'（将来シーズンを分けるなら増やす）
  version     INTEGER NOT NULL DEFAULT 0,    -- 保存のたびに +1
  data        TEXT    NOT NULL,              -- JSON（seasons / wishes / parties）
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
