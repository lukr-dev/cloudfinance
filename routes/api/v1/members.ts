import { defineHandler } from "void";
import { requireAuthContext } from "../../../server/auth-context";
import { listMembers } from "../../../server/members";
export const GET = defineHandler(async (c) => listMembers(await requireAuthContext(c)));
