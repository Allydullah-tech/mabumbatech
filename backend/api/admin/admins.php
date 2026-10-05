<?php
/**
 * Admin/Super-Admin account management.
 *
 * Restricted to Full Admins (Super Admin, or an admin with no job role —
 * "Generic Administrator") via api_require_full_admin() — a hard role
 * check, not a permission lookup. Per spec, scoped/job-role admins must
 * NEVER be able to add, edit, or delete admin accounts, and that boundary
 * must not be reopenable by granting a permission key. Scoped admins get a
 * read-only Company Directory instead (backend/api/company/directory.php).
 */
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_full_admin();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'create_admin') {
        $fullName = trim($input['full_name'] ?? '');
        $email = trim($input['email'] ?? '');
        $phone = trim($input['phone'] ?? '');
        $position = trim($input['position_title'] ?? 'Administrator');
        $password = $input['password'] ?? '';
        // Empty string / omitted = generic Administrator (full access,
        // exactly like every admin created before this feature existed).
        $jobRoleKey = trim($input['job_role_key'] ?? '') ?: null;

        if ($fullName === '' || $email === '' || strlen($password) < 6) {
            json_response(['success' => false, 'message' => 'Please complete all fields correctly (password min 6 characters).']);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_response(['success' => false, 'message' => 'Please enter a valid email address.']);
        }
        if ($jobRoleKey !== null) {
            $chkRole = $pdo->prepare('SELECT 1 FROM job_roles WHERE job_role_key = ?');
            $chkRole->execute([$jobRoleKey]);
            if (!$chkRole->fetchColumn()) {
                json_response(['success' => false, 'message' => 'Unknown job role.']);
            }
        }
        $chk = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = ?');
        $chk->execute([$email]);
        if ((int)$chk->fetchColumn() > 0) {
            json_response(['success' => false, 'message' => 'A user with this email already exists.']);
        }

        $username = generate_username($fullName, $pdo);
        $hash = password_hash($password, PASSWORD_DEFAULT);
        // role is hardcoded to 'admin' — this endpoint can never mint a
        // second super_admin account, by design.
        $stmt = $pdo->prepare('INSERT INTO users (full_name, username, email, phone, password_hash, role, position_title, job_role_key, status, created_by) VALUES (?,?,?,?,?,"admin",?,?,"active",?)');
        $stmt->execute([$fullName, $username, $email, $phone, $hash, $position, $jobRoleKey, $me['id']]);
        log_activity($me['id'], 'Created admin account', "$fullName ($username)" . ($jobRoleKey ? " as $jobRoleKey" : ' as generic Administrator'));
        send_email($email, $fullName, 'Welcome to ' . SITE_NAME,
            notification_email_body('Welcome to the Team', 'Hi ' . $fullName . ', an administrator account has been created for you at ' . SITE_NAME . '. Your username is "' . $username . '". Please ask the person who created your account for your login password.', '/frontend/html/auth/login.html?as=admin'));

        json_response(['success' => true, 'message' => "New administrator created. Username: $username"]);
    }

    if ($action === 'update_job_role') {
        $id = (int)($input['admin_id'] ?? 0);
        $jobRoleKey = trim($input['job_role_key'] ?? '') ?: null;

        if ($id === (int)$me['id']) {
            // Changing your own job role could strip your own full-admin
            // status mid-session (job role is re-read live on every
            // request now — see current_user() in session.php) and lock
            // you out of this very page. Force another full admin to do it.
            json_response(['success' => false, 'message' => 'You cannot change your own job role. Ask another Super Administrator or Generic Administrator to do this.']);
        }

        $target = $pdo->prepare('SELECT role FROM users WHERE id = ?');
        $target->execute([$id]);
        $targetRole = $target->fetchColumn();
        if ($targetRole !== 'admin') {
            json_response(['success' => false, 'message' => 'Only Administrator accounts have a job role (Super Admin always has full access).']);
        }
        if ($jobRoleKey !== null) {
            $chkRole = $pdo->prepare('SELECT 1 FROM job_roles WHERE job_role_key = ?');
            $chkRole->execute([$jobRoleKey]);
            if (!$chkRole->fetchColumn()) {
                json_response(['success' => false, 'message' => 'Unknown job role.']);
            }
        }
        $pdo->prepare('UPDATE users SET job_role_key = ? WHERE id = ?')->execute([$jobRoleKey, $id]);
        log_activity($me['id'], 'Changed job role', "Admin #$id -> " . ($jobRoleKey ?: 'generic Administrator'));
        json_response(['success' => true, 'message' => 'Job role updated.']);
    }

    if ($action === 'toggle_status') {
        $id = (int)($input['admin_id'] ?? 0);
        $target = $pdo->prepare('SELECT role FROM users WHERE id = ?');
        $target->execute([$id]);
        $targetRole = $target->fetchColumn();

        if ($id === (int)$me['id']) {
            json_response(['success' => false, 'message' => 'You cannot change the status of your own account.']);
        }
        if ($targetRole === 'super_admin') {
            json_response(['success' => false, 'message' => 'The Super Administrator account cannot be suspended.']);
        }
        if (!$targetRole) {
            json_response(['success' => false, 'message' => 'Administrator not found.']);
        }
        $pdo->prepare("UPDATE users SET status = IF(status='active','suspended','active') WHERE id = ? AND role IN ('admin','super_admin')")->execute([$id]);
        $newStatus = $pdo->prepare('SELECT status FROM users WHERE id = ?');
        $newStatus->execute([$id]);
        log_activity($me['id'], 'Changed administrator status', "Admin #$id -> " . $newStatus->fetchColumn());
        json_response(['success' => true, 'message' => 'Administrator status updated.']);
    }

    if ($action === 'update_public_profile') {
        // Any admin — including the Super Administrator (CEO) — can be
        // switched on for the public Team page, self included. This is a
        // visibility toggle only, not a permissions/status change, so it
        // does not carry the "not yourself / not super admin" restrictions
        // that toggle_status and update_job_role enforce above.
        $id = (int)($input['admin_id'] ?? 0);
        $target = $pdo->prepare("SELECT role FROM users WHERE id = ?");
        $target->execute([$id]);
        if (!in_array($target->fetchColumn(), ['admin', 'super_admin'], true)) {
            json_response(['success' => false, 'message' => 'Administrator not found.']);
        }
        $isPublic = !empty($input['is_public_profile']) ? 1 : 0;
        $bio = trim($input['public_bio'] ?? '');
        $skills = trim($input['public_skills'] ?? '');
        if (mb_strlen($bio) > 300 || mb_strlen($skills) > 300) {
            json_response(['success' => false, 'message' => 'Bio and skills must each be under 300 characters.']);
        }
        $pdo->prepare("UPDATE users SET is_public_profile = ?, public_bio = ?, public_skills = ? WHERE id = ? AND role IN ('admin','super_admin')")
            ->execute([$isPublic, $bio ?: null, $skills ?: null, $id]);
        json_response(['success' => true, 'message' => 'Public profile updated.']);
    }

    json_error('Unknown action.');
}

// Explicit column list — never SELECT * on the users table. `password_hash`,
// `temp_code` and `security_answer_hash` must never leave the server, even
// to a fellow Full Admin's browser.
$admins = $pdo->query(
    "SELECT id, full_name, username, email, phone, role, position_title,
            job_role_key, status, is_public_profile, public_bio, public_skills,
            created_at, last_login
     FROM users WHERE role IN ('admin','super_admin')
     ORDER BY FIELD(role,'super_admin','admin'), created_at ASC"
)->fetchAll();
json_response(['admins' => $admins, 'me_id' => (int)$me['id'], 'job_roles' => all_job_roles()]);
