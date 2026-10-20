-- void:allow-destructive
-- Preserve existing rows while rebuilding CHECK constraints with D1 foreign keys enabled.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
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
	`split_method` text,
	`shared_out_minor` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transfer_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`account_id`,`currency`) REFERENCES `accounts`(`user_id`,`id`,`currency`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`category_id`) REFERENCES `categories`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`transfer_account_id`) REFERENCES `accounts`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_amount" CHECK(typeof("__new_transactions"."amount_minor")='integer' AND abs("__new_transactions"."amount_minor")<=9007199254740991),
	CONSTRAINT "transactions_split" CHECK("__new_transactions"."split_method" IS NULL OR "__new_transactions"."split_method" IN ('equal','percent','amount')),
	CONSTRAINT "transactions_shared_amount" CHECK(typeof("__new_transactions"."shared_out_minor")='integer' AND abs("__new_transactions"."shared_out_minor")<=abs("__new_transactions"."amount_minor") AND ("__new_transactions"."shared_out_minor"=0 OR ("__new_transactions"."shared_out_minor">0)=("__new_transactions"."amount_minor">0))),
	CONSTRAINT "transactions_cleared" CHECK("__new_transactions"."cleared" IN ('uncleared','cleared','reconciled')),
	CONSTRAINT "transactions_source" CHECK("__new_transactions"."source" IN ('manual','api','mcp') OR "__new_transactions"."source" GLOB 'import:?*'),
	CONSTRAINT "transactions_transfer_pair" CHECK(("__new_transactions"."transfer_account_id" IS NULL) = ("__new_transactions"."transfer_transaction_id" IS NULL)),
	CONSTRAINT "transactions_date" CHECK("__new_transactions"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("__new_transactions"."date",'+0 days') = "__new_transactions"."date")
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "user_id", "created_at", "updated_at", "account_id", "date", "amount_minor", "currency", "payee", "memo", "category_id", "cleared", "transfer_account_id", "transfer_transaction_id", "split_method", "shared_out_minor", "source", "external_id") SELECT "id", "user_id", "created_at", "updated_at", "account_id", "date", "amount_minor", "currency", "payee", "memo", "category_id", "cleared", "transfer_account_id", "transfer_transaction_id", "split_method", "shared_out_minor", "source", "external_id" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_owner_id` ON `transactions` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_account_date` ON `transactions` (`user_id`,`account_id`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_category_date` ON `transactions` (`user_id`,`category_id`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_user_date` ON `transactions` (`user_id`,`date`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_external_id` ON `transactions` (`user_id`,`account_id`,`external_id`);
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
