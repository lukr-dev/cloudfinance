import { setupId } from "./ids";
import { db, eq, and, sql } from "void/db";
import { settings, categories, accounts, budgetAssignments } from "../db/schema";
import type { AuthContext } from "../shared/auth";
import type { Settings, SettingsUpdate } from "../shared/schemas";
import { write, rowBase } from "./audit";
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
  return row as Settings;
}
export async function updateSettings(ctx: AuthContext, input: SettingsUpdate): Promise<Settings> {
  const current = await getSettings(ctx);
  const enabled = [...new Set(input.enabled_currencies ?? current.enabled_currencies)];
  const base = input.base_currency ?? current.base_currency;
  if (!enabled.includes(base)) fail("CURRENCY_NOT_ENABLED", "Base currency must be enabled.");
  const used = await db.all<{ currency: string }>(
    sql`SELECT currency FROM ${accounts} WHERE user_id=${ctx.id} UNION SELECT currency FROM ${budgetAssignments} WHERE user_id=${ctx.id}`,
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
