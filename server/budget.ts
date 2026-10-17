import { setupId } from "./ids";
import { db, sql } from "void/db";
import { budgetAssignments } from "../db/schema";
import type { AuthContext } from "../shared/auth";
import type { Currency } from "../shared/money";
import type {
  AssignmentInput,
  BudgetMonth,
  CategoryMonth,
  MoveInput,
  BudgetAssignment,
  Category,
} from "../shared/schemas";
import { getSettings } from "./settings";
import { expenseCategory, listGroups } from "./categories";
import { write, rowBase } from "./audit";
import { fail } from "./errors";
import { listTransactions } from "./transactions";
export function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year!, m! - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
export async function budgetCategories(ctx: AuthContext, month: string, currency: Currency) {
  // Pre-aggregate each ledger before joining; joining raw rows would multiply money.
  const rows = await db.all<
    Category & {
      assigned_minor: number;
      activity_minor: number;
      available_minor: number;
      carried_over_minor: number;
      group_assigned_minor: number;
      group_activity_minor: number;
      group_available_minor: number;
    }
  >(sql`
    WITH a AS (
      SELECT category_id, sum(CASE WHEN month=${month} THEN amount_minor ELSE 0 END) assigned,
        sum(amount_minor) cumulative
      FROM budget_assignments WHERE user_id=${ctx.id} AND currency=${currency} AND month<=${month} GROUP BY category_id
    ), t AS (
      SELECT t.category_id, sum(CASE WHEN substr(t.date,1,7)=${month} THEN t.amount_minor ELSE 0 END) activity,
        sum(t.amount_minor) cumulative
      FROM transactions t JOIN accounts ac ON ac.user_id=t.user_id AND ac.id=t.account_id
      WHERE t.user_id=${ctx.id} AND t.currency=${currency} AND t.date<${shiftMonth(month, 1) + "-01"} AND ac.on_budget=1 GROUP BY t.category_id
    ) SELECT c.*, coalesce(a.assigned,0) assigned_minor, coalesce(t.activity,0) activity_minor,
      coalesce(a.cumulative,0)+coalesce(t.cumulative,0) available_minor,
      coalesce(a.cumulative,0)+coalesce(t.cumulative,0)-coalesce(a.assigned,0)-coalesce(t.activity,0) carried_over_minor,
      sum(coalesce(a.assigned,0)) OVER (PARTITION BY c.group_id) group_assigned_minor,
      sum(coalesce(t.activity,0)) OVER (PARTITION BY c.group_id) group_activity_minor,
      sum(coalesce(a.cumulative,0)+coalesce(t.cumulative,0)) OVER (PARTITION BY c.group_id) group_available_minor
    FROM categories c LEFT JOIN a ON a.category_id=c.id LEFT JOIN t ON t.category_id=c.id
    WHERE c.user_id=${ctx.id} AND c.kind='expense' ORDER BY c.sort_order,c.id`);
  return rows.map((c) => ({ ...c, hidden: Boolean(c.hidden) }));
}
export async function getBudgetMonth(
  ctx: AuthContext,
  month: string,
  currency?: Currency,
): Promise<BudgetMonth> {
  const prefs = await getSettings(ctx);
  const c = currency ?? prefs.base_currency;
  const cats = await budgetCategories(ctx, month, c);
  const groups = (await listGroups(ctx)).map((g) => {
    const children = cats.filter((cat) => cat.group_id === g.id);
    return {
      ...g,
      assigned_minor: children[0]?.group_assigned_minor ?? 0,
      activity_minor: children[0]?.group_activity_minor ?? 0,
      available_minor: children[0]?.group_available_minor ?? 0,
      categories: children.map(
        ({
          group_assigned_minor: _a,
          group_activity_minor: _t,
          group_available_minor: _v,
          ...cat
        }) => cat,
      ),
    };
  });
  const summary = (await db.get<{
    ready_to_assign_minor: number;
    income_this_month_minor: number;
    assigned_this_month_minor: number;
    activity_this_month_minor: number;
    available_total_minor: number;
    uncategorized_count: number;
  }>(sql`
    SELECT
      coalesce(sum(CASE WHEN cat.kind='income' THEN t.amount_minor ELSE 0 END),0) -
        (SELECT coalesce(sum(amount_minor),0) FROM budget_assignments WHERE user_id=${ctx.id} AND currency=${c}) ready_to_assign_minor,
      coalesce(sum(CASE WHEN cat.kind='income' AND substr(t.date,1,7)=${month} THEN t.amount_minor ELSE 0 END),0) income_this_month_minor,
      (SELECT coalesce(sum(amount_minor),0) FROM budget_assignments WHERE user_id=${ctx.id} AND currency=${c} AND month=${month}) assigned_this_month_minor,
      coalesce(sum(CASE WHEN cat.kind='expense' AND substr(t.date,1,7)=${month} THEN t.amount_minor ELSE 0 END),0) activity_this_month_minor,
      (SELECT coalesce(sum(amount_minor),0) FROM budget_assignments WHERE user_id=${ctx.id} AND currency=${c} AND month<=${month}) +
        coalesce(sum(CASE WHEN cat.kind='expense' AND substr(t.date,1,7)<=${month} THEN t.amount_minor ELSE 0 END),0) available_total_minor,
      count(CASE WHEN t.category_id IS NULL AND t.transfer_account_id IS NULL AND substr(t.date,1,7)=${month} THEN 1 END) uncategorized_count
    FROM transactions t JOIN accounts ac ON ac.user_id=t.user_id AND ac.id=t.account_id
    LEFT JOIN categories cat ON cat.user_id=t.user_id AND cat.id=t.category_id
    WHERE t.user_id=${ctx.id} AND t.currency=${c} AND ac.on_budget=1`))!;
  return { month, currency: c, ...summary, groups };
}
export async function getCategoryMonth(
  ctx: AuthContext,
  month: string,
  id: string,
  currency?: Currency,
): Promise<CategoryMonth> {
  await expenseCategory(ctx, id);
  const prefs = await getSettings(ctx);
  const c = currency ?? prefs.base_currency;
  const cat = (await budgetCategories(ctx, month, c)).find((x) => x.id === id)!;
  const last = shiftMonth(month, -1),
    start = shiftMonth(month, -3);
  const stats = (await db.get<{
    assigned_last_month_minor: number;
    spent_last_month_minor: number;
    average_spent_3m_minor: number;
  }>(sql`
    SELECT (SELECT coalesce(sum(amount_minor),0) FROM budget_assignments WHERE user_id=${ctx.id} AND category_id=${id} AND currency=${c} AND month=${last}) assigned_last_month_minor,
      coalesce(sum(CASE WHEN substr(t.date,1,7)=${last} THEN -t.amount_minor ELSE 0 END),0) spent_last_month_minor,
      cast(round(coalesce(sum(-t.amount_minor),0)/3.0) AS INTEGER) average_spent_3m_minor
    FROM transactions t JOIN accounts a ON a.user_id=t.user_id AND a.id=t.account_id
    WHERE t.user_id=${ctx.id} AND t.category_id=${id} AND t.currency=${c} AND a.on_budget=1 AND t.amount_minor<0 AND t.date>=${start + "-01"} AND t.date<${month + "-01"}`))!;
  const tx = await listTransactions(
    ctx,
    { category_id: id, from: month + "-01", to: shiftMonth(month, 1) + "-01", limit: 20 },
    c,
    true,
  );
  const {
    group_assigned_minor: _a,
    group_activity_minor: _t,
    group_available_minor: _v,
    ...category
  } = cat;
  return { ...category, month, currency: c, ...stats, transactions: tx.transactions };
}
export async function assignToCategory(
  ctx: AuthContext,
  month: string,
  id: string,
  input: AssignmentInput,
): Promise<BudgetAssignment> {
  await expenseCategory(ctx, id);
  const existing = await db.get<{ id: string }>(
    sql`SELECT id FROM budget_assignments WHERE user_id=${ctx.id} AND month=${month} AND category_id=${id} AND currency=${input.currency}`,
  );
  const base = rowBase(
    ctx.id,
    existing?.id ?? (await setupId(`assignment:${ctx.id}:${month}:${id}:${input.currency}`)),
  );
  await write(ctx, "assign", "budget_assignment", base.id, { month, category_id: id, ...input }, [
    db
      .insert(budgetAssignments)
      .values({ ...base, month, category_id: id, ...input })
      .onConflictDoUpdate({
        target: [
          budgetAssignments.user_id,
          budgetAssignments.month,
          budgetAssignments.category_id,
          budgetAssignments.currency,
        ],
        set: { amount_minor: input.amount_minor, updated_at: base.updated_at },
      }),
  ]);
  return (await db.get<BudgetAssignment>(
    sql`SELECT * FROM budget_assignments WHERE user_id=${ctx.id} AND month=${month} AND category_id=${id} AND currency=${input.currency}`,
  ))!;
}
export async function moveMoney(ctx: AuthContext, month: string, input: MoveInput) {
  if (input.from_category_id === input.to_category_id)
    fail("VALIDATION_FAILED", "Choose two different categories.");
  await expenseCategory(ctx, input.from_category_id);
  await expenseCategory(ctx, input.to_category_id);
  const existing = await db.all<{ id: string; category_id: string }>(
    sql`SELECT id,category_id FROM budget_assignments WHERE user_id=${ctx.id} AND month=${month} AND currency=${input.currency} AND category_id IN (${input.from_category_id},${input.to_category_id})`,
  );
  const baseFor = async (category: string) =>
    rowBase(
      ctx.id,
      existing.find((a) => a.category_id === category)?.id ??
        (await setupId(`assignment:${ctx.id}:${month}:${category}:${input.currency}`)),
    );
  const from = await baseFor(input.from_category_id),
    to = await baseFor(input.to_category_id);
  const move = (base: ReturnType<typeof rowBase>, category_id: string, amount_minor: number) =>
    db
      .insert(budgetAssignments)
      .values({ ...base, month, category_id, currency: input.currency, amount_minor })
      .onConflictDoUpdate({
        target: [
          budgetAssignments.user_id,
          budgetAssignments.month,
          budgetAssignments.category_id,
          budgetAssignments.currency,
        ],
        set: {
          amount_minor: sql`budget_assignments.amount_minor + excluded.amount_minor`,
          updated_at: base.updated_at,
        },
      });
  await write(
    ctx,
    "move",
    "budget_assignment",
    from.id,
    { month, to_assignment_id: to.id, ...input },
    [
      move(from, input.from_category_id, -input.amount_minor),
      move(to, input.to_category_id, input.amount_minor),
    ],
  );
  return getBudgetMonth(ctx, month, input.currency);
}
