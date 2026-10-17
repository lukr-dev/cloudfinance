import { setupStatusSchema, authContextSchema } from "../../shared/auth";

export async function getSetupStatus() {
  const response = await fetch("/api/v1/setup-status", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load setup status.");
  return setupStatusSchema.parse(await response.json());
}

export async function getMe() {
  const response = await fetch("/api/v1/me", { cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Could not load current user.");
  return authContextSchema.parse(await response.json());
}
