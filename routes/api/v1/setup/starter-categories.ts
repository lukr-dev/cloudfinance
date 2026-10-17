import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { starterCategories } from "../../../../server/categories";

export const POST = defineHandler.withValidator({})(async (c) => {
  const auth = await requireAuthContext(c);
  return starterCategories(auth);
});
