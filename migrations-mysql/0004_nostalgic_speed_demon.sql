CREATE TABLE `ai_saved_replies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` longtext NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `ai_saved_replies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blocked_dates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`start_date` varchar(10) NOT NULL,
	`end_date` varchar(10) NOT NULL,
	`reason` varchar(255),
	`created_at` bigint NOT NULL,
	CONSTRAINT `blocked_dates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `postal_code` varchar(20);--> statement-breakpoint
ALTER TABLE `clients` ADD `city` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `naturobot_intro_seen_at` bigint;--> statement-breakpoint
CREATE INDEX `idx_ai_saved_replies_user` ON `ai_saved_replies` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_blocked_dates_user` ON `blocked_dates` (`user_id`);