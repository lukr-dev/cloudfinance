import { defineEnv, string, url } from "void/env";

export default defineEnv({
  AUTH_ORIGIN: url().optional(),
  PASSKEY_RP_ID: string().optional(),
});
