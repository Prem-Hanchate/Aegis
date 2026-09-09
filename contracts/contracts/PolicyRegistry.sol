// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

interface IIdentityRegistry {
    function isActive(bytes32 identityId) external view returns (bool);
}

contract PolicyRegistry is AccessControl {
    bytes32 public constant POLICY_ADMIN_ROLE = keccak256("POLICY_ADMIN_ROLE");

    struct Role {
        bytes32 roleId;
        bool exists;
    }

    struct Permission {
        bytes32 permissionId;
        bytes32 resource;
        bytes32 action;
        bool exists;
    }

    error InvalidRoleId();
    error InvalidPermissionId();
    error InvalidIdentityRegistry();
    error RoleAlreadyExists(bytes32 roleId);
    error PermissionAlreadyExists(bytes32 permissionId);
    error RoleNotFound(bytes32 roleId);
    error PermissionNotFound(bytes32 permissionId);
    error IdentityNotFound(bytes32 identityId);
    error PermissionAlreadyGranted(bytes32 roleId, bytes32 permissionId);
    error PermissionNotGranted(bytes32 roleId, bytes32 permissionId);
    error RoleAlreadyAssigned(bytes32 identityId, bytes32 roleId);
    error RoleNotAssigned(bytes32 identityId, bytes32 roleId);

    event RoleCreated(bytes32 indexed roleId, uint256 timestamp);
    event PermissionCreated(
        bytes32 indexed permissionId,
        bytes32 indexed resource,
        bytes32 indexed action,
        uint256 timestamp
    );
    event PermissionGranted(bytes32 indexed roleId, bytes32 indexed permissionId, uint256 timestamp);
    event PermissionRevoked(bytes32 indexed roleId, bytes32 indexed permissionId, uint256 timestamp);
    event RoleAssigned(bytes32 indexed identityId, bytes32 indexed roleId, uint256 timestamp);
    event RoleRemoved(bytes32 indexed identityId, bytes32 indexed roleId, uint256 timestamp);

    IIdentityRegistry public immutable identityRegistry;
    mapping(bytes32 => Role) private roles;
    mapping(bytes32 => Permission) private permissions;
    mapping(bytes32 => mapping(bytes32 => bool)) private rolePermissions;
    mapping(bytes32 => mapping(bytes32 => bool)) private identityRoles;
    mapping(bytes32 => bytes32[]) private identityRoleIds;

    constructor(address initialAdmin, address identityRegistryAddress) {
        if (initialAdmin == address(0) || identityRegistryAddress == address(0)) {
            revert InvalidIdentityRegistry();
        }

        identityRegistry = IIdentityRegistry(identityRegistryAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(POLICY_ADMIN_ROLE, initialAdmin);
    }

    function createRole(bytes32 roleId) external onlyRole(POLICY_ADMIN_ROLE) {
        if (roleId == bytes32(0)) revert InvalidRoleId();
        if (roles[roleId].exists) revert RoleAlreadyExists(roleId);

        roles[roleId] = Role({ roleId: roleId, exists: true });
        emit RoleCreated(roleId, block.timestamp);
    }

    function createPermission(bytes32 permissionId, bytes32 resource, bytes32 action)
        external
        onlyRole(POLICY_ADMIN_ROLE)
    {
        if (permissionId == bytes32(0)) revert InvalidPermissionId();
        if (permissions[permissionId].exists) revert PermissionAlreadyExists(permissionId);

        permissions[permissionId] = Permission({
            permissionId: permissionId,
            resource: resource,
            action: action,
            exists: true
        });
        emit PermissionCreated(permissionId, resource, action, block.timestamp);
    }

    function grantPermissionToRole(bytes32 roleId, bytes32 permissionId) external onlyRole(POLICY_ADMIN_ROLE) {
        _requireRole(roleId);
        _requirePermission(permissionId);
        if (rolePermissions[roleId][permissionId]) {
            revert PermissionAlreadyGranted(roleId, permissionId);
        }

        rolePermissions[roleId][permissionId] = true;
        emit PermissionGranted(roleId, permissionId, block.timestamp);
    }

    function revokePermissionFromRole(bytes32 roleId, bytes32 permissionId)
        external
        onlyRole(POLICY_ADMIN_ROLE)
    {
        _requireRole(roleId);
        _requirePermission(permissionId);
        if (!rolePermissions[roleId][permissionId]) {
            revert PermissionNotGranted(roleId, permissionId);
        }

        rolePermissions[roleId][permissionId] = false;
        emit PermissionRevoked(roleId, permissionId, block.timestamp);
    }

    function assignRole(bytes32 identityId, bytes32 roleId) external onlyRole(POLICY_ADMIN_ROLE) {
        _requireRole(roleId);
        _requireActiveIdentity(identityId);
        if (identityRoles[identityId][roleId]) {
            revert RoleAlreadyAssigned(identityId, roleId);
        }

        identityRoles[identityId][roleId] = true;
        identityRoleIds[identityId].push(roleId);
        emit RoleAssigned(identityId, roleId, block.timestamp);
    }

    function removeRole(bytes32 identityId, bytes32 roleId) external onlyRole(POLICY_ADMIN_ROLE) {
        _requireRole(roleId);
        if (!identityRoles[identityId][roleId]) {
            revert RoleNotAssigned(identityId, roleId);
        }

        identityRoles[identityId][roleId] = false;
        emit RoleRemoved(identityId, roleId, block.timestamp);
    }

    function hasIdentityRole(bytes32 identityId, bytes32 roleId) public view returns (bool) {
        return identityRoles[identityId][roleId];
    }

    function hasPermission(bytes32 identityId, bytes32 permissionId) external view returns (bool) {
        if (!permissions[permissionId].exists || !identityRegistry.isActive(identityId)) return false;

        bytes32[] memory assignedRoles = identityRoleIds[identityId];
        for (uint256 index = 0; index < assignedRoles.length; index++) {
            if (identityRoles[identityId][assignedRoles[index]] && rolePermissions[assignedRoles[index]][permissionId]) {
                return true;
            }
        }
        return false;
    }

    function getRole(bytes32 roleId) external view returns (Role memory) {
        _requireRole(roleId);
        return roles[roleId];
    }

    function getPermission(bytes32 permissionId) external view returns (Permission memory) {
        _requirePermission(permissionId);
        return permissions[permissionId];
    }

    function hasPermissionForRole(bytes32 roleId, bytes32 permissionId) external view returns (bool) {
        return rolePermissions[roleId][permissionId];
    }

    function _requireRole(bytes32 roleId) internal view {
        if (!roles[roleId].exists) revert RoleNotFound(roleId);
    }

    function _requirePermission(bytes32 permissionId) internal view {
        if (!permissions[permissionId].exists) revert PermissionNotFound(permissionId);
    }

    function _requireActiveIdentity(bytes32 identityId) internal view {
        if (identityId == bytes32(0) || !identityRegistry.isActive(identityId)) {
            revert IdentityNotFound(identityId);
        }
    }
}
