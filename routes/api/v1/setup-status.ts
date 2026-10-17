import { defineHandler } from "void";
import { getSetupStatus } from "../../../server/setup";

export const GET = defineHandler(async (c) =>
  c.json(await getSetupStatus(), 200, { "Cache-Control": "no-store" }),
);
