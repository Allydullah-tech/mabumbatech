<?php
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_role('admin');
api_require_permission('messages.manage');

// Contact messages are an inbox with a time-filtered history. Passing a
// customer on to the manager is done in person, so nothing here creates leads
// or sales.

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'mark_read') {
        $pdo->prepare('UPDATE contact_messages SET is_read = 1 WHERE id = ?')->execute([(int)($input['msg_id'] ?? 0)]);
        json_response(['success' => true]);
    }

    json_error('Unknown action.');
}

// ---- GET ----

/**
 * Turns a period name (or custom from/to) into [period, from, to, label];
 * from/to are 'Y-m-d' (null = no limit). Default is "all" so nothing is hidden.
 */
function msg_period_range(string $period, string $from, string $to, string $today): array
{
    $t = new DateTimeImmutable($today);
    $valid = function (string $d): bool {
        return (bool)preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
    };
    switch ($period) {
        case 'today':
            return ['today', $today, $today, 'Today'];
        case 'yesterday':
            $d = $t->modify('-1 day')->format('Y-m-d');
            return ['yesterday', $d, $d, 'Yesterday'];
        case 'week':
            return ['week', $t->modify('monday this week')->format('Y-m-d'), $today, 'This week'];
        case 'month':
            return ['month', $t->format('Y-m-01'), $today, 'This month'];
        case 'last_month':
            return ['last_month', $t->modify('first day of last month')->format('Y-m-d'), $t->modify('last day of last month')->format('Y-m-d'), 'Last month'];
        case 'year':
            return ['year', $t->format('Y-01-01'), $today, 'This year'];
        case 'custom':
            $okFrom = $valid($from);
            $okTo = $valid($to);
            if ($okFrom || $okTo) {
                if (!$okFrom) $from = $to;
                if (!$okTo) $to = $from;
                if ($from > $to) { $tmp = $from; $from = $to; $to = $tmp; }
                $label = $from === $to ? date('j M Y', strtotime($from)) : date('j M Y', strtotime($from)) . ' – ' . date('j M Y', strtotime($to));
                return ['custom', $from, $to, $label];
            }
            break;
    }
    return ['all', null, null, 'All time'];
}

$today = (string)$pdo->query('SELECT CURDATE()')->fetchColumn();
[$period, $from, $to, $periodLabel] = msg_period_range(
    (string)($_GET['period'] ?? 'all'), trim($_GET['from'] ?? ''), trim($_GET['to'] ?? ''), $today
);

$win = '';
$params = [];
if ($from !== null) { $win .= ' AND created_at >= ?'; $params[] = $from . ' 00:00:00'; }
if ($to !== null)   { $win .= ' AND created_at <= ?'; $params[] = $to . ' 23:59:59'; }

// Totals for the chosen period (not affected by the status filter).
$sumStmt = $pdo->prepare("SELECT COUNT(*) AS total, COALESCE(SUM(is_read = 0), 0) AS unread, COALESCE(SUM(is_read = 1), 0) AS read_count FROM contact_messages WHERE 1=1 $win");
$sumStmt->execute($params);
$summary = array_map('intval', $sumStmt->fetch());

$status = (string)($_GET['status'] ?? 'all');
$statusSql = '';
if ($status === 'new')       $statusSql = ' AND is_read = 0';
elseif ($status === 'read')  $statusSql = ' AND is_read = 1';
else                         $status = 'all';

$LIMIT = 500;
$stmt = $pdo->prepare("SELECT id, name, email, phone, subject, message, is_read, created_at FROM contact_messages WHERE 1=1 $win $statusSql ORDER BY created_at DESC, id DESC LIMIT $LIMIT");
$stmt->execute($params);
$messages = $stmt->fetchAll();

json_response([
    'messages' => $messages,
    'summary' => $summary,
    'range' => ['period' => $period, 'from' => $from, 'to' => $to, 'label' => $periodLabel, 'status' => $status],
    'limit_reached' => count($messages) >= $LIMIT,
]);
