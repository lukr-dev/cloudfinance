import { defineHandler } from "void";
import { requireAuthContext } from "../../../../../server/auth-context";
import { currencyQuerySchema, monthParamsSchema } from "../../../../../shared/schemas";
import { getBudgetMonth } from "../../../../../server/budget";

export const GET = defineHandler.withValidator({
  params: monthParamsSchema,
  query: currencyQuerySchema,
})(async (c, { params, query }) => {
  const auth = await requireAuthContext(c);
  return getBudgetMonth(auth, params.month, query.currency);
});
