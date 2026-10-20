import { expect } from "vite-plus/test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import * as s from "../shared/schemas";
import { authContextSchema } from "../shared/auth";
export async function sharingSmoke(base: string, adminCookie: string, adminKey: string) {
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    cookie = adminCookie,
    status = 200,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        Cookie: cookie,
        Origin: base,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result: unknown = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(status);
    return result;
  }
  const invite = s.invitationCreatedSchema.parse(
    await request("/api/v1/invitations", "POST", { email: "guest@example.com" }),
  );
  expect(invite.url).toBe(`${base}/join?token=${invite.token}`);
  expect(
    await request(`/api/v1/invite-status?token=${invite.token}`, "GET", undefined, ""),
  ).toEqual({ valid: true, email: "guest@example.com", invited_by_name: "Owner" });
  expect(await request("/api/v1/invite-status?token=unknown", "GET", undefined, "")).toEqual({
    valid: false,
    email: null,
    invited_by_name: null,
  });
  const signup = async (email: string, token: string, status: number) => {
    const response = await fetch(base + "/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        "X-Invite-Token": token,
        "X-Setup-Token": "ignored-after-setup",
      },
      body: JSON.stringify({ email, name: "Guest", password: "test-password-123456" }),
    });
    expect(response.status, await response.clone().text()).toBe(status);
    return response;
  };
  expect(await (await signup("wrong@example.com", invite.token, 403)).json()).toMatchObject({
    code: "INVITE_EMAIL_MISMATCH",
  });
  expect(await (await signup("guest@example.com", "unknown", 403)).json()).toMatchObject({
    code: "INVITE_INVALID",
  });
  const response = await signup("guest@example.com", invite.token, 200);
  const guestCookie = response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  expect(guestCookie).toContain("session_token");
  const guest = authContextSchema.parse(await request("/api/v1/me", "GET", undefined, guestCookie));
  expect(guest.role).toBe("member");
  expect(authContextSchema.parse(await request("/api/v1/me")).role).toBe("admin");
  expect(
    await request(`/api/v1/invite-status?token=${invite.token}`, "GET", undefined, ""),
  ).toEqual({ valid: false, email: null, invited_by_name: null });
  expect(await (await signup("reuse@example.com", invite.token, 403)).json()).toMatchObject({
    code: "INVITE_INVALID",
  });
  expect(
    ((await request("/api/v1/invitations")) as unknown[]).some((v) =>
      JSON.stringify(v).includes(invite.token),
    ),
  ).toBe(false);
  expect(await request("/api/v1/invitations", "POST", {}, guestCookie, 403)).toMatchObject({
    error: { code: "FORBIDDEN" },
  });
  expect(await request("/api/v1/members", "GET", undefined, guestCookie, 403)).toMatchObject({
    error: { code: "FORBIDDEN" },
  });
  expect(s.memberSchema.array().parse(await request("/api/v1/members"))).toHaveLength(2);
  const revoked = s.invitationCreatedSchema.parse(await request("/api/v1/invitations", "POST", {}));
  await request("/api/v1/invitations/" + revoked.invitation.id, "DELETE");
  expect(await (await signup("revoked@example.com", revoked.token, 403)).json()).toMatchObject({
    code: "INVITE_INVALID",
  });

  const bank = s.accountSchema.parse(
    await request("/api/v1/accounts", "POST", {
      name: "Shared Bank",
      type: "checking",
      currency: "CHF",
    }),
  );
  const result = s.transactionResultSchema.parse(
    await request("/api/v1/transactions", "POST", {
      account_id: bank.id,
      date: "2026-10-20",
      amount_minor: -201,
      payee: "Shared meal",
      share: { split_method: "equal", participants: [{ email: guest.email }] },
    }),
  );
  const tx = result.created[0]!;
  expect(tx).toMatchObject({
    shared_out_minor: -100,
    own_amount_minor: -101,
    split_method: "equal",
  });
  const shares = s.incomingShareListSchema.parse(
    await request("/api/v1/shares?status=active&uncategorized=true", "GET", undefined, guestCookie),
  );
  expect(shares.shares).toHaveLength(1);
  expect(shares.shares[0]).toMatchObject({ amount_minor: -100, total_minor: -201 });
  expect(
    s.budgetMonthSchema.parse(
      await request("/api/v1/budget/2026-10", "GET", undefined, guestCookie),
    ),
  ).toMatchObject({ uncategorized_shares_count: 1, uncategorized_count: 1 });
  expect(
    s.shareContactSchema
      .array()
      .parse(await request("/api/v1/share-contacts", "GET", undefined, guestCookie)),
  ).toEqual([{ user_id: tx.user_id, name: "Owner", email: "owner@example.com" }]);
  await request("/api/v1/transactions/" + tx.id, "GET", undefined, guestCookie, 404);
  await request("/api/v1/transactions/" + tx.id, "PATCH", { amount_minor: 1 }, guestCookie, 404);
  const shareId = shares.shares[0]!.id;
  await request("/api/v1/shares/" + shareId, "PATCH", { status: "declined" }, adminCookie, 404);
  await request("/api/v1/shares/" + shareId, "PATCH", { amount_minor: -1 }, guestCookie, 400);
  s.incomingShareSchema.parse(
    await request("/api/v1/shares/" + shareId, "PATCH", { status: "declined" }, guestCookie),
  );
  expect(
    s.transactionSchema.parse(await request("/api/v1/transactions/" + tx.id)).shared_out_minor,
  ).toBe(0);
  expect(
    s.incomingShareListSchema.parse(
      await request("/api/v1/shares?status=declined&limit=1", "GET", undefined, guestCookie),
    ).shares,
  ).toHaveLength(1);
  const apiKey = (await request(
    "/api/auth/api-key/create",
    "POST",
    { name: "sharing-smoke" },
    guestCookie,
  )) as { key: string };
  async function client(key: string) {
    const instance = new Client(
      { name: "sharing-smoke", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    await instance.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        requestInit: { headers: { Authorization: `Bearer ${key}` } },
      }),
    );
    return instance;
  }
  const ownerClient = await client(adminKey),
    guestClient = await client(apiKey.key);
  try {
    const created = await ownerClient.callTool({
      name: "create_transaction",
      arguments: {
        account_id: bank.id,
        date: "2026-10-21",
        amount_minor: -101,
        share: {
          split_method: "percent",
          participants: [{ email: guest.email, percent_bp: 5000 }],
        },
      },
    });
    expect(created.isError).toBeUndefined();
    const mcpTx = s.transactionResultSchema.parse(created.structuredContent).created[0]!;
    expect(mcpTx).toMatchObject({ source: "mcp", shared_out_minor: -50, own_amount_minor: -51 });
    const listed = await guestClient.callTool({
      name: "list_incoming_shares",
      arguments: { status: "active", uncategorized: true },
    });
    expect(s.incomingShareListSchema.parse(listed.structuredContent).shares).toHaveLength(1);
    const changed = await guestClient.callTool({
      name: "update_incoming_share",
      arguments: { id: shareId, status: "active" },
    });
    expect(s.incomingShareSchema.parse(changed.structuredContent).status).toBe("active");
    const forbidden = await guestClient.callTool({ name: "create_invitation", arguments: {} });
    expect(forbidden).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "FORBIDDEN" } },
    });
    const contacts = await guestClient.callTool({ name: "list_share_contacts", arguments: {} });
    expect(contacts.structuredContent).toMatchObject({ items: [{ user_id: tx.user_id }] });
    const invitations = await ownerClient.callTool({ name: "list_invitations", arguments: {} });
    expect(invitations.isError).toBeUndefined();
  } finally {
    await Promise.all([ownerClient.close(), guestClient.close()]);
  }
  const racing = s.invitationCreatedSchema.parse(await request("/api/v1/invitations", "POST", {}));
  const raced = await Promise.all(
    ["race-a@example.com", "race-b@example.com"].map((email) =>
      fetch(base + "/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: base,
          "X-Invite-Token": racing.token,
        },
        body: JSON.stringify({ email, name: "Race", password: "test-password-123456" }),
      }),
    ),
  );
  expect(raced.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 403]);
  expect(await raced.find((r) => r.status === 403)!.json()).toMatchObject({
    code: "INVITE_INVALID",
  });
  const openapi = (await request("/api/v1/openapi.json")) as { paths: Record<string, unknown> };
  for (const path of [
    "members",
    "invitations",
    "invitations/{id}",
    "invite-status",
    "shares",
    "shares/{id}",
    "share-contacts",
  ])
    expect(openapi.paths).toHaveProperty(`/api/v1/${path}`);
}
