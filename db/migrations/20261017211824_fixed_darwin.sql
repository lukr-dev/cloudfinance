CREATE TABLE `accounts` (
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
	CONSTRAINT "accounts_type" CHECK("accounts"."type" IN ('checking','savings','credit_card','cash','investment','other')),
	CONSTRAINT "accounts_boolean" CHECK("accounts"."on_budget" IN (0,1)),
	CONSTRAINT "accounts_currency" CHECK("accounts"."currency" IN ('CHF','EUR','USD','GBP','JPY'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_owner_id` ON `accounts` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `accounts_user_order` ON `accounts` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_owner_id_currency` ON `accounts` (`user_id`,`id`,`currency`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`at` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "audit_actor_type" CHECK("audit_events"."actor_type" IN ('user','api_key')),
	CONSTRAINT "audit_payload_json" CHECK(json_valid("audit_events"."payload"))
);
--> statement-breakpoint
CREATE INDEX `audit_user_at` ON `audit_events` (`user_id`,`at`,`id`);--> statement-breakpoint
CREATE TABLE `budget_assignments` (
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
	CONSTRAINT "assignments_month" CHECK("budget_assignments"."month" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr("budget_assignments"."month",6,2) BETWEEN '01' AND '12'),
	CONSTRAINT "assignments_amount" CHECK(typeof("budget_assignments"."amount_minor")='integer' AND abs("budget_assignments"."amount_minor")<=9007199254740991),
	CONSTRAINT "assignments_currency" CHECK("budget_assignments"."currency" IN ('CHF','EUR','USD','GBP','JPY'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignments_user_month_category_currency` ON `budget_assignments` (`user_id`,`month`,`category_id`,`currency`);--> statement-breakpoint
CREATE INDEX `assignments_user_currency_month` ON `budget_assignments` (`user_id`,`currency`,`month`);--> statement-breakpoint
CREATE TABLE `categories` (
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
	CONSTRAINT "categories_kind" CHECK(("categories"."kind"='income' AND "categories"."group_id" IS NULL) OR ("categories"."kind"='expense' AND "categories"."group_id" IS NOT NULL)),
	CONSTRAINT "categories_color" CHECK("categories"."color" IN ('teal','orange','pink','indigo','violet','amber','red','green','blue','slate')),
	CONSTRAINT "categories_boolean" CHECK("categories"."hidden" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_owner_id` ON `categories` (`user_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_income_category` ON `categories` (`user_id`) WHERE "categories"."kind" = 'income';--> statement-breakpoint
CREATE INDEX `categories_group_order` ON `categories` (`user_id`,`group_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `category_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "groups_boolean" CHECK("category_groups"."hidden" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_owner_id` ON `category_groups` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `groups_user_order` ON `category_groups` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`base_currency` text DEFAULT 'CHF' NOT NULL,
	`enabled_currencies` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "settings_locale" CHECK("settings"."locale" IN ('de','en')),
	CONSTRAINT "settings_theme" CHECK("settings"."theme" IN ('light','dark','system')),
	CONSTRAINT "settings_currencies_json" CHECK(json_valid("settings"."enabled_currencies") AND json_type("settings"."enabled_currencies") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_user` ON `settings` (`user_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`payee` text DEFAULT '' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`category_id` text,
	`cleared` text DEFAULT 'uncleared' NOT NULL,
	`transfer_account_id` text,
	`transfer_transaction_id` text,
	`source` text NOT NULL,
	`external_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transfer_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`account_id`,`currency`) REFERENCES `accounts`(`user_id`,`id`,`currency`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`category_id`) REFERENCES `categories`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`transfer_account_id`) REFERENCES `accounts`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_amount" CHECK(typeof("transactions"."amount_minor")='integer' AND abs("transactions"."amount_minor")<=9007199254740991),
	CONSTRAINT "transactions_cleared" CHECK("transactions"."cleared" IN ('uncleared','cleared','reconciled')),
	CONSTRAINT "transactions_source" CHECK("transactions"."source" IN ('manual','api','mcp') OR "transactions"."source" GLOB 'import:?*'),
	CONSTRAINT "transactions_transfer_pair" CHECK(("transactions"."transfer_account_id" IS NULL) = ("transactions"."transfer_transaction_id" IS NULL)),
	CONSTRAINT "transactions_date" CHECK("transactions"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("transactions"."date",'+0 days') = "transactions"."date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_owner_id` ON `transactions` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_account_date` ON `transactions` (`user_id`,`account_id`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_category_date` ON `transactions` (`user_id`,`category_id`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_user_date` ON `transactions` (`user_id`,`date`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_external_id` ON `transactions` (`user_id`,`account_id`,`external_id`);