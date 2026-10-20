import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { updateIncomingShare } from "../../../../server/shares";
import { incomingShareUpdateSchema, idParamsSchema } from "../../../../shared/schemas";
export const PATCH = defineHandler.withValidator({
  body: incomingShareUpdateSchema,
  params: idParamsSchema,
})(async (c, { body, params }) =>
  updateIncomingShare(await requireAuthContext(c), params.id, body),
);
