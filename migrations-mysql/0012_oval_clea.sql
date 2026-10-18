ALTER TABLE `appointments` ADD `sms_reminder_sent_at` bigint;--> statement-breakpoint
ALTER TABLE `users` ADD `brevo_api_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `brevo_list_id` int;--> statement-breakpoint
ALTER TABLE `users` ADD `brevo_sms_sender` varchar(11);--> statement-breakpoint
ALTER TABLE `users` ADD `sms_reminders_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `brevo_last_sync_at` bigint;--> statement-breakpoint
ALTER TABLE `users` ADD `brevo_last_sync_count` int;