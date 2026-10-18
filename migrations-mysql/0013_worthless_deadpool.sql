ALTER TABLE `users` ADD `referral_code` varchar(16);--> statement-breakpoint
ALTER TABLE `users` ADD `referred_by_user_id` int;--> statement-breakpoint
ALTER TABLE `users` ADD `referral_rewarded_at` bigint;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `uk_users_referral_code` UNIQUE(`referral_code`);