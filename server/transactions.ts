import { db, sql, eq, and, inArray } from "void/db";
import { transactions, accounts, categories } from "../db/schema";
import type { AuthContext } from "../shared/auth";
import type { Currency } from "../shared/money";
import type {
  Transaction,
  TransactionBody,
  TransactionCreate,
  TransactionUpdate,
  TransactionQuery,
  TransactionList,
  TransactionResult,
} from "../shared/schemas";
import { withShares, prepareShares } from "./shares";
import { write, rowBase } from "./audit";
import { fail, found } from "./errors";
import { getAccount } from "./accounts";
import { getCategory } from "./categories";
import { incomeCategory } from "./settings";
import { decodeCursor, encodeCursor } from "./pagination";
const joined = sql`SELECT t.*, a.name account_name, c.name category_name, c.color category_color
  FROM transactions t JOIN accounts a ON a.user_id=t.user_id AND a.id=t.account_id
  LEFT JOIN categories c ON c.user_id=t.user_id AND c.id=t.category_id`;
export async function getTransaction(ctx: AuthContext, id: string): Promise<Transaction> {
  return (
    await withShares(ctx, [
      found(await db.get<Transaction>(sql`${joined} WHERE t.user_id=${ctx.id} AND t.id=${id}`)),
    ])
  )[0]!;
}
export async function listTransactions(
  ctx: AuthContext,
  q: TransactionQuery,
  currency?: Currency,
  exclusiveTo = false,
): Promise<TransactionList> {
  const filters = [sql`t.user_id=${ctx.id}`];
  if (q.account_id) filters.push(sql`t.account_id=${q.account_id}`);
  if (q.category_id) filters.push(sql`t.category_id=${q.category_id}`);
  if (q.from) filters.push(sql`t.date>=${q.from}`);
  if (q.to) filters.push(exclusiveTo ? sql`t.date<${q.to}` : sql`t.date<=${q.to}`);
  if (currency) filters.push(sql`t.currency=${currency}`);
  if (q.q)
    filters.push(
      sql`(instr(lower(t.payee),lower(${q.q}))>0 OR instr(lower(t.memo),lower(${q.q}))>0)`,
    );
  const uncategorized = sql`t.category_id IS NULL AND t.transfer_account_id IS NULL AND a.on_budget=1`;
  if (q.uncategorized !== undefined)
    filters.push(q.uncategorized ? sql`(${uncategorized})` : sql`NOT (${uncategorized})`);
  const where = sql.join(filters, sql` AND `);
  const count =
    (
      await db.get<{ n: number }>(
        sql`SELECT count(*) n FROM transactions t JOIN accounts a ON a.user_id=t.user_id AND a.id=t.account_id WHERE ${where} AND ${uncategorized}`,
      )
    )?.n ?? 0;
  const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
  const keyset = cursor
    ? sql`AND (t.date<${cursor[0]} OR (t.date=${cursor[0]} AND t.id<${cursor[1]}))`
    : sql``;
  const limit = q.limit ?? 50;
  const rows = await db.all<Transaction>(
    sql`${joined} WHERE ${where} ${keyset} ORDER BY t.date DESC,t.id DESC LIMIT ${limit + 1}`,
  );
  const page = rows.slice(0, limit),
    last = page.at(-1);
  return {
    transactions: await withShares(ctx, page),
    next_cursor: rows.length > limit && last ? encodeCursor(last.date, last.id) : null,
    uncategorized_count: count,
  };
}
type TxInsert = typeof transactions.$inferInsert;
type Lookups = {
  accounts: Map<string, typeof accounts.$inferSelect>;
  categories: Map<string, typeof categories.$inferSelect>;
};
async function prepareTransaction(
  ctx: AuthContext,
  input: TransactionCreate,
  source: string,
  ids?: [string, string],
  lookups?: Lookups,
): Promise<TxInsert[]> {
  const account = lookups
    ? found(lookups.accounts.get(input.account_id))
    : await getAccount(ctx, input.account_id);
  if (account.closed_at) fail("CONFLICT", "Reopen this account before adding transactions.", 409);
  if (input.currency && input.currency !== account.currency)
    fail("VALIDATION_FAILED", "Transaction currency must match the account.");
  const base = rowBase(ctx.id, ids?.[0]);
  const tx: TxInsert = {
    ...base,
    account_id: account.id,
    date: input.date,
    amount_minor: input.amount_minor,
    currency: account.currency,
    payee: input.payee ?? "",
    memo: input.memo ?? "",
    cleared: input.cleared ?? "uncleared",
    category_id: input.category_id ?? null,
    source,
    external_id: input.external_id ?? null,
  };
  if (!input.transfer_account_id) {
    if (input.transfer_amount_minor !== undefined || input.transfer_category_id !== undefined)
      fail("VALIDATION_FAILED", "Transfer fields require a transfer account.");
    if (!account.on_budget && tx.category_id)
      fail("VALIDATION_FAILED", "Off-budget transactions cannot have categories.");
    if (tx.category_id) {
      if (lookups) found(lookups.categories.get(tx.category_id));
      else await getCategory(ctx, tx.category_id);
    }
    return [tx];
  }
  if (input.transfer_account_id === account.id)
    fail("VALIDATION_FAILED", "A transfer needs two different accounts.");
  const other = lookups
    ? found(lookups.accounts.get(input.transfer_account_id))
    : await getAccount(ctx, input.transfer_account_id);
  if (other.closed_at) fail("CONFLICT", "Reopen the transfer account first.", 409);
  const cross = other.currency !== account.currency;
  const otherAmount = cross ? input.transfer_amount_minor : -input.amount_minor;
  if (otherAmount === undefined)
    fail("VALIDATION_FAILED", "Cross-currency transfers require transfer_amount_minor.");
  if (
    input.amount_minor === 0 ||
    otherAmount === 0 ||
    Math.sign(otherAmount) === Math.sign(input.amount_minor)
  )
    fail("VALIDATION_FAILED", "Transfer amounts must be nonzero and have opposite signs.");
  if (
    !cross &&
    input.transfer_amount_minor !== undefined &&
    input.transfer_amount_minor !== otherAmount
  )
    fail("VALIDATION_FAILED", "Same-currency transfers must have equal opposite amounts.");
  let ownCategory = input.category_id ?? null,
    otherCategory = input.transfer_category_id ?? null;
  if (account.on_budget && other.on_budget) {
    if (!cross) {
      if (ownCategory || otherCategory)
        fail("VALIDATION_FAILED", "Same-currency on-budget transfers must be uncategorised.");
    } else {
      const income = lookups
        ? found([...lookups.categories.values()].find((c) => c.kind === "income"))
        : await incomeCategory(ctx);
      ownCategory = input.category_id ?? income.id;
      otherCategory = input.transfer_category_id ?? income.id;
    }
  } else if (account.on_budget !== other.on_budget) {
    if ((account.on_budget && !ownCategory) || (other.on_budget && !otherCategory))
      fail("VALIDATION_FAILED", "The on-budget side of a tracking transfer needs a category.");
  }
  if ((!account.on_budget && ownCategory) || (!other.on_budget && otherCategory))
    fail("VALIDATION_FAILED", "The off-budget side cannot have a category.");
  if (ownCategory) {
    if (lookups) found(lookups.categories.get(ownCategory));
    else await getCategory(ctx, ownCategory);
  }
  if (otherCategory) {
    if (lookups) found(lookups.categories.get(otherCategory));
    else await getCategory(ctx, otherCategory);
  }
  const second = {
    ...rowBase(ctx.id, ids?.[1]),
    account_id: other.id,
    date: tx.date,
    amount_minor: otherAmount,
    currency: other.currency,
    payee: tx.payee,
    memo: tx.memo,
    cleared: tx.cleared,
    category_id: otherCategory,
    source,
    external_id: null,
    transfer_account_id: account.id,
    transfer_transaction_id: tx.id,
  };
  return [
    {
      ...tx,
      category_id: ownCategory,
      transfer_account_id: other.id,
      transfer_transaction_id: second.id,
    },
    second,
  ];
}
export async function createTransactions(
  ctx: AuthContext,
  body: TransactionBody,
  source = "api",
  retry = true,
): Promise<TransactionResult> {
  const inputs = "transactions" in body ? body.transactions : [body];
  if ("transactions" in body && inputs.some((i) => i.share))
    fail("VALIDATION_FAILED", "Sharing requires a single transaction request.");
  const shareStatements: Array<Parameters<typeof db.batch>[0][number]> = [];
  await incomeCategory(ctx);
  const [ownedAccounts, ownedCategories] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.user_id, ctx.id)),
    db.select().from(categories).where(eq(categories.user_id, ctx.id)),
  ]);
  const lookups: Lookups = {
    accounts: new Map(ownedAccounts.map((a) => [a.id, a])),
    categories: new Map(ownedCategories.map((c) => [c.id, c])),
  };
  const externalIds = inputs.flatMap((i) => (i.external_id ? [i.external_id] : []));
  const existing = externalIds.length
    ? await db.all<{ id: string; account_id: string; external_id: string }>(
        sql`SELECT id,account_id,external_id FROM transactions WHERE user_id=${ctx.id} AND external_id IN (SELECT value FROM json_each(${JSON.stringify(externalIds)}))`,
      )
    : [];
  const seen = new Map(existing.map((t) => [JSON.stringify([t.account_id, t.external_id]), t]));
  const skipped: TransactionResult["skipped"] = [],
    rows: TxInsert[] = [];
  for (const input of inputs) {
    const key = JSON.stringify([input.account_id, input.external_id]);
    const previous = input.external_id ? seen.get(key) : undefined;
    if (previous) {
      skipped.push(previous);
      continue;
    }
    const prepared = await prepareTransaction(
      ctx,
      input,
      source === "mcp" ? "mcp" : (input.source ?? source),
      undefined,
      lookups,
    );
    if (input.share) {
      if (!lookups.accounts.get(input.account_id)?.on_budget)
        fail("VALIDATION_FAILED", "Off-budget transactions cannot be shared.");
      const plan = await prepareShares(ctx, prepared[0]! as Transaction, input.share);
      prepared[0]!.split_method = plan.split_method;
      shareStatements.push(...plan.after);
    }
    rows.push(...prepared);
    if (input.external_id)
      seen.set(key, {
        id: prepared[0]!.id!,
        account_id: input.account_id,
        external_id: input.external_id,
      });
  }
  if (!rows.length) return { created: [], skipped };
  // JSON input uses one SQL parameter even for 500 items; D1 limits bound parameters and queries.
  const columns = [
    "id",
    "user_id",
    "created_at",
    "updated_at",
    "account_id",
    "date",
    "amount_minor",
    "currency",
    "payee",
    "memo",
    "category_id",
    "cleared",
    "transfer_account_id",
    "transfer_transaction_id",
    "split_method",
    "shared_out_minor",
    "source",
    "external_id",
  ];
  const select = sql`SELECT ${sql.join(
    columns.map((name) => sql.raw(`json_extract(value, '$.${name}')`)),
    sql`, `,
  )} FROM json_each(${JSON.stringify(rows.map((r) => ({ ...r, shared_out_minor: 0 })))})`;
  try {
    await write(
      ctx,
      "create",
      "transaction",
      rows[0]!.id!,
      { source, count: inputs.length - skipped.length, ids: rows.map((r) => r.id) },
      [db.insert(transactions).select(select), ...shareStatements],
    );
  } catch (error) {
    // A racing importer may claim an external ID after our read. The entire batch rolled back.
    if (
      retry &&
      externalIds.length &&
      error instanceof Error &&
      /unique|constraint/i.test(error.message + " " + String(error.cause))
    )
      return createTransactions(ctx, body, source, false);
    throw error;
  }
  const ids = rows.map((r) => r.id!);
  const created = await db.all<Transaction>(
    sql`${joined} WHERE t.user_id=${ctx.id} AND t.id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) ORDER BY t.created_at,t.id`,
  );
  // Preserve request/transfer-leg order without re-reading individual rows.
  const byId = new Map(created.map((t) => [t.id, t]));
  return {
    created: await withShares(
      ctx,
      ids.map((id) => byId.get(id)!),
    ),
    skipped,
  };
}
export async function updateTransaction(
  ctx: AuthContext,
  id: string,
  input: TransactionUpdate,
): Promise<Transaction> {
  const current = await getTransaction(ctx, id);
  if (
    current.transfer_account_id &&
    input.transfer_account_id &&
    input.transfer_account_id !== current.transfer_account_id
  )
    fail("CONFLICT", "Delete and recreate a transaction to change transfer accounts.", 409);
  let other: Transaction | undefined;
  if (current.transfer_transaction_id)
    other = await getTransaction(ctx, current.transfer_transaction_id);
  if (
    !other &&
    !input.transfer_account_id &&
    (input.transfer_amount_minor !== undefined || input.transfer_category_id !== undefined)
  )
    fail("VALIDATION_FAILED", "Transfer fields require a transfer account.");
  if (current.split_method && input.transfer_account_id && input.share !== null)
    fail("VALIDATION_FAILED", "Remove sharing in the same request before creating a transfer.");
  const cross = other && other.currency !== current.currency;
  if (cross && input.amount_minor !== undefined && input.transfer_amount_minor === undefined)
    fail("VALIDATION_FAILED", "Supply both amounts when changing a cross-currency transfer.");
  const merged: TransactionCreate = {
    account_id: current.account_id,
    date: current.date,
    amount_minor: current.amount_minor,
    currency: current.currency,
    payee: current.payee,
    memo: current.memo,
    category_id: current.category_id,
    cleared: current.cleared,
    ...(other
      ? {
          transfer_account_id: other.account_id,
          transfer_amount_minor: cross ? other.amount_minor : undefined,
          transfer_category_id: other.category_id,
        }
      : {}),
    ...input,
    share: input.share ?? undefined,
  };
  const rows = await prepareTransaction(ctx, merged, current.source, [
    id,
    other?.id ?? crypto.randomUUID(),
  ]);
  const plan = await prepareShares(ctx, rows[0]! as Transaction, input.share, current);
  rows[0]!.split_method = null;
  rows[0]!.shared_out_minor = 0;
  const statements = rows.map((row, i) => {
    const { id: rowId, user_id: _user, created_at: _created, ...patch } = row;
    if (i === 1 && !other) return db.insert(transactions).values(row);
    return db
      .update(transactions)
      .set({
        ...patch,
        external_id: i === 0 ? current.external_id : (other?.external_id ?? null),
        cleared: i === 1 && input.cleared === undefined ? other!.cleared : patch.cleared,
      })
      .where(and(eq(transactions.user_id, ctx.id), eq(transactions.id, rowId!)));
  });
  if (!other && rows.length === 2) statements.reverse();
  await write(ctx, "update", "transaction", id, input, [
    ...plan.before,
    statements[0]!,
    ...statements.slice(1),
    ...plan.after,
  ]);
  return getTransaction(ctx, id);
}
export async function deleteTransaction(ctx: AuthContext, id: string) {
  const current = await getTransaction(ctx, id);
  const ids = current.transfer_transaction_id ? [id, current.transfer_transaction_id] : [id];
  const plan = await prepareShares(ctx, current, null, current);
  await write(ctx, "delete", "transaction", id, { paired_id: current.transfer_transaction_id }, [
    ...plan.before,
    ...plan.after,
    db
      .delete(transactions)
      .where(and(eq(transactions.user_id, ctx.id), inArray(transactions.id, ids))),
  ]);
  return { ok: true as const };
}
