import { describe, expect, it } from "vite-plus/test";
import { currencyExponents, formatMoney, parseMoney } from "./money";

describe("integer minor units", () => {
  it("uses the currency exponent and locale decimal separator", () => {
    expect(currencyExponents).toEqual({ CHF: 2, EUR: 2, USD: 2, GBP: 2, JPY: 0 });
    expect(parseMoney("-1234.50", "CHF", "de-CH")).toBe(-123450);
    expect(parseMoney("12,34", "EUR", "de-DE")).toBe(1234);
    expect(parseMoney("19", "JPY")).toBe(19);
    expect(parseMoney("0.01", "GBP")).toBe(1);
    expect(parseMoney("-0", "USD")).toBe(0);
  });

  it("rejects rounding, grouping, invalid input and unsafe amounts", () => {
    for (const input of ["1.001", "NaN", "1e2", "", "1,234.56", "90071992547409.92"]) {
      expect(() => parseMoney(input, "USD")).toThrow();
    }
    expect(() => parseMoney("1.1", "JPY")).toThrow();
    expect(() => parseMoney("12.34", "EUR", "de-DE")).toThrow();
    expect(() => formatMoney(0.1, "CHF")).toThrow();
  });

  it("formats currency with Intl without losing cents at the integer limit", () => {
    expect(formatMoney(123450, "CHF", "de-CH")).toBe(
      new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(1234.5),
    );
    expect(formatMoney(-1, "USD", "en-US")).toBe("-$0.01");
    expect(formatMoney(1234, "JPY", "en-US")).toBe("¥1,234");
    expect(formatMoney(Number.MAX_SAFE_INTEGER, "USD", "en-US")).toBe("$90,071,992,547,409.91");
  });
});
