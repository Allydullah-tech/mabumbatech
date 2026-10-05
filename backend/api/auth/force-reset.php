<?php
require_once __DIR__ . '/../../includes/api.php';
$user = api_require_login();

if ($user['role'] !== 'staff' || (int)$user['must_reset'] !== 1) {
    json_error('No password reset is pending for your account.');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed.', 405);
$input = api_input();
api_require_csrf($input);

$tempCode = trim($input['temp_code'] ?? '');
$newPassword = $input['new_password'] ?? '';
$confirm = $input['confirm_password'] ?? '';

$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$user['id']]);
$dbUser = $stmt->fetch();

$errors = [];
if (!$tempCode || (string)$dbUser['temp_code'] !== $tempCode) {
    $errors[] = 'The one-digit code you entered does not match the code given by your administrator.';
}
if (strlen($newPassword) < 6) $errors[] = 'New password must be at least 6 characters.';
if ($newPassword !== $confirm) $errors[] = 'Passwords do not match.';

if ($errors) {
    json_response(['success' => false, 'message' => implode(' ', $errors)]);
}

$hash = password_hash($newPassword, PASSWORD_DEFAULT);
$pdo->prepare('UPDATE users SET password_hash = ?, must_reset = 0, temp_code = NULL WHERE id = ?')
    ->execute([$hash, $user['id']]);
$_SESSION['user']['must_reset'] = 0;
log_activity($user['id'], 'Password reset completed', 'Staff set a new password after admin reset');

json_response(['success' => true, 'redirect' => '/staff/dashboard.html']);
