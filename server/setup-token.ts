import { createHash, timingSafeEqual } from "node:crypto";
import { APIError } from "better-auth/api";

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/** Production builds always require the token; only local dev on loopback may skip it. */
export function setupTokenRequired(
  requestUrl: string,
  token: unknown,
  dev = Boolean(import.meta.env?.DEV),
): boolean {
  if (typeof token === "string") return true;
  return !(dev && LOOPBACK.includes(new URL(requestUrl).hostname));
}

export function requireSetupToken(request: Request, token: unknown): void {
  if (!setupTokenRequired(request.url, token)) return;
  if (typeof token !== "string" || token.length === 0) {
    throw new APIError("FORBIDDEN", {
      code: "SETUP_TOKEN_REQUIRED",
      message: "Configure a setup token before creating the account.",
    });
  }
  const supplied = request.headers.get("X-Setup-Token");
  // Hash both values to compare fixed-size buffers, including different-length tokens.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const matches = timingSafeEqual(digest(supplied ?? ""), digest(token));
  if (!matches || supplied === null) {
    throw new APIError("FORBIDDEN", {
      code: "SETUP_TOKEN_INVALID",
      message: "A valid setup token is required.",
    });
  }
}
