import { setupId } from "./ids";
import { db, eq, and, sql } from "void/db";
import { settings, categories, accounts, budgetAssignments, transactionShares } from "../db/schema";
import type { AuthContext } from "../shared/auth";
import type { Settings, SettingsUpdate } from "../shared/schemas";
import { write, rowBase, auditEvent } from "./audit";
import { fail } from "./errors";
export async function getSettings(ctx: AuthContext): Promise<Settings> {
  let row = await db.select().from(settings).where(eq(settings.user_id, ctx.id)).get();
  if (!row) {
    const base = rowBase(ctx.id, await setupId(`settings:${ctx.id}`));
    await write(
      ctx,
      "initialize",
      "settings",
      base.id,
      {},
      [
        db
          .insert(settings)
          .values({ ...base, enabled_currencies: ["CHF"] })
          .onConflictDoNothing(),
        db
          .insert(categories)
          .values({
            ...rowBase(ctx.id, await setupId(`income:${ctx.id}`)),
            name: "Ready to Assign",
            kind: "income",
            color: "teal",
          })
          .onConflictDoNothing(),
      ],
      await setupId(`initialize:${ctx.id}`),
    );
    row = (await db.select().from(settings).where(eq(settings.user_id, ctx.id)).get())!;
  }
  const repayment = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.user_id, ctx.id), eq(categories.kind, "repayment")))
    .get();
  if (!repayment)
    await write(
      ctx,
      "initialize",
      "category",
      await setupId(`repayment:${ctx.id}`),
      {},
      [
        db
          .insert(categories)
          .values({
            ...rowBase(ctx.id, await setupId(`repayment:${ctx.id}`)),
            name: "Shared repayment",
            kind: "repayment",
            color: "slate",
          })
          .onConflictDoNothing(),
      ],
      await setupId(`initialize-repayment:${ctx.id}`),
    );
  return row as Settings;
}
export async function updateSettings(ctx: AuthContext, input: SettingsUpdate): Promise<Settings> {
  const current = await getSettings(ctx);
  const enabled = [...new Set(input.enabled_currencies ?? current.enabled_currencies)];
  const base = input.base_currency ?? current.base_currency;
  if (!enabled.includes(base)) fail("CURRENCY_NOT_ENABLED", "Base currency must be enabled.");
  const used = await db.all<{ currency: string }>(
    sql`SELECT currency FROM ${accounts} WHERE user_id=${ctx.id} UNION SELECT currency FROM ${budgetAssignments} WHERE user_id=${ctx.id} UNION SELECT currency FROM ${transactionShares} WHERE user_id=${ctx.id}`,
  );
  if (used.some((r) => !enabled.includes(r.currency as Settings["base_currency"])))
    fail("CONFLICT", "Currencies used by accounts or assignments cannot be disabled.", 409);
  await write(ctx, "update", "settings", current.id, input, [
    db
      .update(settings)
      .set({ ...input, enabled_currencies: enabled, updated_at: new Date().toISOString() })
      .where(eq(settings.user_id, ctx.id)),
  ]);
  return getSettings(ctx);
}
export async function incomeCategory(ctx: AuthContext) {
  await getSettings(ctx);
  return (await db
    .select()
    .from(categories)
    .where(and(eq(categories.user_id, ctx.id), eq(categories.kind, "income")))
    .get())!;
}

export async function shareCurrencyStatements(
  ctx: AuthContext,
  user_id: string,
  currency: Settings["base_currency"],
) {
  const [settingsId, incomeId, repaymentId, eventId] = await Promise.all([
    setupId(`settings:${user_id}`),
    setupId(`income:${user_id}`),
    setupId(`repayment:${user_id}`),
    setupId(`initialize:${user_id}`),
  ]);
  const now = new Date().toISOString();
  return [
    db
      .insert(settings)
      .values({
        ...rowBase(user_id, settingsId),
        enabled_currencies: currency === "CHF" ? ["CHF"] : ["CHF", currency],
      })
      .onConflictDoUpdate({
        target: settings.user_id,
        set: {
          enabled_currencies: sql`CASE WHEN EXISTS(SELECT 1 FROM json_each(enabled_currencies) WHERE value=${currency}) THEN enabled_currencies ELSE json_insert(enabled_currencies,'$[#]',${currency}) END`,
          updated_at: now,
        },
      }),
    db
      .insert(categories)
      .values([
        { ...rowBase(user_id, incomeId), name: "Ready to Assign", kind: "income", color: "teal" },
        {
          ...rowBase(user_id, repaymentId),
          name: "Shared repayment",
          kind: "repayment",
          color: "slate",
        },
      ])
      .onConflictDoNothing(),
    auditEvent(ctx, user_id, "initialize", "settings", settingsId, {}, eventId),
  ];
}
