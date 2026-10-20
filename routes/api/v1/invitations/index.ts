import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { listInvitations, createInvitation } from "../../../../server/invitations";
import { invitationCreateSchema } from "../../../../shared/schemas";
export const GET = defineHandler(async (c) => listInvitations(await requireAuthContext(c)));
export const POST = defineHandler.withValidator({ body: invitationCreateSchema })(
  async (c, { body }) =>
    createInvitation(await requireAuthContext(c), body, new URL(c.req.url).origin),
);
