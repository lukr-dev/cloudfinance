import { db, sql } from "void/db";
import type { AuthContext } from "../shared/auth";
import type { Member } from "../shared/schemas";
import { fail, found } from "./errors";
export function requireAdmin(ctx: AuthContext) {
  if (ctx.role !== "admin")
    fail("FORBIDDEN", "Only the admin can manage invitations and members.", 403);
}
export async function memberRole(id: string): Promise<AuthContext["role"]> {
  return found(
    await db.get<{ role: AuthContext["role"] }>(sql`SELECT role FROM members WHERE user_id=${id}`),
  ).role;
}
export function listMembers(ctx: AuthContext): Promise<Member[]> {
  requireAdmin(ctx);
  return db.all<Member>(
    sql`SELECT m.user_id,u.name,u.email,m.role,m.joined_at FROM members m JOIN "user" u ON u.id=m.user_id ORDER BY m.joined_at,m.user_id`,
  );
}
