import { db, sql } from "void/db";
import type { AuthContext } from "../shared/auth";
export async function listPayees(ctx: AuthContext, q = ""): Promise<string[]> {
  return (
    await db.all<{ payee: string }>(
      sql`SELECT DISTINCT payee FROM transactions WHERE user_id=${ctx.id} AND payee<>'' AND instr(lower(payee),lower(${q}))>0 ORDER BY payee COLLATE NOCASE LIMIT 100`,
    )
  ).map((r) => r.payee);
}
