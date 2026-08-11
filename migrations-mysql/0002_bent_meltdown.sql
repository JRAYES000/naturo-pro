CREATE TABLE `analytics_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`event` varchar(64) NOT NULL,
	`metadata` text,
	`created_at` bigint NOT NULL,
	CONSTRAINT `analytics_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` bigint;--> statement-breakpoint
ALTER TABLE `users` ADD `stripe_customer_id` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `stripe_subscription_id` varchar(255);--> statement-breakpoint
CREATE INDEX `idx_analytics_user` ON `analytics_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_analytics_event` ON `analytics_events` (`event`);