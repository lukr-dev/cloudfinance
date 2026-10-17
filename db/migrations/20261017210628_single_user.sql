-- The hook gives a useful error; this index also closes concurrent first-sign-up races.
CREATE UNIQUE INDEX user_single_account ON "user" ((1));
--> statement-breakpoint
