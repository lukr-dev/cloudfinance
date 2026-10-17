import { defineMiddleware } from "void";
import { HTTPException } from "hono/http-exception";
import { requireAuthContext } from "../server/auth-context";
import { getSettings } from "../server/settings";
import { DomainError } from "../server/errors";
export default defineMiddleware(async (c, next) => {
  if (!c.req.path.startsWith("/api/v1/")) return next();
  c.header("Cache-Control", "no-store");
  try {
    if (c.req.path !== "/api/v1/setup-status") await getSettings(await requireAuthContext(c));
    await next();
    if (c.error) throw c.error;
    if (c.res.status === 400) {
      const body: unknown = await c.res
        .clone()
        .json()
        .catch(() => null);
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string")
        return (c.res = c.json(
          {
            error: {
              code: "VALIDATION_FAILED",
              message: "Request validation failed.",
              details: body,
            },
          },
          400,
        ));
    }
  } catch (error) {
    if (error instanceof DomainError)
      return (c.res = Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details }),
          },
        },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      ));
    if (error instanceof HTTPException) return (c.res = error.getResponse());
    if (error instanceof SyntaxError)
      return (c.res = c.json(
        { error: { code: "VALIDATION_FAILED", message: "Invalid JSON body." } },
        400,
      ));
    if (error instanceof Error && /constraint failed|SQLITE_CONSTRAINT/i.test(error.message))
      return (c.res = c.json(
        { error: { code: "CONFLICT", message: "The operation conflicts with existing data." } },
        409,
      ));
    console.error(error);
    return (c.res = c.json(
      { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      500,
    ));
  }
});
