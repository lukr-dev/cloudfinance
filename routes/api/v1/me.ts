import { defineHandler } from "void";
import { requireAuthContext } from "../../../server/auth-context";

export const GET = defineHandler.withValidator({})((c) => requireAuthContext(c));
