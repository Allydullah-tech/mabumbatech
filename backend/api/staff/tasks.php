<?php
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_role('staff');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';
    $assignmentId = (int)($input['assignment_id'] ?? 0);

    $stmt = $pdo->prepare('SELECT * FROM request_assignments WHERE id = ? AND staff_id = ?');
    $stmt->execute([$assignmentId, $me['id']]);
    $assignment = $stmt->fetch();

    if (!$assignment) json_error('Task not found.', 404);

    if ($action === 'accept') {
        if ($assignment['task_status'] !== 'new') {
            json_error('This task has already been ' . $assignment['task_status'] . '.');
        }
        $pdo->prepare('UPDATE request_assignments SET task_status = "accepted", responded_at = NOW() WHERE id = ?')->execute([$assignmentId]);
        if ($assignment['is_broadcast']) {
            $pdo->prepare('UPDATE request_assignments SET task_status = "declined" WHERE request_id = ? AND id != ?')
                ->execute([$assignment['request_id'], $assignmentId]);
        }
        $pdo->prepare('UPDATE service_requests SET status = "in_progress" WHERE id = ?')->execute([$assignment['request_id']]);
        log_activity($me['id'], 'Accepted task', "Assignment #$assignmentId");
        json_response(['success' => true, 'message' => 'Task accepted. It now appears in your active work.']);
    }

    if ($action === 'decline') {
        if ($assignment['task_status'] !== 'new') {
            json_error('This task has already been ' . $assignment['task_status'] . '.');
        }
        $pdo->prepare('UPDATE request_assignments SET task_status = "declined", responded_at = NOW() WHERE id = ?')->execute([$assignmentId]);
        json_response(['success' => true, 'message' => 'Task declined.']);
    }

    if ($action === 'complete') {
        if ($assignment['task_status'] === 'completed') {
            json_error('This task has already been marked as completed.');
        }
        $remark = trim($input['remark'] ?? '');
        $pdo->prepare('UPDATE request_assignments SET task_status = "completed", remark = ?, responded_at = NOW() WHERE id = ?')
            ->execute([$remark, $assignmentId]);
        $pdo->prepare('UPDATE service_requests SET status = "completed", completed_at = NOW() WHERE id = ?')->execute([$assignment['request_id']]);
        log_activity($me['id'], 'Completed task', "Assignment #$assignmentId");

        $r = $pdo->prepare('SELECT customer_id, guest_name, guest_email, subject, tracking_code FROM service_requests WHERE id = ?');
        $r->execute([$assignment['request_id']]);
        $rr = $r->fetch();
        if ($rr) {
            if (!empty($rr['customer_id'])) {
                notify_user((int)$rr['customer_id'], 'status_change', 'Request Completed: ' . $rr['subject'],
                    'Great news! Your request "' . $rr['subject'] . '" (' . $rr['tracking_code'] . ') has been completed.',
                    '/backend/customer/request-view.php?id=' . $assignment['request_id']);
            } elseif (!empty($rr['guest_email'])) {
                send_email($rr['guest_email'], $rr['guest_name'], 'Your request has been completed',
                    notification_email_body('Request Completed', 'Your request "' . $rr['subject'] . '" (' . $rr['tracking_code'] . ') has been completed.', ''));
            }
        }
        notify_role('admin', 'task_completed', 'Task Completed', 'A task on request #' . $assignment['request_id'] . ' was marked completed by ' . $me['full_name'] . '.', '/backend/admin/requests.php?view=' . $assignment['request_id']);
        json_response(['success' => true, 'message' => 'Task marked as completed. Great work!']);
    }

    json_error('Unknown action.');
}

$tab = $_GET['tab'] ?? 'all';
$sql = "SELECT ra.*, sr.tracking_code, sr.subject, sr.message, sr.guest_name, sr.guest_email, sr.progress, sr.priority, sr.deadline, s.name AS service_name, s.icon
    FROM request_assignments ra
    JOIN service_requests sr ON sr.id = ra.request_id
    JOIN services s ON s.id = sr.service_id
    WHERE ra.staff_id = ?";
$params = [$me['id']];
if ($tab !== 'all') {
    $sql .= " AND ra.task_status = ?";
    $params[] = $tab;
}
$sql .= " ORDER BY (sr.priority = 'urgent') DESC, (sr.deadline IS NOT NULL AND sr.deadline <= DATE_ADD(CURDATE(), INTERVAL 2 DAY)) DESC, ra.created_at DESC";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$tasks = $stmt->fetchAll();

$unread = get_thread_unread_counts(array_column($tasks, 'request_id'), (int)$me['id'], false);
foreach ($tasks as &$t) {
    $t['unread_messages'] = $unread[(int)$t['request_id']] ?? 0;
}
unset($t);

json_response(['tasks' => $tasks]);
