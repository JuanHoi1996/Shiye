CREATE TABLE IF NOT EXISTS `chat_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`fromChatId` text NOT NULL,
	`fromMessageId` text NOT NULL,
	`toChatId` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_branches_from` ON `chat_branches` (`fromChatId`, `fromMessageId`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_branches_to` ON `chat_branches` (`toChatId`);
