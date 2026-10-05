<?php
require_once __DIR__ . '/../../includes/api.php';

/**
 * BUGFIX: this used to gate the whole Dashboard behind
 * api_require_any_permission(['reports.operational', 'reports.financial']).
 * Those two permissions are only granted to a handful of job roles (General
 * Manager, Store Manager, Marketing Manager, Accountant, Data/Reports
 * Officer) — every OTHER scoped admin (Secretary, Sales Officer, ...)
 * got a 403 here and the Dashboard simply never
 * loaded for them after login, even though they are fully authorized
 * admin-tier accounts.
 *
 * The Dashboard is the landing overview for every admin account, not a
 * restricted module — access to the individual modules it links to
 * (Finance, Sales, Employees, ...) is still independently permission-gated in
 * their own endpoints exactly as before. So this only needs to confirm the
 * caller is logged in as an admin-tier account (admin or super_admin).
 */
$me = api_require_role('admin');

$totalStaff = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='staff'")->fetchColumn();
$totalAdmins = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role IN ('admin','super_admin')")->fetchColumn();
$totalCustomers = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='customer'")->fetchColumn();
$newCustomersWeek = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='customer' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")->fetchColumn();
$pending = (int)$pdo->query("SELECT COUNT(*) FROM service_requests WHERE status='pending'")->fetchColumn();
$inProgress = (int)$pdo->query("SELECT COUNT(*) FROM service_requests WHERE status IN ('assigned','in_progress','review')")->fetchColumn();
$completed = (int)$pdo->query("SELECT COUNT(*) FROM service_requests WHERE status IN ('completed','delivered')")->fetchColumn();
$urgent = (int)$pdo->query("SELECT COUNT(*) FROM service_requests WHERE priority='urgent' AND status NOT IN ('completed','delivered','cancelled')")->fetchColumn();
$unreadMsgs = (int)$pdo->query("SELECT COUNT(*) FROM contact_messages WHERE is_read = 0")->fetchColumn();

// Recent Requests = service requests AND product requests (registered through Customer Acquisition).
// A product request has no service_id, so this must be a LEFT JOIN — the old inner JOIN silently dropped them.
// Product requests follow the same visibility rule as the Customer Acquisition module: a plain Marketing
// Officer (no review permission, not a full admin, not the Operations Manager) only sees the ones they
// registered or were forwarded; everyone else with access to this dashboard sees them all.
$dashIsOpsManager = ($me['job_role_key'] ?? null) === 'general_manager';
$dashProductOwnOnly = !has_permission($me, 'marketing.acquisition.manage') && !is_full_admin($me) && !$dashIsOpsManager;
$recentSql = "SELECT sr.*, s.name AS service_name, COALESCE(s.icon, 'bi-box-seam') AS icon,
        pt.name AS product_type_name
    FROM service_requests sr
    LEFT JOIN services s ON s.id = sr.service_id
    LEFT JOIN product_types pt ON pt.id = sr.product_type_id
    WHERE (sr.request_type <> 'product'";
$recentParams = [];
if ($dashProductOwnOnly) {
    $recentSql .= " OR sr.created_by_staff_id = ? OR sr.id IN (SELECT ra.request_id FROM request_assignments ra WHERE ra.staff_id = ?)";
    $recentParams = [(int)$me['id'], (int)$me['id']];
} else {
    $recentSql .= " OR 1 = 1";
}
$recentSql .= ") ORDER BY sr.created_at DESC LIMIT 8";
$recentStmt = $pdo->prepare($recentSql);
$recentStmt->execute($recentParams);
$recentRequests = $recentStmt->fetchAll();

$categoryLoad = $pdo->query("SELECT s.category_key, s.name, COUNT(sr.id) AS total
    FROM services s LEFT JOIN service_requests sr ON sr.service_id = s.id
    GROUP BY s.id ORDER BY total DESC")->fetchAll();

// Staff activity feed — recent admin/staff-attributed actions, for "what's happening" at a glance.
// Restricted to full admins (Super Admin / CEO / Generic Admin); scoped job-role
// admins (Secretary, Sales Officer, Accountant, ...) don't need or get this detail.
$staffActivity = is_full_admin($me) ? $pdo->query("SELECT al.action, al.details, al.created_at, u.full_name, u.role
    FROM activity_logs al JOIN users u ON u.id = al.user_id
    WHERE u.role IN ('staff','admin','super_admin')
    ORDER BY al.created_at DESC LIMIT 8")->fetchAll() : [];

// Recent conversation activity across all requests (distinct from the site's public contact form).
$recentThreadMessages = $pdo->query("SELECT rm.message, rm.sender_role, rm.created_at, sr.id AS request_id, sr.request_type, sr.subject, sr.tracking_code, u.full_name
    FROM request_messages rm
    JOIN service_requests sr ON sr.id = rm.request_id
    LEFT JOIN users u ON u.id = rm.sender_id
    ORDER BY rm.created_at DESC LIMIT 6")->fetchAll();

$recentNotifications = get_recent_notifications((int)current_user()['id'], 5);

// Service demand over the last 6 months, for a simple trend view.
$demandTrend = $pdo->query("SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, COUNT(*) AS c
    FROM service_requests
    WHERE created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 5 MONTH)
    GROUP BY ym ORDER BY ym ASC")->fetchAll();

json_response([
    'stats' => [
        'staff' => $totalStaff, 'admins' => $totalAdmins, 'customers' => $totalCustomers,
        'new_customers_week' => $newCustomersWeek,
        'pending' => $pending, 'in_progress' => $inProgress, 'completed' => $completed,
        'urgent' => $urgent, 'unread_messages' => $unreadMsgs,
    ],
    'recent_requests' => $recentRequests,
    'category_load' => $categoryLoad,
    'staff_activity' => $staffActivity,
    'recent_thread_messages' => $recentThreadMessages,
    'recent_notifications' => $recentNotifications,
    'demand_trend' => $demandTrend,
]);
