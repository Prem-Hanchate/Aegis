import { connectDatabase, disconnectDatabase } from "../backend/src/config/database.js";
import { policyRepository } from "../backend/src/repositories/policy.repository.js";
import { rehydratePolicyStore } from "../backend/src/services/authorization/authorization.service.js";

async function main() {
  await connectDatabase("mongodb://127.0.0.1:27017/identity_security_db");
  await policyRepository.seedDefaults();
  await rehydratePolicyStore();
  console.log("Database seeded successfully with default policy permissions!");
  await disconnectDatabase();
}

main().catch(console.error);

