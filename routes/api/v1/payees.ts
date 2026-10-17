import { defineHandler } from "void";
import { requireAuthContext } from "../../../server/auth-context";
import { payeeQuerySchema } from "../../../shared/schemas";
import { listPayees } from "../../../server/payees";

export const GET = defineHandler.withValidator({ query: payeeQuerySchema })(async (
  c,
  { query },
) => {
  const auth = await requireAuthContext(c);
  return listPayees(auth, query.q);
});
