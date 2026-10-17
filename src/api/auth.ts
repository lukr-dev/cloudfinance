import { apiKeyClient } from "@better-auth/api-key/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "void/client/vue";

export const auth = createAuthClient({
  basePath: "/api/auth",
  plugins: [passkeyClient(), apiKeyClient()],
});
