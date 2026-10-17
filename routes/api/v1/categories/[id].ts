import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import {
  categoryDeleteQuerySchema,
  categoryUpdateSchema,
  idParamsSchema,
} from "../../../../shared/schemas";
import { updateCategory, deleteCategory } from "../../../../server/categories";

export const PATCH = defineHandler.withValidator({
  params: idParamsSchema,
  body: categoryUpdateSchema,
})(async (c, { params, body }) => {
  const auth = await requireAuthContext(c);
  return updateCategory(auth, params.id, body);
});

export const DELETE = defineHandler.withValidator({
  params: idParamsSchema,
  query: categoryDeleteQuerySchema,
})(async (c, { params, query }) => {
  const auth = await requireAuthContext(c);
  return deleteCategory(auth, params.id, query.reassign_to);
});
