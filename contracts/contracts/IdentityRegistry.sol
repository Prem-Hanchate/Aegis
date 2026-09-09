// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

contract IdentityRegistry is AccessControl {
    bytes32 public constant IDENTITY_ADMIN_ROLE = keccak256("IDENTITY_ADMIN_ROLE");

    enum IdentityStatus {
        NONE,
        ACTIVE,
        REVOKED
    }

    struct IdentityRecord {
        address walletAddress;
        IdentityStatus status;
        uint64 createdAt;
        uint64 updatedAt;
        uint64 revokedAt;
    }

    error InvalidIdentityId();
    error InvalidWalletAddress();
    error IdentityAlreadyExists(bytes32 identityId);
    error WalletAlreadyRegistered(address walletAddress);
    error IdentityNotFound(bytes32 identityId);
    error InvalidStatusTransition(
        bytes32 identityId,
        IdentityStatus currentStatus,
        IdentityStatus requestedStatus
    );

    event IdentityRegistered(bytes32 indexed identityId, address indexed walletAddress, uint256 timestamp);
    event IdentityActivated(bytes32 indexed identityId, address indexed walletAddress, uint256 timestamp);
    event IdentityRevoked(bytes32 indexed identityId, address indexed walletAddress, uint256 timestamp);

    mapping(bytes32 => IdentityRecord) private identities;
    mapping(address => bytes32) private identityByWallet;

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) {
            revert InvalidWalletAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(IDENTITY_ADMIN_ROLE, initialAdmin);
    }

    function registerIdentity(bytes32 identityId, address walletAddress) external onlyRole(IDENTITY_ADMIN_ROLE) {
        if (identityId == bytes32(0)) {
            revert InvalidIdentityId();
        }
        if (walletAddress == address(0)) {
            revert InvalidWalletAddress();
        }
        if (identities[identityId].walletAddress != address(0)) {
            revert IdentityAlreadyExists(identityId);
        }
        if (identityByWallet[walletAddress] != bytes32(0)) {
            revert WalletAlreadyRegistered(walletAddress);
        }

        uint64 timestamp = uint64(block.timestamp);
        identities[identityId] = IdentityRecord({
            walletAddress: walletAddress,
            status: IdentityStatus.NONE,
            createdAt: timestamp,
            updatedAt: timestamp,
            revokedAt: 0
        });
        identityByWallet[walletAddress] = identityId;

        emit IdentityRegistered(identityId, walletAddress, block.timestamp);
    }

    function activateIdentity(bytes32 identityId) external onlyRole(IDENTITY_ADMIN_ROLE) {
        IdentityRecord storage identity = _getIdentity(identityId);
        if (identity.status != IdentityStatus.NONE) {
            revert InvalidStatusTransition(identityId, identity.status, IdentityStatus.ACTIVE);
        }

        identity.status = IdentityStatus.ACTIVE;
        identity.updatedAt = uint64(block.timestamp);

        emit IdentityActivated(identityId, identity.walletAddress, block.timestamp);
    }

    function revokeIdentity(bytes32 identityId) external onlyRole(IDENTITY_ADMIN_ROLE) {
        IdentityRecord storage identity = _getIdentity(identityId);
        if (identity.status != IdentityStatus.ACTIVE) {
            revert InvalidStatusTransition(identityId, identity.status, IdentityStatus.REVOKED);
        }

        uint64 timestamp = uint64(block.timestamp);
        identity.status = IdentityStatus.REVOKED;
        identity.updatedAt = timestamp;
        identity.revokedAt = timestamp;

        emit IdentityRevoked(identityId, identity.walletAddress, block.timestamp);
    }

    function getIdentity(bytes32 identityId) external view returns (IdentityRecord memory) {
        return _getIdentity(identityId);
    }

    function getIdentityByWallet(address walletAddress)
        external
        view
        returns (bytes32 identityId, IdentityRecord memory identity)
    {
        if (walletAddress == address(0)) {
            revert InvalidWalletAddress();
        }

        identityId = identityByWallet[walletAddress];
        if (identityId == bytes32(0)) {
            revert IdentityNotFound(bytes32(0));
        }

        identity = identities[identityId];
    }

    function isActive(bytes32 identityId) external view returns (bool) {
        return identities[identityId].status == IdentityStatus.ACTIVE;
    }

    function _getIdentity(bytes32 identityId) internal view returns (IdentityRecord storage identity) {
        identity = identities[identityId];
        if (identity.walletAddress == address(0)) {
            revert IdentityNotFound(identityId);
        }
    }
}
