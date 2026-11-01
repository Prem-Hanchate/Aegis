const fs = require('fs');

let authService = fs.readFileSync('backend/src/services/authorization/authorization.service.ts', 'utf8');

authService = authService.replace(
  'return identity.status === "ACTIVE" && identity.roles.some((role) => rolePermissions[role]?.has(permission));',
  `console.log('[DEBUG hasPermission]', { identityId, status: identity.status, roles: identity.roles, permission, rolePermissions: Object.fromEntries(Object.entries(rolePermissions).map(([k, v]) => [k, [...v]])) });
  return identity.status === "ACTIVE" && identity.roles.some((role) => rolePermissions[role]?.has(permission));`
);

fs.writeFileSync('backend/src/services/authorization/authorization.service.ts', authService, 'utf8');
console.log('patched hasPermission with debug log');

