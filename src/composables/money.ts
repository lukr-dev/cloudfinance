import { computed } from "vue";
import { useI18n } from "vue-i18n";

/** Minor-unit exponent per ISO 4217 code; unknown codes fall back to 2. */
export function exponentOf(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** UI locale → number locale. Swiss conventions (1’234.50) for both languages. */
export function numberLocale(locale: string): string {
  return locale.startsWith("de") ? "de-CH" : "en-CH";
}

const MINUS = "−";
const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, digits: number): Intl.NumberFormat {
  const key = `${locale}:${digits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatters.set(key, f);
  }
  return f;
}

export interface FormatOptions {
  /** Prefix positive values with "+". */
  signed?: boolean;
  /** Prepend the currency code ("CHF 12.00"). */
  code?: boolean;
}

export function formatMinor(
  amountMinor: number,
  currency: string,
  locale: string,
  options: FormatOptions = {},
): string {
  const digits = exponentOf(currency);
  const abs = Math.abs(amountMinor) / 10 ** digits;
  // Normalise the grouping apostrophe: ICU builds differ between ' and ’.
  const body = formatter(numberLocale(locale), digits).format(abs).replace(/'/g, "’");
  const sign = amountMinor < 0 ? MINUS : options.signed && amountMinor > 0 ? "+" : "";
  return `${options.code ? `${currency} ` : ""}${sign}${body}`;
}

/**
 * Lenient amount parser for typed input: accepts "1’240.50", "1240,5", "-12", "+3.2".
 * Returns integer minor units, or null when the input is not a number.
 */
export function parseToMinor(input: string, currency: string): number | null {
  const digits = exponentOf(currency);
  let s = input
    .trim()
    .replace(/[\s'’`]/g, "")
    .replace(MINUS, "-");
  if (s === "") return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let whole = s;
  let fraction = "";
  if (lastSep !== -1) {
    const tail = s.slice(lastSep + 1);
    // "1,234" / "1.234" read as grouping unless the currency itself has three decimals.
    const isGrouping = tail.length === 3 && digits !== 3;
    if (!isGrouping) {
      whole = s.slice(0, lastSep);
      fraction = tail;
    }
  }
  whole = whole.replace(/[.,]/g, "");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction) || (whole === "" && fraction === "")) {
    return null;
  }
  if (fraction.length > digits) return null;
  const minor = Number(whole || "0") * 10 ** digits + Number(fraction.padEnd(digits, "0") || "0");
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/** Locale-bound helpers for components. */
export function useMoney() {
  const { locale } = useI18n();
  const current = computed(() => locale.value);
  return {
    format: (amountMinor: number, currency: string, options?: FormatOptions) =>
      formatMinor(amountMinor, currency, current.value, options),
    parse: parseToMinor,
    /** For input fields: plain number without grouping, e.g. "1240.50". */
    toInput: (amountMinor: number, currency: string) => {
      const digits = exponentOf(currency);
      return (amountMinor / 10 ** digits).toFixed(digits);
    },
  };
}
