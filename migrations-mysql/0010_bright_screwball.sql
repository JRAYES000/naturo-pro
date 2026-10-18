ALTER TABLE `users` ADD `totp_secret` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled_at` bigint;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_last_counter` bigint;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_backup_codes` text;