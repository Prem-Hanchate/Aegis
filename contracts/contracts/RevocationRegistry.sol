// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

contract RevocationRegistry is AccessControl {
    bytes32 public constant REVOCATION_ADMIN_ROLE = keccak256("REVOCATION_ADMIN_ROLE");

    struct RevocationRecord {
        bool revoked;
        uint64 revokedAt;
    }

    error InvalidInitialAdmin();
    error InvalidIdentityId();
    error InvalidDeviceId();
    error InvalidPermissionId();
    error IdentityAlreadyRevoked(bytes32 identityId);
    error DeviceAlreadyRevoked(bytes32 deviceId);
    error PermissionAlreadyRevoked(bytes32 permissionId);

    event IdentityRevoked(bytes32 indexed identityId, uint256 timestamp);
    event DeviceRevoked(bytes32 indexed deviceId, uint256 timestamp);
    event PermissionRevoked(bytes32 indexed permissionId, uint256 timestamp);

    mapping(bytes32 => RevocationRecord) private revokedIdentities;
    mapping(bytes32 => RevocationRecord) private revokedDevices;
    mapping(bytes32 => RevocationRecord) private revokedPermissions;

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert InvalidInitialAdmin();

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(REVOCATION_ADMIN_ROLE, initialAdmin);
    }

    function revokeIdentity(bytes32 identityId) external onlyRole(REVOCATION_ADMIN_ROLE) {
        if (identityId == bytes32(0)) revert InvalidIdentityId();
        if (revokedIdentities[identityId].revoked) revert IdentityAlreadyRevoked(identityId);

        uint64 timestamp = uint64(block.timestamp);
        revokedIdentities[identityId] = RevocationRecord({ revoked: true, revokedAt: timestamp });
        emit IdentityRevoked(identityId, block.timestamp);
    }

    function revokeDevice(bytes32 deviceId) external onlyRole(REVOCATION_ADMIN_ROLE) {
        if (deviceId == bytes32(0)) revert InvalidDeviceId();
        if (revokedDevices[deviceId].revoked) revert DeviceAlreadyRevoked(deviceId);

        uint64 timestamp = uint64(block.timestamp);
        revokedDevices[deviceId] = RevocationRecord({ revoked: true, revokedAt: timestamp });
        emit DeviceRevoked(deviceId, block.timestamp);
    }

    function revokePermission(bytes32 permissionId) external onlyRole(REVOCATION_ADMIN_ROLE) {
        if (permissionId == bytes32(0)) revert InvalidPermissionId();
        if (revokedPermissions[permissionId].revoked) revert PermissionAlreadyRevoked(permissionId);

        uint64 timestamp = uint64(block.timestamp);
        revokedPermissions[permissionId] = RevocationRecord({ revoked: true, revokedAt: timestamp });
        emit PermissionRevoked(permissionId, block.timestamp);
    }

    function isIdentityRevoked(bytes32 identityId) external view returns (bool) {
        return revokedIdentities[identityId].revoked;
    }

    function isDeviceRevoked(bytes32 deviceId) external view returns (bool) {
        return revokedDevices[deviceId].revoked;
    }

    function isPermissionRevoked(bytes32 permissionId) external view returns (bool) {
        return revokedPermissions[permissionId].revoked;
    }

    function getIdentityRevocation(bytes32 identityId) external view returns (RevocationRecord memory) {
        return revokedIdentities[identityId];
    }

    function getDeviceRevocation(bytes32 deviceId) external view returns (RevocationRecord memory) {
        return revokedDevices[deviceId];
    }

    function getPermissionRevocation(bytes32 permissionId) external view returns (RevocationRecord memory) {
        return revokedPermissions[permissionId];
    }
}
