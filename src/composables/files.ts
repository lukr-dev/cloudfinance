/** "2.4 MB" / "2,4 MB", "820 kB". */
export function formatBytes(bytes: number, locale: string): string {
  const tag = locale === "de" ? "de-CH" : "en-GB";
  const [value, unit] =
    bytes >= 1_000_000
      ? [bytes / 1_000_000, "megabyte"]
      : bytes >= 1_000
        ? [bytes / 1_000, "kilobyte"]
        : [bytes, "byte"];
  return new Intl.NumberFormat(tag, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

export function attachmentUrl(id: string, download = false): string {
  return `/api/v1/attachments/${id}/content${download ? "?download=1" : ""}`;
}
