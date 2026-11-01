import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongoServer;
let uri = process.env.MONGODB_TEST_URI;

if (!uri) {
  mongoServer = await MongoMemoryServer.create({ instance: { dbName: `aegis_test_${randomUUID().replaceAll("-", "")}` } });
  uri = mongoServer.getUri();
} else {
  const parsedUri = new URL(uri);
  parsedUri.pathname = `${parsedUri.pathname.replace(/\/$/, "")}_test_${randomUUID().replaceAll("-", "")}`;
  uri = parsedUri.toString();
}

const testDirectory = new URL("../tests/", import.meta.url);
const testFiles = process.env.VITEST_INCLUDE
  ? [process.env.VITEST_INCLUDE]
  : (await readdir(testDirectory)).filter((file) => file.endsWith(".test.ts"));

let exitCode = 0;
for (const testFile of testFiles) {
  const child = spawn("npx", ["vitest", "run", "--no-file-parallelism", "--maxWorkers=1", "--minWorkers=1", testFile], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, NODE_ENV: "test", MONGODB_TEST_URI: uri },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const result = await new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
  if (result !== 0) {
    exitCode = result;
    break;
  }
}

await mongoServer?.stop();
process.exitCode = exitCode;
