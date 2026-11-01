import { BlockchainClient, blockchainRoleId, blockchainIdentityId } from "../backend/src/blockchain/client.js";
import { loadBlockchainConfig } from "../backend/src/blockchain/config.js";
import { connectDatabase, disconnectDatabase } from "../backend/src/config/database.js";
import { BlockchainSyncService } from "../backend/src/services/blockchain/sync.service.js";

async function main() {
  process.env.BLOCKCHAIN_RPC_URL = "http://127.0.0.1:8545";
  process.env.BLOCKCHAIN_CHAIN_ID = "31337";
  process.env.BACKEND_SIGNER_PRIVATE_KEY =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  process.env.IDENTITY_REGISTRY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  process.env.POLICY_REGISTRY_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
  process.env.REVOCATION_REGISTRY_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
  process.env.AEGIS_REGISTRY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/identity_security_db";

  await connectDatabase(process.env.MONGODB_URI);
  const config = loadBlockchainConfig();
  const client = await BlockchainClient.connect(config);

  const policyContract = client.getContracts().policyRegistry;
  const events = await policyContract.queryFilter("RoleAssigned", -20);
  console.log("RoleAssigned events count:", events.length);
  if (events.length > 0) {
    const lastEvent = events[events.length - 1];
    console.log("Last event args:", lastEvent.args);
    console.log("inputs:", lastEvent.fragment?.inputs);
  }
  await disconnectDatabase();
}

main().catch(console.error);

