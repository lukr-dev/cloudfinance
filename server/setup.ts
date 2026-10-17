import { db, sql } from "void/db";

export async function getSetupStatus() {
  const row = await db.get<{ present: number }>(
    sql`SELECT EXISTS(SELECT 1 FROM "user") AS present`,
  );
  return { needsSetup: row?.present === 0 };
}
