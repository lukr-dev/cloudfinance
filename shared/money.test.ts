import { describe, expect, it } from "vite-plus/test";
import { currencyExponents, formatMoney, parseMoney } from "./money";

describe("integer minor units", () => {
  it("uses the currency exponent and locale decimal separator", () => {
    expect(Object.keys(currencyExponents).length).toBeGreaterThan(150);
    expect(currencyExponents).toMatchObject({
      CHF: 2,
      JPY: 0,
      KRW: 0,
      CLP: 0,
      ISK: 0,
      KWD: 3,
      IQD: 3,
    });
    expect(Object.keys(currencyExponents)).toEqual(Object.keys(currencyExponents).sort());
    for (const code of [
      "XAU",
      "XAG",
      "XPT",
      "XPD",
      "XTS",
      "XXX",
      "XDR",
      "XSU",
      "XUA",
      "BOV",
      "CLF",
      "COU",
      "MXV",
      "USN",
      "UYI",
      "UYW",
      "CHE",
      "CHW",
      "XAD",
      "BGN",
      "ANG",
      "ZWL",
    ])
      expect(currencyExponents).not.toHaveProperty(code);
    expect(parseMoney("-1234.50", "CHF", "de-CH")).toBe(-123450);
    expect(parseMoney("12,34", "EUR", "de-DE")).toBe(1234);
    expect(parseMoney("19", "JPY")).toBe(19);
    expect(parseMoney("-12.345", "KWD")).toBe(-12345);
    expect(parseMoney("0,001", "IQD", "de-DE")).toBe(1);
    expect(parseMoney("0.01", "GBP")).toBe(1);
    expect(parseMoney("-0", "USD")).toBe(0);
  });

  it("rejects rounding, grouping, invalid input and unsafe amounts", () => {
    for (const input of ["1.001", "NaN", "1e2", "", "1,234.56", "90071992547409.92"]) {
      expect(() => parseMoney(input, "USD")).toThrow();
    }
    expect(() => parseMoney("1.1", "JPY")).toThrow();
    expect(() => parseMoney("1.2345", "KWD")).toThrow();
    expect(() => parseMoney("9007199254740.992", "KWD")).toThrow();
    expect(() => parseMoney("12.34", "EUR", "de-DE")).toThrow();
    expect(() => formatMoney(0.1, "CHF")).toThrow();
  });

  it("formats currency with Intl without losing cents at the integer limit", () => {
    expect(formatMoney(123450, "CHF", "de-CH")).toBe(
      new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(1234.5),
    );
    expect(formatMoney(-1, "USD", "en-US")).toBe("-$0.01");
    expect(formatMoney(1234, "JPY", "en-US")).toBe("¥1,234");
    expect(formatMoney(-1, "KWD", "en-US")).toBe("-KWD\u00a00.001");
    expect(formatMoney(Number.MAX_SAFE_INTEGER, "KWD", "en-US")).toBe(
      "KWD\u00a09,007,199,254,740.991",
    );
    expect(formatMoney(Number.MAX_SAFE_INTEGER, "USD", "en-US")).toBe("$90,071,992,547,409.91");
  });
  it("uses ISO decimal places even where Intl defaults differ", () => {
    for (const [currency, exponent] of Object.entries(currencyExponents)) {
      const code = currency as keyof typeof currencyExponents;
      const formatted = formatMoney(12345, code, "en-US");
      const expected = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: exponent,
        maximumFractionDigits: exponent,
      }).format(12345 / 10 ** exponent);
      expect(formatted, currency).toBe(expected);
      expect(parseMoney((12345 / 10 ** exponent).toFixed(exponent), code)).toBe(12345);
    }
  });
});
