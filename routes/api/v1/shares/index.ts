import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { listIncomingShares } from "../../../../server/shares";
import { incomingShareQuerySchema } from "../../../../shared/schemas";
export const GET = defineHandler.withValidator({ query: incomingShareQuerySchema })(
  async (c, { query }) => listIncomingShares(await requireAuthContext(c), query),
);
