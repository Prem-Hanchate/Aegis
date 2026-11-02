import mongoose from "mongoose";
import { AppError } from "../../middleware/AppError.js";
import { AuditBatchModel, AuditLogModel, type AuditBatchDocument, type AuditLogDocument } from "../../models/index.js";
import { hashAuditEvent, MerkleTree, verifyMerkleProof } from "../../utils/merkle.js";
import { hasBlockchainConfiguration, loadBlockchainConfig } from "../../blockchain/config.js";
import { BlockchainClient } from "../../blockchain/client.js";

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

// In-memory fallback if MongoDB is not connected
const inMemoryBatches: Array<{
  batchId: number;
  rootHash: string;
  batchSize: number;
  eventIds: string[];
  startTimestamp: Date;
  endTimestamp: Date;
  metadata: string;
  txHash: string | null;
  blockNumber: number | null;
  anchoredAt: Date;
  status: "ANCHORED" | "FAILED";
}> = [];

let inMemoryBatchCounter = 0;

export async function batchAndAnchorAuditLogs(batchLimit = 50, clientOverride?: BlockchainClient) {
  if (isDbConnected()) {
    const unanchoredEvents = await AuditLogModel.find({ batchId: null })
      .sort({ timestamp: 1 })
      .limit(batchLimit)
      .exec();

    if (unanchoredEvents.length === 0) {
      throw new AppError("No unanchored audit records found.", 400, "NO_UNANCHORED_AUDIT_LOGS");
    }

    const leafHashes = unanchoredEvents.map((evt) =>
      hashAuditEvent({
        eventId: evt.eventId,
        timestamp: evt.timestamp,
        eventType: evt.eventType,
        identityId: evt.identityId,
        resource: evt.resource,
        action: evt.action,
        outcome: evt.outcome,
        reason: evt.reason,
        actor: evt.actor,
      })
    );

    const tree = new MerkleTree(leafHashes);
    const rootHash = tree.getRoot();

    // Determine next batch ID
    const latestBatch = await AuditBatchModel.findOne().sort({ batchId: -1 }).exec();
    const batchId = (latestBatch?.batchId ?? 0) + 1;

    const startTimestamp = unanchoredEvents[0]!.timestamp;
    const endTimestamp = unanchoredEvents[unanchoredEvents.length - 1]!.timestamp;
    const eventIds = unanchoredEvents.map((e) => e.eventId);
    const metadata = `batch-${batchId}:${unanchoredEvents.length}-events`;

    let txHash: string | null = null;
    let blockNumber: number | null = null;
    let failureReason: string | null = null;

    // Blockchain anchoring attempt
    let client: BlockchainClient | null = clientOverride ?? null;
    if (!client && hasBlockchainConfiguration()) {
      try {
        const config = loadBlockchainConfig();
        if (config.auditRegistryAddress) {
          client = await BlockchainClient.connect(config);
        }
      } catch (err) {
        console.warn("Failed to connect to blockchain client for audit anchoring:", err);
      }
    }

    if (client) {
      try {
        const startSec = Math.floor(startTimestamp.getTime() / 1000);
        const endSec = Math.floor(endTimestamp.getTime() / 1000);
        const receipt = await client.anchorAuditBatch(
          rootHash,
          unanchoredEvents.length,
          startSec,
          endSec,
          metadata,
        );
        txHash = receipt.hash;
        blockNumber = receipt.blockNumber;
      } catch (error) {
        failureReason = error instanceof Error ? error.message : "Blockchain audit anchoring transaction failed.";
        console.error("Blockchain audit anchoring transaction failed:", error);
      }
    } else {
      failureReason = "AuditRegistry blockchain client is unavailable.";
    }

    // Save batch record
    const batchDoc = await AuditBatchModel.create({
      batchId,
      rootHash,
      batchSize: unanchoredEvents.length,
      eventIds,
      startTimestamp,
      endTimestamp,
      metadata,
      txHash,
      blockNumber,
      anchoredAt: new Date(),
      status: failureReason ? "FAILED" : "ANCHORED",
      failureReason,
    });

    if (failureReason) {
      throw new AppError(
        "Audit batch anchoring failed; the batch remains retryable.",
        503,
        "AUDIT_ANCHORING_FAILED",
        { batchId, reason: failureReason },
      );
    }

    // Update audit log documents with batch details
    await Promise.all(
      unanchoredEvents.map((event, index) =>
        AuditLogModel.updateOne(
          { eventId: event.eventId },
          {
            $set: {
              batchId,
              leafIndex: index,
              leafHash: leafHashes[index],
            },
          }
        )
      )
    );

    return {
      batchId,
      rootHash,
      batchSize: unanchoredEvents.length,
      txHash,
      blockNumber,
      status: "ANCHORED",
      startTimestamp,
      endTimestamp,
    };
  }

  // In-memory fallback
  throw new AppError("Database connection required for audit anchoring.", 503, "DATABASE_UNAVAILABLE");
}

export async function getAuditProofForEvent(eventId: string) {
  if (isDbConnected()) {
    const event = await AuditLogModel.findOne({ eventId }).lean().exec();
    if (!event) {
      throw new AppError("Audit event not found.", 404, "AUDIT_EVENT_NOT_FOUND");
    }

    if (event.batchId === null || event.batchId === undefined) {
      return {
        eventId,
        anchored: false,
        message: "This audit event has not been anchored in a Merkle batch yet.",
      };
    }

    const batch = await AuditBatchModel.findOne({ batchId: event.batchId }).lean().exec();
    if (!batch) {
      throw new AppError("Audit batch not found.", 404, "AUDIT_BATCH_NOT_FOUND");
    }

    const batchEvents = await AuditLogModel.find({ batchId: event.batchId })
      .sort({ leafIndex: 1 })
      .lean()
      .exec();

    // Use stored leaf hashes (or compute them)
    const leafHashes = batchEvents.map((e) =>
      e.leafHash ??
      hashAuditEvent({
        eventId: e.eventId,
        timestamp: e.timestamp,
        eventType: e.eventType,
        identityId: e.identityId,
        resource: e.resource,
        action: e.action,
        outcome: e.outcome,
        reason: e.reason,
        actor: e.actor,
      })
    );

    const tree = new MerkleTree(leafHashes);
    const proof = tree.getProof(event.leafIndex ?? 0);

    return {
      eventId,
      anchored: true,
      batchId: batch.batchId,
      leafIndex: event.leafIndex,
      leafHash: event.leafHash ?? leafHashes[event.leafIndex ?? 0],
      rootHash: batch.rootHash,
      proof,
      txHash: batch.txHash,
      blockNumber: batch.blockNumber,
      anchoredAt: batch.anchoredAt,
    };
  }

  throw new AppError("Database connection required.", 503, "DATABASE_UNAVAILABLE");
}

export async function verifyAuditRecordIntegrity(eventId: string, clientOverride?: BlockchainClient) {
  if (!isDbConnected()) {
    throw new AppError("Database connection required for verification.", 503, "DATABASE_UNAVAILABLE");
  }

  const event = await AuditLogModel.findOne({ eventId }).lean().exec();
  if (!event) {
    throw new AppError("Audit event not found.", 404, "AUDIT_EVENT_NOT_FOUND");
  }

  if (event.batchId === null || event.batchId === undefined) {
    return {
      eventId,
      anchored: false,
      valid: false,
      message: "Audit record has not yet been anchored.",
    };
  }

  const batch = await AuditBatchModel.findOne({ batchId: event.batchId }).lean().exec();
  if (!batch) {
    throw new AppError("Audit batch not found.", 404, "AUDIT_BATCH_NOT_FOUND");
  }

  // 1. Recompute the hash of the current record in the database
  const computedHash = hashAuditEvent({
    eventId: event.eventId,
    timestamp: event.timestamp,
    eventType: event.eventType,
    identityId: event.identityId,
    resource: event.resource,
    action: event.action,
    outcome: event.outcome,
    reason: event.reason,
    actor: event.actor,
  });

  // Tamper detection: record fields modified!
  if (event.leafHash && computedHash.toLowerCase() !== event.leafHash.toLowerCase()) {
    return {
      eventId,
      anchored: true,
      valid: false,
      tampered: true,
      reason: "Tampering detected: Event content does not match the anchored cryptographic leaf hash.",
      storedLeafHash: event.leafHash,
      computedHash,
      rootHash: batch.rootHash,
    };
  }

  // 2. Fetch all events in this batch and verify Merkle inclusion proof
  const batchEvents = await AuditLogModel.find({ batchId: event.batchId })
    .sort({ leafIndex: 1 })
    .lean()
    .exec();

  const leafHashes = batchEvents.map((e) =>
    hashAuditEvent({
      eventId: e.eventId,
      timestamp: e.timestamp,
      eventType: e.eventType,
      identityId: e.identityId,
      resource: e.resource,
      action: e.action,
      outcome: e.outcome,
      reason: e.reason,
      actor: e.actor,
    })
  );

  const tree = new MerkleTree(leafHashes);
  const calculatedRoot = tree.getRoot();

  if (calculatedRoot.toLowerCase() !== batch.rootHash.toLowerCase()) {
    return {
      eventId,
      anchored: true,
      valid: false,
      tampered: true,
      reason: "Tampering detected: Batch tree root does not match anchored batch root hash (record modified or deleted).",
      batchRootHash: batch.rootHash,
      calculatedRoot,
    };
  }

  const proof = tree.getProof(event.leafIndex ?? 0);
  const proofValid = verifyMerkleProof(computedHash, proof, batch.rootHash);

  // 3. If blockchain connected, check on-chain root
  let onChainVerified = false;
  let onChainRoot: string | null = null;
  let client = clientOverride;
  if (!client && hasBlockchainConfiguration()) {
    try {
      const config = loadBlockchainConfig();
      if (config.auditRegistryAddress) {
        client = await BlockchainClient.connect(config);
      }
    } catch {
      // ignore
    }
  }

  if (client) {
    try {
      const onChainBatch = await client.getAuditBatch(batch.batchId);
      const rootHash = onChainBatch.rootHash;
      onChainRoot = rootHash;
      if (rootHash.toLowerCase() === batch.rootHash.toLowerCase()) {
        onChainVerified = await client.verifyAuditProof(batch.rootHash, computedHash, proof);
      } else {
        return {
          eventId,
          anchored: true,
          valid: false,
          tampered: true,
          reason: "Tampering detected: Database batch root does not match on-chain anchored root hash.",
          batchRootHash: batch.rootHash,
          onChainRoot,
        };
      }
    } catch (err) {
      console.warn("Could not verify proof directly on-chain:", err);
    }
  }

  return {
    eventId,
    anchored: true,
    valid: proofValid,
    tampered: !proofValid,
    leafHash: computedHash,
    rootHash: batch.rootHash,
    batchId: batch.batchId,
    txHash: batch.txHash,
    blockNumber: batch.blockNumber,
    onChainVerified,
    onChainRoot,
  };
}

export async function detectTamperedBatchRecords(batchId: number) {
  if (!isDbConnected()) {
    throw new AppError("Database connection required.", 503, "DATABASE_UNAVAILABLE");
  }

  const batch = await AuditBatchModel.findOne({ batchId }).lean().exec();
  if (!batch) {
    throw new AppError("Audit batch not found.", 404, "AUDIT_BATCH_NOT_FOUND");
  }

  const batchEvents = await AuditLogModel.find({ batchId }).sort({ leafIndex: 1 }).lean().exec();

  const missingCount = batch.batchSize - batchEvents.length;
  const tamperedRecords: Array<{ eventId: string; reason: string }> = [];

  for (const event of batchEvents) {
    const computedHash = hashAuditEvent({
      eventId: event.eventId,
      timestamp: event.timestamp,
      eventType: event.eventType,
      identityId: event.identityId,
      resource: event.resource,
      action: event.action,
      outcome: event.outcome,
      reason: event.reason,
      actor: event.actor,
    });

    if (event.leafHash && computedHash.toLowerCase() !== event.leafHash.toLowerCase()) {
      tamperedRecords.push({
        eventId: event.eventId,
        reason: "Content modified (hash mismatch).",
      });
    }
  }

  const isTampered = missingCount > 0 || tamperedRecords.length > 0;

  return {
    batchId,
    batchSize: batch.batchSize,
    actualEventsCount: batchEvents.length,
    missingEventsCount: missingCount,
    tamperedRecordsCount: tamperedRecords.length,
    tamperedRecords,
    rootHash: batch.rootHash,
    status: isTampered ? "TAMPERED" : "VERIFIED",
  };
}

export async function listAuditBatches(limit = 20) {
  if (isDbConnected()) {
    const batches = await AuditBatchModel.find().sort({ batchId: -1 }).limit(limit).lean().exec();
    return batches;
  }
  return inMemoryBatches;
}

export async function getLatestAuditBatch() {
  if (isDbConnected()) {
    return AuditBatchModel.findOne().sort({ batchId: -1 }).lean().exec();
  }
  return inMemoryBatches.length > 0 ? inMemoryBatches[inMemoryBatches.length - 1] : null;
}
