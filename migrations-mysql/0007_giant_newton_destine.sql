CREATE TABLE `einvoicing_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'superpdp',
	`env` varchar(16),
	`company_id` int,
	`company_name` varchar(255),
	`company_number` varchar(32),
	`access_token` text,
	`refresh_token` text,
	`expires_at` bigint,
	`last_event_id` bigint,
	`last_sync_at` bigint,
	`last_error` text,
	`connected_at` bigint NOT NULL,
	CONSTRAINT `einvoicing_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_einvoicing_conn_user` UNIQUE(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `einvoice_external_id` varchar(64);--> statement-breakpoint
ALTER TABLE `invoices` ADD `einvoice_status` varchar(32);--> statement-breakpoint
ALTER TABLE `invoices` ADD `einvoice_status_label` varchar(255);--> statement-breakpoint
ALTER TABLE `invoices` ADD `einvoice_sent_at` bigint;--> statement-breakpoint
ALTER TABLE `invoices` ADD `einvoice_status_at` bigint;--> statement-breakpoint
ALTER TABLE `invoices` ADD `einvoice_paid_reported_at` bigint;--> statement-breakpoint
ALTER TABLE `invoices` ADD `einvoice_error` text;