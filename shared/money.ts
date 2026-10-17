export const currencyExponents = { CHF: 2, EUR: 2, USD: 2, GBP: 2, JPY: 0 } as const;
export type Currency = keyof typeof currencyExponents;

export function parseMoney(input: string, currency: Currency, locale = "en-US"): number {
  const exponent = currencyExponents[currency];
  const decimal =
    new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")
      ?.value ?? ".";
  if (decimal !== "." && input.includes(".")) throw new Error("Invalid decimal separator.");
  const normalized = input.trim().replace(decimal, ".");
  // Input accepts an ungrouped decimal amount in the active locale.
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) throw new Error("Invalid amount.");
  const [whole, fraction = ""] = normalized.replace(/^[+-]/, "").split(".");
  if (fraction.length > exponent) throw new Error("Too many fractional digits.");
  const magnitude =
    BigInt(whole!) * 10n ** BigInt(exponent) + BigInt(fraction.padEnd(exponent, "0") || "0");
  const minor = Number(normalized.startsWith("-") ? -magnitude : magnitude);
  if (!Number.isSafeInteger(minor)) throw new Error("Amount exceeds safe integer range.");
  return minor === 0 ? 0 : minor;
}

export function formatMoney(amountMinor: number, currency: Currency, locale = "de-CH"): string {
  if (!Number.isSafeInteger(amountMinor))
    throw new Error("Amount must be safe integer minor units.");
  const exponent = currencyExponents[currency];
  const factor = 10n ** BigInt(exponent);
  const amount = BigInt(amountMinor);
  const whole = amount / factor;
  const fraction = (amount < 0n ? -amount % factor : amount % factor)
    .toString()
    .padStart(exponent, "0");
  return new Intl.NumberFormat(locale, { style: "currency", currency })
    .formatToParts(amountMinor < 0 && whole === 0n ? -0 : whole)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
