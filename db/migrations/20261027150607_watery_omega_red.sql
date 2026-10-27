CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`category_id` text,
	`transaction_id` text,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_key` text NOT NULL,
	`note` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`category_id`) REFERENCES `categories`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`transaction_id`) REFERENCES `transactions`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attachments_parent" CHECK(("attachments"."category_id" IS NOT NULL) != ("attachments"."transaction_id" IS NOT NULL)),
	CONSTRAINT "attachments_file_name" CHECK(length("attachments"."file_name") BETWEEN 1 AND 255),
	CONSTRAINT "attachments_content_type" CHECK(content_type IN ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif')),
	CONSTRAINT "attachments_size" CHECK(typeof("attachments"."size_bytes")='integer' AND "attachments"."size_bytes" BETWEEN 1 AND 10485760),
	CONSTRAINT "attachments_note" CHECK(length("attachments"."note") <= 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_storage_key` ON `attachments` (`storage_key`);--> statement-breakpoint
CREATE INDEX `attachments_user_category` ON `attachments` (`user_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `attachments_user_transaction` ON `attachments` (`user_id`,`transaction_id`);