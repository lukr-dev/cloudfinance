import { defineHandler } from "void";
import { HTTPException } from "hono/http-exception";
import { requireAuthContext } from "../server/auth-context";
import { getSettings } from "../server/settings";
import { mcpHandler } from "../server/mcp";
const handle = defineHandler(async (c) => {
  try {
    if (!c.req.header("Authorization")) throw new HTTPException(401);
    const auth = await requireAuthContext(c);
    if (auth.via !== "api_key") throw new HTTPException(401);
    await getSettings(auth);
    return await mcpHandler(auth).fetch(c.req.raw);
  } catch (error) {
    if (error instanceof HTTPException && error.status === 401) {
      // Drain without buffering so the local Worker proxy can complete rejected POSTs.
      await c.req.raw.body?.pipeTo(new WritableStream());
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32000,
            message: "Authentication required.",
            data: { code: "UNAUTHORIZED" },
          },
        },
        401,
        { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" },
      );
    }
    throw error;
  }
});
export const POST = handle;
// Explicit routes prevent Void's SPA fallback; the strict SDK handler returns HTTP 405.
export const GET = handle;
export const DELETE = handle;
