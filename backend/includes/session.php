<?php
/**
 * MABUMBA TECH — Session bootstrap + auth guards
 */

if (session_status() === PHP_SESSION_NONE) {
    // Harden the session cookie explicitly rather than relying on the host's
    // php.ini defaults, which vary (and are frequently insecure) across
    // shared hosting: HttpOnly blocks JS/XSS access to the cookie, SameSite=Lax
    // stops it being sent on cross-site requests (CSRF), and Secure is only
    // set when the connection is actually HTTPS so local/dev HTTP still works.
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

require_once __DIR__ . '/../config/constants.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/notify.php';

/**
 * Resolves the logged-in user from the DATABASE on every call, keyed only by
 * the id stored in the session — never trusts a cached snapshot for
 * security-relevant fields (role, status, job_role_key, must_reset).
 *
 * This closes two real vulnerabilities that existed when $_SESSION['user']
 * carried a full snapshot taken at login time:
 *
 *   1. PRIVILEGE ESCALATION: the snapshot never included `job_role_key`, so
 *      permissions.php's `empty($user['job_role_key'])` check was ALWAYS
 *      true for every admin, silently granting every scoped admin (e.g. a
 *      Secretary or Sales Officer) full Super-Admin-equivalent access for
 *      the lifetime of their session.
 *   2. STALE AUTHORIZATION: suspending a staff/admin account, or changing
 *      their job role, had no effect until they logged out and back in —
 *      a suspended user's existing session kept working.
 *
 * A request-local cache means this is at most one extra query per request,
 * not per call.
 */
function current_user(): ?array
{
    static $cached = null;
    static $resolved = false;
    if ($resolved) {
        return $cached;
    }
    $resolved = true;

    $id = $_SESSION['user']['id'] ?? null;
    if (!$id) {
        return null;
    }

    global $pdo;
    $stmt = $pdo->prepare(
        'SELECT id, full_name, username, email, phone, role, staff_category,
                position_title, job_role_key, status, must_reset, avatar, last_login
         FROM users WHERE id = ?'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    // Account deleted or suspended since the session was created — the
    // session cookie itself stays valid (rotating it on every request would
    // be wasteful), but auth now fails immediately rather than after logout.
    if (!$row || $row['status'] !== 'active') {
        $cached = null;
        return null;
    }

    $cached = $row;
    return $row;
}

function is_logged_in(): bool
{
    return current_user() !== null;
}

/** Treat 'admin' as meaning "any admin-level role" (admin or super_admin). */
function is_admin_role(?string $role): bool
{
    return in_array($role, ['admin', 'super_admin'], true);
}

function is_super_admin(): bool
{
    $user = current_user();
    return $user !== null && $user['role'] === 'super_admin';
}

/**
 * "Full Admin" = Super Admin OR an admin-tier account with no specific job
 * role assigned (a "Generic Administrator"). Per spec, both tiers get
 * unrestricted access to every module AND exclusive control over
 * staff/admin account management and the Activity Log — regardless of
 * anything in the job_role_permissions / user_permissions override tables.
 *
 * This is intentionally a hard role check, not a permission lookup: the
 * permission system (permissions.php) is for shaping what a *scoped* admin
 * can do within their job, and must never be able to grant scoped admins
 * the ability to manage other admins/staff or read the audit trail — those
 * two capabilities are an organizational boundary, not a configurable
 * permission.
 */
function is_full_admin(?array $user = null): bool
{
    $user = $user ?? current_user();
    if (!$user) {
        return false;
    }
    return $user['role'] === 'super_admin'
        || ($user['role'] === 'admin' && empty($user['job_role_key']));
}

function require_login(string $redirect = '/frontend/html/auth/login.html'): void
{
    if (!is_logged_in()) {
        redirect(base_path($redirect));
    }
}

/**
 * $roles accepts 'admin' (matches admin + super_admin), 'staff', 'customer',
 * or an array combining them.
 */
function require_role($roles, string $redirect = '/frontend/html/auth/login.html'): void
{
    require_login($redirect);
    $roles = is_array($roles) ? $roles : [$roles];
    $userRole = current_user()['role'];

    $allowed = false;
    foreach ($roles as $r) {
        if ($r === 'admin' && is_admin_role($userRole)) { $allowed = true; break; }
        if ($r === $userRole) { $allowed = true; break; }
    }

    if (!$allowed) {
        redirect(base_path('/frontend/html/auth/login.html'));
    }
}
