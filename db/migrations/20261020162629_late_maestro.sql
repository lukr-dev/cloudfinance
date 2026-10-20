-- void:allow-destructive
-- Preserve existing rows while rebuilding CHECK constraints with D1 foreign keys enabled.
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`email` text,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`used_by` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitations_creator` ON `invitations` (`created_by`,`created_at`);--> statement-breakpoint
CREATE TABLE `members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`invited_by` text,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "members_role" CHECK("members"."role" IN ('admin','member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_admin` ON `members` (`role`) WHERE "members"."role"='admin';--> statement-breakpoint
CREATE TABLE `transaction_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`transaction_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`percent_bp` integer,
	`currency` text NOT NULL,
	`date` text NOT NULL,
	`payee` text NOT NULL,
	`memo` text NOT NULL,
	`category_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`,`transaction_id`) REFERENCES `transactions`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`category_id`) REFERENCES `categories`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shares_amount" CHECK(typeof("transaction_shares"."amount_minor")='integer' AND "transaction_shares"."amount_minor"!=0 AND abs("transaction_shares"."amount_minor")<=9007199254740991),
	CONSTRAINT "shares_percent" CHECK("transaction_shares"."percent_bp" IS NULL OR (typeof("transaction_shares"."percent_bp")='integer' AND "transaction_shares"."percent_bp" BETWEEN 1 AND 10000)),
	CONSTRAINT "shares_status" CHECK("transaction_shares"."status" IN ('active','declined')),
	CONSTRAINT "shares_not_owner" CHECK("transaction_shares"."user_id"!="transaction_shares"."owner_user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shares_transaction_user` ON `transaction_shares` (`transaction_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `shares_user_date` ON `transaction_shares` (`user_id`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `shares_owner` ON `transaction_shares` (`owner_user_id`,`transaction_id`);--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`group_id` text,
	`name` text NOT NULL,
	`kind` text DEFAULT 'expense' NOT NULL,
	`color` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`group_id`) REFERENCES `category_groups`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "categories_kind" CHECK(("__new_categories"."kind" IN ('income','repayment') AND "__new_categories"."group_id" IS NULL) OR ("__new_categories"."kind"='expense' AND "__new_categories"."group_id" IS NOT NULL)),
	CONSTRAINT "categories_color" CHECK("__new_categories"."color" IN ('teal','orange','pink','indigo','violet','amber','red','green','blue','slate')),
	CONSTRAINT "categories_boolean" CHECK("__new_categories"."hidden" IN (0,1))
);
--> statement-breakpoint
INSERT INTO `__new_categories`("id", "user_id", "created_at", "updated_at", "group_id", "name", "kind", "color", "note", "hidden", "sort_order") SELECT "id", "user_id", "created_at", "updated_at", "group_id", "name", "kind", "color", "note", "hidden", "sort_order" FROM `categories`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
ALTER TABLE `__new_categories` RENAME TO `categories`;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_owner_id` ON `categories` (`user_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_income_category` ON `categories` (`user_id`) WHERE "categories"."kind" = 'income';--> statement-breakpoint
CREATE UNIQUE INDEX `one_repayment_category` ON `categories` (`user_id`) WHERE "categories"."kind" = 'repayment';--> statement-breakpoint
CREATE INDEX `categories_group_order` ON `categories` (`user_id`,`group_id`,`sort_order`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `split_method` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `shared_out_minor` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
