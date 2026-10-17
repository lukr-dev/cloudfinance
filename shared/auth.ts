import { z } from "zod";

export const setupStatusSchema = z.object({ needsSetup: z.boolean() });
export const authContextSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  via: z.enum(["session", "api_key"]),
});
export type AuthContext = z.infer<typeof authContextSchema>;
