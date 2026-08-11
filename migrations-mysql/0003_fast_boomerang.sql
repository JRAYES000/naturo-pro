ALTER TABLE `client_documents` ADD `kind` varchar(32);--> statement-breakpoint
ALTER TABLE `clients` ADD `client_type` varchar(20) DEFAULT 'particulier';--> statement-breakpoint
ALTER TABLE `clients` ADD `company_name` varchar(255);--> statement-breakpoint
ALTER TABLE `clients` ADD `company_siret` varchar(32);--> statement-breakpoint
ALTER TABLE `clients` ADD `height_cm` int;--> statement-breakpoint
ALTER TABLE `clients` ADD `weight_kg` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `doc_type` varchar(16) DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email_reply_to` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `dashboard_note` text;--> statement-breakpoint
ALTER TABLE `users` ADD `onboarding_checklist_hidden_at` bigint;