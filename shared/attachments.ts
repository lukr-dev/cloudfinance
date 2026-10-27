export const ATTACHMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_NOTE_LENGTH = 2000;
export const MAX_MCP_ATTACHMENT_BYTES = 4 * 1024 * 1024;
