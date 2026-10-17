import { defineHandler } from "void";
import { requireAuthContext } from "../../../server/auth-context";
import { settingsUpdateSchema } from "../../../shared/schemas";
import { getSettings, updateSettings } from "../../../server/settings";

export const GET = defineHandler.withValidator({})(async (c) => {
  const auth = await requireAuthContext(c);
  return getSettings(auth);
});

export const PATCH = defineHandler.withValidator({ body: settingsUpdateSchema })(async (
  c,
  { body },
) => {
  const auth = await requireAuthContext(c);
  return updateSettings(auth, body);
});
