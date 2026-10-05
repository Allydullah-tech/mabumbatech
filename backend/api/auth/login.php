<?php
require_once __DIR__ . '/../../includes/api.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed.', 405);
$input = api_input();
api_require_csrf($input);

$identity = trim($input['identity'] ?? '');
$password = $input['password'] ?? '';
$expectedRole = $input['expected_role'] ?? 'staff';

// Customer accounts have been removed system-wide (spec: no customer
// login). Block the 'customer' portal outright, even if someone posts it
// directly — not just hidden from the login page's tabs.
if ($expectedRole === 'customer') {
    json_error('Customer accounts are no longer used. Please use the Request a Service form instead.');
}

// Brute-force protection: throttle by identity + IP so repeated wrong
// passwords against one account (or from one source) get locked out
// temporarily instead of allowing unlimited guesses.
$limitKey = 'login:' . mb_strtolower($identity) . ':' . client_ip();
[$blocked, $retryAfter] = rate_limit_status($limitKey);
if ($blocked) {
    $minutes = (int)ceil($retryAfter / 60);
    json_error("Too many failed attempts. Please try again in about {$minutes} minute" . ($minutes === 1 ? '' : 's') . '.', 429);
}

$stmt = $pdo->prepare('SELECT * FROM users WHERE (username = ? OR email = ?) LIMIT 1');
$stmt->execute([$identity, $identity]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    rate_limit_record_failure($limitKey);
    json_error('Invalid username/email or password.');
}

rate_limit_clear($limitKey);

$userIsAdminLevel = is_admin_role($user['role']);
$roleMatches = ($expectedRole === 'admin' && $userIsAdminLevel) || ($user['role'] === $expectedRole);
if (!$roleMatches) {
    json_error('This account is not registered under the ' . ucfirst($expectedRole) . ' portal. Please choose the correct tab.');
}

if ($user['status'] !== 'active') {
    json_error('Your account has been suspended. Please contact the administrator.');
}

// Only the id is trusted in the session. Every other field (role, status,
// job_role_key, must_reset, ...) is re-read from the database on every
// request by current_user() — see backend/includes/session.php — so that
// permission changes, suspensions, and job-role reassignments take effect
// immediately instead of only after the next login.
session_regenerate_id(true); // rotate the session id on every login (session fixation)
$_SESSION['user'] = ['id' => (int)$user['id']];

$pdo->prepare('UPDATE users SET last_login = NOW() WHERE id = ?')->execute([$user['id']]);
log_activity($user['id'], 'Login', role_label($user['role']) . ' logged in');

if ($user['role'] === 'staff' && (int)$user['must_reset'] === 1) {
    json_response(['success' => true, 'redirect' => '/auth/force-reset.html']);
}

$home = '/customer/dashboard.html';
if (is_admin_role($user['role'])) $home = '/admin/dashboard.html';
elseif ($user['role'] === 'staff') $home = '/staff/dashboard.html';

json_response(['success' => true, 'redirect' => $home]);
