/** Client-side preview of the server's split rules (docs/ARCHITECTURE.md, "Splitting rules"). */

export type SplitMethod = "equal" | "percent" | "amount";

export interface SplitPreview {
  /** Each participant's part, same sign as the total; null where the input is missing. */
  shares: (number | null)[];
  /** The owner's own part (the remainder). */
  own: number;
  /** Why the split can't be saved, if it can't. */
  error: "over" | "missing" | null;
}

/**
 * `values` holds basis points for `percent` and absolute minor units for `amount`
 * (sign follows the total); it is ignored for `equal`.
 */
export function previewSplit(
  total: number,
  method: SplitMethod,
  values: (number | null)[],
): SplitPreview {
  const sign = Math.sign(total) || 1;
  const abs = Math.abs(total);
  const n = values.length;
  if (!n) return { shares: [], own: total, error: null };

  let parts: (number | null)[];
  if (method === "equal") {
    parts = values.map(() => Math.trunc(abs / (n + 1)));
  } else if (method === "percent") {
    const sum = values.reduce<number>((a, v) => a + (v ?? 0), 0);
    if (sum > 10000) return { shares: values.map(() => null), own: total, error: "over" };
    parts = values.map((v) => (v === null ? null : Math.trunc((abs * v) / 10000)));
  } else {
    parts = values.map((v) => (v === null ? null : Math.abs(v)));
  }

  const given = parts.reduce<number>((a, v) => a + (v ?? 0), 0);
  if (given > abs)
    return {
      shares: parts.map((p) => (p === null ? null : p * sign)),
      own: total - given * sign,
      error: "over",
    };
  const missing = parts.some((p) => p === null || p === 0);
  return {
    shares: parts.map((p) => (p === null ? null : p * sign)),
    own: (abs - given) * sign,
    error: missing ? "missing" : null,
  };
}

export interface SharePerson {
  email: string;
  /** Percent ("50", "33.3") or amount ("100.00") as typed; unused for `equal`. */
  value: string;
  name?: string;
  status?: "active" | "declined";
}
export interface ShareDraft {
  method: SplitMethod;
  people: SharePerson[];
}

/** "33.3" → 3330 basis points; null when not a percentage. */
export function parsePercent(input: string): number | null {
  const text = input.replace("%", "").replace(",", ".").trim();
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

export function formatPercent(bp: number): string {
  return String(Math.round(bp) / 100);
}
