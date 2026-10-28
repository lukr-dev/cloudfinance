import { setupId } from "./ids";
import { db, eq, and, asc, sql } from "void/db";
import {
  categories,
  categoryGroups,
  transactions,
  budgetAssignments,
  transactionShares,
  attachments,
} from "../db/schema";
import type { AuthContext } from "../shared/auth";
import {
  colors,
  type Category,
  type CategoryCreate,
  type CategoryUpdate,
  type GroupCreate,
  type GroupUpdate,
  type StarterResult,
} from "../shared/schemas";
import { write, rowBase } from "./audit";
import { fail, found } from "./errors";
import { getSettings } from "./settings";
export function listGroups(ctx: AuthContext) {
  return db
    .select()
    .from(categoryGroups)
    .where(eq(categoryGroups.user_id, ctx.id))
    .orderBy(asc(categoryGroups.sort_order), asc(categoryGroups.id));
}
export async function getGroup(ctx: AuthContext, id: string) {
  return found(
    await db
      .select()
      .from(categoryGroups)
      .where(and(eq(categoryGroups.user_id, ctx.id), eq(categoryGroups.id, id)))
      .get(),
  );
}
export async function createGroup(ctx: AuthContext, input: GroupCreate) {
  const row = { ...rowBase(ctx.id), ...input };
  await write(ctx, "create", "category_group", row.id, input, [
    db.insert(categoryGroups).values(row),
  ]);
  return getGroup(ctx, row.id);
}
export async function updateGroup(ctx: AuthContext, id: string, input: GroupUpdate) {
  await getGroup(ctx, id);
  await write(ctx, "update", "category_group", id, input, [
    db
      .update(categoryGroups)
      .set({ ...input, updated_at: new Date().toISOString() })
      .where(and(eq(categoryGroups.user_id, ctx.id), eq(categoryGroups.id, id))),
  ]);
  return getGroup(ctx, id);
}
export async function deleteGroup(ctx: AuthContext, id: string) {
  await getGroup(ctx, id);
  if (
    await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.user_id, ctx.id), eq(categories.group_id, id)))
      .get()
  )
    fail("CONFLICT", "Move or delete the group's categories first.", 409);
  await write(ctx, "delete", "category_group", id, {}, [
    db
      .delete(categoryGroups)
      .where(and(eq(categoryGroups.user_id, ctx.id), eq(categoryGroups.id, id))),
  ]);
  return { ok: true as const };
}
const categorySelect = sql`SELECT c.*, (SELECT count(*) FROM attachments x WHERE x.user_id=c.user_id AND x.category_id=c.id) attachment_count FROM categories c`;
export async function listCategories(ctx: AuthContext): Promise<Category[]> {
  await getSettings(ctx);
  const rows = await db.all<Category>(
    sql`${categorySelect} WHERE c.user_id=${ctx.id} ORDER BY c.sort_order,c.id`,
  );
  return rows.map((c) => ({ ...c, hidden: Boolean(c.hidden) }));
}
export async function getCategory(ctx: AuthContext, id: string): Promise<Category> {
  const row = found(
    await db.get<Category>(sql`${categorySelect} WHERE c.user_id=${ctx.id} AND c.id=${id}`),
  );
  return { ...row, hidden: Boolean(row.hidden) };
}
export async function expenseCategory(ctx: AuthContext, id: string) {
  const cat = await getCategory(ctx, id);
  if (cat.kind !== "expense")
    fail("CONFLICT", "System categories cannot be modified or assigned money.", 409);
  return cat;
}
export async function createCategory(ctx: AuthContext, input: CategoryCreate): Promise<Category> {
  await getGroup(ctx, input.group_id);
  const count = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM categories WHERE user_id=${ctx.id} AND kind='expense'`,
  );
  const row = {
    ...rowBase(ctx.id),
    ...input,
    color: input.color ?? colors[(count?.n ?? 0) % colors.length]!,
  };
  await write(ctx, "create", "category", row.id, input, [db.insert(categories).values(row)]);
  return getCategory(ctx, row.id);
}
export async function updateCategory(
  ctx: AuthContext,
  id: string,
  input: CategoryUpdate,
): Promise<Category> {
  await expenseCategory(ctx, id);
  if (input.group_id) await getGroup(ctx, input.group_id);
  await write(ctx, "update", "category", id, input, [
    db
      .update(categories)
      .set({ ...input, updated_at: new Date().toISOString() })
      .where(and(eq(categories.user_id, ctx.id), eq(categories.id, id))),
  ]);
  return getCategory(ctx, id);
}
export async function deleteCategory(ctx: AuthContext, id: string, reassignTo?: string) {
  await expenseCategory(ctx, id);
  if (reassignTo === id) fail("VALIDATION_FAILED", "Reassignment target must be another category.");
  if (reassignTo) await expenseCategory(ctx, reassignTo);
  const used = await db.get<{ n: number }>(
    sql`SELECT (EXISTS(SELECT 1 FROM transactions WHERE user_id=${ctx.id} AND category_id=${id}) OR EXISTS(SELECT 1 FROM transaction_shares WHERE user_id=${ctx.id} AND category_id=${id}) OR EXISTS(SELECT 1 FROM attachments WHERE user_id=${ctx.id} AND category_id=${id}) OR EXISTS(SELECT 1 FROM budget_assignments WHERE user_id=${ctx.id} AND category_id=${id})) n`,
  );
  if (used?.n && !reassignTo)
    fail(
      "CATEGORY_IN_USE",
      "Provide reassign_to to move transactions, shares, assignments and attachments.",
      409,
    );
  const deletion = db
    .delete(categories)
    .where(and(eq(categories.user_id, ctx.id), eq(categories.id, id)));
  if (reassignTo) {
    const now = new Date().toISOString();
    const moved = await db
      .select({ id: attachments.id })
      .from(attachments)
      .where(and(eq(attachments.user_id, ctx.id), eq(attachments.category_id, id)));
    await write(
      ctx,
      "delete",
      "category",
      id,
      { reassign_to: reassignTo, attachment_ids: moved.map((a) => a.id) },
      [
        db
          .update(attachments)
          .set({ category_id: reassignTo, updated_at: now })
          .where(and(eq(attachments.user_id, ctx.id), eq(attachments.category_id, id))),
        db
          .update(transactionShares)
          .set({ category_id: reassignTo, updated_at: now })
          .where(and(eq(transactionShares.user_id, ctx.id), eq(transactionShares.category_id, id))),
        db
          .update(transactions)
          .set({ category_id: reassignTo, updated_at: now })
          .where(and(eq(transactions.user_id, ctx.id), eq(transactions.category_id, id))),
        db
          .insert(budgetAssignments)
          .select(
            sql`SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))), user_id, created_at, ${now}, month, ${reassignTo}, currency, amount_minor FROM budget_assignments WHERE user_id=${ctx.id} AND category_id=${id} AND true`,
          )
          .onConflictDoUpdate({
            target: [
              budgetAssignments.user_id,
              budgetAssignments.month,
              budgetAssignments.category_id,
              budgetAssignments.currency,
            ],
            set: {
              amount_minor: sql`budget_assignments.amount_minor + excluded.amount_minor`,
              updated_at: now,
            },
          }),
        db
          .delete(budgetAssignments)
          .where(and(eq(budgetAssignments.user_id, ctx.id), eq(budgetAssignments.category_id, id))),
        deletion,
      ],
    );
  } else await write(ctx, "delete", "category", id, {}, [deletion]);
  return { ok: true as const };
}
const starterNames = {
  en: [
    ["Fixed costs", "Rent", "Health insurance", "Mobile & Internet", "Utilities", "Insurance"],
    ["Everyday", "Groceries", "Transport", "Eating out", "Personal care", "Household"],
    ["Lifestyle", "Clothing", "Leisure", "Subscriptions", "Gifts"],
    ["Savings goals", "Emergency fund", "Holidays", "Pillar 3a"],
  ],
  de: [
    ["Fixkosten", "Miete", "Krankenkasse", "Handy & Internet", "Nebenkosten", "Versicherungen"],
    ["Alltag", "Lebensmittel", "Mobilität", "Auswärts essen", "Körperpflege", "Haushalt"],
    ["Freizeit", "Kleidung", "Freizeit", "Abos", "Geschenke"],
    ["Sparziele", "Notgroschen", "Ferien", "Säule 3a"],
  ],
};
export async function starterCategories(ctx: AuthContext): Promise<StarterResult> {
  const prefs = await getSettings(ctx);
  if ((await listCategories(ctx)).some((c) => c.kind === "expense"))
    return { created: false, groups: await listGroups(ctx), categories: await listCategories(ctx) };
  let n = 0;
  const groups = await Promise.all(
    starterNames[prefs.locale].map(async (names, i) => ({
      ...rowBase(ctx.id, await setupId(`starter:${ctx.id}:g${i}`)),
      name: names[0]!,
      sort_order: i,
      hidden: false,
    })),
  );
  const categoryIds = await Promise.all(
    starterNames[prefs.locale].flatMap((names, i) =>
      names.slice(1).map((_name, j) => setupId(`starter:${ctx.id}:c${i}:${j}`)),
    ),
  );
  const cats = starterNames[prefs.locale].flatMap((names, i) =>
    names.slice(1).map((name, j) => ({
      ...rowBase(ctx.id, categoryIds[n]!),
      group_id: groups[i]!.id,
      name,
      kind: "expense" as const,
      sort_order: j,
      hidden: false,
      note: "",
      color: colors[n++ % colors.length]!,
    })),
  );
  await write(
    ctx,
    "create_starter",
    "category_group",
    groups[0]!.id,
    { locale: prefs.locale, count: cats.length },
    [
      db.insert(categoryGroups).values(groups).onConflictDoNothing(),
      ...cats.map((cat) => db.insert(categories).values(cat).onConflictDoNothing()),
    ],
  );
  return { created: true, groups: await listGroups(ctx), categories: await listCategories(ctx) };
}
