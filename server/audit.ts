import { db, and, eq, desc, lt, or } from "void/db";
import { auditEvents } from "../db/schema";
import type { AuthContext } from "../shared/auth";
import type { AuditList, PageQuery } from "../shared/schemas";
import { decodeCursor, encodeCursor } from "./pagination";
export function rowBase(user_id: string, id: string = crypto.randomUUID()) {
  const now = new Date().toISOString();
  return { id, user_id, created_at: now, updated_at: now };
}
export async function write(
  ctx: AuthContext,
  action: string,
  entity: string,
  entity_id: string,
  payload: Record<string, unknown>,
  statements: ReadonlyArray<Parameters<typeof db.batch>[0][number]>,
  eventId?: string,
) {
  await db.batch([
    auditEvent(ctx, ctx.id, action, entity, entity_id, payload, eventId),
    ...statements,
  ]);
}
export function auditEvent(
  ctx: AuthContext,
  user_id: string,
  action: string,
  entity: string,
  entity_id: string,
  payload: Record<string, unknown>,
  eventId?: string,
) {
  const base = rowBase(user_id, eventId);
  return db
    .insert(auditEvents)
    .values({
      ...base,
      at: base.created_at,
      actor_type: ctx.via === "api_key" ? "api_key" : "user",
      actor_id: ctx.via === "api_key" ? ctx.api_key_id! : ctx.id,
      action,
      entity,
      entity_id,
      payload,
    })
    .onConflictDoNothing();
}

export async function listAuditEvents(ctx: AuthContext, query: PageQuery): Promise<AuditList> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const limit = query.limit ?? 50;
  const rows = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.user_id, ctx.id),
        cursor
          ? or(
              lt(auditEvents.at, cursor[0]),
              and(eq(auditEvents.at, cursor[0]), lt(auditEvents.id, cursor[1])),
            )
          : undefined,
      ),
    )
    .orderBy(desc(auditEvents.at), desc(auditEvents.id))
    .limit(limit + 1);
  const events = rows.slice(0, limit);
  const last = events.at(-1);
  return {
    events,
    next_cursor: rows.length > limit && last ? encodeCursor(last.at, last.id) : null,
  };
}
