import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { accountCreateSchema, accountQuerySchema } from "../../../../shared/schemas";
import { listAccounts, createAccount } from "../../../../server/accounts";

export const GET = defineHandler.withValidator({ query: accountQuerySchema })(async (
  c,
  { query },
) => {
  const auth = await requireAuthContext(c);
  return listAccounts(auth, query.include_closed);
});

export const POST = defineHandler.withValidator({ body: accountCreateSchema })(async (
  c,
  { body },
) => {
  const auth = await requireAuthContext(c);
  return createAccount(auth, body);
});
