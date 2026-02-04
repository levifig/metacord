import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["./vitest.workers.ts", "./vitest.frontend.ts"],
  },
});
