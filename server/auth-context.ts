import type { apiKey } from "@better-auth/api-key";
import type { CloudContext } from "void";
import { getUser } from "void/auth";
import { db, sql } from "void/db";
import { HTTPException } from "hono/http-exception";
import type { AuthContext } from "../shared/auth";

import { memberRole } from "./members";

type ApiKeyAuth = { api: { verifyApiKey: ReturnType<typeof apiKey>["endpoints"]["verifyApiKey"] } };

function unauthorized(): never {
  throw new HTTPException(401, {
    res: Response.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 },
    ),
  });
}

export async function requireAuthContext(c: CloudContext): Promise<AuthContext> {
  c.header("Cache-Control", "no-store");
  const cached = c.get("financeAuth") as AuthContext | undefined;
  if (cached) return cached;
  const authorization = c.req.header("Authorization");
  if (authorization !== undefined) {
    const token = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
    if (!token) unauthorized();
    // Void 1.1.11 exposes its request auth instance only on this internal context key.
    const auth = c.get("__voidAuth") as ApiKeyAuth | undefined;
    if (!auth?.api.verifyApiKey) throw new Error("Void auth runtime is unavailable.");
    const result = await auth.api.verifyApiKey({ body: { key: token } });
    if (!result.valid && result.error?.code === "RATE_LIMITED") {
      // Better Auth returns details at runtime but omits them from verifyApiKey's type.
      const milliseconds = (result.error as { details?: { tryAgainIn?: unknown } }).details
        ?.tryAgainIn;
      const retryAfter =
        typeof milliseconds === "number" && Number.isFinite(milliseconds)
          ? Math.max(1, Math.ceil(milliseconds / 1000))
          : 60;
      throw new HTTPException(429, {
        res: Response.json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "API key rate limit exceeded. Retry after the indicated delay.",
            },
          },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
          },
        ),
      });
    }
    if (!result.valid || !result.key) unauthorized();
    const user = await db.get<{ id: string; email: string; name: string }>(
      sql`SELECT id, email, name FROM "user" WHERE id = ${result.key.referenceId}`,
    );
    if (!user) unauthorized();
    const context: AuthContext = {
      ...user,
      role: await memberRole(user.id),
      via: "api_key",
      api_key_id: result.key.id,
      api_key_name: result.key.name,
    };
    c.set("financeAuth", context);
    return context;
  }
  const user = getUser();
  if (!user) unauthorized();
  const context: AuthContext = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: await memberRole(user.id),
    via: "session",
  };
  c.set("financeAuth", context);
  return context;
}
