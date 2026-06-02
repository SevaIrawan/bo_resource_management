/**
 * Validasi aturan hak akses (username → admin/operator).
 * Jalankan: node scripts/validate-user-permissions.mjs
 */
import assert from 'node:assert/strict';

const ADMIN_USERNAME = 'admin';

function resolveAppRoleFromUsername(userName) {
  if (userName.trim().toLowerCase() === ADMIN_USERNAME) return 'admin';
  return 'operator';
}

function permissionsForRole(role) {
  const isAdmin = role === 'admin';
  return {
    canManageStructure: isAdmin,
    canOperatePlatform: isAdmin,
    canAutoSync: isAdmin,
    canAdminSettings: isAdmin,
  };
}

const cases = [
  ['Admin', 'admin'],
  ['admin', 'admin'],
  ['ADMIN', 'admin'],
  ['Executive', 'operator'],
  ['manager_sgd', 'operator'],
  ['telor ijo', 'operator'],
  ['administrator', 'operator'],
];

for (const [user, expected] of cases) {
  assert.equal(resolveAppRoleFromUsername(user), expected, `role ${user}`);
  const p = permissionsForRole(expected);
  if (expected === 'admin') {
    assert.equal(p.canOperatePlatform, true);
    assert.equal(p.canManageStructure, true);
  } else {
    assert.equal(p.canOperatePlatform, false);
    assert.equal(p.canManageStructure, false);
  }
}

console.log(`OK: ${cases.length} username → role cases passed.`);
