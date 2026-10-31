process.env.VITEST_INCLUDE = "tests/persistence.integration.test.ts";
await import("./run-tests.mjs");
