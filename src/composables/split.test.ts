import { describe, expect, it } from "vite-plus/test";
import { previewSplit } from "./split";

describe("previewSplit", () => {
  it("splits equally and leaves the remainder with the owner", () => {
    expect(previewSplit(-20001, "equal", [null])).toEqual({
      shares: [-10000],
      own: -10001,
      error: null,
    });
    expect(previewSplit(-10000, "equal", [null, null])).toEqual({
      shares: [-3333, -3333],
      own: -3334,
      error: null,
    });
  });

  it("truncates percentages toward zero", () => {
    expect(previewSplit(-999, "percent", [3333])).toEqual({
      shares: [-332],
      own: -667,
      error: null,
    });
    expect(previewSplit(5000, "percent", [10000])).toEqual({ shares: [5000], own: 0, error: null });
    expect(previewSplit(-5000, "percent", [6000, 5000]).error).toBe("over");
  });

  it("takes fixed amounts with the total's sign", () => {
    expect(previewSplit(-20000, "amount", [7500])).toEqual({
      shares: [-7500],
      own: -12500,
      error: null,
    });
    expect(previewSplit(-20000, "amount", [25000]).error).toBe("over");
    expect(previewSplit(-20000, "amount", [null]).error).toBe("missing");
  });
});
