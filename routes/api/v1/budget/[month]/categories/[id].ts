import { defineHandler } from "void";
import { requireAuthContext } from "../../../../../../server/auth-context";
import { categoryMonthParamsSchema, currencyQuerySchema } from "../../../../../../shared/schemas";
import { getCategoryMonth } from "../../../../../../server/budget";

export const GET = defineHandler.withValidator({
  params: categoryMonthParamsSchema,
  query: currencyQuerySchema,
})(async (c, { params, query }) => {
  const auth = await requireAuthContext(c);
  return getCategoryMonth(auth, params.month, params.id, query.currency);
});
