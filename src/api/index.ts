import { setupStatusSchema, authContextSchema } from "../../shared/auth";
import { inviteStatusSchema } from "../../shared/schemas";

export async function getSetupStatus() {
  const response = await fetch("/api/v1/setup-status", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load setup status.");
  return setupStatusSchema.parse(await response.json());
}

export async function getInviteStatus(token: string) {
  const url = new URL("/api/v1/invite-status", location.origin);
  url.searchParams.set("token", token);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not check the invitation.");
  return inviteStatusSchema.parse(await response.json());
}

export async function getMe() {
  const response = await fetch("/api/v1/me", { cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Could not load current user.");
  return authContextSchema.parse(await response.json());
}

export { fetch, FetchError } from "void/client";
export type * from "../../shared/schemas";
