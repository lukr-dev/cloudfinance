import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { groupCreateSchema } from "../../../../shared/schemas";
import { listGroups, createGroup } from "../../../../server/categories";

export const GET = defineHandler.withValidator({})(async (c) => {
  const auth = await requireAuthContext(c);
  return listGroups(auth);
});

export const POST = defineHandler.withValidator({ body: groupCreateSchema })(async (
  c,
  { body },
) => {
  const auth = await requireAuthContext(c);
  return createGroup(auth, body);
});
