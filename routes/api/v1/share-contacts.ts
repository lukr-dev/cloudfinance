import { defineHandler } from "void";
import { requireAuthContext } from "../../../server/auth-context";
import { listShareContacts } from "../../../server/shares";
export const GET = defineHandler(async (c) => listShareContacts(await requireAuthContext(c)));
