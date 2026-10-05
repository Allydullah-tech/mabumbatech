<?php
/**
 * Activity Log / Audit Trail — read-only.
 *
 * Restricted to Full Admins (Super Admin, or an admin with no job role —
 * "Generic Administrator") via api_require_full_admin() — a hard role
 * check, not a permission lookup, so it can never be reopened for a scoped
 * admin through a permission grant. The `audit.view` permission key still
 * exists in the catalogue for forward compatibility but is no longer
 * sufficient on its own (see migration_020_rbac_hardening.sql, which also
 * revokes its default grant to the Data/Reports Officer job role).
 */
require_once __DIR__ . '/../../includes/api.php';
api_require_full_admin();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed.', 405);
}

$page = max(1, (int)($_GET['page'] ?? 1));
$perPage = 25;
$offset = ($page - 1) * $perPage;

$search = trim($_GET['q'] ?? '');           // matches actor name or details
$actionFilter = trim($_GET['action'] ?? ''); // exact action label from the dropdown
$from = trim($_GET['from'] ?? '');           // YYYY-MM-DD
$to = trim($_GET['to'] ?? '');               // YYYY-MM-DD

$where = [];
$params = [];

if ($search !== '') {
    $where[] = '(actor_name LIKE ? OR details LIKE ? OR action LIKE ?)';
    $like = '%' . $search . '%';
    array_push($params, $like, $like, $like);
}
if ($actionFilter !== '') {
    $where[] = 'action = ?';
    $params[] = $actionFilter;
}
if ($from !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
    $where[] = 'created_at >= ?';
    $params[] = $from . ' 00:00:00';
}
if ($to !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
    $where[] = 'created_at <= ?';
    $params[] = $to . ' 23:59:59';
}

$whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

$countStmt = $pdo->prepare("SELECT COUNT(*) FROM activity_logs $whereSql");
$countStmt->execute($params);
$total = (int)$countStmt->fetchColumn();

$stmt = $pdo->prepare(
    "SELECT id, user_id, actor_name, actor_role, action, details, ip_address, created_at
     FROM activity_logs
     $whereSql
     ORDER BY created_at DESC, id DESC
     LIMIT $perPage OFFSET $offset"
);
$stmt->execute($params);
$logs = $stmt->fetchAll();

// Distinct action labels seen so far, to populate the filter dropdown.
$actions = $pdo->query('SELECT DISTINCT action FROM activity_logs ORDER BY action ASC')->fetchAll(PDO::FETCH_COLUMN);

json_response([
    'logs' => $logs,
    'actions' => $actions,
    'page' => $page,
    'per_page' => $perPage,
    'total' => $total,
    'total_pages' => max(1, (int)ceil($total / $perPage)),
]);
