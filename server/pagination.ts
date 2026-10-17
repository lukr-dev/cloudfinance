import { fail } from "./errors";
export function encodeCursor(date: string, id: string): string {
  return btoa(JSON.stringify([date, id]));
}
export function decodeCursor(cursor: string): [string, string] {
  try {
    const v: unknown = JSON.parse(atob(cursor));
    if (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "string" && x.length > 0))
      return v as [string, string];
  } catch {
    /* Invalid cursor is a client error. */
  }
  return fail("VALIDATION_FAILED", "Invalid cursor.");
}
