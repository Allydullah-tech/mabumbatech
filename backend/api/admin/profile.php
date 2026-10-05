<?php
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_role('admin');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'update_profile') {
        $fullName = trim($input['full_name'] ?? '');
        $phone = trim($input['phone'] ?? '');
        $position = trim($input['position_title'] ?? '');
        $pdo->prepare('UPDATE users SET full_name = ?, phone = ?, position_title = ? WHERE id = ?')
            ->execute([$fullName, $phone, $position, $me['id']]);
        $_SESSION['user']['full_name'] = $fullName;
        $_SESSION['user']['phone'] = $phone;
        $_SESSION['user']['position_title'] = $position;
        json_response(['success' => true, 'message' => 'Profile updated successfully.']);
    }

    if ($action === 'change_password') {
        $current = $input['current_password'] ?? '';
        $new = $input['new_password'] ?? '';
        $confirm = $input['confirm_password'] ?? '';
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$me['id']]);
        $hash = $stmt->fetchColumn();
        if (!password_verify($current, $hash)) {
            json_response(['success' => false, 'message' => 'Current password is incorrect.']);
        }
        if (strlen($new) < 6 || $new !== $confirm) {
            json_response(['success' => false, 'message' => 'New password must be at least 6 characters and match confirmation.']);
        }
        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $me['id']]);
        json_response(['success' => true, 'message' => 'Password changed successfully.']);
    }

    if ($action === 'update_avatar') {
        $err = save_avatar_upload($me['id'], $_FILES['avatar'] ?? []);
        if ($err) {
            json_response(['success' => false, 'message' => $err]);
        }
        $fresh = $pdo->prepare('SELECT avatar FROM users WHERE id = ?');
        $fresh->execute([$me['id']]);
        $avatar = $fresh->fetchColumn();
        $_SESSION['user']['avatar'] = $avatar;
        json_response(['success' => true, 'message' => 'Photo updated.', 'avatar' => $avatar]);
    }

    json_error('Unknown action.');
}

json_response(['user' => $me]);
