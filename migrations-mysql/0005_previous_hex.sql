ALTER TABLE `users` ADD `is_demo` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `public_page_updated_at` bigint;