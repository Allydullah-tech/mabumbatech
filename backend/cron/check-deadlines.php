<?php
/**
 * MABUMBA TECH — Deadline reminder job
 *
 * Notifies the assigned staff and all admins when a request's deadline is
 * within the next 48 hours and hasn't already been flagged (so re-running
 * this daily doesn't spam the same reminder). Not tied to session.php on
 * purpose — this needs to run from the command line / a hosting cron panel,
 * not from a logged-in browser request.
 *
 * Run daily, e.g. via crontab:
 *   0 7 * * * php /path/to/MABUMBATECH/backend/cron/check-deadlines.php
 *
 * If your host only supports "visit a URL" cron jobs, you can instead hit:
 *   https://yourdomain.com/backend/cron/check-deadlines.php?key=YOUR_CRON_SECRET
 * Set CRON_SECRET in backend/config/constants.php to something random first —
 * without it, this endpoint refuses to run over HTTP.
 */

require_once __DIR__ . '/../config/constants.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/mailer.php';
require_once __DIR__ . '/../includes/notify.php';

$isCli = (php_sapi_name() === 'cli');

if (!$isCli) {
    $key = $_GET['key'] ?? '';
    if (!defined('CRON_SECRET') || CRON_SECRET === '' || CRON_SECRET === 'change-this-to-a-random-string' || !hash_equals(CRON_SECRET, $key)) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Forbidden. Set CRON_SECRET in constants.php and pass it as ?key=']);
        exit;
    }
}

$stmt = $pdo->query("
    SELECT id, subject, tracking_code, deadline
    FROM service_requests
    WHERE deadline IS NOT NULL
      AND deadline_reminder_sent = 0
      AND status NOT IN ('completed', 'delivered', 'cancelled')
      AND deadline <= DATE_ADD(CURDATE(), INTERVAL 2 DAY)
");
$dueSoon = $stmt->fetchAll();

$sent = 0;
foreach ($dueSoon as $req) {
    $dueDate = date('d M Y', strtotime($req['deadline']));
    $title = 'Deadline Approaching: ' . $req['subject'];
    $message = 'The deadline for "' . $req['subject'] . '" (' . $req['tracking_code'] . ') is ' . $dueDate . '.';

    $staffStmt = $pdo->prepare("SELECT DISTINCT staff_id FROM request_assignments WHERE request_id = ? AND task_status != 'declined'");
    $staffStmt->execute([$req['id']]);
    foreach ($staffStmt->fetchAll() as $s) {
        notify_user((int)$s['staff_id'], 'deadline_approaching', $title, $message, '/backend/staff/task-view.php?id=' . $req['id']);
    }
    notify_role('admin', 'deadline_approaching', $title, $message, '/backend/admin/requests.php?view=' . $req['id']);

    $pdo->prepare('UPDATE service_requests SET deadline_reminder_sent = 1 WHERE id = ?')->execute([$req['id']]);
    $sent++;
}

if ($isCli) {
    echo "Deadline check complete: {$sent} request(s) flagged, reminders sent." . PHP_EOL;
} else {
    header('Content-Type: application/json');
    echo json_encode(['success' => true, 'requests_flagged' => $sent]);
}
