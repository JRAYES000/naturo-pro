CREATE TABLE `ai_chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`role` varchar(16) NOT NULL,
	`content` text NOT NULL,
	`discussion_id` int,
	`created_at` bigint NOT NULL,
	CONSTRAINT `ai_chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_chat_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`day` varchar(10) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `ai_chat_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_discussions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`client_id` int,
	`theme` varchar(120),
	`title` varchar(255) NOT NULL DEFAULT 'Nouvelle discussion',
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `ai_discussions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `anamnesis_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`template_id` int,
	`client_id` int,
	`appointment_id` int,
	`token` varchar(64) NOT NULL,
	`answers` text,
	`submitted_at` bigint,
	`created_at` bigint NOT NULL,
	CONSTRAINT `anamnesis_responses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `anamnesis_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`questions` text NOT NULL,
	`is_active` boolean DEFAULT true,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `anamnesis_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appointment_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`duration_minutes` int NOT NULL DEFAULT 60,
	`price_cents` int NOT NULL DEFAULT 0,
	`location` varchar(50) DEFAULT 'cabinet',
	`color` varchar(20) DEFAULT '#186749',
	`description` text,
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `appointment_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`client_id` int,
	`category_id` int,
	`start_at` bigint NOT NULL,
	`end_at` bigint NOT NULL,
	`status` varchar(20) DEFAULT 'confirmed',
	`client_first_name` varchar(255),
	`client_last_name` varchar(255),
	`client_email` varchar(255),
	`client_phone` varchar(50),
	`notes_before` text,
	`location` varchar(50),
	`google_event_id` varchar(255),
	`google_meet_link` varchar(512),
	`stripe_session_id` varchar(255),
	`deposit_amount_cents` int,
	`reminder_sent` boolean NOT NULL DEFAULT false,
	`reminder_sent_at` bigint,
	`confirm_token` varchar(64),
	`cancel_token` varchar(64),
	`client_confirmed_at` bigint,
	`client_cancelled_at` bigint,
	`payment_status` varchar(20) DEFAULT 'unpaid',
	`payment_amount_cents` int DEFAULT 0,
	`source` varchar(20) DEFAULT 'manual',
	`created_at` bigint NOT NULL,
	`review_email_sent_at` bigint,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assistant_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`custom_instructions` text NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `assistant_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `availability_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`day_of_week` int NOT NULL,
	`start_time` varchar(10) NOT NULL,
	`end_time` varchar(10) NOT NULL,
	CONSTRAINT `availability_slots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `client_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`client_id` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mime_type` varchar(128),
	`size_bytes` int,
	`data_base64` longtext NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `client_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`first_name` varchar(255) NOT NULL,
	`last_name` varchar(255) NOT NULL,
	`email` varchar(255),
	`phone` varchar(50),
	`date_of_birth` varchar(20),
	`address` text,
	`allergies` text,
	`antecedents` text,
	`lifestyle_notes` text,
	`pense_bete` text,
	`created_at` bigint NOT NULL,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consultation_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointment_id` int,
	`client_id` int,
	`user_id` int NOT NULL,
	`motif` text,
	`anamnese` text,
	`bilan` text,
	`conseils_alimentaires` text,
	`hygiene_de_vie` text,
	`suivi` text,
	`notes_libres` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `consultation_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`channel` varchar(32) NOT NULL,
	`format` varchar(32) NOT NULL,
	`theme` varchar(200),
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'brouillon',
	`slides_json` text,
	`background_image` longtext,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	`published_at` bigint,
	CONSTRAINT `content_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`kind` varchar(50) NOT NULL,
	`subject` varchar(500) NOT NULL,
	`body_html` text NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `email_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_user_kind` UNIQUE(`user_id`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoice_id` int NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`description` text NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unit_price_cents` int NOT NULL DEFAULT 0,
	`total_cents` int NOT NULL DEFAULT 0,
	CONSTRAINT `invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`number` varchar(32) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`issue_date` bigint NOT NULL,
	`due_date` bigint,
	`appointment_id` int,
	`client_id` int,
	`client_first_name` varchar(255),
	`client_last_name` varchar(255),
	`client_email` varchar(255),
	`client_address` text,
	`client_postal_code` varchar(20),
	`client_city` varchar(255),
	`subtotal_cents` int NOT NULL DEFAULT 0,
	`vat_cents` int NOT NULL DEFAULT 0,
	`total_cents` int NOT NULL DEFAULT 0,
	`vat_rate` int NOT NULL DEFAULT 0,
	`vat_enabled` boolean NOT NULL DEFAULT false,
	`payment_method` varchar(20),
	`paid_at` bigint,
	`sent_at` bigint,
	`notes` text,
	`practitioner_snapshot` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `uk_invoices_user_number` UNIQUE(`user_id`,`number`)
);
--> statement-breakpoint
CREATE TABLE `kb_chunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`document_id` int NOT NULL,
	`chunk_index` int NOT NULL,
	`content` text NOT NULL,
	`embedding` text NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `kb_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kb_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`filename` varchar(255),
	`mime_type` varchar(127),
	`char_count` int NOT NULL DEFAULT 0,
	`status` varchar(16) NOT NULL DEFAULT 'ready',
	`error` text,
	`folder` varchar(255),
	`created_at` bigint NOT NULL,
	CONSTRAINT `kb_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `natural_solutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`name` varchar(255) NOT NULL,
	`category` varchar(80) NOT NULL DEFAULT 'Plante',
	`properties` text,
	`contraindications` text,
	`usage_notes` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `natural_solutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`client_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`total_sessions` int NOT NULL,
	`used_sessions` int NOT NULL DEFAULT 0,
	`price_cents` int DEFAULT 0,
	`notes` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `packages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`client_id` int,
	`appointment_id` int,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`status` varchar(20) DEFAULT 'draft',
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `programs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`expires_at` bigint NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `stripe_processed_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`session_id` varchar(255) NOT NULL,
	`appointment_id` int,
	`created_at` bigint NOT NULL,
	CONSTRAINT `stripe_processed_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_processed_sessions_session_id_unique` UNIQUE(`session_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255),
	`google_id` varchar(255),
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`bio` text DEFAULT (''),
	`photo_url` text,
	`phone` varchar(50),
	`specialties` text DEFAULT ('[]'),
	`address` text,
	`city` varchar(255),
	`created_at` bigint NOT NULL,
	`google_calendar_token` text,
	`google_calendar_email` varchar(255),
	`email_reminders_enabled` boolean NOT NULL DEFAULT true,
	`public_page_enabled` boolean NOT NULL DEFAULT true,
	`primary_color` varchar(20) DEFAULT '#186749',
	`accent_color` varchar(20) DEFAULT '#17EC9B',
	`instagram` varchar(255),
	`facebook` varchar(255),
	`website_url` varchar(255),
	`marketing_tone` varchar(64),
	`marketing_audience` varchar(255),
	`studio_intro_seen_at` bigint,
	`resend_api_key` varchar(255),
	`email_from_address` varchar(255),
	`email_from_name` varchar(255),
	`daily_recap_enabled` boolean NOT NULL DEFAULT true,
	`reminder_hour_local` int NOT NULL DEFAULT 10,
	`recap_hour_local` int NOT NULL DEFAULT 10,
	`stripe_secret_key` varchar(255),
	`stripe_deposit_percent` int DEFAULT 0,
	`billing_company_name` varchar(255),
	`billing_siret` varchar(32),
	`billing_address` text,
	`billing_postal_code` varchar(20),
	`billing_city` varchar(255),
	`billing_country` varchar(100) DEFAULT 'France',
	`billing_iban` varchar(64),
	`billing_bic` varchar(32),
	`billing_logo_base64` text,
	`billing_vat_enabled` boolean NOT NULL DEFAULT false,
	`billing_vat_rate` int NOT NULL DEFAULT 2000,
	`billing_legal_mention` text,
	`billing_payment_terms` text,
	`auto_invoice_on_completed` boolean NOT NULL DEFAULT false,
	`invoice_counter_year` int NOT NULL DEFAULT 0,
	`invoice_counter_value` int NOT NULL DEFAULT 0,
	`plan` varchar(32) NOT NULL DEFAULT 'trial',
	`trial_ends_at` bigint,
	`email_verified_at` bigint,
	`email_verify_token` varchar(128),
	`email_verify_expires_at` bigint,
	`password_reset_token` varchar(128),
	`password_reset_expires_at` bigint,
	`onboarding_completed_at` bigint,
	`google_review_url` varchar(512),
	`review_request_enabled` boolean NOT NULL DEFAULT false,
	`theme_preference` varchar(16) NOT NULL DEFAULT 'light',
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `idx_ai_chat_user_created` ON `ai_chat_messages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_user_day` ON `ai_chat_usage` (`user_id`,`day`);--> statement-breakpoint
CREATE INDEX `idx_ai_discussions_user` ON `ai_discussions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_anamnesis_resp_user` ON `anamnesis_responses` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_anamnesis_resp_token` ON `anamnesis_responses` (`token`);--> statement-breakpoint
CREATE INDEX `idx_anamnesis_tpl_user` ON `anamnesis_templates` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_categories_user` ON `appointment_categories` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_appt_user_start` ON `appointments` (`user_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `idx_appt_user_google_event` ON `appointments` (`user_id`,`google_event_id`);--> statement-breakpoint
CREATE INDEX `idx_appt_confirm_token` ON `appointments` (`confirm_token`);--> statement-breakpoint
CREATE INDEX `idx_appt_cancel_token` ON `appointments` (`cancel_token`);--> statement-breakpoint
CREATE INDEX `idx_appt_reminder_pending` ON `appointments` (`start_at`,`reminder_sent`);--> statement-breakpoint
CREATE INDEX `idx_avail_user` ON `availability_slots` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_client_docs_user_client` ON `client_documents` (`user_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `idx_clients_user` ON `clients` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_user` ON `consultation_notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_client` ON `consultation_notes` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_appointment` ON `consultation_notes` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_content_posts_user` ON `content_posts` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_invoice_items_invoice` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_user` ON `invoices` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_status` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `idx_invoices_issue_date` ON `invoices` (`issue_date`);--> statement-breakpoint
CREATE INDEX `idx_invoices_appointment` ON `invoices` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_client` ON `invoices` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_kb_chunks_document_id` ON `kb_chunks` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_natural_solutions_user` ON `natural_solutions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_packages_user_client` ON `packages` (`user_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `idx_programs_user` ON `programs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_programs_client` ON `programs` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_sps_user` ON `stripe_processed_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_email_verify_token` ON `users` (`email_verify_token`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_token` ON `users` (`password_reset_token`);