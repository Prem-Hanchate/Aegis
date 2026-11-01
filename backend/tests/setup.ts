import { afterAll, beforeAll, beforeEach } from "vitest";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { getDatabaseStatus } from "../src/config/database.js";
import { resetMongoRepositories } from "../src/repositories/index.js";

const testUri = process.env.MONGODB_TEST_URI;

beforeAll(async () => {
  if (!testUri) {
    throw new Error("MONGODB_TEST_URI must be provided by the test runner.");
  }
  await connectDatabase(testUri);
});

beforeEach(async () => {
  await resetMongoRepositories();
});

afterAll(async () => {
  if (getDatabaseStatus().connected) {
    await resetMongoRepositories();
    await disconnectDatabase();
  }
});
