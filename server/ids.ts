// UUID v5 in the nil namespace gives lazy setup stable IDs across concurrent first requests.
export async function setupId(name: string): Promise<string> {
  const label = new TextEncoder().encode(name);
  const input = new Uint8Array(16 + label.length);
  input.set(label, 16);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", input)).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
