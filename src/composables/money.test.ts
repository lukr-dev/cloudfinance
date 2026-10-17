import { describe, expect, it } from "vite-plus/test";
import { formatMinor, parseToMinor } from "./money";

describe("formatMinor", () => {
  it("uses Swiss grouping and a true minus sign", () => {
    expect(formatMinor(124050, "CHF", "de")).toBe("1’240.50");
    expect(formatMinor(-2460, "CHF", "en")).toBe("−24.60");
    expect(formatMinor(5000, "EUR", "en", { signed: true, code: true })).toBe("EUR +50.00");
    expect(formatMinor(1200, "JPY", "en")).toBe("1’200");
  });
});

describe("parseToMinor", () => {
  it.each([
    ["1’240.50", 124050],
    ["1240,5", 124050],
    ["-12", -1200],
    ["+3.2", 320],
    ["1,234", 123400],
    ["1.234,56", 123456],
    ["0.05", 5],
  ])("parses %s", (input, expected) => {
    expect(parseToMinor(input, "CHF")).toBe(expected);
  });

  it.each(["", "abc", "1.2.3x"])("rejects %s", (input) => {
    expect(parseToMinor(input, "CHF")).toBeNull();
  });
});
