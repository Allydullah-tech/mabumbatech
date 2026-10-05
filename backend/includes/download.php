<?php
require_once __DIR__ . '/session.php';
$me = current_user();

$id = (int)($_GET['id'] ?? 0);
$stmt = $pdo->prepare('SELECT ra.*, sr.customer_id, sr.tracking_code FROM request_attachments ra
    JOIN service_requests sr ON sr.id = ra.request_id WHERE ra.id = ?');
$stmt->execute([$id]);
$file = $stmt->fetch();

if (!$file) {
    http_response_code(404);
    die('File not found.');
}

$allowed = false;
if ($me && is_admin_role($me['role'])) {
    $allowed = true;
} elseif ($me && $me['role'] === 'customer' && (int)$file['customer_id'] === (int)$me['id']) {
    $allowed = true;
} elseif ($me && $me['role'] === 'staff') {
    $chk = $pdo->prepare("SELECT COUNT(*) FROM request_assignments WHERE request_id = ? AND staff_id = ? AND task_status != 'declined'");
    $chk->execute([$file['request_id'], $me['id']]);
    $allowed = (int)$chk->fetchColumn() > 0;
} elseif (!$me && $file['customer_id'] === null) {
    // Guest (no account) request: the tracking code IS the access token here —
    // the same trust boundary the public tracking page already uses. Only
    // applies to requests with no customer_id, so a registered customer's
    // files still always require logging in, exactly as before.
    $code = trim($_GET['code'] ?? '');
    $allowed = $code !== '' && hash_equals((string)$file['tracking_code'], $code);
}

if (!$allowed) {
    http_response_code(403);
    die('You do not have access to this file.');
}

$path = __DIR__ . '/../uploads/requests/' . $file['request_id'] . '/' . $file['stored_name'];
if (!file_exists($path)) {
    http_response_code(404);
    die('File not found on server.');
}

header('Content-Type: ' . ($file['mime_type'] ?: 'application/octet-stream'));
header('Content-Disposition: attachment; filename="' . basename($file['original_name']) . '"');
header('Content-Length: ' . filesize($path));
readfile($path);
exit;
