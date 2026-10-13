import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside a React Server Components bundle. The
      // modules under test import it but only their pure helpers are exercised.
      "server-only": fileURLToPath(new URL("./tests/unit/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
