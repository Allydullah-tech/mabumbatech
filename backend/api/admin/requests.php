<?php
require_once __DIR__ . '/../../includes/api.php';
$admin = api_require_role('admin');
// 'post_message' is deliberately allowed under the lighter projects.comment
// permission (e.g. the Lawyer, spec §8: "can add comments, concerns, or
// legal observations to projects") — every other action here (assign,
// status, links, milestones, attachments) still requires projects.manage.
// The per-action check just below enforces that split.
api_require_any_permission($_SERVER['REQUEST_METHOD'] !== 'POST'
    ? ['projects.view']
    : ['projects.manage', 'projects.comment']);

// The Lawyer reads projects (details, links, attached files) so they can write
// their notes in the Lawyer Desk — they never change anything here. Managers,
// Super Admin and Generic Admin keep full control. Enforced server-side so it
// can't be bypassed from the browser.
$isLawyerViewOnly = ($admin['job_role_key'] ?? null) === 'lawyer' && !is_full_admin($admin);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';
    $requestId = (int)($input['request_id'] ?? 0);

    if ($isLawyerViewOnly) {
        json_error('You have view-only access to service requests. Please record your notes in the Lawyer Desk.', 403);
    }

    if ($action !== 'post_message' && !has_permission($admin, 'projects.manage')) {
        json_error('You do not have permission to make changes here.', 403);
    }

    if ($action === 'assign') {
        $stmt = $pdo->prepare('SELECT sr.*, s.category_key, s.is_broadcast, s.name AS service_name FROM service_requests sr LEFT JOIN services s ON s.id = sr.service_id WHERE sr.id = ?');
        $stmt->execute([$requestId]);
        $req = $stmt->fetch();

        if (!$req) json_error('Request not found.', 404);

        // A Marketing Officer's PRODUCT request is assigned only to the Super Admin, a General Admin
        // or a Sales Officer, and follows pending -> in progress -> completed (see marketing_acquisition.php).
        if (($req['request_type'] ?? '') === 'product') {
            $err = forward_acquisition_request($requestId, (int)($input['staff_id'] ?? 0), (int)$admin['id']);
            json_response(['success' => !$err, 'message' => $err ?: 'Request assigned successfully.']);
        }

        if ($req['is_broadcast']) {
            // Prevent a repeat click from re-broadcasting and re-notifying every staff member again.
            $already = $pdo->prepare('SELECT COUNT(*) FROM request_assignments WHERE request_id = ?');
            $already->execute([$requestId]);
            if ($already->fetchColumn() > 0) {
                json_error('This request has already been broadcast to staff.');
            }
            $staffAll = $pdo->query("SELECT id FROM users WHERE role='staff' AND status='active'")->fetchAll();
            $ins = $pdo->prepare('INSERT IGNORE INTO request_assignments (request_id, staff_id, is_broadcast, task_status) VALUES (?,?,1,"new")');
            foreach ($staffAll as $s) { $ins->execute([$requestId, $s['id']]); }
            log_activity($admin['id'], 'Broadcast request', "Request #$requestId sent to all staff");
            notify_role('staff', 'task_broadcast', 'New Open Request: ' . $req['subject'],
                'A new "' . $req['service_name'] . '" request is open to any available staff member. First to accept owns the task.',
                '/backend/staff/tasks.php?tab=new');
        } else {
            $staffId = (int)($input['staff_id'] ?? 0);
            if ($staffId) {
                // Don't just trust whatever id the client sent — confirm this is
                // actually a legitimate assignee for this request: either an
                // active specialist in the matching service category (or any
                // active staff member, for requests with no category), or one
                // of the administrator roles the spec allows for administrative
                // assignment (Super Admin/CEO, General Admin, Manager/Operations).
                $eligible = $pdo->prepare("
                    SELECT 1 FROM users WHERE id = ? AND status = 'active' AND (
                        (role = 'staff' AND (? IS NULL OR staff_category = ?))
                        OR role = 'super_admin'
                        OR (role = 'admin' AND job_role_key IS NULL)
                        OR (role = 'admin' AND job_role_key = 'general_manager')
                    )
                ");
                $eligible->execute([$staffId, $req['category_key'], $req['category_key']]);
                if (!$eligible->fetchColumn()) {
                    json_error('That person is not available for assignment on this request.');
                }

                // Prevent a repeat click from re-assigning the same staff member and re-notifying them.
                $already = $pdo->prepare('SELECT COUNT(*) FROM request_assignments WHERE request_id = ? AND staff_id = ?');
                $already->execute([$requestId, $staffId]);
                if ($already->fetchColumn() > 0) {
                    json_error('This request is already assigned to that staff member.');
                }
                $pdo->prepare('INSERT IGNORE INTO request_assignments (request_id, staff_id, is_broadcast, task_status) VALUES (?,?,0,"new")')
                    ->execute([$requestId, $staffId]);
                log_activity($admin['id'], 'Assigned request', "Request #$requestId -> staff #$staffId");

                $assigneeRole = $pdo->prepare('SELECT role FROM users WHERE id = ?');
                $assigneeRole->execute([$staffId]);
                $isStaffAssignee = $assigneeRole->fetchColumn() === 'staff';
                notify_user($staffId, 'task_assigned', 'New Task Assigned: ' . $req['subject'],
                    ($isStaffAssignee
                        ? 'You have been assigned a new "' . $req['service_name'] . '" request. Please review and accept it.'
                        : 'The request "' . $req['subject'] . '" (' . $req['tracking_code'] . ') has been forwarded to you for administrative handling.'),
                    $isStaffAssignee ? '/backend/staff/task-view.php?id=' . $requestId : '/backend/admin/requests.php?view=' . $requestId);
            }
        }
        $pdo->prepare('UPDATE service_requests SET status = "assigned", assigned_by = ?, assigned_at = NOW() WHERE id = ?')
            ->execute([$admin['id'], $requestId]);

        if (!empty($req['customer_id'])) {
            notify_user((int)$req['customer_id'], 'status_change', 'Request Assigned: ' . $req['subject'],
                'Your request "' . $req['subject'] . '" (' . $req['tracking_code'] . ') has been assigned to a specialist.',
                '/backend/customer/request-view.php?id=' . $requestId);
        } elseif (!empty($req['guest_email'])) {
            send_email($req['guest_email'], $req['guest_name'], 'Your request has been assigned',
                notification_email_body('Request Assigned', 'Your request "' . $req['subject'] . '" (' . $req['tracking_code'] . ') has been assigned to our team.', ''));
        }
        json_response(['success' => true, 'message' => 'Request assigned successfully.']);
    }

    if ($action === 'update_status') {
        $status = $input['status'] ?? '';
        $note = trim($input['admin_note'] ?? '');
        if (!in_array($status, PROJECT_STATUSES, true)) {
            json_error('Invalid status.');
        }
        // Product requests only have three steps — pending, in progress, completed — and
        // completing one also notifies the Accountant. Handled by the acquisition logic.
        $typeRow = $pdo->prepare('SELECT request_type FROM service_requests WHERE id = ?');
        $typeRow->execute([$requestId]);
        if ($typeRow->fetchColumn() === 'product') {
            $current = get_acquisition_request($requestId);
            if ($current && $current['status'] === $status) {
                json_response(['success' => true, 'message' => 'Request status updated.']);
            }
            if (!in_array($status, ['in_progress', 'completed'], true)) {
                json_error('A product request can only be Pending, In progress or Completed.');
            }
            if ($status === 'completed') {
                // Completing a product deal means a real sale (stock, income, profit), which needs the
                // product/quantity/price/payment details — those are entered in Marketing & Acquisition.
                json_error('To complete a product request, open it in Marketing & Customer Acquisition and press the Deal Done — Sale Made button so the sale is recorded.');
            }
            $err = update_product_progress($requestId, $status, (int)$admin['id'], $note);
            json_response(['success' => !$err, 'message' => $err ?: 'Request status updated.']);
        }
        $extraSql = '';
        if ($status === 'completed') $extraSql = ', completed_at = NOW()';
        if ($status === 'delivered') $extraSql = ', completed_at = COALESCE(completed_at, NOW()), delivered_at = NOW()';
        $pdo->prepare("UPDATE service_requests SET status = ?, admin_note = ? $extraSql WHERE id = ?")
            ->execute([$status, $note, $requestId]);

        $r = $pdo->prepare('SELECT customer_id, guest_name, guest_email, subject, tracking_code FROM service_requests WHERE id = ?');
        $r->execute([$requestId]);
        $rr = $r->fetch();
        $statusLabel = ucwords(str_replace('_', ' ', $status));
        if ($rr) {
            if (!empty($rr['customer_id'])) {
                notify_user((int)$rr['customer_id'], 'status_change', 'Request Status Updated: ' . $statusLabel,
                    'Your request "' . $rr['subject'] . '" (' . $rr['tracking_code'] . ') is now "' . $statusLabel . '".' . ($note ? ' Note: ' . $note : ''),
                    '/backend/customer/request-view.php?id=' . $requestId);
            } elseif (!empty($rr['guest_email'])) {
                send_email($rr['guest_email'], $rr['guest_name'], 'Your request status changed to ' . $statusLabel,
                    notification_email_body('Status Updated: ' . $statusLabel, 'Your request "' . $rr['subject'] . '" (' . $rr['tracking_code'] . ') is now "' . $statusLabel . '".' . ($note ? ' Note: ' . $note : ''), ''));
            }
        }
        json_response(['success' => true, 'message' => 'Request status updated.']);
    }

    if ($action === 'update_progress') {
        $progress = (int)($input['progress'] ?? 0);
        $internalNotes = array_key_exists('internal_notes', $input) ? trim($input['internal_notes']) : null;

        $r = $pdo->prepare('SELECT customer_id, guest_name, guest_email, subject, tracking_code, progress FROM service_requests WHERE id = ?');
        $r->execute([$requestId]);
        $before = $r->fetch();

        update_request_progress($requestId, $progress, $internalNotes);
        log_activity($admin['id'], 'Updated project progress', "Request #$requestId -> {$progress}%");

        if ($before && (int)$before['progress'] !== max(0, min(100, $progress))) {
            notify_request_owner($before, 'progress_update', 'Progress Update: ' . $before['subject'],
                'Your project "' . $before['subject'] . '" (' . $before['tracking_code'] . ') is now ' . max(0, min(100, $progress)) . '% complete.',
                '/backend/customer/request-view.php?id=' . $requestId);
        }
        json_response(['success' => true, 'message' => 'Progress updated.']);
    }

    if ($action === 'add_link') {
        $err = add_project_link(
            $requestId, $admin['id'],
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
        log_activity($admin['id'], 'Added project link', "Request #$requestId");
        json_response(['success' => true, 'message' => 'Link added.']);
    }

    if ($action === 'delete_link') {
        delete_project_link((int)($input['link_id'] ?? 0), $requestId);
        json_response(['success' => true, 'message' => 'Link removed.']);
    }

    if ($action === 'add_milestone') {
        $err = add_project_milestone($requestId, $admin['id'], $input['title'] ?? '', $input['description'] ?? '', $input['due_date'] ?? null);
        if ($err) json_error($err);
        $r = $pdo->prepare('SELECT customer_id, guest_name, guest_email, subject, tracking_code FROM service_requests WHERE id = ?');
        $r->execute([$requestId]);
        if ($rr = $r->fetch()) {
            notify_request_owner($rr, 'milestone_update', 'Progress Update: ' . $rr['subject'],
                'A new milestone — "' . trim($input['title'] ?? '') . '" — has been added to your project "' . $rr['subject'] . '" (' . $rr['tracking_code'] . ').',
                '/backend/customer/request-view.php?id=' . $requestId);
        }
        json_response(['success' => true, 'message' => 'Milestone added.']);
    }

    if ($action === 'update_milestone_status') {
        update_project_milestone_status((int)($input['milestone_id'] ?? 0), $requestId, $input['status'] ?? '');
        $r = $pdo->prepare('SELECT customer_id, guest_name, guest_email, subject, tracking_code FROM service_requests WHERE id = ?');
        $r->execute([$requestId]);
        if ($rr = $r->fetch()) {
            notify_request_owner($rr, 'milestone_update', 'Progress Update: ' . $rr['subject'],
                'A milestone on your project "' . $rr['subject'] . '" (' . $rr['tracking_code'] . ') is now: ' . str_replace('_', ' ', $input['status'] ?? '') . '.',
                '/backend/customer/request-view.php?id=' . $requestId);
        }
        json_response(['success' => true, 'message' => 'Milestone updated.']);
    }

    if ($action === 'delete_milestone') {
        delete_project_milestone((int)($input['milestone_id'] ?? 0), $requestId);
        json_response(['success' => true, 'message' => 'Milestone removed.']);
    }

    if ($action === 'post_message') {
        $message = trim($input['message'] ?? '');
        if ($message !== '' && $requestId) {
            post_request_message($requestId, $admin['id'], $admin['role'], $message);
        }
        json_response(['success' => true, 'message' => 'Message sent.']);
    }

    if ($action === 'edit_message') {
        $err = edit_request_message($requestId, (int)($input['message_id'] ?? 0), (int)$admin['id'], $input['message'] ?? '');
        json_response(['success' => !$err, 'message' => $err ?: 'Message updated.']);
    }

    if ($action === 'delete_message') {
        $err = delete_request_message($requestId, (int)($input['message_id'] ?? 0), (int)$admin['id'], $admin['role']);
        json_response(['success' => !$err, 'message' => $err ?: 'Message deleted.']);
    }

    if ($action === 'upload_attachment') {
        if (!empty($_FILES['attachment']['name'])) {
            $err = save_request_attachment($requestId, $admin['id'], $_FILES['attachment']);
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
        json_response(['success' => false, 'message' => 'No file selected.']);
    }

    json_error('Unknown action.');
}

// ---- GET ----
$viewId = (int)($_GET['view'] ?? 0);

if ($viewId) {
    $stmt = $pdo->prepare("SELECT sr.*, s.name AS service_name, s.icon, s.category_key, s.is_broadcast FROM service_requests sr LEFT JOIN services s ON s.id = sr.service_id WHERE sr.id = ?");
    $stmt->execute([$viewId]);
    $viewReq = $stmt->fetch();
    if (!$viewReq) json_error('Request not found.', 404);
    if (($viewReq['request_type'] ?? 'service') === 'product') {
        json_error('This is a product request. Open it from Product Requests (Customer Acquisition).', 404);
    }

    if (!$isLawyerViewOnly) mark_thread_read($viewId, $admin['id']);

    $a = $pdo->prepare("SELECT ra.*, u.full_name, u.username FROM request_assignments ra JOIN users u ON u.id = ra.staff_id WHERE ra.request_id = ? ORDER BY ra.created_at ASC");
    $a->execute([$viewId]);
    $viewAssignments = $a->fetchAll();

    // Staff currently on approved leave — computed once so the assignment
    // picker can clearly flag them (spec: "When assigning a project, the
    // system should clearly indicate if the selected staff member is
    // currently on leave") rather than an admin finding out after the fact.
    $onLeaveIds = array_column(employees_on_leave_today(), 'employee_id');

    $isProductRequest = ($viewReq['request_type'] ?? '') === 'product';
    $staffOptions = [];
    if (!$viewReq['is_broadcast'] && !$isLawyerViewOnly && !$isProductRequest) {
        if ($viewReq['category_key']) {
            $so = $pdo->prepare("SELECT id, full_name, username FROM users WHERE role='staff' AND status='active' AND staff_category = ? ORDER BY full_name");
            $so->execute([$viewReq['category_key']]);
        } else {
            // Product/other requests with no service category (e.g. a Marketing
            // Officer's product opportunity) — offer every active staff member.
            $so = $pdo->query("SELECT id, full_name, username FROM users WHERE role='staff' AND status='active' ORDER BY full_name");
        }
        $staffOptions = $so->fetchAll();
        foreach ($staffOptions as &$so_row) {
            $so_row['on_leave'] = in_array((int)$so_row['id'], $onLeaveIds, true);
        }
        unset($so_row);
    }

    // Administrative assignment (spec §7): a request can also be forwarded to
    // an administrator instead of a technical specialist — e.g. something
    // that needs a manager's or the CEO's attention rather than delivery
    // work. Kept as a clearly separate group from the specialist list above.
    $adminOptions = [];
    if ($isProductRequest && !$isLawyerViewOnly) {
        // Product request: Super Admin, General Admin or Sales Officer only.
        $adminOptions = acq_product_assignee_options();
        foreach ($adminOptions as &$ao_row) {
            $ao_row['on_leave'] = in_array((int)$ao_row['id'], $onLeaveIds, true);
        }
        unset($ao_row);
    } elseif (!$viewReq['is_broadcast'] && !$isLawyerViewOnly) {
        $adminOptions = $pdo->query("
            SELECT id, full_name, username,
                CASE
                    WHEN role = 'super_admin' THEN 'Super Admin / CEO'
                    WHEN job_role_key = 'general_manager' THEN 'Manager / Operations'
                    ELSE 'General Admin'
                END AS role_label
            FROM users
            WHERE status = 'active' AND (
                role = 'super_admin'
                OR (role = 'admin' AND job_role_key IS NULL)
                OR (role = 'admin' AND job_role_key = 'general_manager')
            )
            ORDER BY FIELD(role, 'super_admin', 'admin'), full_name
        ")->fetchAll();
        foreach ($adminOptions as &$ao_row) {
            $ao_row['on_leave'] = in_array((int)$ao_row['id'], $onLeaveIds, true);
        }
        unset($ao_row);
    }

    json_response([
        'request' => $viewReq,
        'assignments' => $viewAssignments,
        'staff_options' => $staffOptions,
        'admin_options' => $adminOptions,
        'attachments' => get_request_attachments($viewId),
        'thread' => get_request_thread($viewId),
        'links' => get_project_links($viewId),
        'milestones' => get_project_milestones($viewId),
        'link_types' => PROJECT_LINK_TYPES,
        'viewer_id' => (int)$admin['id'],
        'read_only' => $isLawyerViewOnly,
    ]);
}

$statusFilter = $_GET['status'] ?? 'all';
// link_count / file_count feed the "Resources" chips in the Lawyer's view-only project list.
$sql = "SELECT sr.*, s.name AS service_name, s.icon, s.category_key,
        (SELECT COUNT(*) FROM project_links pl WHERE pl.request_id = sr.id) AS link_count,
        (SELECT COUNT(*) FROM request_attachments ra WHERE ra.request_id = sr.id) AS file_count
        FROM service_requests sr LEFT JOIN services s ON s.id = sr.service_id";
// Product requests (registered by the Marketing Officer) live in Customer Acquisition / Product
// Requests only — they are not service projects, so they are kept out of this list.
$sql .= " WHERE sr.request_type <> 'product'";
if ($statusFilter !== 'all') {
    $sql .= " AND sr.status = " . $pdo->quote($statusFilter);
}
$sql .= " ORDER BY sr.created_at DESC";
$requests = $pdo->query($sql)->fetchAll();

$unread = get_thread_unread_counts(array_column($requests, 'id'), (int)$admin['id'], false);
foreach ($requests as &$r) {
    $r['unread_messages'] = $unread[(int)$r['id']] ?? 0;
}
unset($r);

json_response(['requests' => $requests, 'read_only' => $isLawyerViewOnly]);
