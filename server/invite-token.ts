import { db, sql } from "void/db";
import { APIError } from "better-auth/api";
export async function hashInviteToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function validInvitation(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return undefined;
  return db.get<{ id: string; email: string | null; invited_by_name: string }>(
    sql`SELECT i.*,u.name invited_by_name FROM invitations i JOIN "user" u ON u.id=i.created_by WHERE i.token_hash=${await hashInviteToken(token)} AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>${new Date().toISOString()}`,
  );
}
export async function signupInvitation(token: string | null, email: string) {
  if (!token)
    throw new APIError("FORBIDDEN", {
      code: "SIGN_UP_CLOSED",
      message: "An invitation is required to join.",
    });
  const row = await validInvitation(token);
  if (!row)
    throw new APIError("FORBIDDEN", {
      code: "INVITE_INVALID",
      message: "This invitation is invalid or no longer available.",
    });
  if (row.email && row.email.toLowerCase() !== email.toLowerCase())
    throw new APIError("FORBIDDEN", {
      code: "INVITE_EMAIL_MISMATCH",
      message: "This invitation is for another email address.",
    });
  return row.id;
}
