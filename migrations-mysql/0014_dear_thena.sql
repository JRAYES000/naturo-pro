CREATE TABLE `medications` (
	`cis` varchar(16) NOT NULL,
	`name` varchar(300) NOT NULL,
	`search` varchar(300) NOT NULL,
	`form` varchar(255),
	`routes` varchar(255),
	`holder` varchar(255),
	`commercialized` boolean NOT NULL DEFAULT true,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `medications_cis` PRIMARY KEY(`cis`)
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `current_treatments` text;