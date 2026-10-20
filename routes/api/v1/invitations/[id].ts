import { defineHandler } from "void";
import { requireAuthContext } from "../../../../server/auth-context";
import { revokeInvitation } from "../../../../server/invitations";
import { idParamsSchema } from "../../../../shared/schemas";
export const DELETE = defineHandler.withValidator({ params: idParamsSchema })(
  async (c, { params }) => revokeInvitation(await requireAuthContext(c), params.id),
);
