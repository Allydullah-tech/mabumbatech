<?php
require_once __DIR__ . '/../../includes/api.php';
$admin = api_require_role('admin');
api_require_permission('settings.manage');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'save_mail') {
        set_setting('mail_method', in_array($input['mail_method'] ?? '', ['php_mail', 'smtp'], true) ? $input['mail_method'] : 'php_mail');
        set_setting('mail_from_email', trim($input['mail_from_email'] ?? ''));
        set_setting('mail_from_name', trim($input['mail_from_name'] ?? ''));
        set_setting('smtp_host', trim($input['smtp_host'] ?? ''));
        set_setting('smtp_port', trim($input['smtp_port'] ?? '587'));
        set_setting('smtp_username', trim($input['smtp_username'] ?? ''));
        if (!empty($input['smtp_password'])) {
            set_setting('smtp_password', $input['smtp_password']);
        }
        set_setting('smtp_secure', in_array($input['smtp_secure'] ?? '', ['tls', 'ssl', ''], true) ? $input['smtp_secure'] : 'tls');
        log_activity($admin['id'], 'Updated mail settings', '');
        json_response(['success' => true, 'message' => 'Mail settings saved.']);
    }

    if ($action === 'send_test') {
        $to = trim($input['test_email'] ?? '');
        if (filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $ok = send_email($to, 'Test Recipient', 'MABUMBA TECH — Test Email',
                notification_email_body('Test Email', 'This is a test message confirming your mail settings are working correctly.', ''));
            json_response(['success' => $ok, 'message' => $ok ? 'Test email sent successfully.' : 'Could not send the test email. Please check your settings.']);
        }
        json_response(['success' => false, 'message' => 'Please enter a valid email address.']);
    }

    json_error('Unknown action.');
}

json_response([
    'settings' => [
        'mail_method' => get_setting('mail_method'),
        'mail_from_email' => get_setting('mail_from_email'),
        'mail_from_name' => get_setting('mail_from_name'),
        'smtp_host' => get_setting('smtp_host'),
        'smtp_port' => get_setting('smtp_port'),
        'smtp_username' => get_setting('smtp_username'),
        'smtp_secure' => get_setting('smtp_secure'),
    ],
]);
