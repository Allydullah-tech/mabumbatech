<?php
/**
 * MABUMBA TECH — Notifications
 * Every notification is stored in-app (bell dropdown) AND, where the recipient
 * has a valid email, sent by email. Email failures never block the request.
 */

/**
 * Notify whoever owns a request — a registered customer (in-app + email,
 * via notify_user) or a guest (email only, since there's no account/session
 * to show an in-app notification in). $request needs customer_id,
 * guest_name and guest_email (a plain SELECT sr.* already has all three).
 * This is the one place that "customer OR guest" branch lives, instead of
 * being repeated (and easy to forget) at every call site.
 */
function notify_request_owner(array $request, string $type, string $emailSubject, string $message, string $link = ''): void
{
    if (!empty($request['customer_id'])) {
        notify_user((int)$request['customer_id'], $type, $emailSubject, $message, $link);
    } elseif (!empty($request['guest_email'])) {
        send_email($request['guest_email'], $request['guest_name'] ?? '', $emailSubject, notification_email_body($emailSubject, $message, $link));
    }
}

/** Notify a single user by id. $link is a root-relative path, e.g. '/backend/admin/requests.php?view=5' */
function notify_user(int $userId, string $type, string $title, string $message, string $link = ''): void
{
    global $pdo;

    $stmt = $pdo->prepare('SELECT full_name, email FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) return;

    $emailSent = send_email($user['email'], $user['full_name'], $title, notification_email_body($title, $message, $link));

    $ins = $pdo->prepare('INSERT INTO notifications (user_id, type, title, message, link, email_sent) VALUES (?,?,?,?,?,?)');
    $ins->execute([$userId, $type, $title, $message, $link, $emailSent ? 1 : 0]);
}

/** Notify every user with a given role (admin covers admin + super_admin). */
function notify_role(string $role, string $type, string $title, string $message, string $link = ''): void
{
    global $pdo;
    if ($role === 'admin') {
        $rows = $pdo->query("SELECT id FROM users WHERE role IN ('admin','super_admin') AND status='active'")->fetchAll();
    } else {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE role = ? AND status='active'");
        $stmt->execute([$role]);
        $rows = $stmt->fetchAll();
    }
    foreach ($rows as $r) {
        notify_user((int)$r['id'], $type, $title, $message, $link);
    }
}

/** Notify every active admin-tier user with a specific job role (e.g. 'marketing_manager'). */
function notify_job_role(string $jobRoleKey, string $type, string $title, string $message, string $link = ''): void
{
    global $pdo;
    $stmt = $pdo->prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND job_role_key = ?");
    $stmt->execute([$jobRoleKey]);
    foreach ($stmt->fetchAll() as $r) {
        notify_user((int)$r['id'], $type, $title, $message, $link);
    }
}

/** Notify every active staff member in a given category (used for direct-category assignment alerts, if desired). */
function notify_staff_category(string $categoryKey, string $type, string $title, string $message, string $link = ''): void
{
    global $pdo;
    $stmt = $pdo->prepare("SELECT id FROM users WHERE role='staff' AND status='active' AND staff_category = ?");
    $stmt->execute([$categoryKey]);
    foreach ($stmt->fetchAll() as $r) {
        notify_user((int)$r['id'], $type, $title, $message, $link);
    }
}

function notification_email_body(string $title, string $message, string $link): string
{
    $html = '<h3 style="margin:0 0 10px;color:#0a3d8f;">' . htmlspecialchars($title, ENT_QUOTES) . '</h3>';
    $html .= '<p style="margin:0 0 16px;">' . nl2br(htmlspecialchars($message, ENT_QUOTES)) . '</p>';
    if ($link) {
        $full = full_url($link);
        $html .= '<a href="' . $full . '" style="display:inline-block;background:#0d52b8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">View Details</a>';
    }
    return $html;
}

function full_url(string $rootRelativePath): string
{
    $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . $host . base_path($rootRelativePath);
}

function get_unread_notification_count(int $userId): int
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0');
    $stmt->execute([$userId]);
    return (int)$stmt->fetchColumn();
}

function get_recent_notifications(int $userId, int $limit = 8, bool $unreadOnly = false): array
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT * FROM notifications WHERE user_id = ?' . ($unreadOnly ? ' AND is_read = 0' : '') . ' ORDER BY created_at DESC LIMIT ' . (int)$limit);
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

function mark_notifications_read(int $userId): void
{
    global $pdo;
    $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')->execute([$userId]);
}
