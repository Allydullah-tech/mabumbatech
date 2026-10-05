<?php
/**
 * MABUMBA TECH — Permissions (RBAC) helper
 *
 * Sits alongside the existing role system (users.role: super_admin /
 * admin / staff / customer) rather than replacing it. That broad role
 * still controls which *kind* of dashboard someone gets and is checked
 * with require_role()/api_require_role() exactly as before.
 *
 * This file answers a narrower question for admin-tier accounts only:
 * "can THIS admin, given their job role (Accountant, Secretary, Sales
 * Officer, ...) and any personal overrides, do THIS specific thing?"
 *
 * super_admin always returns true — per the spec, the CEO has
 * unrestricted access unless a future protected system-owner layer is
 * added on top.
 */

/**
 * Returns the effective permission keys for one user: their job role's
 * template, with any personal overrides (grants or revokes) applied.
 */
function effective_permissions(array $user): array
{
    global $pdo;

    if (is_full_admin($user)) {
        // Full access. This covers super_admin AND every admin-tier account
        // that has no specific job role assigned — which is every admin
        // account that existed before this permissions system did, plus any
        // new admin deliberately created as a generic/full Administrator.
        // Without this, adding job_role_key would silently strip every
        // existing admin down to zero permissions the moment any endpoint
        // started checking api_require_permission().
        $stmt = $pdo->query('SELECT permission_key FROM permissions');
        return array_column($stmt->fetchAll(), 'permission_key');
    }

    if ($user['role'] !== 'admin') {
        // Plain 'staff'/'customer' accounts get nothing here — they're
        // governed entirely by their existing role-based guards.
        return [];
    }

    $stmt = $pdo->prepare('SELECT permission_key FROM job_role_permissions WHERE job_role_key = ?');
    $stmt->execute([$user['job_role_key']]);
    $keys = array_column($stmt->fetchAll(), 'permission_key');

    $stmt = $pdo->prepare('SELECT permission_key, granted FROM user_permissions WHERE user_id = ?');
    $stmt->execute([$user['id']]);
    foreach ($stmt->fetchAll() as $row) {
        $has = in_array($row['permission_key'], $keys, true);
        if ((int)$row['granted'] === 1 && !$has) {
            $keys[] = $row['permission_key'];
        } elseif ((int)$row['granted'] === 0 && $has) {
            $keys = array_values(array_diff($keys, [$row['permission_key']]));
        }
    }

    // Hard organizational boundary — never overridable via user_permissions.
    // Staff/admin account management and the audit trail are gated by role
    // (is_full_admin()), not by permission key, so no per-user grant can
    // reopen them for a scoped admin. Strip them defensively even if stale
    // rows exist from before this rule was introduced.
    $keys = array_values(array_diff($keys, ['users.manage', 'employees.manage', 'audit.view']));

    // The Sales Officer works with inventory, recording sales and damaged stock —
    // NOT the Sales & Leads pipeline (leads/quotations belong to marketing and
    // management). Same defensive rule as above: stripped here so it holds even
    // if an old database row or personal override still grants it.
    if (($user['job_role_key'] ?? null) === 'sales_officer') {
        $keys = array_values(array_diff($keys, ['sales.view', 'sales.manage']));
    }

    return $keys;
}

function has_permission(array $user, string $permissionKey): bool
{
    if (is_full_admin($user)) {
        return true;
    }
    return in_array($permissionKey, effective_permissions($user), true);
}

/**
 * Use inside an API endpoint after api_require_login()/api_require_role().
 * Ends the request with a 403 JSON response if the permission is missing.
 */
function api_require_permission(string $permissionKey): array
{
    $user = api_require_login();
    if (!has_permission($user, $permissionKey)) {
        json_error('You do not have permission to access this resource.', 403);
    }
    return $user;
}

/** Like api_require_permission(), but passes if the user has ANY of the given keys. */
function api_require_any_permission(array $permissionKeys): array
{
    $user = api_require_login();
    foreach ($permissionKeys as $key) {
        if (has_permission($user, $key)) return $user;
    }
    json_error('You do not have permission to access this resource.', 403);
}

/** All permissions, grouped by category — for a future "Manage Roles" admin screen. */
function all_permissions_grouped(): array
{
    global $pdo;
    $rows = $pdo->query('SELECT permission_key, category, label FROM permissions ORDER BY category, label')->fetchAll();
    $grouped = [];
    foreach ($rows as $row) {
        $grouped[$row['category']][] = $row;
    }
    return $grouped;
}

/** All job roles — for populating a job-role dropdown when creating/editing an admin. */
function all_job_roles(): array
{
    global $pdo;
    return $pdo->query('SELECT job_role_key, label, icon FROM job_roles ORDER BY label')->fetchAll();
}
