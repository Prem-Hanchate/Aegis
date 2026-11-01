import { BlockchainClient } from "../backend/src/blockchain/client.js";
import { loadBlockchainConfig } from "../backend/src/blockchain/config.js";

process.env.BLOCKCHAIN_RPC_URL = "http://127.0.0.1:8545";
process.env.BLOCKCHAIN_CHAIN_ID = "31337";
process.env.BACKEND_SIGNER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.IDENTITY_REGISTRY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
process.env.POLICY_REGISTRY_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
process.env.REVOCATION_REGISTRY_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
process.env.AEGIS_REGISTRY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function test() {
  const config = loadBlockchainConfig();
  const client = await BlockchainClient.connect(config);
  const events = await client.getContracts().policyRegistry.queryFilter("RoleAssigned", -20);
  console.log("Events count:", events.length);
  if (events.length > 0) {
    const e: any = events[events.length - 1];
    console.log("Raw args:", e.args);
    console.log("Inputs:", e.fragment.inputs.map((i: any) => ({ name: i.name, type: i.type })));
  }
}
test().catch(console.error);

