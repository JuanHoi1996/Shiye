CREATE TABLE IF NOT EXISTS `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `folderId` text REFERENCES `folders`(`id`);
