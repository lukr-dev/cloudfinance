import { defineHandler } from "void";
import { requireAuthContext } from "../../../../../server/auth-context";
import { attachmentContentResponse } from "../../../../../server/attachments";
import { idParamsSchema, attachmentContentQuerySchema } from "../../../../../shared/schemas";

export const GET = defineHandler.withValidator({
  params: idParamsSchema,
  query: attachmentContentQuerySchema,
})(async (c, { params, query }) =>
  attachmentContentResponse(await requireAuthContext(c), params.id, query.download === "1"),
);
