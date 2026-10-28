import { beforeAll, afterAll, expect, it } from "vite-plus/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { startDevServer } from "./dev-server";
import type {
  Attachment,
  AttachmentList,
  Category,
  CategoryGroup,
  TransactionResult,
} from "../shared/schemas";
let server: Awaited<ReturnType<typeof startDevServer>>, cookie: string, key: string;
const pdf = "%PDF-1.7\nlocal R2 fixture";
beforeAll(async () => {
  server = await startDevServer();
  const credentials = {
    email: "attachments@example.com",
    password: "test-password-123456",
    name: "Attachments",
  };
  const signup = await fetch(server.base + "/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: server.base },
    body: JSON.stringify(credentials),
  });
  expect(signup.status, await signup.clone().text()).toBe(200);
  cookie = signup.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  const created = await fetch(server.base + "/api/auth/api-key/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: server.base, Cookie: cookie },
    body: JSON.stringify({ name: "attachments" }),
  });
  expect(created.status, await created.clone().text()).toBe(200);
  key = ((await created.json()) as { key: string }).key;
});
afterAll(async () => server?.stop());
function request(path: string, method = "GET", body?: unknown) {
  return fetch(server.base + "/api/v1" + path, {
    method,
    headers: {
      Cookie: cookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function json<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await request(path, method, body);
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json() as Promise<T>;
}
async function upload(parent: Record<string, string>, bytes: BlobPart = pdf, type = "text/plain") {
  const body = new FormData();
  body.set("file", new File([bytes], "policy.pdf", { type }));
  for (const [key, value] of Object.entries(parent)) body.set(key, value);
  return fetch(server.base + "/api/v1/attachments", {
    method: "POST",
    headers: { Cookie: cookie },
    body,
  });
}
it("serves authenticated binary content from local R2 and documents multipart/binary endpoints", async () => {
  const group = await json<CategoryGroup>("/category-groups", "POST", { name: "Documents" });
  const category = await json<Category>("/categories", "POST", {
    group_id: group.id,
    name: "Insurance",
  });
  const target = await json<Category>("/categories", "POST", {
    group_id: group.id,
    name: "Target",
  });
  const uploaded = await upload({ category_id: category.id, note: "Policy" });
  expect(uploaded.status, await uploaded.clone().text()).toBe(201);
  const attachment = (await uploaded.json()) as Attachment;
  expect(attachment).toMatchObject({
    category_id: category.id,
    transaction_id: null,
    note: "Policy",
    content_type: "application/pdf",
  });
  expect(await json<Attachment>(`/attachments/${attachment.id}`)).toEqual(attachment);
  expect(
    (await json<AttachmentList>(`/attachments?category_id=${category.id}`)).attachments,
  ).toEqual([attachment]);
  const content = await request(`/attachments/${attachment.id}/content`);
  expect(content.status).toBe(200);
  expect(content.headers.get("Content-Type")).toBe("application/pdf");
  expect(content.headers.get("Content-Length")).toBe(String(pdf.length));
  expect(content.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(content.headers.get("Content-Security-Policy")).toBe("sandbox");
  expect(content.headers.get("Cache-Control")).toBe("private, no-store");
  expect(content.headers.get("Content-Disposition")).toBe("inline; filename*=UTF-8''policy.pdf");
  expect(await content.text()).toBe(pdf);
  const apiContent = await fetch(
    server.base + `/api/v1/attachments/${attachment.id}/content?download=1`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  expect(apiContent.status).toBe(200);
  expect(apiContent.headers.get("Content-Disposition")).toContain("attachment;");
  expect(await apiContent.text()).toBe(pdf);
  expect((await fetch(server.base + `/api/v1/attachments/${attachment.id}/content`)).status).toBe(
    401,
  );
  expect(
    await json<Attachment>(`/attachments/${attachment.id}`, "PATCH", { note: "Renew in November" }),
  ).toMatchObject({ note: "Renew in November" });
  const invalid = await upload(
    { category_id: category.id },
    "<html>not PDF</html>",
    "application/pdf",
  );
  expect(invalid.status).toBe(415);
  expect(await invalid.json()).toMatchObject({ error: { code: "ATTACHMENT_TYPE_UNSUPPORTED" } });
  const big = await upload({ category_id: category.id }, new Uint8Array(10 * 1024 * 1024 + 1));
  expect(big.status).toBe(413);
  expect(await big.json()).toMatchObject({ error: { code: "ATTACHMENT_TOO_LARGE" } });
  const png = await upload(
    { category_id: category.id },
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(png.status).toBe(201);
  expect(await png.json()).toMatchObject({ content_type: "image/png" });
  const blocked = await request(`/categories/${category.id}`, "DELETE");
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toMatchObject({ error: { code: "CATEGORY_IN_USE" } });
  await json(`/categories/${category.id}?reassign_to=${target.id}`, "DELETE");
  expect(await json<Attachment>(`/attachments/${attachment.id}`)).toMatchObject({
    category_id: target.id,
  });
  const deleted = await request(`/attachments/${attachment.id}`, "DELETE");
  expect(deleted.status).toBe(204);
  expect(await deleted.text()).toBe("");
  expect((await request(`/attachments/${attachment.id}/content`)).status).toBe(404);
  const account = await json<{ id: string }>("/accounts", "POST", {
    name: "Bank",
    type: "checking",
    currency: "CHF",
  });
  const tx = (
    await json<TransactionResult>("/transactions", "POST", {
      account_id: account.id,
      date: "2026-10-27",
      amount_minor: -1,
    })
  ).created[0]!;
  const receipt = (await (await upload({ transaction_id: tx.id })).json()) as Attachment;
  expect(await json(`/transactions/${tx.id}`)).toMatchObject({ attachment_count: 1 });
  await json(`/transactions/${tx.id}`, "DELETE");
  expect((await request(`/attachments/${receipt.id}`)).status).toBe(404);
  const spec = await json<{ paths: Record<string, Record<string, any>> }>("/openapi.json");
  expect(
    spec.paths["/api/v1/attachments"]!.post.requestBody.content["multipart/form-data"].schema
      .properties.file,
  ).toMatchObject({ type: "string", format: "binary" });
  expect(spec.paths["/api/v1/attachments"]!.post.responses).toHaveProperty("201");
  expect(spec.paths["/api/v1/attachments/{id}"]!.delete.responses).toHaveProperty("204");
  expect(
    spec.paths["/api/v1/attachments/{id}/content"]!.get.responses[200].content["application/pdf"]
      .schema.format,
  ).toBe("binary");
});
it("uploads, reads embedded blob resources, edits and deletes through the MCP client", async () => {
  const categories = await json<Category[]>("/categories");
  const parent = categories.find((c) => c.kind === "income")!;
  const client = new Client(
    { name: "attachments-test", version: "1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(server.base + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    }),
  );
  try {
    const upload = await client.callTool({
      name: "upload_attachment",
      arguments: {
        category_id: parent.id,
        file_name: "policy.pdf",
        content_base64: Buffer.from(pdf).toString("base64"),
        note: "Policy",
      },
    });
    expect(upload.isError, JSON.stringify(upload)).not.toBe(true);
    const attachment = upload.structuredContent as Attachment;
    expect(attachment.content_type).toBe("application/pdf");
    const get = await client.callTool({ name: "get_attachment", arguments: { id: attachment.id } });
    expect(get.structuredContent).toEqual(attachment);
    const content = await client.callTool({
      name: "get_attachment_content",
      arguments: { id: attachment.id },
    });
    expect(content.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource",
          resource: expect.objectContaining({
            mimeType: "application/pdf",
            blob: Buffer.from(pdf).toString("base64"),
          }),
        }),
      ]),
    );
    const list = await client.callTool({
      name: "list_attachments",
      arguments: { category_id: parent.id },
    });
    expect(list.structuredContent).toMatchObject({ items: [attachment], next_cursor: null });
    const update = await client.callTool({
      name: "update_attachment",
      arguments: { id: attachment.id, note: "Updated" },
    });
    expect(update.structuredContent).toMatchObject({ note: "Updated" });
    const deleted = await client.callTool({
      name: "delete_attachment",
      arguments: { id: attachment.id },
    });
    expect(deleted.structuredContent).toEqual({ ok: true });
  } finally {
    await client.close();
  }
});
