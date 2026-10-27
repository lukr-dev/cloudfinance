import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { listAttachments, uploadAttachment } from "../../../../server/attachments";
import { attachmentQuerySchema } from "../../../../shared/schemas";

export const GET = defineHandler.withValidator({ query: attachmentQuerySchema })(
  async (c, { query }) => listAttachments(await requireAuthContext(c), query),
);
export const POST = defineHandler(async (c) =>
  c.json(await uploadAttachment(await requireAuthContext(c), c.req.raw), 201),
);
