import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { startDevServer } from "./dev-server";

let server: Awaited<ReturnType<typeof startDevServer>>;
const token = "integration-setup-token";

beforeAll(async () => {
  server = await startDevServer({ SETUP_TOKEN: token });
});

afterAll(async () => {
  await server?.stop();
});

it("requires the configured token before creating the only account", async () => {
  const status = () => fetch(`${server.base}/api/v1/setup-status`).then((r) => r.json());
  expect(await status()).toEqual({ needsSetup: true, setupTokenRequired: true });

  const signup = (supplied?: string, email = "owner@example.com") =>
    fetch(`${server.base}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: server.base,
        ...(supplied === undefined ? {} : { "X-Setup-Token": supplied }),
      },
      body: JSON.stringify({ email, password: "test-password-123456", name: "Owner" }),
    });

  for (const supplied of [undefined, "wrong", "x".repeat(token.length)]) {
    const response = await signup(supplied);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "SETUP_TOKEN_INVALID" });
    expect(await status()).toEqual({ needsSetup: true, setupTokenRequired: true });
  }

  const accepted = await signup(token);
  expect(accepted.status, await accepted.clone().text()).toBe(200);
  expect(await status()).toEqual({ needsSetup: false, setupTokenRequired: true });

  const closed = await signup(undefined, "stranger@example.com");
  expect(closed.status).toBe(403);
  expect(await closed.json()).toMatchObject({ code: "SIGN_UP_CLOSED" });
});
