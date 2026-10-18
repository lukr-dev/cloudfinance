-- void:allow-destructive
-- Rebuilds copy every column before dropping the old tables; no domain rows are deleted.
-- D1 keeps foreign keys enabled; defer checks until both tables and their indexes are restored.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text NOT NULL,
	`on_budget` integer DEFAULT true NOT NULL,
	`institution` text,
	`closed_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "accounts_type" CHECK("__new_accounts"."type" IN ('checking','savings','credit_card','cash','investment','other')),
	CONSTRAINT "accounts_boolean" CHECK("__new_accounts"."on_budget" IN (0,1))
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "user_id", "created_at", "updated_at", "name", "type", "currency", "on_budget", "institution", "closed_at", "sort_order") SELECT "id", "user_id", "created_at", "updated_at", "name", "type", "currency", "on_budget", "institution", "closed_at", "sort_order" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_owner_id` ON `accounts` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `accounts_user_order` ON `accounts` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_owner_id_currency` ON `accounts` (`user_id`,`id`,`currency`);--> statement-breakpoint
CREATE TABLE `__new_budget_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`month` text NOT NULL,
	`category_id` text NOT NULL,
	`currency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`category_id`) REFERENCES `categories`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assignments_month" CHECK("__new_budget_assignments"."month" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr("__new_budget_assignments"."month",6,2) BETWEEN '01' AND '12'),
	CONSTRAINT "assignments_amount" CHECK(typeof("__new_budget_assignments"."amount_minor")='integer' AND abs("__new_budget_assignments"."amount_minor")<=9007199254740991)
);
--> statement-breakpoint
INSERT INTO `__new_budget_assignments`("id", "user_id", "created_at", "updated_at", "month", "category_id", "currency", "amount_minor") SELECT "id", "user_id", "created_at", "updated_at", "month", "category_id", "currency", "amount_minor" FROM `budget_assignments`;--> statement-breakpoint
DROP TABLE `budget_assignments`;--> statement-breakpoint
ALTER TABLE `__new_budget_assignments` RENAME TO `budget_assignments`;--> statement-breakpoint
CREATE UNIQUE INDEX `assignments_user_month_category_currency` ON `budget_assignments` (`user_id`,`month`,`category_id`,`currency`);--> statement-breakpoint
CREATE INDEX `assignments_user_currency_month` ON `budget_assignments` (`user_id`,`currency`,`month`);
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
