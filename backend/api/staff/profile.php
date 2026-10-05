<?php
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_role('staff');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    if (($input['action'] ?? '') === 'update_profile') {
        $phone = trim($input['phone'] ?? '');
        $pdo->prepare('UPDATE users SET phone = ? WHERE id = ?')->execute([$phone, $me['id']]);
        $_SESSION['user']['phone'] = $phone;
        json_response(['success' => true, 'message' => 'Contact details updated.']);
    }
    if (($input['action'] ?? '') === 'update_avatar') {
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
