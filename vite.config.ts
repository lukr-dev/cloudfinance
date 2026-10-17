import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { voidPlugin } from "void";

export default defineConfig(({ mode }) => ({
  plugins:
    mode === "test" ? [] : [vue(), voidPlugin({ persistTo: process.env.CLOUDFINANCE_TEST_STATE })],
  server: { host: "127.0.0.1", allowedHosts: ["hermes.tail880baf.ts.net"] },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {
    ignorePatterns: [
      "docs/ARCHITECTURE.md",
      "docs/design/**",
      "db/migrations/**",
      "pnpm-lock.yaml",
      ".agents/**",
      ".claude/**",
    ],
  },
  test: {
    include: ["shared/**/*.test.ts", "tests/**/*.test.ts"],
    hookTimeout: 60000,
    testTimeout: 30000,
  },
}));
