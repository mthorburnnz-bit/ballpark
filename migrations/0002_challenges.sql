-- Challenge links: a short public token that resolves to "this player scored
-- this much on this date", so a shared link can greet the recipient with a
-- concrete score to beat instead of a generic landing page.
--
-- UNIQUE(player_id, date) keeps minting idempotent — replaying or re-sharing
-- a day always yields the same token, so links stay stable once sent.
CREATE TABLE challenges (
  token TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(player_id, date)
);
