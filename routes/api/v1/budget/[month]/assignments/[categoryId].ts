import { defineHandler } from "void";
import { requireAuthContext } from "../../../../../../server/auth-context";
import { assignmentParamsSchema, assignmentSchema } from "../../../../../../shared/schemas";
import { assignToCategory } from "../../../../../../server/budget";

export const PUT = defineHandler.withValidator({
  params: assignmentParamsSchema,
  body: assignmentSchema,
})(async (c, { params, body }) => {
  const auth = await requireAuthContext(c);
  return assignToCategory(auth, params.month, params.categoryId, body);
});
