import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { categoryCreateSchema } from "../../../../shared/schemas";
import { listCategories, createCategory } from "../../../../server/categories";

export const GET = defineHandler.withValidator({})(async (c) => {
  const auth = await requireAuthContext(c);
  return listCategories(auth);
});

export const POST = defineHandler.withValidator({ body: categoryCreateSchema })(async (
  c,
  { body },
) => {
  const auth = await requireAuthContext(c);
  return createCategory(auth, body);
});
