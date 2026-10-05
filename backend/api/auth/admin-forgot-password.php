<?php
/**
 * MABUMBA TECH — Administrator Password Reset (email-based)
 *
 * Separate from backend/api/auth/forgot-password.php (customer, security
 * question) because Administrator accounts (Super Admin/CEO and job-role
 * admins) recover access via a secure emailed link instead. Staff accounts
 * are unaffected — they're still reset by an administrator via temp_code.
 *
 * Actions:
 *   request_reset  { email }
 *   reset_password { token, new_password, confirm_password }
 */
require_once __DIR__ . '/../../includes/api.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed.', 405);
$input = api_input();
api_require_csrf($input);

$action = $input['action'] ?? '';

// Always the same message whether or not the email matches an administrator
// account, so this endpoint can't be used to discover which emails are
// registered as admins.
$genericSent = 'If that email belongs to an administrator account, a password-reset link has been sent to it.';

if ($action === 'request_reset') {
    $email = trim($input['email'] ?? '');
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(['success' => false, 'message' => 'Please enter a valid email address.']);
    }

    // Throttle by email+IP so this can't be used to spam an admin's inbox
    // or brute-force-probe which emails exist.
    $limitKey = 'admin_reset_request:' . strtolower($email) . ':' . client_ip();
    [$blocked] = rate_limit_status($limitKey);
    if ($blocked) {
        json_response(['success' => true, 'message' => $genericSent]);
    }
    rate_limit_record_failure($limitKey);

    $stmt = $pdo->prepare("SELECT id, full_name, email FROM users WHERE email = ? AND role IN ('admin','super_admin') AND status = 'active' LIMIT 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user) {
        $rawToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawToken);
        $expiresAt = date('Y-m-d H:i:s', time() + 1800); // 30 minutes

        $pdo->prepare('INSERT INTO password_resets (user_id, token_hash, expires_at, requested_ip) VALUES (?,?,?,?)')
            ->execute([$user['id'], $tokenHash, $expiresAt, client_ip()]);

        $resetLink = full_url('/frontend/html/auth/admin-reset-password.html?token=' . $rawToken);
        send_email(
            $user['email'],
            $user['full_name'],
            'Reset Your MABUMBA TECH Password',
            '<p>We received a request to reset the password for your administrator account.</p>'
            . '<p><a href="' . htmlspecialchars($resetLink, ENT_QUOTES) . '" style="display:inline-block;background:#0d52b8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">Reset Password</a></p>'
            . '<p style="color:#5b6b85;font-size:12px;">This link expires in 30 minutes. If you did not request this, you can safely ignore this email — your password will not be changed.</p>'
        );
        log_activity($user['id'], 'Requested password reset', 'via email link');
    }

    json_response(['success' => true, 'message' => $genericSent]);
}

if ($action === 'reset_password') {
    $token = trim($input['token'] ?? '');
    $newPassword = $input['new_password'] ?? '';
    $confirm = $input['confirm_password'] ?? '';

    if ($token === '') {
        json_response(['success' => false, 'message' => 'Missing or invalid reset link.']);
    }
    if (strlen($newPassword) < 6) {
        json_response(['success' => false, 'message' => 'New password must be at least 6 characters.']);
    }
    if ($newPassword !== $confirm) {
        json_response(['success' => false, 'message' => 'Passwords do not match.']);
    }

    $tokenHash = hash('sha256', $token);
    $stmt = $pdo->prepare('SELECT * FROM password_resets WHERE token_hash = ? LIMIT 1');
    $stmt->execute([$tokenHash]);
    $reset = $stmt->fetch();

    if (!$reset || $reset['used_at'] !== null || strtotime($reset['expires_at']) < time()) {
        json_response(['success' => false, 'message' => 'This reset link is invalid or has expired. Please request a new one.']);
    }

    $stmt = $pdo->prepare("SELECT id, full_name, email FROM users WHERE id = ? AND role IN ('admin','super_admin') LIMIT 1");
    $stmt->execute([$reset['user_id']]);
    $user = $stmt->fetch();
    if (!$user) {
        json_response(['success' => false, 'message' => 'This reset link is invalid or has expired. Please request a new one.']);
    }

    $hash = password_hash($newPassword, PASSWORD_DEFAULT);
    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $user['id']]);
    $pdo->prepare('UPDATE password_resets SET used_at = NOW() WHERE id = ?')->execute([$reset['id']]);
    // Invalidate any other still-live reset links for this account.
    $pdo->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL')->execute([$user['id']]);

    log_activity($user['id'], 'Password reset via email link', '');
    notify_user((int)$user['id'], 'security_reset', 'Password Changed',
        'Your password was just reset using the email reset link. If this was not you, please contact us immediately.', '');

    json_response(['success' => true, 'message' => 'Your password has been reset. You can now log in.']);
}

json_error('Unknown action.');
