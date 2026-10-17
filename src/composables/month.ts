/** Month helpers on "YYYY-MM" strings (local calendar). */

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return currentMonth(d);
}

export function monthLabel(
  month: string,
  locale: string,
  style: "long" | "short" = "long",
): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "de" ? "de-CH" : "en-GB", {
    month: style,
    year: "numeric",
  }).format(new Date(y!, m! - 1, 1));
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y!, m!, 0).getDate();
}

export function todayIso(now = new Date()): string {
  return `${currentMonth(now)}-${String(now.getDate()).padStart(2, "0")}`;
}

export function formatDay(date: string, locale: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "de" ? "de-CH" : "en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(y!, m! - 1, d));
}
