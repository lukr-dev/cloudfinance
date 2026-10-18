import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { APIError } from "better-auth/api";
import { defineAuth } from "void/auth";
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
    databaseHooks: {
      ...defaults.databaseHooks,
      user: {
        ...defaults.databaseHooks?.user,
        create: {
          ...defaults.databaseHooks?.user?.create,
          before: async (user, context) => {
            if (!context || (await context.context.adapter.count({ model: "user" })) >= 1) {
              throw new APIError("FORBIDDEN", {
                code: "SIGN_UP_CLOSED",
                message: "Account setup is complete. Sign-up is closed.",
              });
            }
            requireSetupToken(request, env.SETUP_TOKEN);
            return defaults.databaseHooks?.user?.create?.before?.(user, context);
          },
        },
      },
    },
  };
});
