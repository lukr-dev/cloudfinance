import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { transactionBodySchema, transactionQuerySchema } from "../../../../shared/schemas";
import { listTransactions, createTransactions } from "../../../../server/transactions";

export const GET = defineHandler.withValidator({ query: transactionQuerySchema })(async (
  c,
  { query },
) => {
  const auth = await requireAuthContext(c);
  return listTransactions(auth, query);
});

export const POST = defineHandler.withValidator({ body: transactionBodySchema })(async (
  c,
  { body },
) => {
  const auth = await requireAuthContext(c);
  return createTransactions(auth, body);
});
