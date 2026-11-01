import { concat, getBytes, keccak256, toUtf8Bytes, ZeroHash } from "ethers";

/**
 * Deterministically serializes an object into canonical JSON with sorted keys.
 */
export function serializeCanonical(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  const canonicalObj: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const val = obj[key];
    if (val !== undefined) {
      if (val instanceof Date) {
        canonicalObj[key] = val.toISOString();
      } else if (typeof val === "bigint") {
        canonicalObj[key] = val.toString();
      } else if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        canonicalObj[key] = JSON.parse(serializeCanonical(val as Record<string, unknown>));
      } else {
        canonicalObj[key] = val;
      }
    }
  }
  return JSON.stringify(canonicalObj);
}

export interface AuditEventPayload {
  eventId: string;
  timestamp: string | Date;
  eventType: string;
  identityId?: string | null;
  resource?: string | null;
  action?: string | null;
  outcome: string;
  reason?: string | null;
  actor?: string | null;
}

/**
 * Computes deterministic Keccak-256 hash for an audit event record.
 */
export function hashAuditEvent(event: AuditEventPayload): string {
  const canonicalString = serializeCanonical({
    action: event.action ?? null,
    actor: event.actor ?? null,
    eventId: event.eventId,
    eventType: event.eventType,
    identityId: event.identityId ?? null,
    outcome: event.outcome,
    reason: event.reason ?? null,
    resource: event.resource ?? null,
    timestamp: typeof event.timestamp === "string" ? event.timestamp : event.timestamp.toISOString(),
  });
  return keccak256(toUtf8Bytes(canonicalString));
}

/**
 * Combines two sibling hashes in lexicographical order, matching OpenZeppelin / AuditRegistry.sol.
 */
export function hashPair(a: string, b: string): string {
  const aNorm = a.toLowerCase();
  const bNorm = b.toLowerCase();
  const [first, second] = aNorm <= bNorm ? [a, b] : [b, a];
  return keccak256(concat([getBytes(first), getBytes(second)]));
}

/**
 * Standard cryptographic Merkle Tree implementation with inclusion proofs.
 */
export class MerkleTree {
  readonly leaves: string[];
  readonly layers: string[][];

  constructor(leafHashes: string[]) {
    this.leaves = leafHashes.slice();
    this.layers = [];

    if (this.leaves.length === 0) {
      this.layers = [[ZeroHash]];
      return;
    }

    let currentLayer = this.leaves.slice();
    this.layers.push(currentLayer);

    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          nextLayer.push(hashPair(currentLayer[i]!, currentLayer[i + 1]!));
        } else {
          // Odd number of leaves: elevate the unmatched leaf (or pair with duplicate)
          // OpenZeppelin standard pairs duplicate of itself:
          nextLayer.push(hashPair(currentLayer[i]!, currentLayer[i]!));
        }
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  getRoot(): string {
    const top = this.layers[this.layers.length - 1];
    return top && top[0] ? top[0] : ZeroHash;
  }

  getProof(leafIndex: number): string[] {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of bounds (0-${this.leaves.length - 1}).`);
    }

    const proof: string[] = [];
    let currentIndex = leafIndex;

    for (let layerIndex = 0; layerIndex < this.layers.length - 1; layerIndex++) {
      const currentLayer = this.layers[layerIndex]!;
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      if (siblingIndex < currentLayer.length) {
        proof.push(currentLayer[siblingIndex]!);
      } else {
        // Odd leaf paired with itself
        proof.push(currentLayer[currentIndex]!);
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  getProofForLeaf(leafHash: string): string[] {
    const index = this.leaves.findIndex((l) => l.toLowerCase() === leafHash.toLowerCase());
    if (index === -1) {
      throw new Error("Leaf hash not found in Merkle tree.");
    }
    return this.getProof(index);
  }
}

/**
 * Verifies a Merkle inclusion proof against a root hash.
 */
export function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
  let computedHash = leaf;

  for (const proofElement of proof) {
    computedHash = hashPair(computedHash, proofElement);
  }

  return computedHash.toLowerCase() === root.toLowerCase();
}

