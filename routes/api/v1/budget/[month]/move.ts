import { defineHandler } from "void";
import { requireAuthContext } from "../../../../../server/auth-context";
import { monthParamsSchema, moveSchema } from "../../../../../shared/schemas";
import { moveMoney } from "../../../../../server/budget";

export const POST = defineHandler.withValidator({ params: monthParamsSchema, body: moveSchema })(
  async (c, { params, body }) => {
    const auth = await requireAuthContext(c);
    return moveMoney(auth, params.month, body);
  },
);
