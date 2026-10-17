import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { groupUpdateSchema, idParamsSchema } from "../../../../shared/schemas";
import { updateGroup, deleteGroup } from "../../../../server/categories";

export const PATCH = defineHandler.withValidator({
  params: idParamsSchema,
  body: groupUpdateSchema,
})(async (c, { params, body }) => {
  const auth = await requireAuthContext(c);
  return updateGroup(auth, params.id, body);
});

export const DELETE = defineHandler.withValidator({ params: idParamsSchema })(async (
  c,
  { params },
) => {
  const auth = await requireAuthContext(c);
  return deleteGroup(auth, params.id);
});
