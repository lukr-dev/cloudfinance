import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, cp, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";

export async function startDevServer(env: NodeJS.ProcessEnv = {}) {
  const state = await mkdtemp(join(tmpdir(), "cloudfinance-test-"));
  const project = join(state, "project");
  // Separate generated Void metadata and file watching from other dev servers/design edits.
  await cp(process.cwd(), project, {
    recursive: true,
    filter: (path) =>
      !["node_modules", ".git", ".void", "dist", ".env"].some(
        (name) => path === resolve(name) || path.startsWith(resolve(name) + "/"),
      ),
  });
  await symlink(resolve("node_modules"), join(project, "node_modules"), "dir");
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("No test port.");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  let logs = "";
  const child = spawn("vp", ["dev", "--port", String(port), "--strictPort"], {
    cwd: project,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      VOID_INSPECTOR_PORT: "false",
      CLOUDFINANCE_TEST_STATE: join(state, "d1"),
      SETUP_TOKEN: undefined,
      ...env,
    },
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });
  const stop = async () => {
    if (child.pid && child.exitCode === null) {
      const closed = once(child, "close");
      process.kill(-child.pid, "SIGTERM");
      await closed;
    }
    await rm(state, { recursive: true, force: true });
  };
  for (let attempt = 0; attempt < 200; attempt++) {
    if (child.exitCode !== null) {
      await stop();
      throw new Error(logs);
    }
    try {
      const response = await fetch(`${base}/api/v1/setup-status`);
      if (response.ok) return { base, stop, state: join(state, "d1") };
    } catch {
      /* Wait for Vite and local D1 to start. */
    }
    await setTimeout(200);
  }
  await stop();
  throw new Error(`Dev server did not start: ${logs}`);
}
