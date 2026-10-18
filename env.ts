import { defineEnv, string } from "void/env";

export default defineEnv({
  // Origin/RP ID are non-secret cloudflare.vars; Void forbids schema keys in vars.
  SETUP_TOKEN: string().optional(),
});
