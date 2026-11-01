import { randomBytes, randomUUID } from "node:crypto";
import { getAddress } from "ethers";
import { connectDatabase, disconnectDatabase } from "../backend/src/config/database.js";
import { BlockchainClient } from "../backend/src/blockchain/client.js";
import { loadBlockchainConfig } from "../backend/src/blockchain/config.js";
import { BlockchainSyncService, registerKnownRole, registerKnownPermission } from "../backend/src/services/blockchain/sync.service.js";
import { registerIdentity, getIdentity } from "../backend/src/services/identity.service.js";
import { authorizeRequest, hasPermission, listRolePermissions } from "../backend/src/services/authorization/authorization.service.js";

async function run() {
  process.env.BLOCKCHAIN_RPC_URL = "http://127.0.0.1:8545";
  process.env.BLOCKCHAIN_CHAIN_ID = "31337";
  process.env.BACKEND_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  process.env.IDENTITY_REGISTRY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  process.env.POLICY_REGISTRY_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
  process.env.REVOCATION_REGISTRY_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
  process.env.AEGIS_REGISTRY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/identity_security_db";

  await connectDatabase(process.env.MONGODB_URI);
  const config = loadBlockchainConfig();
  const client = await BlockchainClient.connect(config);
  const syncService = new BlockchainSyncService(client, config);

  console.log("--- TEST 1 REPRODUCTION ---");
  const testWallet = getAddress("0x" + randomBytes(20).toString("hex"));
  const identityId = randomUUID();
  const roleName = "operator";

  registerKnownRole(roleName);
  registerKnownPermission("server", "restart");

  const identity = registerIdentity(testWallet, "Auth Operator", identityId);
  console.log("Initial identity in memory:", getIdentity(identityId));

  await client.registerIdentity(identityId, testWallet);
  await client.activateIdentity(identityId);
  const pTx = await client.createPolicy(roleName, "server", "restart");
  console.log("createPolicy result transactions count:", pTx.transactions.length);
  const aTx = await client.assignRole(identityId, roleName);
  console.log("assignRole result transactions count:", aTx.transactions.length);

  const syncedCount = await syncService.syncLatest(1);
  console.log("syncLatest syncedCount:", syncedCount);

  const updatedIdentity = getIdentity(identityId);
  console.log("Updated identity in memory:", updatedIdentity);
  console.log("Role permissions in memory:", listRolePermissions());
  console.log("hasPermission result:", hasPermission(identityId, "server", "restart"));

  await disconnectDatabase();
}

run().catch(console.error);

