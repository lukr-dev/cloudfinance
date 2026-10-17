import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { accountUpdateSchema, idParamsSchema } from "../../../../shared/schemas";
import { getAccount, updateAccount, deleteAccount } from "../../../../server/accounts";

export const GET = defineHandler.withValidator({ params: idParamsSchema })(async (
  c,
  { params },
) => {
  const auth = await requireAuthContext(c);
  return getAccount(auth, params.id);
});

export const PATCH = defineHandler.withValidator({
  params: idParamsSchema,
  body: accountUpdateSchema,
})(async (c, { params, body }) => {
  const auth = await requireAuthContext(c);
  return updateAccount(auth, params.id, body);
});

export const DELETE = defineHandler.withValidator({ params: idParamsSchema })(async (
  c,
  { params },
) => {
  const auth = await requireAuthContext(c);
  return deleteAccount(auth, params.id);
});
