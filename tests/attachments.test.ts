import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vite-plus/test";
vi.mock("void/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("void/db")>();
  const holder = { db: undefined as typeof original.db | undefined };
  return {
    ...original,
    db: new Proxy({}, { get: (_target, key) => Reflect.get(holder.db!, key) }),
    testHolder: holder,
  };
});
vi.mock("void/storage", () => {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    storage: {
      put: vi.fn(async (key: string, bytes: Uint8Array) => {
        objects.set(key, new Uint8Array(bytes));
      }),
      get: vi.fn(async (key: string) => {
        const bytes = objects.get(key);
        return bytes
          ? {
              body: new Blob([bytes as Uint8Array<ArrayBuffer>]).stream(),
              arrayBuffer: async () => bytes.buffer,
            }
          : null;
      }),
      delete: vi.fn(async (keys: string | string[]) => {
        for (const key of typeof keys === "string" ? [keys] : keys) objects.delete(key);
      }),
    },
  };
});
import * as dbModule from "void/db";
import * as storageModule from "void/storage";
import { testDatabase } from "./database";
import { createInvitation } from "../server/invitations";
import { signupInvitation } from "../server/invite-token";
import { listIncomingShares, updateIncomingShare } from "../server/shares";
import { getSettings } from "../server/settings";
import { createAccount } from "../server/accounts";
import {
  createGroup,
  createCategory,
  deleteCategory,
  updateCategory,
  listCategories,
} from "../server/categories";
import {
  createTransactions,
  deleteTransaction,
  getTransaction,
  listTransactions,
} from "../server/transactions";
import { getBudgetMonth, getCategoryMonth } from "../server/budget";
import {
  createAttachment,
  listAttachments,
  getAttachment,
  updateAttachment,
  deleteAttachment,
  attachmentContentResponse,
  detectAttachmentType,
  uploadAttachment,
  uploadAttachmentBase64,
  attachmentBlob,
} from "../server/attachments";
import { MAX_ATTACHMENT_BYTES, MAX_MCP_ATTACHMENT_BYTES } from "../shared/attachments";
import type { AuthContext } from "../shared/auth";
const ctx: AuthContext = {
  id: "owner",
  email: "owner@example.com",
  name: "Owner",
  role: "admin",
  via: "session",
};
let outsider: AuthContext;
const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
let fixture: ReturnType<typeof testDatabase>, category: string, target: string, account: string;
const objects = (storageModule as unknown as { objects: Map<string, Uint8Array> }).objects;
beforeAll(async () => {
  fixture = testDatabase();
  (dbModule as unknown as { testHolder: { db: typeof dbModule.db } }).testHolder.db = fixture.db;
  fixture.sqlite.exec(
    "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES ('owner','Owner','owner@example.com',0,0,0)",
  );
  await getSettings(ctx);
  const invitation = await createInvitation(ctx, { email: "other@example.com" });
  const id = await signupInvitation(invitation.token, "other@example.com");
  fixture.sqlite
    .prepare(
      "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,'Other','other@example.com',0,0,0)",
    )
    .run(id);
  outsider = { id, name: "Other", email: "other@example.com", role: "member", via: "session" };
  await getSettings(outsider);
  const group = await createGroup(ctx, { name: "Documents" });
  category = (await createCategory(ctx, { group_id: group.id, name: "Insurance" })).id;
  target = (await createCategory(ctx, { group_id: group.id, name: "Receipts" })).id;
  account = (await createAccount(ctx, { name: "Bank", type: "checking", currency: "CHF" })).id;
});
afterAll(() => fixture?.sqlite.close());
beforeEach(() => vi.clearAllMocks());
it("detects only supported magic bytes, including compatible ISO-BMFF brands", () => {
  expect(detectAttachmentType(pdf)).toBe("application/pdf");
  expect(detectAttachmentType(png)).toBe("image/png");
  expect(detectAttachmentType(new Uint8Array([255, 216, 255]))).toBe("image/jpeg");
  expect(detectAttachmentType(new TextEncoder().encode("RIFF1234WEBP"))).toBe("image/webp");
  for (const brand of ["heic", "heix", "hevc", "mif1", "msf1", "heif"]) {
    const bytes = new Uint8Array(20);
    new DataView(bytes.buffer).setUint32(0, 20);
    bytes.set(new TextEncoder().encode("ftyp"), 4);
    bytes.set(new TextEncoder().encode("mif1"), 8);
    bytes.set(new TextEncoder().encode(brand), 16);
    expect(detectAttachmentType(bytes)).toBe(
      ["heic", "heix", "hevc"].includes(brand) ? "image/heic" : "image/heif",
    );
  }
  for (const bytes of [
    new Uint8Array(),
    new TextEncoder().encode("<html>fake.pdf"),
    new TextEncoder().encode("RIFF"),
  ])
    expect(() => detectAttachmentType(bytes)).toThrow();
});
it("uploads PDF/PNG, sanitizes names, filters/paginates and exposes counts and inspector metadata", async () => {
  const tx = (
    await createTransactions(ctx, { account_id: account, date: "2026-10-01", amount_minor: -100 })
  ).created[0]!;
  const a = await createAttachment(
    ctx,
    { category_id: category, note: "Policy" },
    "C:\\fakepath\\policy\n.pdf",
    pdf,
  );
  const b = await createAttachment(ctx, { category_id: category }, "receipt.png", png);
  const c = await createAttachment(ctx, { transaction_id: tx.id }, "receipt.png", png);
  expect(a.file_name).toBe("policy.pdf");
  expect(a).not.toHaveProperty("storage_key");
  expect(a).not.toHaveProperty("user_id");
  expect(objects.get(`users/owner/attachments/${a.id}`)).toEqual(pdf);
  const first = await listAttachments(ctx, { category_id: category, limit: 1 });
  const second = await listAttachments(ctx, {
    category_id: category,
    limit: 1,
    cursor: first.next_cursor!,
  });
  expect(new Set([...first.attachments, ...second.attachments].map((a) => a.id))).toEqual(
    new Set([a.id, b.id]),
  );
  expect(second.next_cursor).toBeNull();
  expect(
    (await listAttachments(ctx, { transaction_id: tx.id })).attachments.map((a) => a.id),
  ).toEqual([c.id]);
  expect(await getTransaction(ctx, tx.id)).toMatchObject({ attachment_count: 1 });
  expect((await listCategories(ctx)).find((c) => c.id === category)?.attachment_count).toBe(2);
  expect(
    (await getBudgetMonth(ctx, "2026-10")).groups[0]?.categories.find((c) => c.id === category)
      ?.attachment_count,
  ).toBe(2);
  expect(await getCategoryMonth(ctx, "2026-10", category)).toMatchObject({
    attachment_count: 2,
    attachments: expect.arrayContaining([a, b]),
  });
  const content = await attachmentContentResponse(ctx, a.id);
  expect(content.headers.get("Content-Type")).toBe("application/pdf");
  expect(content.headers.get("Content-Length")).toBe(String(pdf.length));
  expect(content.headers.get("Content-Security-Policy")).toBe("sandbox");
  expect(content.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(content.headers.get("Cache-Control")).toBe("private, no-store");
  expect(content.headers.get("Content-Disposition")).toBe("inline; filename*=UTF-8''policy.pdf");
  expect(new Uint8Array(await content.arrayBuffer())).toEqual(pdf);
  expect(
    (await attachmentContentResponse(ctx, a.id, true)).headers.get("Content-Disposition"),
  ).toContain("attachment;");
  expect(await updateAttachment(ctx, a.id, { note: null, file_name: "new.pdf" })).toMatchObject({
    note: null,
    file_name: "new.pdf",
  });
  await deleteAttachment(ctx, a.id);
  expect(objects.has(`users/owner/attachments/${a.id}`)).toBe(false);
  await expect(getAttachment(ctx, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const events = fixture.sqlite
    .prepare("SELECT action,payload FROM audit_events WHERE entity='attachment'")
    .all();
  expect(events.map((e) => e.action)).toEqual(
    expect.arrayContaining(["create", "update", "delete"]),
  );
  expect(events.every((e) => !String(e.payload).includes("%PDF-"))).toBe(true);
});
it("rejects invalid metadata, wrong magic, oversized files, missing parents and foreign owners", async () => {
  await expect(
    createAttachment(ctx, { category_id: category }, "bad.pdf", new TextEncoder().encode("html")),
  ).rejects.toMatchObject({ code: "ATTACHMENT_TYPE_UNSUPPORTED", status: 415 });
  await expect(
    createAttachment(
      ctx,
      { category_id: category },
      "big.pdf",
      new Uint8Array(MAX_ATTACHMENT_BYTES + 1),
    ),
  ).rejects.toMatchObject({ code: "ATTACHMENT_TOO_LARGE", status: 413 });
  await expect(createAttachment(ctx, {}, "a.pdf", pdf)).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
  await expect(
    createAttachment(ctx, { category_id: category, transaction_id: "both" }, "a.pdf", pdf),
  ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  await expect(
    createAttachment(ctx, { category_id: "missing" }, "a.pdf", pdf),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    createAttachment(outsider, { category_id: category }, "a.pdf", pdf),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const a = await createAttachment(ctx, { category_id: target }, "a.pdf", pdf);
  expect((await listAttachments(outsider, {})).attachments).toEqual([]);
  for (const action of [
    () => getAttachment(outsider, a.id),
    () => updateAttachment(outsider, a.id, { note: "bad" }),
    () => deleteAttachment(outsider, a.id),
    () => attachmentContentResponse(outsider, a.id),
  ])
    await expect(action()).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(updateAttachment(ctx, a.id, { note: "a".repeat(2001) })).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
  });
});
it("bounds multipart requests while reading and ignores client MIME types", async () => {
  const form = new FormData();
  form.set("file", new File([pdf], "test.pdf", { type: "text/html" }));
  form.set("category_id", target);
  expect(
    await uploadAttachment(ctx, new Request("http://localhost", { method: "POST", body: form })),
  ).toMatchObject({ content_type: "application/pdf" });
  const big = new FormData();
  big.set("file", new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], "big.pdf"));
  big.set("category_id", target);
  await expect(
    uploadAttachment(ctx, new Request("http://localhost", { method: "POST", body: big })),
  ).rejects.toMatchObject({ code: "ATTACHMENT_TOO_LARGE" });
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(MAX_ATTACHMENT_BYTES + 65537));
      c.close();
    },
  });
  const request = new Request("http://localhost", {
    method: "POST",
    body: stream,
    headers: { "Content-Type": "multipart/form-data; boundary=x" },
    duplex: "half",
  } as RequestInit);
  await expect(uploadAttachment(ctx, request)).rejects.toMatchObject({
    code: "ATTACHMENT_TOO_LARGE",
  });
  await expect(
    uploadAttachment(
      ctx,
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Length": String(MAX_ATTACHMENT_BYTES + 65537) },
      }),
    ),
  ).rejects.toMatchObject({ code: "ATTACHMENT_TOO_LARGE" });
});
it("moves category attachments, blocks deletion without reassignment, and allows income attachments", async () => {
  const group = await createGroup(ctx, { name: "Lifecycle" });
  const source = await createCategory(ctx, { group_id: group.id, name: "Temporary" });
  const a = await createAttachment(ctx, { category_id: source.id }, "policy.pdf", pdf);
  await expect(deleteCategory(ctx, source.id)).rejects.toMatchObject({ code: "CATEGORY_IN_USE" });
  await deleteCategory(ctx, source.id, target);
  expect(await getAttachment(ctx, a.id)).toMatchObject({ category_id: target });
  expect(objects.has(`users/owner/attachments/${a.id}`)).toBe(true);
  const income = (await listCategories(ctx)).find((c) => c.kind === "income")!;
  expect(await createAttachment(ctx, { category_id: income.id }, "income.pdf", pdf)).toMatchObject({
    category_id: income.id,
  });
});
it("deletes both transfer legs and their objects, with attachment IDs in the parent audit event", async () => {
  const second = await createAccount(ctx, { name: "Wallet", type: "cash", currency: "CHF" });
  const tx = await createTransactions(ctx, {
    account_id: account,
    date: "2026-10-01",
    amount_minor: -1,
    transfer_account_id: second.id,
  });
  const attached = [];
  for (const t of tx.created)
    attached.push(await createAttachment(ctx, { transaction_id: t.id }, "receipt.png", png));
  await deleteTransaction(ctx, tx.created[1]!.id);
  for (const a of attached) {
    await expect(getAttachment(ctx, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(objects.has(`users/owner/attachments/${a.id}`)).toBe(false);
  }
  const event = fixture.sqlite
    .prepare(
      "SELECT payload FROM audit_events WHERE entity='transaction' AND action='delete' ORDER BY at DESC LIMIT 1",
    )
    .get()!;
  expect(JSON.parse(String(event.payload)).attachment_ids.sort()).toEqual(
    attached.map((a) => a.id).sort(),
  );
});
it("cleans R2 after a failed audited insert and keeps rows when a deletion audit fails", async () => {
  const a = await createAttachment(ctx, { category_id: target }, "policy.pdf", pdf);
  const before = objects.size;
  fixture.sqlite.exec(
    "CREATE TRIGGER reject_attachment_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
  );
  try {
    await expect(
      createAttachment(ctx, { category_id: target }, "policy.pdf", pdf),
    ).rejects.toThrow();
    expect(objects.size).toBe(before);
    await expect(deleteAttachment(ctx, a.id)).rejects.toThrow();
    expect(await getAttachment(ctx, a.id)).toMatchObject({ id: a.id });
    expect(objects.has(`users/owner/attachments/${a.id}`)).toBe(true);
  } finally {
    fixture.sqlite.exec("DROP TRIGGER reject_attachment_audit");
  }
});
it("caps MCP decoded upload/download at 4 MB and validates base64", async () => {
  const a = await uploadAttachmentBase64(ctx, {
    category_id: target,
    file_name: "policy.pdf",
    content_base64: Buffer.from(pdf).toString("base64"),
  });
  expect(await attachmentBlob(ctx, a.id)).toMatchObject({
    mimeType: "application/pdf",
    blob: Buffer.from(pdf).toString("base64"),
  });
  await expect(
    uploadAttachmentBase64(ctx, {
      category_id: target,
      file_name: "policy.pdf",
      content_base64: "not base64",
    }),
  ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  const bytes = new Uint8Array(MAX_MCP_ATTACHMENT_BYTES + 1);
  bytes.set(pdf);
  await expect(
    uploadAttachmentBase64(ctx, {
      category_id: target,
      file_name: "policy.pdf",
      content_base64: Buffer.from(bytes).toString("base64"),
    }),
  ).rejects.toMatchObject({ code: "ATTACHMENT_TOO_LARGE" });
  const large = await createAttachment(ctx, { category_id: target }, "large.pdf", bytes);
  await expect(attachmentBlob(ctx, large.id)).rejects.toMatchObject({
    code: "ATTACHMENT_TOO_LARGE",
    message: expect.stringContaining(`/api/v1/attachments/${large.id}/content`),
  });
});

it("keeps shared transaction attachments private and deletes shares and objects together", async () => {
  const tx = (
    await createTransactions(ctx, {
      account_id: account,
      date: "2026-10-01",
      amount_minor: -100,
      share: { split_method: "equal", participants: [{ email: outsider.email }] },
    })
  ).created[0]!;
  const attached = await createAttachment(ctx, { transaction_id: tx.id }, "receipt.pdf", pdf);
  const share = (await listIncomingShares(outsider, {})).shares[0]!;
  expect(share.transaction_id).toBe(tx.id);
  expect(share).not.toHaveProperty("attachment_count");
  expect(share).not.toHaveProperty("attachments");
  expect((await listTransactions(outsider, {})).transactions).toEqual([]);
  expect((await listAttachments(outsider, { transaction_id: tx.id })).attachments).toEqual([]);
  for (const action of [
    () => getAttachment(outsider, attached.id),
    () => attachmentContentResponse(outsider, attached.id),
    () => createAttachment(outsider, { transaction_id: tx.id }, "receipt.pdf", pdf),
    () => createAttachment(outsider, { transaction_id: share.id }, "receipt.pdf", pdf),
  ])
    await expect(action()).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await getTransaction(ctx, tx.id)).toMatchObject({
    attachment_count: 1,
    shared_out_minor: -50,
  });
  await deleteTransaction(ctx, tx.id);
  expect((await listIncomingShares(outsider, {})).shares).toEqual([]);
  await expect(getAttachment(ctx, attached.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(objects.has(`users/owner/attachments/${attached.id}`)).toBe(false);
  expect(
    fixture.sqlite
      .prepare("SELECT action FROM audit_events WHERE user_id=? AND entity_id=?")
      .all(outsider.id, share.id),
  ).toContainEqual({ action: "share_removed" });
});
it("reassigns incoming shares and attachments together and protects repayment categories", async () => {
  const group = await createGroup(outsider, { name: "Shared documents" });
  const source = await createCategory(outsider, { group_id: group.id, name: "Old" });
  const destination = await createCategory(outsider, { group_id: group.id, name: "New" });
  const tx = (
    await createTransactions(ctx, {
      account_id: account,
      date: "2026-10-01",
      amount_minor: -100,
      share: { split_method: "equal", participants: [{ email: outsider.email }] },
    })
  ).created[0]!;
  const share = (await listIncomingShares(outsider, {})).shares[0]!;
  await updateIncomingShare(outsider, share.id, { category_id: source.id });
  const attached = await createAttachment(outsider, { category_id: source.id }, "policy.pdf", pdf);
  await expect(deleteCategory(outsider, source.id)).rejects.toMatchObject({
    code: "CATEGORY_IN_USE",
  });
  await deleteCategory(outsider, source.id, destination.id);
  expect((await listIncomingShares(outsider, {})).shares[0]).toMatchObject({
    category_id: destination.id,
  });
  expect(await getCategoryMonth(outsider, "2026-10", destination.id)).toMatchObject({
    attachment_count: 1,
    attachments: [expect.objectContaining({ id: attached.id })],
    shares: [expect.objectContaining({ id: share.id })],
  });
  const repayment = (await listCategories(outsider)).find((c) => c.kind === "repayment")!;
  await createAttachment(outsider, { category_id: repayment.id }, "repayment.pdf", pdf);
  await expect(deleteCategory(outsider, repayment.id, destination.id)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await expect(updateCategory(outsider, repayment.id, { name: "Changed" })).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await deleteTransaction(ctx, tx.id);
});
it("rolls back share and attachment cleanup when an uncaptured upload blocks parent deletion", async () => {
  const tx = (
    await createTransactions(ctx, {
      account_id: account,
      date: "2026-10-01",
      amount_minor: -100,
      share: { split_method: "equal", participants: [{ email: outsider.email }] },
    })
  ).created[0]!;
  const attached = await createAttachment(ctx, { transaction_id: tx.id }, "receipt.pdf", pdf);
  // Simulate an upload appearing after the attachment IDs were captured, inside the delete batch.
  fixture.sqlite.exec(`
    CREATE TRIGGER upload_during_delete AFTER DELETE ON attachments
    WHEN OLD.id='${attached.id}' BEGIN
      INSERT INTO attachments(id,user_id,created_at,updated_at,transaction_id,file_name,content_type,size_bytes,storage_key)
      VALUES ('concurrent-upload',OLD.user_id,OLD.created_at,OLD.updated_at,OLD.transaction_id,OLD.file_name,OLD.content_type,OLD.size_bytes,'concurrent-key');
    END;
  `);
  try {
    await expect(deleteTransaction(ctx, tx.id)).rejects.toThrow(/FOREIGN KEY constraint/);
    expect(await getTransaction(ctx, tx.id)).toMatchObject({
      attachment_count: 1,
      shared_out_minor: -50,
    });
    expect((await listIncomingShares(outsider, {})).shares).toHaveLength(1);
    expect(await getAttachment(ctx, attached.id)).toMatchObject({ transaction_id: tx.id });
    expect(objects.has(`users/owner/attachments/${attached.id}`)).toBe(true);
    expect(
      fixture.sqlite
        .prepare("SELECT id FROM audit_events WHERE entity_id=? AND action='delete'")
        .all(tx.id),
    ).toEqual([]);
  } finally {
    fixture.sqlite.exec("DROP TRIGGER upload_during_delete");
  }
  await deleteTransaction(ctx, tx.id);
});
