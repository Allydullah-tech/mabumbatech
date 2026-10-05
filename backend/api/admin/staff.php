<?php
/**
 * Service Staff account management.
 *
 * Restricted to Full Admins (Super Admin, or an admin with no job role —
 * "Generic Administrator") via api_require_full_admin() — a hard role
 * check, not a permission lookup. Previously gated by the `employees.manage`
 * permission, which the General Manager job role held by default; per the
 * updated spec, NO scoped/job-role admin may add, edit, suspend, or reset
 * staff accounts, so that permission grant has been revoked (see
 * database/migration_020_rbac_hardening.sql) and this hard check added as
 * defense-in-depth so it can't be reopened via a future permission grant.
 * Scoped admins get a read-only Company Directory instead
 * (backend/api/company/directory.php).
 */
require_once __DIR__ . '/../../includes/api.php';
$admin = api_require_full_admin();

function department_exists(PDO $pdo, string $key): bool
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM departments WHERE dept_key = ?');
    $stmt->execute([$key]);
    return (int)$stmt->fetchColumn() > 0;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'create_staff') {
        $fullName = trim($input['full_name'] ?? '');
        $email = trim($input['email'] ?? '');
        $phone = trim($input['phone'] ?? '');
        $category = trim($input['staff_category'] ?? '');
        $position = trim($input['position_title'] ?? '');
        $password = $input['password'] ?? '';

        if ($fullName === '' || $email === '' || !department_exists($pdo, $category) || strlen($password) < 6) {
            json_response(['success' => false, 'message' => 'Please complete all required fields correctly (password min 6 characters).']);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_response(['success' => false, 'message' => 'Please enter a valid email address.']);
        }
        $chk = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = ?');
        $chk->execute([$email]);
        if ((int)$chk->fetchColumn() > 0) {
            json_response(['success' => false, 'message' => 'A user with this email already exists.']);
        }

        $username = generate_username($fullName, $pdo);
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare('INSERT INTO users (full_name, username, email, phone, password_hash, role, staff_category, position_title, status, created_by) VALUES (?,?,?,?,?,"staff",?,?,"active",?)');
        $stmt->execute([$fullName, $username, $email, $phone, $hash, $category, $position ?: category_label($category), $admin['id']]);
        log_activity($admin['id'], 'Created staff account', "$fullName ($username)");
        send_email($email, $fullName, 'Welcome to ' . SITE_NAME,
            notification_email_body('Welcome to the Team', 'Hi ' . $fullName . ', an account has been created for you at ' . SITE_NAME . ' as ' . category_label($category) . '. Your username is "' . $username . '". Please ask your administrator for your login password.', '/frontend/html/auth/login.html?as=staff'));

        json_response(['success' => true, 'message' => "Staff account created. Username: $username"]);
    }

    if ($action === 'reset_password') {
        $staffId = (int)($input['staff_id'] ?? 0);
        $digit = (string)random_int(1, 9);
        $hash = password_hash($digit, PASSWORD_DEFAULT);
        $pdo->prepare('UPDATE users SET password_hash = ?, must_reset = 1, temp_code = ? WHERE id = ? AND role = "staff"')
            ->execute([$hash, $digit, $staffId]);
        $u = $pdo->prepare('SELECT full_name, username, email FROM users WHERE id = ?');
        $u->execute([$staffId]);
        $resetForUser = $u->fetch();
        if (!$resetForUser) {
            json_response(['success' => false, 'message' => 'Staff account not found.']);
        }
        log_activity($admin['id'], 'Reset staff password', "Staff #$staffId given temp code");
        send_email($resetForUser['email'], $resetForUser['full_name'], 'Your account access was reset',
            notification_email_body('Account Access Reset', 'An administrator has reset your account access. Please contact them directly for your one-digit login code, then set a new password when you log in.', '/frontend/html/auth/login.html?as=staff'));

        json_response([
            'success' => true,
            'message' => 'Password reset. Give this one-digit code to ' . $resetForUser['full_name'] . ' directly.',
            'temp_code' => $digit,
            'staff_name' => $resetForUser['full_name'],
        ]);
    }

    if ($action === 'toggle_status') {
        $staffId = (int)($input['staff_id'] ?? 0);
        $pdo->prepare("UPDATE users SET status = IF(status='active','suspended','active') WHERE id = ? AND role = 'staff'")->execute([$staffId]);
        $newStatus = $pdo->prepare("SELECT status FROM users WHERE id = ? AND role = 'staff'");
        $newStatus->execute([$staffId]);
        $statusVal = $newStatus->fetchColumn();
        if ($statusVal === false) {
            json_response(['success' => false, 'message' => 'Staff account not found.']);
        }
        log_activity($admin['id'], 'Changed staff status', "Staff #$staffId -> $statusVal");
        json_response(['success' => true, 'message' => 'Staff status updated.']);
    }

    if ($action === 'update_category') {
        $staffId = (int)($input['staff_id'] ?? 0);
        $category = trim($input['staff_category'] ?? '');
        $position = trim($input['position_title'] ?? '');
        if (department_exists($pdo, $category)) {
            $pdo->prepare('UPDATE users SET staff_category = ?, position_title = ? WHERE id = ? AND role = "staff"')
                ->execute([$category, $position ?: category_label($category), $staffId]);
            log_activity($admin['id'], 'Updated staff position', "Staff #$staffId -> $category");
            json_response(['success' => true, 'message' => 'Staff position updated.']);
        }
        json_response(['success' => false, 'message' => 'Invalid department.']);
    }

    if ($action === 'update_public_profile') {
        $staffId = (int)($input['staff_id'] ?? 0);
        $isPublic = !empty($input['is_public_profile']) ? 1 : 0;
        $bio = trim($input['public_bio'] ?? '');
        $skills = trim($input['public_skills'] ?? '');
        if (mb_strlen($bio) > 300 || mb_strlen($skills) > 300) {
            json_response(['success' => false, 'message' => 'Bio and skills must each be under 300 characters.']);
        }
        $pdo->prepare('UPDATE users SET is_public_profile = ?, public_bio = ?, public_skills = ? WHERE id = ? AND role = "staff"')
            ->execute([$isPublic, $bio ?: null, $skills ?: null, $staffId]);
        json_response(['success' => true, 'message' => 'Public profile updated.']);
    }

    json_error('Unknown action.');
}

// Explicit column list — never SELECT * on the users table. `password_hash`,
// `temp_code` (a live one-digit login code during a pending reset) and
// `security_answer_hash` must never leave the server.
$staffList = $pdo->query(
    "SELECT id, full_name, username, email, phone, role, staff_category, position_title,
            status, must_reset, is_public_profile, public_bio, public_skills, created_at, last_login
     FROM users WHERE role = 'staff' ORDER BY created_at DESC"
)->fetchAll();
$departments = $pdo->query('SELECT * FROM departments ORDER BY is_custom ASC, label ASC')->fetchAll();
json_response(['staff' => $staffList, 'departments' => $departments]);
