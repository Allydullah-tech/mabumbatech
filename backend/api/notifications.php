<?php
require_once __DIR__ . '/../includes/api.php';
$user = api_require_login();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? 'mark_all';

    if ($action === 'mark_one') {
        $id = (int)($input['id'] ?? 0);
        $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')->execute([$id, (int)$user['id']]);
        json_response(['success' => true]);
    }

    mark_notifications_read((int)$user['id']);
    json_response(['success' => true]);
}

$limit = min(100, max(1, (int)($_GET['limit'] ?? 8)));

json_response([
    'unread_count' => get_unread_notification_count((int)$user['id']),
    'notifications' => get_recent_notifications((int)$user['id'], $limit, !empty($_GET['unread_only'])),
]);
