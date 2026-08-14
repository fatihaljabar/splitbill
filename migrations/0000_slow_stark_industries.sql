CREATE TABLE `bills` (
	`short_code` varchar(12) NOT NULL,
	`data` json NOT NULL,
	`created_at` bigint NOT NULL,
	`expires_at` bigint NOT NULL,
	CONSTRAINT `bills_short_code` PRIMARY KEY(`short_code`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`short_code` varchar(12) NOT NULL,
	`participant_id` varchar(64) NOT NULL,
	`status` enum('unpaid','paid') NOT NULL DEFAULT 'unpaid',
	`updated_at` bigint NOT NULL,
	CONSTRAINT `payments_short_code_participant_id_pk` PRIMARY KEY(`short_code`,`participant_id`)
);
--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_bill_fk` FOREIGN KEY (`short_code`) REFERENCES `bills`(`short_code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_expires` ON `bills` (`expires_at`);