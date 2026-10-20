import { db, sql, eq, and } from "void/db";
import { hashInviteToken, validInvitation } from "./invite-token";
import { invitations } from "../db/schema";
import type { AuthContext } from "../shared/auth";
import type {
  Invitation,
  InvitationCreate,
  InvitationCreated,
  InviteStatus,
} from "../shared/schemas";
import { write } from "./audit";
import { found } from "./errors";
import { requireAdmin } from "./members";
function view(row: typeof invitations.$inferSelect): Invitation {
  const { token_hash: _hash, ...invitation } = row;
  return {
    ...invitation,
    status: row.used_at
      ? "used"
      : row.revoked_at
        ? "revoked"
        : row.expires_at <= new Date().toISOString()
          ? "expired"
          : "pending",
  };
}
export async function listInvitations(ctx: AuthContext) {
  requireAdmin(ctx);
  const rows = await db.all<typeof invitations.$inferSelect>(
    sql`SELECT * FROM invitations WHERE created_by=${ctx.id} ORDER BY created_at DESC,id DESC`,
  );
  return rows.map(view);
}
export async function createInvitation(
  ctx: AuthContext,
  input: InvitationCreate,
  origin = "",
): Promise<InvitationCreated> {
  requireAdmin(ctx);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    created_by: ctx.id,
    email: input.email?.toLowerCase() ?? null,
    token_hash: await hashInviteToken(token),
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 7 * 86400000).toISOString(),
    used_at: null,
    used_by: null,
    revoked_at: null,
  };
  await write(ctx, "create", "invitation", row.id, { email: row.email }, [
    db.insert(invitations).values(row),
  ]);
  return { invitation: view(row), token, url: `${origin}/join?token=${token}` };
}
export async function revokeInvitation(ctx: AuthContext, id: string) {
  requireAdmin(ctx);
  found(
    await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.created_by, ctx.id), eq(invitations.id, id)))
      .get(),
  );
  await write(ctx, "revoke", "invitation", id, {}, [
    db
      .update(invitations)
      .set({ revoked_at: new Date().toISOString() })
      .where(and(eq(invitations.created_by, ctx.id), eq(invitations.id, id))),
  ]);
  return { ok: true as const };
}
export async function inviteStatus(token?: string): Promise<InviteStatus> {
  const row = token ? await validInvitation(token) : undefined;
  return row
    ? { valid: true, email: row.email, invited_by_name: row.invited_by_name }
    : { valid: false, email: null, invited_by_name: null };
}
