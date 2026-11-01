// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

contract AuditRegistry is AccessControl {
    bytes32 public constant AUDIT_ADMIN_ROLE = keccak256("AUDIT_ADMIN_ROLE");

    struct AuditBatch {
        uint256 batchId;
        bytes32 rootHash;
        uint256 batchSize;
        uint64 anchoredAt;
        uint64 startTimestamp;
        uint64 endTimestamp;
        string metadata;
    }

    error InvalidInitialAdmin();
    error InvalidRootHash();
    error InvalidBatchSize();
    error BatchNotFound(uint256 batchId);

    event AuditBatchAnchored(
        uint256 indexed batchId,
        bytes32 indexed rootHash,
        uint256 batchSize,
        uint256 timestamp
    );

    uint256 private _currentBatchId;
    mapping(uint256 => AuditBatch) private batches;

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) {
            revert InvalidInitialAdmin();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(AUDIT_ADMIN_ROLE, initialAdmin);
    }

    function anchorBatch(
        bytes32 rootHash,
        uint256 batchSize,
        uint64 startTimestamp,
        uint64 endTimestamp,
        string calldata metadata
    ) external onlyRole(AUDIT_ADMIN_ROLE) returns (uint256) {
        if (rootHash == bytes32(0)) revert InvalidRootHash();
        if (batchSize == 0) revert InvalidBatchSize();

        _currentBatchId += 1;
        uint256 batchId = _currentBatchId;
        uint64 timestamp = uint64(block.timestamp);

        batches[batchId] = AuditBatch({
            batchId: batchId,
            rootHash: rootHash,
            batchSize: batchSize,
            anchoredAt: timestamp,
            startTimestamp: startTimestamp,
            endTimestamp: endTimestamp,
            metadata: metadata
        });

        emit AuditBatchAnchored(batchId, rootHash, batchSize, block.timestamp);
        return batchId;
    }

    function getBatch(uint256 batchId) external view returns (AuditBatch memory) {
        if (batchId == 0 || batchId > _currentBatchId) {
            revert BatchNotFound(batchId);
        }
        return batches[batchId];
    }

    function latestBatchId() external view returns (uint256) {
        return _currentBatchId;
    }

    function verifyProof(
        bytes32 rootHash,
        bytes32 leafHash,
        bytes32[] calldata proof
    ) external pure returns (bool) {
        bytes32 computedHash = leafHash;

        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }

        return computedHash == rootHash;
    }
}

