import { defineHandler } from "void";
import { requireAuthContext } from "../../../server/auth-context";
import { pageQuerySchema } from "../../../shared/schemas";
import { listAuditEvents } from "../../../server/audit";

export const GET = defineHandler.withValidator({ query: pageQuerySchema })(async (c, { query }) => {
  const auth = await requireAuthContext(c);
  return listAuditEvents(auth, query);
});
