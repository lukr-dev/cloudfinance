import { db, sql, and, eq } from "void/db";
import { transactionShares, transactions, categories } from "../db/schema";
import type { AuthContext } from "../shared/auth";
import type {
  ShareInput,
  Transaction,
  TransactionShare,
  IncomingShare,
  IncomingShareQuery,
  IncomingShareList,
  IncomingShareUpdate,
  ShareContact,
} from "../shared/schemas";
import { auditEvent, rowBase, write } from "./audit";
import { fail, found } from "./errors";
import { shareCurrencyStatements } from "./settings";
import { decodeCursor, encodeCursor } from "./pagination";

type ShareRow = typeof transactionShares.$inferSelect;
type SharedTransaction = Pick<
  Transaction,
  | "id"
  | "amount_minor"
  | "currency"
  | "date"
  | "payee"
  | "memo"
  | "category_id"
  | "transfer_account_id"
>;
export function splitAmounts(total: number, input: ShareInput): number[] {
  if (
    !Number.isSafeInteger(total) ||
    total === 0 ||
    input.participants.length < 1 ||
    input.participants.length > 10
  )
    fail("VALIDATION_FAILED", "A split requires a nonzero amount and 1–10 participants.");
  let basis = 0;
  const amounts = input.participants.map((p) => {
    if (input.split_method === "equal") {
      if (p.percent_bp !== undefined || p.amount_minor !== undefined)
        fail("VALIDATION_FAILED", "Equal shares do not accept amounts or percentages.");
      return Number(BigInt(total) / BigInt(input.participants.length + 1));
    }
    if (input.split_method === "percent") {
      if (
        !Number.isInteger(p.percent_bp) ||
        p.percent_bp! < 1 ||
        p.percent_bp! > 10000 ||
        p.amount_minor !== undefined
      )
        fail("VALIDATION_FAILED", "Percent shares require basis points from 1 to 10000.");
      basis += p.percent_bp!;
      return Number((BigInt(total) * BigInt(p.percent_bp!)) / 10000n);
    }
    if (!Number.isSafeInteger(p.amount_minor) || p.percent_bp !== undefined)
      fail("VALIDATION_FAILED", "Amount shares require integer minor units.");
    return p.amount_minor!;
  });
  const sum = amounts.reduce((n, a) => n + BigInt(a), 0n);
  if (
    basis > 10000 ||
    amounts.some((a) => a === 0 || Math.sign(a) !== Math.sign(total)) ||
    (sum < 0n ? -sum : sum) > BigInt(Math.abs(total))
  )
    fail(
      "VALIDATION_FAILED",
      "Shares must be nonzero, have the transaction's sign and fit within its total.",
    );
  return amounts;
}
export async function ownerShares(ctx: AuthContext, ids: string[]) {
  if (!ids.length) return [];
  return db.all<ShareRow & { name: string; email: string }>(
    sql`SELECT s.*,u.name,u.email FROM transaction_shares s JOIN "user" u ON u.id=s.user_id WHERE s.owner_user_id=${ctx.id} AND s.transaction_id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) ORDER BY s.id`,
  );
}
export async function withShares(ctx: AuthContext, rows: Transaction[]): Promise<Transaction[]> {
  const shares = await ownerShares(
    ctx,
    rows.filter((t) => t.split_method).map((t) => t.id),
  );
  return rows.map((t) => ({
    ...t,
    own_amount_minor: t.amount_minor - t.shared_out_minor,
    share: t.split_method
      ? ({
          split_method: t.split_method,
          participants: shares
            .filter((s) => s.transaction_id === t.id)
            .map((s) => ({
              share_id: s.id,
              user_id: s.user_id,
              name: s.name,
              email: s.email,
              amount_minor: s.amount_minor,
              percent_bp: s.percent_bp,
              status: s.status,
            })),
        } satisfies TransactionShare)
      : null,
  }));
}
export async function prepareShares(
  ctx: AuthContext,
  tx: SharedTransaction,
  input: ShareInput | null | undefined,
  current?: Transaction,
) {
  const old = current?.split_method ? await ownerShares(ctx, [tx.id]) : [];
  const before: Array<Parameters<typeof db.batch>[0][number]> = [];
  const after: Array<Parameters<typeof db.batch>[0][number]> = [];
  const method =
    input === undefined ? (current?.split_method ?? null) : (input?.split_method ?? null);
  if (!method && !old.length) return { before, after, split_method: null };
  if (method) {
    const account = await db.get<{ on_budget: number }>(
      sql`SELECT on_budget FROM accounts WHERE user_id=${ctx.id} AND id=(SELECT account_id FROM transactions WHERE user_id=${ctx.id} AND id=${tx.id})`,
    );
    // New transactions are checked against their account by the caller.
    if (
      tx.transfer_account_id ||
      account?.on_budget === 0 ||
      (tx.category_id &&
        (
          await db.get<{ kind: string }>(
            sql`SELECT kind FROM categories WHERE user_id=${ctx.id} AND id=${tx.category_id}`,
          )
        )?.kind === "repayment")
    )
      fail(
        "VALIDATION_FAILED",
        "Only on-budget non-transfer transactions outside Shared repayment can be shared.",
      );
  }
  const replacement: ShareInput | null = method
    ? (input ?? {
        split_method: method,
        participants: old.map((s) => ({
          email: s.email,
          ...(method === "percent"
            ? { percent_bp: s.percent_bp! }
            : method === "amount"
              ? { amount_minor: s.amount_minor }
              : {}),
        })),
      })
    : null;
  const amounts = replacement ? splitAmounts(tx.amount_minor, replacement) : [];
  const rows: ShareRow[] = [];
  if (replacement) {
    const emails = replacement.participants.map((p) => p.email.toLowerCase());
    if (new Set(emails).size !== emails.length || emails.includes(ctx.email.toLowerCase()))
      fail("VALIDATION_FAILED", "Participants must be unique and cannot include yourself.");
    const recipients = await db.all<ShareContact>(
      sql`SELECT u.id user_id,u.name,u.email FROM "user" u JOIN members m ON m.user_id=u.id WHERE lower(u.email) IN (SELECT value FROM json_each(${JSON.stringify(emails)}))`,
    );
    for (let i = 0; i < emails.length; i++) {
      const user = recipients.find((u) => u.email.toLowerCase() === emails[i]);
      if (!user)
        fail(
          "SHARE_RECIPIENT_NOT_FOUND",
          "A share recipient is not a member of this instance.",
          404,
        );
      const previous = old.find((s) => s.user_id === user.user_id);
      rows.push({
        ...rowBase(user.user_id, previous?.id),
        created_at: previous?.created_at ?? new Date().toISOString(),
        transaction_id: tx.id,
        owner_user_id: ctx.id,
        amount_minor: amounts[i]!,
        percent_bp: method === "percent" ? replacement.participants[i]!.percent_bp! : null,
        currency: tx.currency,
        date: tx.date,
        payee: tx.payee,
        memo: tx.memo,
        category_id: previous?.category_id ?? null,
        status: input === undefined ? (previous?.status ?? "active") : "active",
      });
      after.push(...(await shareCurrencyStatements(ctx, user.user_id, tx.currency)));
    }
  }
  // Suspend totals within the batch while upserts retain the participant’s current category/status.
  before.push(
    db
      .update(transactions)
      .set({ split_method: null, shared_out_minor: 0 })
      .where(and(eq(transactions.user_id, ctx.id), eq(transactions.id, tx.id))),
    db
      .delete(transactionShares)
      .where(
        and(
          eq(transactionShares.owner_user_id, ctx.id),
          eq(transactionShares.transaction_id, tx.id),
          sql`user_id NOT IN (SELECT value FROM json_each(${JSON.stringify(rows.map((r) => r.user_id))}))`,
        ),
      ),
  );
  if (rows.length) {
    const columns = [
      "id",
      "user_id",
      "created_at",
      "updated_at",
      "transaction_id",
      "owner_user_id",
      "amount_minor",
      "percent_bp",
      "currency",
      "date",
      "payee",
      "memo",
      "category_id",
      "status",
    ];
    after.push(
      db
        .insert(transactionShares)
        .select(
          sql`SELECT ${sql.join(
            columns.map((name) => sql.raw(`json_extract(value, '$.${name}')`)),
            sql`, `,
          )} FROM json_each(${JSON.stringify(rows)}) WHERE true`,
        )
        .onConflictDoUpdate({
          target: [transactionShares.transaction_id, transactionShares.user_id],
          set: {
            amount_minor: sql`excluded.amount_minor`,
            percent_bp: sql`excluded.percent_bp`,
            currency: sql`excluded.currency`,
            date: sql`excluded.date`,
            payee: sql`excluded.payee`,
            memo: sql`excluded.memo`,
            updated_at: sql`excluded.updated_at`,
            status: input === undefined ? sql`transaction_shares.status` : "active",
          },
        }),
    );
  }
  for (const oldRow of old)
    if (!rows.some((r) => r.user_id === oldRow.user_id))
      after.push(
        auditEvent(ctx, ctx.id, "delete", "transaction_share", oldRow.id, {
          participant: { user_id: oldRow.user_id, name: oldRow.name, email: oldRow.email },
          participant_user_id: oldRow.user_id,
          transaction_id: tx.id,
        }),
        auditEvent(ctx, oldRow.user_id, "share_removed", "transaction_share", oldRow.id, {
          owner: { user_id: ctx.id, name: ctx.name, email: ctx.email },
          transaction_id: tx.id,
        }),
      );
  for (const row of rows)
    after.push(
      auditEvent(
        ctx,
        ctx.id,
        old.some((s) => s.user_id === row.user_id) ? "update" : "create",
        "transaction_share",
        row.id,
        {
          participant_user_id: row.user_id,
          transaction_id: tx.id,
          amount_minor: row.amount_minor,
          percent_bp: row.percent_bp,
          ...(input === undefined ? {} : { status: row.status }),
        },
      ),
      auditEvent(
        ctx,
        row.user_id,
        old.some((s) => s.user_id === row.user_id) ? "share_updated" : "share_received",
        "transaction_share",
        row.id,
        {
          owner: { user_id: ctx.id, name: ctx.name, email: ctx.email },
          transaction_id: tx.id,
          amount_minor: row.amount_minor,
        },
      ),
    );
  after.push(
    db
      .update(transactions)
      .set({
        split_method: method,
        shared_out_minor: sql`(SELECT coalesce(sum(amount_minor),0) FROM transaction_shares WHERE owner_user_id=${ctx.id} AND transaction_id=${tx.id} AND status='active')`,
      })
      .where(and(eq(transactions.user_id, ctx.id), eq(transactions.id, tx.id))),
  );
  return { before, after, split_method: method };
}
const incoming = sql`SELECT s.*,t.amount_minor total_minor,t.split_method,u.name owner_name,u.email owner_email,c.name category_name,c.color category_color FROM transaction_shares s JOIN transactions t ON t.user_id=s.owner_user_id AND t.id=s.transaction_id JOIN "user" u ON u.id=s.owner_user_id LEFT JOIN categories c ON c.user_id=s.user_id AND c.id=s.category_id`;
type IncomingRow = Omit<IncomingShare, "owner"> & {
  owner_user_id: string;
  owner_name: string;
  owner_email: string;
};
function incomingView(row: IncomingRow): IncomingShare {
  return {
    id: row.id,
    transaction_id: row.transaction_id,
    owner: { user_id: row.owner_user_id, name: row.owner_name, email: row.owner_email },
    date: row.date,
    payee: row.payee,
    memo: row.memo,
    currency: row.currency,
    total_minor: row.total_minor,
    amount_minor: row.amount_minor,
    split_method: row.split_method,
    percent_bp: row.percent_bp,
    category_id: row.category_id,
    category_name: row.category_name,
    category_color: row.category_color,
    status: row.status,
  };
}
export async function getIncomingShare(ctx: AuthContext, id: string) {
  return incomingView(
    found(await db.get<IncomingRow>(sql`${incoming} WHERE s.user_id=${ctx.id} AND s.id=${id}`)),
  );
}
export async function listIncomingShares(
  ctx: AuthContext,
  q: IncomingShareQuery,
): Promise<IncomingShareList> {
  const filters = [sql`s.user_id=${ctx.id}`];
  if (q.status) filters.push(sql`s.status=${q.status}`);
  if (q.uncategorized !== undefined)
    filters.push(q.uncategorized ? sql`s.category_id IS NULL` : sql`s.category_id IS NOT NULL`);
  if (q.from) filters.push(sql`s.date>=${q.from}`);
  if (q.to) filters.push(sql`s.date<=${q.to}`);
  if (q.cursor) {
    const [date, id] = decodeCursor(q.cursor);
    filters.push(sql`(s.date<${date} OR (s.date=${date} AND s.id<${id}))`);
  }
  const limit = q.limit ?? 50;
  const rows = await db.all<IncomingRow>(
    sql`${incoming} WHERE ${sql.join(filters, sql` AND `)} ORDER BY s.date DESC,s.id DESC LIMIT ${limit + 1}`,
  );
  const page = rows.slice(0, limit).map(incomingView),
    last = page.at(-1);
  return {
    shares: page,
    next_cursor: rows.length > limit && last ? encodeCursor(last.date, last.id) : null,
  };
}
export async function categoryShares(
  ctx: AuthContext,
  category: string,
  month: string,
  currency: string,
) {
  return (
    await db.all<IncomingRow>(
      sql`${incoming} WHERE s.user_id=${ctx.id} AND s.category_id=${category} AND substr(s.date,1,7)=${month} AND s.currency=${currency} AND s.status='active' ORDER BY s.date DESC,s.id DESC`,
    )
  ).map(incomingView);
}
export async function updateIncomingShare(
  ctx: AuthContext,
  id: string,
  input: IncomingShareUpdate,
) {
  const current = await getIncomingShare(ctx, id);
  if (input.category_id) {
    const category = found(
      await db
        .select()
        .from(categories)
        .where(and(eq(categories.user_id, ctx.id), eq(categories.id, input.category_id)))
        .get(),
    );
    if (category.kind === "repayment")
      fail("VALIDATION_FAILED", "Incoming shares require an expense or income category.");
  }
  const statements: [
    Parameters<typeof db.batch>[0][number],
    ...Array<Parameters<typeof db.batch>[0][number]>,
  ] = [
    db
      .update(transactionShares)
      .set({ ...input, updated_at: new Date().toISOString() })
      .where(and(eq(transactionShares.user_id, ctx.id), eq(transactionShares.id, id))),
  ];
  if (input.status === "declined" && current.status !== "declined")
    statements.push(
      auditEvent(ctx, current.owner.user_id, "share_declined", "transaction_share", id, {
        participant: { user_id: ctx.id, name: ctx.name, email: ctx.email },
        transaction_id: current.transaction_id,
      }),
    );
  await write(ctx, "update", "transaction_share", id, input, statements);
  return getIncomingShare(ctx, id);
}
export function listShareContacts(ctx: AuthContext): Promise<ShareContact[]> {
  return db.all<ShareContact>(
    sql`SELECT DISTINCT u.id user_id,u.name,u.email FROM "user" u WHERE u.id IN (SELECT user_id FROM transaction_shares WHERE owner_user_id=${ctx.id} UNION SELECT owner_user_id FROM transaction_shares WHERE user_id=${ctx.id}
      UNION SELECT json_extract(payload,'$.owner.user_id') FROM audit_events WHERE user_id=${ctx.id} AND entity='transaction_share'
      UNION SELECT json_extract(payload,'$.participant_user_id') FROM audit_events WHERE user_id=${ctx.id} AND entity='transaction_share'
    ) ORDER BY u.name,u.id`,
  );
}
