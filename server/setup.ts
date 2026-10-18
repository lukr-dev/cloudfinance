import { db, sql } from "void/db";
import { env } from "void/env";
import { setupTokenRequired } from "./setup-token";

export async function getSetupStatus(requestUrl: string) {
  const row = await db.get<{ present: number }>(
    sql`SELECT EXISTS(SELECT 1 FROM "user") AS present`,
  );
  return {
    needsSetup: row?.present === 0,
    setupTokenRequired: setupTokenRequired(requestUrl, env.SETUP_TOKEN),
  };
}
