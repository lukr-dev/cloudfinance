import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { defineAuth } from "void/auth";
import { signupInvitation } from "./server/invite-token.ts";
import { requireSetupToken } from "./server/setup-token.ts";

export default defineAuth(({ defaults, env, request }) => {
  const origin =
    !import.meta.env?.DEV && typeof env.AUTH_ORIGIN === "string"
      ? env.AUTH_ORIGIN
      : new URL(request.url).origin;
  const rpID =
    !import.meta.env?.DEV && typeof env.PASSKEY_RP_ID === "string"
      ? env.PASSKEY_RP_ID
      : new URL(origin).hostname;

  return {
    ...defaults,
    baseURL: origin,
    trustedOrigins: [
      ...(Array.isArray(defaults.trustedOrigins) ? defaults.trustedOrigins : []),
      origin,
    ],
    emailAndPassword: { ...defaults.emailAndPassword, enabled: true },
    plugins: [
      ...(defaults.plugins ?? []),
      passkey({ rpID, rpName: "cloudfinance", origin }),
      apiKey({ defaultPrefix: "cf_", rateLimit: { timeWindow: 60000, maxRequests: 600 } }),
    ],
    hooks: {
      ...defaults.hooks,
      after: createAuthMiddleware(async (context) => {
        const result = context.context.returned;
        if (
          context.path === "/sign-up/email" &&
          isAPIError(result) &&
          result.body?.code === "FAILED_TO_CREATE_USER" &&
          (await context.context.adapter.count({ model: "user" })) > 0
        ) {
          try {
            await signupInvitation(request.headers.get("X-Invite-Token"), context.body.email);
          } catch (error) {
            if (isAPIError(error))
              return Response.json(error.body, {
                status: error.statusCode,
                headers: { "Cache-Control": "no-store" },
              });
            throw error;
          }
        }
        return defaults.hooks?.after?.(context);
      }),
    },
    databaseHooks: {
      ...defaults.databaseHooks,
      user: {
        ...defaults.databaseHooks?.user,
        create: {
          ...defaults.databaseHooks?.user?.create,
          before: async (user, context) => {
            if (!context)
              throw new APIError("FORBIDDEN", {
                code: "SIGN_UP_CLOSED",
                message: "Sign-up is closed.",
              });
            const existing = (await context.context.adapter.count({ model: "user" })) >= 1;
            const id = existing
              ? await signupInvitation(request.headers.get("X-Invite-Token"), user.email)
              : crypto.randomUUID();
            if (!existing) requireSetupToken(request, env.SETUP_TOKEN);
            const result = await defaults.databaseHooks?.user?.create?.before?.(user, context);
            if (result === false) return false;
            return {
              data: {
                ...user,
                ...(result && typeof result === "object" && "data" in result ? result.data : {}),
                id,
              },
            };
          },
        },
      },
    },
  };
});
