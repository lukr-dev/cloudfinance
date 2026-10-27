import { defineHandler } from "void";
import { requireAuthContext } from "../../../../../server/auth-context";
import {
  getAttachment,
  updateAttachment,
  deleteAttachment,
} from "../../../../../server/attachments";
import { idParamsSchema, attachmentUpdateSchema } from "../../../../../shared/schemas";

export const GET = defineHandler.withValidator({ params: idParamsSchema })(async (c, { params }) =>
  getAttachment(await requireAuthContext(c), params.id),
);
export const PATCH = defineHandler.withValidator({
  params: idParamsSchema,
  body: attachmentUpdateSchema,
})(async (c, { params, body }) => updateAttachment(await requireAuthContext(c), params.id, body));
export const DELETE = defineHandler.withValidator({ params: idParamsSchema })(async (
  c,
  { params },
) => {
  await deleteAttachment(await requireAuthContext(c), params.id);
  return new Response(null, { status: 204 });
});
