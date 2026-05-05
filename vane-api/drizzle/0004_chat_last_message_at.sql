ALTER TABLE `chats` ADD COLUMN `lastMessageAt` text;
--> statement-breakpoint
UPDATE chats
SET lastMessageAt = (
  SELECT MAX(messages.createdAt)
  FROM messages
  WHERE messages.chatId = chats.id
)
WHERE EXISTS (
  SELECT 1 FROM messages WHERE messages.chatId = chats.id
);
--> statement-breakpoint
UPDATE chats SET lastMessageAt = createdAt WHERE lastMessageAt IS NULL;
