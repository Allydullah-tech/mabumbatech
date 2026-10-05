<?php
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_role('staff');

$counts = $pdo->prepare("SELECT
    SUM(CASE WHEN task_status='new' THEN 1 ELSE 0 END) AS new_c,
    SUM(CASE WHEN task_status='accepted' OR task_status='in_progress' THEN 1 ELSE 0 END) AS active_c,
    SUM(CASE WHEN task_status='completed' THEN 1 ELSE 0 END) AS done_c,
    COUNT(*) AS total_c
    FROM request_assignments WHERE staff_id = ?");
$counts->execute([$me['id']]);
$stat = $counts->fetch();

$recentTasks = $pdo->prepare("SELECT ra.*, sr.tracking_code, sr.subject, sr.message, sr.status AS request_status, s.name AS service_name, s.icon
    FROM request_assignments ra
    JOIN service_requests sr ON sr.id = ra.request_id
    JOIN services s ON s.id = sr.service_id
    WHERE ra.staff_id = ? ORDER BY ra.created_at DESC LIMIT 6");
$recentTasks->execute([$me['id']]);
$recentTasks = $recentTasks->fetchAll();

// Work that needs attention now: urgent priority, or a deadline within 2 days — mirrors the
// threshold used by the deadline-reminder cron, so "identify urgent work" means the same thing everywhere.
$urgentTasks = $pdo->prepare("SELECT ra.*, sr.tracking_code, sr.subject, sr.priority, sr.deadline, s.name AS service_name, s.icon
    FROM request_assignments ra
    JOIN service_requests sr ON sr.id = ra.request_id
    JOIN services s ON s.id = sr.service_id
    WHERE ra.staff_id = ? AND ra.task_status IN ('new','accepted','in_progress')
      AND (sr.priority = 'urgent' OR (sr.deadline IS NOT NULL AND sr.deadline <= DATE_ADD(CURDATE(), INTERVAL 2 DAY)))
    ORDER BY sr.deadline ASC LIMIT 6");
$urgentTasks->execute([$me['id']]);
$urgentTasks = $urgentTasks->fetchAll();

$recentlyCompleted = $pdo->prepare("SELECT ra.*, sr.tracking_code, sr.subject, s.name AS service_name, s.icon
    FROM request_assignments ra
    JOIN service_requests sr ON sr.id = ra.request_id
    JOIN services s ON s.id = sr.service_id
    WHERE ra.staff_id = ? AND ra.task_status = 'completed'
    ORDER BY ra.responded_at DESC LIMIT 5");
$recentlyCompleted->execute([$me['id']]);
$recentlyCompleted = $recentlyCompleted->fetchAll();

json_response([
    'stats' => $stat,
    'recent_tasks' => $recentTasks,
    'urgent_tasks' => $urgentTasks,
    'recently_completed' => $recentlyCompleted,
]);
