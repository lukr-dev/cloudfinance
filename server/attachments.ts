import { Buffer } from "node:buffer";
import { db, sql, eq, and } from "void/db";
import { storage } from "void/storage";
import { attachments } from "../db/schema";
import type { AuthContext } from "../shared/auth";
import {
  attachmentParentSchema,
  attachmentUpdateSchema,
  type Attachment,
  type AttachmentParent,
  type AttachmentUpdate,
  type AttachmentQuery,
  type AttachmentList,
} from "../shared/schemas";
import { MAX_ATTACHMENT_BYTES, MAX_MCP_ATTACHMENT_BYTES } from "../shared/attachments";
import { write, rowBase } from "./audit";
import { DomainError, fail, found } from "./errors";
import { decodeCursor, encodeCursor } from "./pagination";

const columns = sql`id,category_id,transaction_id,file_name,content_type,size_bytes,note,created_at,updated_at`;
const owned = (ctx: AuthContext, id: string) =>
  and(eq(attachments.user_id, ctx.id), eq(attachments.id, id));
function validate<T>(result: { success: true; data: T } | { success: false; error: unknown }): T {
  if (!result.success)
    throw new DomainError("VALIDATION_FAILED", "Invalid attachment metadata.", 400, result.error);
  return result.data;
}
export function sanitizeFileName(name: string) {
  const clean = name
    .normalize("NFC")
    .split(/[\\/]/)
    .at(-1)!
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .slice(0, 255);
  if (!clean || clean === "." || clean === "..") fail("VALIDATION_FAILED", "Provide a file name.");
  return new TextDecoder().decode(new TextEncoder().encode(clean));
}
export function detectAttachmentType(bytes: Uint8Array): Attachment["content_type"] {
  const match = (signature: number[], offset = 0) =>
    signature.every((b, i) => bytes[offset + i] === b);
  const text = (start: number, end: number) => new TextDecoder().decode(bytes.subarray(start, end));
  if (text(0, 5) === "%PDF-") return "application/pdf";
  if (match([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (match([137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 16 && text(4, 8) === "ftyp") {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    if (size >= 16 && size % 4 === 0 && size <= bytes.length) {
      const brands = [text(8, 12)];
      for (let i = 16; i < Math.min(size, 256); i += 4) brands.push(text(i, i + 4));
      if (brands.some((b) => ["heic", "heix", "hevc"].includes(b))) return "image/heic";
      if (brands.some((b) => ["mif1", "msf1", "heif"].includes(b))) return "image/heif";
    }
  }
  return fail(
    "ATTACHMENT_TYPE_UNSUPPORTED",
    "Supported files: PDF, JPEG, PNG, WebP, HEIC and HEIF.",
    415,
  );
}
function checkSize(size: number, max = MAX_ATTACHMENT_BYTES) {
  if (size > max) fail("ATTACHMENT_TOO_LARGE", `Attachment exceeds ${max} bytes.`, 413);
}
export async function getAttachment(ctx: AuthContext, id: string): Promise<Attachment> {
  return found(
    await db.get<Attachment>(
      sql`SELECT ${columns} FROM attachments WHERE user_id=${ctx.id} AND id=${id}`,
    ),
  );
}
export async function listAttachments(
  ctx: AuthContext,
  q: AttachmentQuery,
): Promise<AttachmentList> {
  const filters = [sql`user_id=${ctx.id}`];
  if (q.category_id) filters.push(sql`category_id=${q.category_id}`);
  if (q.transaction_id) filters.push(sql`transaction_id=${q.transaction_id}`);
  if (q.cursor) {
    const [at, id] = decodeCursor(q.cursor);
    filters.push(sql`(created_at<${at} OR (created_at=${at} AND id<${id}))`);
  }
  const limit = q.limit ?? 50;
  const rows = await db.all<Attachment>(
    sql`SELECT ${columns} FROM attachments WHERE ${sql.join(filters, sql` AND `)} ORDER BY created_at DESC,id DESC LIMIT ${limit + 1}`,
  );
  const page = rows.slice(0, limit),
    last = page.at(-1);
  return {
    attachments: page,
    next_cursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
  };
}
export function categoryAttachments(ctx: AuthContext, id: string) {
  return db.all<Attachment>(
    sql`SELECT ${columns} FROM attachments WHERE user_id=${ctx.id} AND category_id=${id} ORDER BY created_at DESC,id DESC`,
  );
}
export async function createAttachment(
  ctx: AuthContext,
  input: AttachmentParent,
  fileName: string,
  bytes: Uint8Array,
): Promise<Attachment> {
  const parent = validate(attachmentParentSchema.safeParse(input));
  checkSize(bytes.byteLength);
  const file_name = sanitizeFileName(fileName),
    content_type = detectAttachmentType(bytes);
  if (parent.category_id)
    found(
      await db.get(
        sql`SELECT id FROM categories WHERE user_id=${ctx.id} AND id=${parent.category_id}`,
      ),
    );
  else
    found(
      await db.get(
        sql`SELECT id FROM transactions WHERE user_id=${ctx.id} AND id=${parent.transaction_id}`,
      ),
    );
  const base = rowBase(ctx.id);
  const row = {
    ...base,
    category_id: parent.category_id ?? null,
    transaction_id: parent.transaction_id ?? null,
    file_name,
    content_type,
    size_bytes: bytes.byteLength,
    note: parent.note ?? null,
    storage_key: `users/${ctx.id}/attachments/${base.id}`,
  };
  await storage.put(row.storage_key, bytes, { httpMetadata: { contentType: content_type } });
  try {
    const { storage_key: _key, user_id: _user, ...metadata } = row;
    await write(ctx, "create", "attachment", row.id, metadata, [
      db.insert(attachments).values(row),
    ]);
  } catch (error) {
    await deleteAttachmentObjects([row.storage_key]);
    throw error;
  }
  return getAttachment(ctx, row.id);
}
export async function uploadAttachment(ctx: AuthContext, request: Request) {
  // Bound the multipart envelope too, before formData can buffer an untrusted body.
  const maxRequest = MAX_ATTACHMENT_BYTES + 64 * 1024;
  checkSize(Number(request.headers.get("Content-Length") ?? 0), maxRequest);
  if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data"))
    fail("VALIDATION_FAILED", "Expected multipart/form-data.");
  let total = 0,
    overflow = false;
  const bounded = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > maxRequest) {
          overflow = true;
          fail("ATTACHMENT_TOO_LARGE", "Attachment exceeds 10 MB.", 413);
        }
        controller.enqueue(chunk);
      },
    }),
  );
  let form: FormData;
  try {
    form = await new Response(bounded, {
      headers: { "Content-Type": request.headers.get("Content-Type")! },
    }).formData();
  } catch {
    if (overflow) fail("ATTACHMENT_TOO_LARGE", "Attachment exceeds 10 MB.", 413);
    return fail("VALIDATION_FAILED", "Invalid multipart body.");
  }
  for (const [key] of form)
    if (
      !["file", "category_id", "transaction_id", "note"].includes(key) ||
      form.getAll(key).length !== 1
    )
      fail("VALIDATION_FAILED", "Unknown or duplicate multipart field.");
  const file = form.get("file");
  if (!(file instanceof File)) fail("VALIDATION_FAILED", "A file is required.");
  checkSize(file.size);
  const input = Object.fromEntries([...form].filter(([key]) => key !== "file"));
  const parent = validate(attachmentParentSchema.safeParse(input));
  return createAttachment(ctx, parent, file.name, new Uint8Array(await file.arrayBuffer()));
}
export async function updateAttachment(ctx: AuthContext, id: string, input: AttachmentUpdate) {
  const patch = validate(attachmentUpdateSchema.safeParse(input));
  await getAttachment(ctx, id);
  if (patch.file_name !== undefined) patch.file_name = sanitizeFileName(patch.file_name);
  await write(ctx, "update", "attachment", id, patch, [
    db
      .update(attachments)
      .set({ ...patch, updated_at: new Date().toISOString() })
      .where(owned(ctx, id)),
  ]);
  return getAttachment(ctx, id);
}
export async function deleteAttachment(ctx: AuthContext, id: string) {
  const current = await getAttachment(ctx, id);
  const row = found(
    await db
      .select({ storage_key: attachments.storage_key })
      .from(attachments)
      .where(owned(ctx, id))
      .get(),
  );
  await write(ctx, "delete", "attachment", id, { ...current }, [
    db.delete(attachments).where(owned(ctx, id)),
  ]);
  await deleteAttachmentObjects([row.storage_key]);
  return { ok: true as const };
}
export async function deleteAttachmentObjects(keys: string[]) {
  // Row deletion has committed; failed R2 cleanup may leave an orphan, never a dangling row.
  for (let i = 0; i < keys.length; i += 1000) {
    try {
      await storage.delete(keys.slice(i, i + 1000));
    } catch (error) {
      console.error("Attachment object cleanup failed", error);
    }
  }
}
export async function attachmentContent(ctx: AuthContext, id: string) {
  const metadata = await getAttachment(ctx, id);
  const row = found(
    await db
      .select({ storage_key: attachments.storage_key })
      .from(attachments)
      .where(owned(ctx, id))
      .get(),
  );
  const object = await storage.get(row.storage_key);
  if (!object) fail("NOT_FOUND", "Attachment content not found.", 404);
  return { metadata, object };
}
export async function attachmentContentResponse(ctx: AuthContext, id: string, download = false) {
  const { metadata, object } = await attachmentContent(ctx, id);
  const name = encodeURIComponent(metadata.file_name).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return new Response(object.body, {
    headers: {
      "Content-Type": metadata.content_type,
      "Content-Length": String(metadata.size_bytes),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
    },
  });
}
export async function uploadAttachmentBase64(
  ctx: AuthContext,
  input: AttachmentParent & { file_name: string; content_base64: string },
) {
  const { file_name, content_base64, ...parent } = input;
  if (content_base64.length > 4 * Math.ceil(MAX_MCP_ATTACHMENT_BYTES / 3))
    checkSize(MAX_MCP_ATTACHMENT_BYTES + 1, MAX_MCP_ATTACHMENT_BYTES);
  if (
    content_base64.length % 4 !== 0 ||
    /[^A-Za-z0-9+/]/.test(content_base64.replace(/={1,2}$/, ""))
  )
    fail("VALIDATION_FAILED", "Invalid base64 content.");
  const bytes = Buffer.from(content_base64, "base64");
  checkSize(bytes.byteLength, MAX_MCP_ATTACHMENT_BYTES);
  return createAttachment(ctx, parent, file_name, bytes);
}
export async function attachmentBlob(ctx: AuthContext, id: string) {
  const metadata = await getAttachment(ctx, id);
  if (metadata.size_bytes > MAX_MCP_ATTACHMENT_BYTES)
    fail(
      "ATTACHMENT_TOO_LARGE",
      `MCP content is limited to 4 MB. Use REST /api/v1/attachments/${id}/content.`,
      413,
    );
  const { object } = await attachmentContent(ctx, id);
  return {
    uri: `attachment://${id}`,
    mimeType: metadata.content_type,
    blob: Buffer.from(await object.arrayBuffer()).toString("base64"),
  };
}
