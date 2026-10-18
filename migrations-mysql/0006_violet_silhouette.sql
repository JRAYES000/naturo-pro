ALTER TABLE `clients` ADD `company_vat_number` varchar(32);--> statement-breakpoint
ALTER TABLE `invoice_items` ADD `kind` varchar(16) DEFAULT 'service' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `service_date` bigint;--> statement-breakpoint
ALTER TABLE `invoices` ADD `operation_category` varchar(16);--> statement-breakpoint
ALTER TABLE `invoices` ADD `client_type` varchar(20);--> statement-breakpoint
ALTER TABLE `invoices` ADD `client_company_name` varchar(255);--> statement-breakpoint
ALTER TABLE `invoices` ADD `client_siren` varchar(16);--> statement-breakpoint
ALTER TABLE `invoices` ADD `client_siret` varchar(20);--> statement-breakpoint
ALTER TABLE `invoices` ADD `client_vat_number` varchar(32);--> statement-breakpoint
ALTER TABLE `invoices` ADD `client_country` varchar(100);--> statement-breakpoint
ALTER TABLE `invoices` ADD `credited_invoice_id` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `issued_at` bigint;--> statement-breakpoint
ALTER TABLE `users` ADD `billing_legal_form` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `billing_vat_number` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `billing_vat_regime` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `billing_vat_on_debits` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `billing_rcs` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `billing_share_capital` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `billing_mediator_name` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `billing_mediator_url` varchar(255);