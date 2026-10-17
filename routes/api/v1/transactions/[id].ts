import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { idParamsSchema, transactionUpdateSchema } from "../../../../shared/schemas";
import {
  getTransaction,
  updateTransaction,
  deleteTransaction,
} from "../../../../server/transactions";

export const GET = defineHandler.withValidator({ params: idParamsSchema })(async (
  c,
  { params },
) => {
  const auth = await requireAuthContext(c);
  return getTransaction(auth, params.id);
});

export const PATCH = defineHandler.withValidator({
  params: idParamsSchema,
  body: transactionUpdateSchema,
})(async (c, { params, body }) => {
  const auth = await requireAuthContext(c);
  return updateTransaction(auth, params.id, body);
});

export const DELETE = defineHandler.withValidator({ params: idParamsSchema })(async (
  c,
  { params },
) => {
  const auth = await requireAuthContext(c);
  return deleteTransaction(auth, params.id);
});
