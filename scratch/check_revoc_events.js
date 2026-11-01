const { ethers } = require('ethers');
const fs = require('fs');

async function test() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const abi = JSON.parse(fs.readFileSync('contracts/artifacts/contracts/RevocationRegistry.sol/RevocationRegistry.json')).abi;
  const revocationRegistry = new ethers.Contract('0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9', abi, provider);

  const currentBlock = await provider.getBlockNumber();
  const events = await revocationRegistry.queryFilter('*', 0, currentBlock);
  console.log('RevocationRegistry events count:', events.length);
  for (const e of events) {
    console.log(e.eventName, 'keys:', Object.keys(e.args), 'args:', e.args);
  }
}

test();

