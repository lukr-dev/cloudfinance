import { defineHandler } from "void";
import { inviteStatus } from "../../../server/invitations";
import { inviteStatusQuerySchema } from "../../../shared/schemas";
export const GET = defineHandler.withValidator({ query: inviteStatusQuerySchema })(
  async (_c, { query }) => inviteStatus(query.token),
);
