import { connectDatabase, disconnectDatabase } from "../backend/src/config/database.js";
import { PolicyModel } from "../backend/src/models/index.js";

async function test() {
  await connectDatabase("mongodb://127.0.0.1:27017/identity_security_db");
  const policies = await PolicyModel.find();
  console.log("Policies in DB:", policies.map(p => ({ role: p.role, perms: p.permissions })));
  await disconnectDatabase();
}
test().catch(console.error);

