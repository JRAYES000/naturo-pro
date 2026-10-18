ALTER TABLE `blocked_dates` ADD `start_time` varchar(5);--> statement-breakpoint
ALTER TABLE `blocked_dates` ADD `end_time` varchar(5);--> statement-breakpoint
ALTER TABLE `blocked_dates` ADD `weekdays` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `booking_min_notice_hours` int DEFAULT 2;--> statement-breakpoint
ALTER TABLE `users` ADD `booking_max_days_ahead` int;--> statement-breakpoint
ALTER TABLE `users` ADD `booking_cancel_notice_hours` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `booking_requires_approval` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `booking_new_clients_allowed` boolean DEFAULT true NOT NULL;