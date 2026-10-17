import { defineHandler } from "void";
import { getOpenApi } from "../../../server/openapi";
export const GET = defineHandler.withValidator({})(() => getOpenApi());
