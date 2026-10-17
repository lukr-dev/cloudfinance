import { db, and, eq, sql } from "void/db";
import { accounts, transactions } from "../db/schema";
import type { AuthContext } from "../shared/auth";
import type { Account, AccountCreate, AccountUpdate } from "../shared/schemas";
import { write, rowBase } from "./audit";
import { fail, found } from "./errors";
import { getSettings } from "./settings";
export async function listAccounts(ctx: AuthContext, includeClosed = false): Promise<Account[]> {
  return db
    .all<Account>(sql`SELECT a.*, json(a.on_budget) AS on_budget,
    coalesce(sum(t.amount_minor),0) balance_minor,
    coalesce(sum(CASE WHEN t.cleared IN ('cleared','reconciled') THEN t.amount_minor ELSE 0 END),0) cleared_balance_minor,
    coalesce(sum(CASE WHEN t.cleared='uncleared' THEN t.amount_minor ELSE 0 END),0) uncleared_balance_minor
    FROM accounts a LEFT JOIN transactions t ON t.user_id=a.user_id AND t.account_id=a.id
    WHERE a.user_id=${ctx.id} AND (${includeClosed ? 1 : 0}=1 OR a.closed_at IS NULL)
    GROUP BY a.id ORDER BY a.sort_order,a.created_at,a.id`)
    .then((rows) => rows.map((r) => ({ ...r, on_budget: Boolean(Number(r.on_budget)) })));
}
export async function getAccount(ctx: AuthContext, id: string): Promise<Account> {
  return found((await listAccounts(ctx, true)).find((a) => a.id === id));
}
export async function createAccount(ctx: AuthContext, input: AccountCreate): Promise<Account> {
  const prefs = await getSettings(ctx);
  if (!prefs.enabled_currencies.includes(input.currency))
    fail("CURRENCY_NOT_ENABLED", "Enable this currency in settings first.");
  const row = { ...rowBase(ctx.id), ...input };
  await write(ctx, "create", "account", row.id, input, [db.insert(accounts).values(row)]);
  return getAccount(ctx, row.id);
}
export async function updateAccount(
  ctx: AuthContext,
  id: string,
  input: AccountUpdate,
): Promise<Account> {
  const current = await getAccount(ctx, id);
  const prefs = await getSettings(ctx);
  if (input.currency && !prefs.enabled_currencies.includes(input.currency))
    fail("CURRENCY_NOT_ENABLED", "Enable this currency in settings first.");
  if (
    (input.currency && input.currency !== current.currency) ||
    (input.on_budget !== undefined && input.on_budget !== current.on_budget)
  ) {
    const any = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.user_id, ctx.id), eq(transactions.account_id, id)))
      .limit(1);
    if (any.length)
      fail(
        "CONFLICT",
        "Currency and budget status cannot change after an account has transactions.",
        409,
      );
  }
  await write(ctx, "update", "account", id, input, [
    db
      .update(accounts)
      .set({ ...input, updated_at: new Date().toISOString() })
      .where(and(eq(accounts.user_id, ctx.id), eq(accounts.id, id))),
  ]);
  return getAccount(ctx, id);
}
export async function deleteAccount(ctx: AuthContext, id: string) {
  await getAccount(ctx, id);
  const any = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.user_id, ctx.id), eq(transactions.account_id, id)))
    .limit(1);
  if (any.length)
    fail(
      "ACCOUNT_HAS_TRANSACTIONS",
      "Close accounts with transactions instead of deleting them.",
      409,
    );
  await write(ctx, "delete", "account", id, {}, [
    db.delete(accounts).where(and(eq(accounts.user_id, ctx.id), eq(accounts.id, id))),
  ]);
  return { ok: true as const };
}
