<?php
require_once __DIR__ . '/../../includes/api.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed.', 405);
$input = api_input();
api_require_csrf($input);

$action = $input['action'] ?? '';
$identity = trim($input['identity'] ?? '');

if ($identity === '') {
    json_response(['success' => false, 'message' => 'Please enter your username or email.']);
}

$stmt = $pdo->prepare("SELECT * FROM users WHERE (username = ? OR email = ?) AND role = 'customer' LIMIT 1");
$stmt->execute([$identity, $identity]);
$user = $stmt->fetch();

// Deliberately generic message when the account isn't found or has no security
// question set — this avoids confirming/denying whether a given email is registered.
$notAvailable = 'We could not find a security question for that account. Please contact us for help.';

if ($action === 'get_question') {
    if (!$user || empty($user['security_question'])) {
        json_response(['success' => false, 'message' => $notAvailable]);
    }
    json_response(['success' => true, 'question' => $user['security_question']]);
}

if ($action === 'verify_and_reset') {
    $answer = trim($input['security_answer'] ?? '');
    $newPassword = $input['new_password'] ?? '';
    $confirm = $input['confirm_password'] ?? '';

    if (!$user || empty($user['security_answer_hash'])) {
        json_response(['success' => false, 'message' => $notAvailable]);
    }

    // Security-question answers are low-entropy (a pet's name, a favorite
    // color) so this endpoint is the easiest account-takeover path in the
    // app if left unthrottled. Lock it down the same way as login.
    $limitKey = 'reset_answer:' . $user['id'] . ':' . client_ip();
    [$blocked, $retryAfter] = rate_limit_status($limitKey);
    if ($blocked) {
        $minutes = (int)ceil($retryAfter / 60);
        json_response(['success' => false, 'message' => "Too many failed attempts. Please try again in about {$minutes} minute" . ($minutes === 1 ? '' : 's') . '.'], 429);
    }

    if (!password_verify(mb_strtolower($answer), $user['security_answer_hash'])) {
        rate_limit_record_failure($limitKey);
        json_response(['success' => false, 'message' => 'That answer does not match our records. Please try again.']);
    }
    rate_limit_clear($limitKey);
    if (strlen($newPassword) < 6) {
        json_response(['success' => false, 'message' => 'New password must be at least 6 characters.']);
    }
    if ($newPassword !== $confirm) {
        json_response(['success' => false, 'message' => 'Passwords do not match.']);
    }

    $hash = password_hash($newPassword, PASSWORD_DEFAULT);
    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $user['id']]);
    log_activity($user['id'], 'Password reset via security question', '');

    notify_user((int)$user['id'], 'security_reset', 'Password Changed',
        'Your password was just reset using your security question. If this was not you, please contact us immediately.', '');

    json_response(['success' => true, 'message' => 'Your password has been reset. You can now log in.']);
}

json_error('Unknown action.');
