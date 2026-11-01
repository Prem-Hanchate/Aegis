import { expect } from "chai";
import { ethers } from "hardhat";

async function expectCustomError(action: Promise<unknown>, errorName: string) {
  try {
    await action;
    expect.fail(`Expected ${errorName} custom error`);
  } catch (error: any) {
    expect(error.message).to.include(errorName);
  }
}

describe("AuditRegistry", () => {
  async function deployAuditRegistryFixture() {
    const [admin, operator, unauthorized] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("AuditRegistry");
    const auditRegistry = await factory.deploy(admin.address);
    await auditRegistry.waitForDeployment();

    return { auditRegistry, admin, operator, unauthorized };
  }

  it("deploys with the initial administrator assigned roles", async () => {
    const { auditRegistry, admin } = await deployAuditRegistryFixture();
    const defaultAdminRole = await auditRegistry.DEFAULT_ADMIN_ROLE();
    const auditAdminRole = await auditRegistry.AUDIT_ADMIN_ROLE();

    expect(await auditRegistry.hasRole(defaultAdminRole, admin.address)).to.equal(true);
    expect(await auditRegistry.hasRole(auditAdminRole, admin.address)).to.equal(true);
    expect(await auditRegistry.latestBatchId()).to.equal(0n);
  });

  it("anchors an audit batch and emits an event", async () => {
    const { auditRegistry } = await deployAuditRegistryFixture();
    const rootHash = ethers.keccak256(ethers.toUtf8Bytes("merkle-root-batch-1"));
    const batchSize = 25n;
    const startTimestamp = 1000n;
    const endTimestamp = 2000n;
    const metadata = "batch-1:25-events";

    const tx = await auditRegistry.anchorBatch(rootHash, batchSize, startTimestamp, endTimestamp, metadata);
    const receipt = await tx.wait();
    expect(receipt?.status).to.equal(1);

    expect(await auditRegistry.latestBatchId()).to.equal(1n);

    const batch = await auditRegistry.getBatch(1n);
    expect(batch.batchId).to.equal(1n);
    expect(batch.rootHash).to.equal(rootHash);
    expect(batch.batchSize).to.equal(batchSize);
    expect(batch.startTimestamp).to.equal(startTimestamp);
    expect(batch.endTimestamp).to.equal(endTimestamp);
    expect(batch.metadata).to.equal(metadata);
    expect(batch.anchoredAt > 0n).to.equal(true);
  });

  it("rejects anchoring with zero root hash or zero batch size", async () => {
    const { auditRegistry } = await deployAuditRegistryFixture();
    const zeroHash = ethers.ZeroHash;

    await expectCustomError(
      auditRegistry.anchorBatch(zeroHash, 10n, 1000n, 2000n, "empty-root"),
      "InvalidRootHash"
    );

    const validHash = ethers.keccak256(ethers.toUtf8Bytes("root-2"));
    await expectCustomError(
      auditRegistry.anchorBatch(validHash, 0n, 1000n, 2000n, "zero-size"),
      "InvalidBatchSize"
    );
  });

  it("rejects unauthorized accounts from anchoring batches", async () => {
    const { auditRegistry, unauthorized } = await deployAuditRegistryFixture();
    const rootHash = ethers.keccak256(ethers.toUtf8Bytes("unauthorized-batch"));

    await expectCustomError(
      auditRegistry.connect(unauthorized).anchorBatch(rootHash, 5n, 1000n, 2000n, "hack"),
      "AccessControlUnauthorizedAccount"
    );
  });

  it("reverts getBatch for unknown batch IDs", async () => {
    const { auditRegistry } = await deployAuditRegistryFixture();

    await expectCustomError(auditRegistry.getBatch(0n), "BatchNotFound");
    await expectCustomError(auditRegistry.getBatch(999n), "BatchNotFound");
  });

  it("verifies Merkle proofs correctly", async () => {
    const { auditRegistry } = await deployAuditRegistryFixture();

    // Create a 2-leaf Merkle tree
    const leafA = ethers.keccak256(ethers.toUtf8Bytes("event-A"));
    const leafB = ethers.keccak256(ethers.toUtf8Bytes("event-B"));

    // Sort pair
    let rootHash: string;
    if (leafA.toLowerCase() <= leafB.toLowerCase()) {
      rootHash = ethers.keccak256(ethers.concat([leafA, leafB]));
    } else {
      rootHash = ethers.keccak256(ethers.concat([leafB, leafA]));
    }

    // Proof for leafA is [leafB]
    const validProof = [leafB];
    expect(await auditRegistry.verifyProof(rootHash, leafA, validProof)).to.equal(true);

    // Proof for leafB is [leafA]
    expect(await auditRegistry.verifyProof(rootHash, leafB, [leafA])).to.equal(true);

    // Invalid leaf should fail
    const fakeLeaf = ethers.keccak256(ethers.toUtf8Bytes("event-C"));
    expect(await auditRegistry.verifyProof(rootHash, fakeLeaf, validProof)).to.equal(false);

    // Invalid proof element should fail
    expect(await auditRegistry.verifyProof(rootHash, leafA, [fakeLeaf])).to.equal(false);
  });
});
