import { currencyExponents } from "../../shared/money";

export type CurrencyCode = keyof typeof currencyExponents;

/** Shown first in pickers: Swiss base plus the currencies a Swiss household meets most. */
export const COMMON_CURRENCIES = [
  "CHF",
  "EUR",
  "USD",
  "GBP",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "JPY",
  "CAD",
  "AUD",
] as const;

export const ALL_CURRENCIES = Object.keys(currencyExponents) as CurrencyCode[];

const names = new Map<string, Intl.DisplayNames>();

/** Localized currency name, e.g. "Schweizer Franken" / "Swiss Franc"; falls back to the code. */
export function currencyName(code: string, locale: string): string {
  let display = names.get(locale);
  if (!display) {
    display = new Intl.DisplayNames([locale === "de" ? "de-CH" : "en"], { type: "currency" });
    names.set(locale, display);
  }
  try {
    return display.of(code) ?? code;
  } catch {
    return code;
  }
}
