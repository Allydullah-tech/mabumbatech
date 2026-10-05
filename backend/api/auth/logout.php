<?php
require_once __DIR__ . '/../../includes/api.php';

if (is_logged_in()) {
    log_activity(current_user()['id'], 'Logout', role_label(current_user()['role']) . ' logged out');
}
$_SESSION = [];
session_destroy();
session_start();

json_response(['success' => true, 'redirect' => '/auth/login.html']);
