/** Display names for institution ids that connectors and agents commonly write in lowercase. */
const KNOWN: Record<string, string> = {
  postfinance: "PostFinance",
  revolut: "Revolut",
  ubs: "UBS",
  zkb: "ZKB",
  raiffeisen: "Raiffeisen",
  neon: "neon",
  yuh: "Yuh",
  viac: "VIAC",
  cembra: "Cembra",
};

export function institutionName(value: string | null | undefined): string {
  if (!value) return "";
  return KNOWN[value.toLowerCase()] ?? value;
}
