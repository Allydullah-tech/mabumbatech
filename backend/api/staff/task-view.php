<?php
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_role('staff');

$requestId = (int)($_GET['id'] ?? ($_POST['request_id'] ?? 0));
$stmt = $pdo->prepare('SELECT * FROM request_assignments WHERE request_id = ? AND staff_id = ?');
$stmt->execute([$requestId, $me['id']]);
$assignment = $stmt->fetch();

if (!$assignment) json_error('That task was not found in your list.', 404);

mark_thread_read($requestId, $me['id']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'accept') {
        if ($assignment['task_status'] !== 'new') {
            json_error('This task has already been ' . $assignment['task_status'] . '.');
        }
        $pdo->prepare('UPDATE request_assignments SET task_status = "accepted", responded_at = NOW() WHERE id = ?')->execute([$assignment['id']]);
        if ($assignment['is_broadcast']) {
            $pdo->prepare('UPDATE request_assignments SET task_status = "declined" WHERE request_id = ? AND id != ?')
                ->execute([$requestId, $assignment['id']]);
        }
        $pdo->prepare('UPDATE service_requests SET status = "in_progress" WHERE id = ?')->execute([$requestId]);
        json_response(['success' => true, 'message' => 'Task accepted.']);
    }

    if ($action === 'decline') {
        if ($assignment['task_status'] !== 'new') {
            json_error('This task has already been ' . $assignment['task_status'] . '.');
        }
        $pdo->prepare('UPDATE request_assignments SET task_status = "declined", responded_at = NOW() WHERE id = ?')->execute([$assignment['id']]);
        json_response(['success' => true, 'message' => 'Task declined.']);
    }

    if ($action === 'update_progress') {
        $progress = (int)($input['progress'] ?? 0);
        $internalNotes = array_key_exists('internal_notes', $input) ? trim($input['internal_notes']) : null;

        $r = $pdo->prepare('SELECT customer_id, guest_name, guest_email, subject, tracking_code, progress FROM service_requests WHERE id = ?');
        $r->execute([$requestId]);
        $before = $r->fetch();

        update_request_progress($requestId, $progress, $internalNotes);
        // Moving progress off zero on an assigned task implicitly starts it.
        $pdo->prepare("UPDATE service_requests SET status = 'in_progress' WHERE id = ? AND status = 'assigned'")->execute([$requestId]);

        if ($before && (int)$before['progress'] !== max(0, min(100, $progress))) {
            notify_request_owner($before, 'progress_update', 'Progress Update: ' . $before['subject'],
                'Your project "' . $before['subject'] . '" (' . $before['tracking_code'] . ') is now ' . max(0, min(100, $progress)) . '% complete.',
                '/backend/customer/request-view.php?id=' . $requestId);
        }
        json_response(['success' => true, 'message' => 'Progress updated.']);
    }

    if ($action === 'send_for_review') {
        $pdo->prepare("UPDATE service_requests SET status = 'review' WHERE id = ?")->execute([$requestId]);
        notify_role('admin', 'status_change', 'Ready for Review', $me['full_name'] . ' marked request #' . $requestId . ' ready for review.', '/backend/admin/requests.php?view=' . $requestId);
        json_response(['success' => true, 'message' => 'Sent to admin for review.']);
    }

    if ($action === 'add_link') {
        $err = add_project_link(
            $requestId, $me['id'],
            $input['title'] ?? '', $input['url'] ?? '', $input['link_type'] ?? 'other',
            $input['description'] ?? '', !empty($input['is_customer_visible'])
        );
        if ($err) json_error($err);
        if (!empty($input['is_customer_visible'])) {
            $r = $pdo->prepare('SELECT customer_id, guest_name, guest_email, subject, tracking_code FROM service_requests WHERE id = ?');
            $r->execute([$requestId]);
            if ($rr = $r->fetch()) {
                notify_request_owner($rr, 'project_link', 'New Project Link: ' . $rr['subject'],
                    'A new link has been added to your project "' . $rr['subject'] . '" (' . $rr['tracking_code'] . ').',
                    '/backend/customer/request-view.php?id=' . $requestId);
            }
        }
        json_response(['success' => true, 'message' => 'Link added.']);
    }

    if ($action === 'delete_link') {
        delete_project_link((int)($input['link_id'] ?? 0), $requestId);
        json_response(['success' => true, 'message' => 'Link removed.']);
    }

    // Milestones were removed per the system restructuring spec ("remove
    // complicated milestones and unnecessary project-management features").
    // add_milestone / update_milestone_status / delete_milestone actions,
    // and their helper functions in includes/functions.php, are intentionally
    // no longer called here.

    if ($action === 'update_remark') {
        $remark = trim($input['remark'] ?? '');
        $pdo->prepare('UPDATE request_assignments SET remark = ? WHERE id = ?')->execute([$remark, $assignment['id']]);
        json_response(['success' => true, 'message' => 'Work remark saved.']);
    }

    if ($action === 'complete') {
        if ($assignment['task_status'] === 'completed') {
            json_error('This task has already been marked as completed.');
        }
        $remark = trim($input['remark'] ?? '');
        $pdo->prepare('UPDATE request_assignments SET task_status = "completed", remark = ?, responded_at = NOW() WHERE id = ?')
            ->execute([$remark, $assignment['id']]);
        $pdo->prepare('UPDATE service_requests SET status = "completed", completed_at = NOW() WHERE id = ?')->execute([$requestId]);

        $r = $pdo->prepare('SELECT customer_id, guest_name, guest_email, subject, tracking_code FROM service_requests WHERE id = ?');
        $r->execute([$requestId]);
        $rr = $r->fetch();
        if ($rr) {
            if (!empty($rr['customer_id'])) {
                notify_user((int)$rr['customer_id'], 'status_change', 'Request Completed: ' . $rr['subject'],
                    'Great news! Your request "' . $rr['subject'] . '" (' . $rr['tracking_code'] . ') has been completed.',
                    '/backend/customer/request-view.php?id=' . $requestId);
            } elseif (!empty($rr['guest_email'])) {
                send_email($rr['guest_email'], $rr['guest_name'], 'Your request has been completed',
                    notification_email_body('Request Completed', 'Your request "' . $rr['subject'] . '" (' . $rr['tracking_code'] . ') has been completed.', ''));
            }
        }
        notify_role('admin', 'task_completed', 'Task Completed', 'A task on request #' . $requestId . ' was marked completed by ' . $me['full_name'] . '.', '/backend/admin/requests.php?view=' . $requestId);
        json_response(['success' => true, 'message' => 'Task marked as completed.']);
    }

    if ($action === 'post_message') {
        $message = trim($input['message'] ?? '');
        if ($message !== '') post_request_message($requestId, $me['id'], 'staff', $message);
        json_response(['success' => true, 'message' => 'Message sent.']);
    }

    if ($action === 'edit_message') {
        $err = edit_request_message($requestId, (int)($input['message_id'] ?? 0), (int)$me['id'], $input['message'] ?? '');
        json_response(['success' => !$err, 'message' => $err ?: 'Message updated.']);
    }

    if ($action === 'delete_message') {
        $err = delete_request_message($requestId, (int)($input['message_id'] ?? 0), (int)$me['id'], 'staff');
        json_response(['success' => !$err, 'message' => $err ?: 'Message deleted.']);
    }

    if ($action === 'upload_attachment' && !empty($_FILES['attachment']['name'])) {
        $err = save_request_attachment($requestId, $me['id'], $_FILES['attachment']);
        if (!$err) {
            $r = $pdo->prepare('SELECT customer_id, guest_name, guest_email, subject, tracking_code FROM service_requests WHERE id = ?');
            $r->execute([$requestId]);
            if ($rr = $r->fetch()) {
                notify_request_owner($rr, 'file_uploaded', 'New File: ' . $rr['subject'],
                    'A new file has been added to your project "' . $rr['subject'] . '" (' . $rr['tracking_code'] . ').',
                    '/backend/customer/request-view.php?id=' . $requestId);
            }
        }
        json_response(['success' => !$err, 'message' => $err ?: 'File attached successfully.']);
    }

    json_error('Unknown action.');
}

$stmt = $pdo->prepare("SELECT sr.*, s.name AS service_name, s.icon FROM service_requests sr JOIN services s ON s.id = sr.service_id WHERE sr.id = ?");
$stmt->execute([$requestId]);
$req = $stmt->fetch();

json_response([
    'request' => $req,
    'assignment' => $assignment,
    'attachments' => get_request_attachments($requestId),
    'thread' => get_request_thread($requestId),
    'links' => get_project_links($requestId),
    'link_types' => PROJECT_LINK_TYPES,
    'viewer_id' => (int)$me['id'],
]);
