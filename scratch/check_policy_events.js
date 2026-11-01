const { ethers } = require('ethers');
const fs = require('fs');

async function test() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const abi = JSON.parse(fs.readFileSync('contracts/artifacts/contracts/PolicyRegistry.sol/PolicyRegistry.json')).abi;
  const policyRegistry = new ethers.Contract('0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0', abi, provider);

  const currentBlock = await provider.getBlockNumber();
  console.log('Querying from 0 to', currentBlock);
  const events = await policyRegistry.queryFilter('*', 0, currentBlock);
  console.log('PolicyRegistry events count:', events.length);
  for (const e of events) {
    console.log(e.eventName, e.blockNumber, e.args);
  }
}

test();

