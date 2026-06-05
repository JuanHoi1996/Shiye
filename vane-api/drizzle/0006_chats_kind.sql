ALTER TABLE chats ADD COLUMN kind TEXT NOT NULL DEFAULT 'normal';
--> statement-breakpoint
UPDATE chats SET kind = 'normal' WHERE kind IS NULL OR kind = '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_chats_kind ON chats (kind);
