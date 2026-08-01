-- Migration number: 0001 	 2026-08-01T00:02:00.725Z

CREATE TABLE players (
  id TEXT PRIMARY KEY,          -- client-generated random id, anonymous (no login)
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL   -- unix ms
);

CREATE TABLE daily_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id),
  date TEXT NOT NULL,           -- YYYY-MM-DD, player's local date at play time
  puzzle_number INTEGER NOT NULL,
  score INTEGER NOT NULL,       -- server-computed total for the day, 0-500
  created_at INTEGER NOT NULL,
  UNIQUE(player_id, date)       -- one score per player per day, no resubmission
);

CREATE INDEX idx_daily_scores_player ON daily_scores(player_id);
CREATE INDEX idx_daily_scores_date ON daily_scores(date);

CREATE TABLE question_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id),
  date TEXT NOT NULL,
  question_index INTEGER NOT NULL, -- 0-4
  question_id TEXT NOT NULL,
  lo REAL NOT NULL,
  hi REAL NOT NULL,
  hit INTEGER NOT NULL,          -- 0/1
  f REAL NOT NULL,
  tight INTEGER NOT NULL,        -- 0/1
  points INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(player_id, date, question_index)
);
