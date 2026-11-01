const { ethers } = require('ethers');

async function test() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  console.log('Current block:', await provider.getBlockNumber());
}

test();

