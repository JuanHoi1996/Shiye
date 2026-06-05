CREATE TABLE IF NOT EXISTS advisor_runs (
  id TEXT PRIMARY KEY NOT NULL,
  chatId TEXT NOT NULL,
  runAt TEXT NOT NULL,
  coveredUntilTimestamp TEXT NOT NULL,
  coveredChatCount INTEGER NOT NULL,
  coveredUserMessageCount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_advisor_runs_runAt ON advisor_runs (runAt DESC);
