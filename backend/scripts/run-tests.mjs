import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
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

const vitestArgs = ["vitest", "run"];
if (process.env.VITEST_INCLUDE) {
  vitestArgs.push(process.env.VITEST_INCLUDE);
}

const child = spawn("npx", vitestArgs, {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, NODE_ENV: "test", MONGODB_TEST_URI: uri },
  stdio: "inherit",
  shell: process.platform === "win32",
});

const exitCode = await new Promise((resolve) => {
  child.on("exit", (code, signal) => {
    resolve(signal ? 1 : code ?? 1);
  });
});

await mongoServer?.stop();
process.exitCode = exitCode;
