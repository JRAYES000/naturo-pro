CREATE TABLE `client_broadcasts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`subject` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'sending',
	`recipient_count` int NOT NULL DEFAULT 0,
	`sent_count` int NOT NULL DEFAULT 0,
	`failed_count` int NOT NULL DEFAULT 0,
	`created_at` bigint NOT NULL,
	`finished_at` bigint,
	CONSTRAINT `client_broadcasts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `client_followups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`client_id` int NOT NULL,
	`kind` varchar(20) NOT NULL DEFAULT 'note',
	`content` text NOT NULL,
	`occurred_at` bigint NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `client_followups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `archived_at` bigint;--> statement-breakpoint
ALTER TABLE `clients` ADD `email_opt_out_at` bigint;--> statement-breakpoint
ALTER TABLE `clients` ADD `opt_out_token` varchar(64);--> statement-breakpoint
ALTER TABLE `invoices` ADD `public_token` varchar(64);--> statement-breakpoint
ALTER TABLE `invoices` ADD `online_payment_session_id` varchar(255);--> statement-breakpoint
ALTER TABLE `invoices` ADD `quote_decided_at` bigint;--> statement-breakpoint
ALTER TABLE `invoices` ADD `quote_signer_name` varchar(255);--> statement-breakpoint
ALTER TABLE `invoices` ADD `quote_decision_note` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `converted_invoice_id` int;--> statement-breakpoint
ALTER TABLE `clients` ADD CONSTRAINT `uk_clients_opt_out_token` UNIQUE(`opt_out_token`);--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `uk_invoices_public_token` UNIQUE(`public_token`);--> statement-breakpoint
CREATE INDEX `idx_broadcasts_user` ON `client_broadcasts` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_followups_user` ON `client_followups` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_followups_client` ON `client_followups` (`client_id`);