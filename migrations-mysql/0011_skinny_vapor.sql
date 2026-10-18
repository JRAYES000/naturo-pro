CREATE TABLE `client_portal_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`client_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`kind` varchar(10) NOT NULL,
	`expires_at` bigint NOT NULL,
	`used_at` bigint,
	`created_at` bigint NOT NULL,
	CONSTRAINT `client_portal_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_portal_token_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `program_checkins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`program_id` int NOT NULL,
	`client_id` int NOT NULL,
	`day` varchar(10) NOT NULL,
	`adherence` int NOT NULL,
	`energy` int,
	`note` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `program_checkins_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_checkin_program_day` UNIQUE(`program_id`,`day`)
);
--> statement-breakpoint
ALTER TABLE `anamnesis_responses` ADD `score` int;--> statement-breakpoint
ALTER TABLE `anamnesis_responses` ADD `score_label` varchar(120);--> statement-breakpoint
ALTER TABLE `anamnesis_templates` ADD `scoring` text;--> statement-breakpoint
ALTER TABLE `client_documents` ADD `shared_with_client` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `portal_last_seen_at` bigint;--> statement-breakpoint
ALTER TABLE `programs` ADD `start_date` varchar(10);--> statement-breakpoint
CREATE INDEX `idx_portal_tokens_client` ON `client_portal_tokens` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_checkins_user` ON `program_checkins` (`user_id`);