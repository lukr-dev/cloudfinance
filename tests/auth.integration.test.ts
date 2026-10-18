import { backendSmoke } from "./backend-smoke";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { startDevServer } from "./dev-server";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

let server: Awaited<ReturnType<typeof startDevServer>>;
let base: string;

beforeAll(async () => {
  server = await startDevServer();
  base = server.base;
});

afterAll(async () => {
  await server?.stop();
});

it("serves the SPA and resolves cookie and verified API-key users, closing sign-up", async () => {
  const request = (path: string, init?: RequestInit) => fetch(`${base}${path}`, init);
  const post = (path: string, body: object, cookie = "") =>
    request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie },
      body: JSON.stringify(body),
    });
  const setup = await request("/api/v1/setup-status");
  expect(setup.headers.get("Cache-Control")).toContain("no-store");
  expect(await setup.json()).toEqual({ needsSetup: true, setupTokenRequired: false });
  expect((await request("/api/v1/me")).status).toBe(401);
  expect(await (await request("/")).text()).toContain("/src/main.ts");
  expect((await request("/setup", { headers: { Accept: "text/html" } })).status).toBe(200);
  // Deep links must serve the SPA shell directly, not redirect to "/".
  for (const path of ["/settings", "/budget/2026-09", "/transactions"]) {
    const deep = await request(path, { headers: { Accept: "text/html" }, redirect: "manual" });
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain('<div id="app">');
  }

  const credentials = {
    email: "owner@example.com",
    password: "test-password-123456",
    name: "Owner",
  };
  const signup = await post("/api/auth/sign-up/email", credentials);
  expect(signup.status, await signup.clone().text()).toBe(200);
  expect(await (await request("/api/v1/setup-status")).json()).toEqual({
    needsSetup: false,
    setupTokenRequired: false,
  });
  const rejected = await post("/api/auth/sign-up/email", {
    ...credentials,
    email: "second@example.com",
  });
  expect(rejected.status).toBe(403);
  expect(await rejected.json()).toMatchObject({ code: "SIGN_UP_CLOSED" });

  const signin = await post("/api/auth/sign-in/email", credentials);
  expect(signin.status).toBe(200);
  const cookie = signin.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(cookie).toContain("session_token");
  const sessionMe = await request("/api/v1/me", { headers: { Cookie: cookie } });
  expect(sessionMe.status).toBe(200);
  expect(await sessionMe.json()).toMatchObject({
    email: credentials.email,
    name: "Owner",
    via: "session",
  });

  const created = await post("/api/auth/api-key/create", { name: "integration" }, cookie);
  expect(created.status, await created.clone().text()).toBe(200);
  const key = (await created.json()) as { key: string; id: string };
  expect(key.key).toMatch(/^cf_/);
  const apiMe = await request("/api/v1/me", { headers: { Authorization: `Bearer ${key.key}` } });
  expect(apiMe.status, await apiMe.clone().text()).toBe(200);
  expect(apiMe.headers.get("Cache-Control")).toContain("no-store");
  expect(await apiMe.json()).toMatchObject({ email: credentials.email, via: "api_key" });
  expect(
    (await request("/api/v1/me", { headers: { Authorization: "Bearer invalid", Cookie: cookie } }))
      .status,
  ).toBe(401);
  expect((await post("/api/auth/api-key/create", { name: "unauthenticated" })).status).toBe(401);
  const passkeys = await request("/api/auth/passkey/list-user-passkeys", {
    headers: { Cookie: cookie },
  });
  expect(passkeys.status).toBe(200);
  expect(await passkeys.json()).toEqual([]);

  await backendSmoke(base, key.key, key.id, cookie);

  const limitedKey = (await (
    await post("/api/auth/api-key/create", { name: "rate-limit" }, cookie)
  ).json()) as { key: string; id: string };
  const headers = { Authorization: `Bearer ${limitedKey.key}` };
  const rest = () => request("/api/v1/me", { headers });
  const mcp = () =>
    request("/mcp", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "tools/list",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
    });
  for (let i = 0; i < 120; i++) {
    const response = await (i % 2 === 0 ? rest() : mcp());
    expect(
      response.status,
      `Authenticated request ${i + 1}: ${await response.clone().text()}`,
    ).toBe(200);
    await response.text();
  }
  for (const call of [rest, mcp]) {
    const response = await call();
    expect(response.status, "Request after 120 accepted requests").toBe(429);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("WWW-Authenticate")).toBeNull();
    const retryAfter = Number(response.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(await response.json()).toMatchObject(
      call === rest
        ? { error: { code: "RATE_LIMITED" } }
        : { jsonrpc: "2.0", id: null, error: { code: -32000, data: { code: "RATE_LIMITED" } } },
    );
  }
  // Age only the disposable key's last accepted request to exercise recovery without sleeping.
  const files = await readdir(server.state, { recursive: true });
  const databaseFiles = files.filter(
    (file) =>
      file.includes("miniflare-D1DatabaseObject/") &&
      file.endsWith(".sqlite") &&
      !file.endsWith("/metadata.sqlite"),
  );
  expect(databaseFiles).toHaveLength(1);
  const database = new DatabaseSync(join(server.state, databaseFiles[0]!));
  try {
    database
      .prepare("UPDATE apikey SET lastRequest = ? WHERE id = ?")
      .run(Date.now() - 61000, limitedKey.id);
  } finally {
    database.close();
  }
  for (const call of [rest, mcp]) {
    const response = await call();
    expect(response.status).toBe(200);
    await response.text();
  }
  expect((await post("/api/auth/api-key/delete", { keyId: limitedKey.id }, cookie)).status).toBe(
    200,
  );
  for (const call of [rest, mcp]) {
    const response = await call();
    expect(response.status).toBe(401);
    await response.text();
  }

  expect((await post("/api/auth/api-key/delete", { keyId: key.id }, cookie)).status).toBe(200);
  expect(
    (await request("/api/v1/me", { headers: { Authorization: `Bearer ${key.key}` } })).status,
  ).toBe(401);
});
