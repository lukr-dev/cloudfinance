import { z } from "zod";

export const setupStatusSchema = z.object({
  needsSetup: z.boolean(),
  setupTokenRequired: z.boolean(),
});
export const authContextSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  via: z.enum(["session", "api_key"]),
  api_key_id: z.string().optional(),
  api_key_name: z.string().nullable().optional(),
});
export type AuthContext = z.infer<typeof authContextSchema>;
