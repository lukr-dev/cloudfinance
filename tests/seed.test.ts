import { spawnSync } from "node:child_process";
import { expect, it } from "vite-plus/test";
it("refuses remote seed arguments, production and external database URLs before invoking Void", () => {
  for (const config of [
    { args: ["--remote"], env: {} },
    { args: [], env: { NODE_ENV: "production" } },
    { args: [], env: { DATABASE_URL: "postgresql://localhost/forbidden" } },
  ]) {
    const result = spawnSync(process.execPath, ["scripts/seed.mjs", ...config.args], {
      encoding: "utf8",
      env: { ...process.env, ...config.env },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("local development D1 only");
  }
});
