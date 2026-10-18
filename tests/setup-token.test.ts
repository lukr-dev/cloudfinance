import { expect, it } from "vite-plus/test";
import { requireSetupToken, setupTokenRequired } from "../server/setup-token";

it("only exempts loopback request URLs when no setup token is configured", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const request = new Request(`http://${host}:5173/api/auth/sign-up/email`);
    expect(setupTokenRequired(request.url, undefined)).toBe(false);
    expect(() => requireSetupToken(request, undefined)).not.toThrow();
    expect(setupTokenRequired(request.url, "configured")).toBe(true);
    // A production build never trusts the hostname, even on loopback.
    expect(setupTokenRequired(request.url, undefined, false)).toBe(true);
  }
  for (const host of ["cloudfinance.toastnet.work", "localhost.example.com", "192.168.1.2"]) {
    const request = new Request(`https://${host}/api/auth/sign-up/email`, {
      headers: { Origin: "http://localhost", "X-Setup-Token": "anything" },
    });
    expect(setupTokenRequired(request.url, undefined)).toBe(true);
    expect(() => requireSetupToken(request, undefined)).toThrow(
      expect.objectContaining({
        status: "FORBIDDEN",
        body: expect.objectContaining({ code: "SETUP_TOKEN_REQUIRED" }),
      }),
    );
  }
});

it("fails closed for an empty configured token", () => {
  const request = new Request("http://localhost:5173/", { headers: { "X-Setup-Token": "" } });
  expect(setupTokenRequired(request.url, "")).toBe(true);
  expect(() => requireSetupToken(request, "")).toThrow(
    expect.objectContaining({ body: expect.objectContaining({ code: "SETUP_TOKEN_REQUIRED" }) }),
  );
});
