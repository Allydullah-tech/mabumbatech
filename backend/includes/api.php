<?php
/**
 * MABUMBA TECH — API bootstrap
 * Every backend/api/**.php endpoint requires this file instead of includes/session.php
 * directly. It gives JSON-friendly auth guards (401/403 JSON instead of redirects),
 * since these endpoints are called by JavaScript (fetch), not by a browser navigation.
 */

// Never let PHP warnings/notices/deprecations leak into the response body — on
// many hosts (XAMPP in particular) display_errors is on by default, and any
// stray warning printed before our JSON would corrupt it, making every fetch()
// call fail with "unexpected response" even though the actual logic worked.
// Errors are still logged server-side, just not echoed into the HTTP output.
ini_set('display_errors', '0');
error_reporting(E_ALL);
ob_start();

// Turn ANY uncaught crash (missing table, PHP fatal error, etc.) across every
// single API endpoint into a readable JSON error instead of a blank 500 page —
// this is what makes real problems (like a missing database table) visible
// instead of just failing silently in the browser console.
set_exception_handler(function (Throwable $e) {
    if (ob_get_length() !== false) {
        ob_clean();
    }
    // Log the real error server-side for debugging, but never echo internals
    // (file paths, SQL, stack traces) into the HTTP response — that's a
    // straightforward information-disclosure risk on a public site. DEBUG_MODE
    // (constants.php) can be flipped on temporarily on a dev/staging box.
    error_log('[MABUMBATECH] Uncaught ' . get_class($e) . ': ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    header('Content-Type: application/json');
    $message = (defined('DEBUG_MODE') && DEBUG_MODE)
        ? 'Server error: ' . $e->getMessage()
        : 'Something went wrong on our end. Please try again, and contact support if it continues.';
    echo json_encode(['success' => false, 'message' => $message]);
    exit;
});

require_once __DIR__ . '/session.php'; // session, $pdo, constants, functions, mailer, notify
require_once __DIR__ . '/permissions.php'; // has_permission(), api_require_permission()
require_once __DIR__ . '/project_team.php'; // cross-department project visibility
require_once __DIR__ . '/crm.php'; // leads, quotations, lead->project conversion
require_once __DIR__ . '/marketing_acquisition.php'; // marketing-officer requests-on-behalf-of-customer
require_once __DIR__ . '/legal.php'; // budget requests (Marketing/Lawyer -> Ops Manager), Lawyer project comments
require_once __DIR__ . '/finance.php'; // ledger, invoices, payroll
require_once __DIR__ . '/inventory.php'; // products, stock movements, purchases
require_once __DIR__ . '/debts.php'; // payment options, credit sales, customer debts
require_once __DIR__ . '/employees.php'; // leave requests, Employees page helpers

header('Access-Control-Allow-Credentials: true');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

// Performance safety net (spec §4): the real fix for email delivery is the
// cron job documented in backend/cron/send-emails.php. This is a fallback
// for a host where that cron hasn't been set up yet, so the queue doesn't
// just grow forever — it only runs on hosts that support
// fastcgi_finish_request() (PHP-FPM), and only AFTER that function has
// already flushed the response and closed the connection to the browser,
// so it can never add latency to whatever the user just did.
if (function_exists('fastcgi_finish_request')) {
    register_shutdown_function(function () {
        fastcgi_finish_request();
        try {
            process_email_queue(5);
        } catch (Throwable $e) {
            // Never let a queue hiccup surface anywhere — the client already has its response.
        }
    });
}

function api_require_login(): array
{
    if (!is_logged_in()) {
        json_error('You must be logged in.', 401);
    }
    return current_user();
}

/** $roles: 'admin' (matches admin + super_admin), 'staff', 'customer', or an array. */
function api_require_role($roles): array
{
    $user = api_require_login();
    $roles = is_array($roles) ? $roles : [$roles];
    $userRole = $user['role'];

    $allowed = false;
    foreach ($roles as $r) {
        if ($r === 'admin' && is_admin_role($userRole)) { $allowed = true; break; }
        if ($r === $userRole) { $allowed = true; break; }
    }
    if (!$allowed) {
        json_error('You do not have permission to access this resource.', 403);
    }

    if (in_array('staff', $roles, true) && $userRole === 'staff' && (int)$user['must_reset'] === 1) {
        json_error('Your account needs a password reset before continuing.', 423);
    }

    return $user;
}

/**
 * Gate for endpoints restricted to Super Admin + Generic Admin only:
 * staff/admin account management and the Activity Log. This is a hard role
 * check — deliberately NOT expressed as a permission key — so it can never
 * be reopened for a scoped admin via job_role_permissions or a
 * user_permissions override. See is_full_admin() in session.php.
 */
function api_require_full_admin(): array
{
    $user = api_require_login();
    if (!is_full_admin($user)) {
        json_error('This area is restricted to Super Administrators and full Administrators.', 403);
    }
    return $user;
}

/** CSRF check for API POST requests (token comes from the /api/auth/me.php response). */
function api_csrf_verify(array $input): bool
{
    return isset($input['csrf_token']) && isset($_SESSION['csrf_token'])
        && hash_equals($_SESSION['csrf_token'], $input['csrf_token']);
}

function api_require_csrf(array $input): void
{
    if (!api_csrf_verify($input)) {
        json_error('Invalid or expired security token. Please refresh the page and try again.', 419);
    }
}
