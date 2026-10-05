<?php
/**
 * MABUMBA TECH — Employees & leave
 *
 * Leave requests (staff ask for leave, management approves/rejects) and the
 * company-wide Employees page helpers. Schema: leave_requests (migration_017).
 */

/**
 * Who may open the Employees page: Super Admin, Generic Administrator (an
 * admin with no job role) and the Operations Manager (job role
 * 'general_manager'). Nobody else — no per-user permission can reopen it.
 */
function can_view_employees(array $user): bool
{
    if (is_full_admin($user)) {
        return true;
    }
    return ($user['role'] ?? '') === 'admin' && ($user['job_role_key'] ?? null) === 'general_manager';
}

function api_require_employees_access(): array
{
    $user = api_require_login();
    if (!can_view_employees($user)) {
        json_error('You do not have permission to access this resource.', 403);
    }
    return $user;
}

function request_leave(int $employeeId, string $type, string $start, string $end, ?string $reason)
{
    global $pdo;
    // A double-click on submit shouldn't create two identical pending requests.
    $dupe = $pdo->prepare("SELECT id FROM leave_requests WHERE employee_id = ? AND leave_type = ? AND start_date = ? AND end_date = ? AND status = 'pending'");
    $dupe->execute([$employeeId, $type, $start, $end]);
    if ($dupe->fetchColumn()) {
        return false; // duplicate — caller decides how to message this
    }
    $stmt = $pdo->prepare('INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason) VALUES (?,?,?,?,?)');
    $stmt->execute([$employeeId, $type, $start, $end, $reason]);
    $id = (int)$pdo->lastInsertId();

    $emp = $pdo->prepare('SELECT full_name FROM users WHERE id = ?');
    $emp->execute([$employeeId]);
    $name = $emp->fetchColumn() ?: 'An employee';

    // Only the people who can actually decide a leave request are notified.
    $approvers = $pdo->query("
        SELECT id FROM users
        WHERE status = 'active'
          AND (role = 'super_admin' OR (role = 'admin' AND (job_role_key IS NULL OR job_role_key = '' OR job_role_key = 'general_manager')))
    ")->fetchAll();
    foreach ($approvers as $a) {
        notify_user((int)$a['id'], 'leave_requested', 'Leave request: ' . $name,
            ucfirst($type) . ' leave from ' . $start . ' to ' . $end . '.', '/backend/admin/employees.php?leave=' . $id);
    }

    return $id;
}

function decide_leave(int $leaveId, string $decision, int $decidedBy, ?string $note = null): void
{
    global $pdo;
    if (!in_array($decision, ['approved', 'rejected'], true)) return;

    $stmt = $pdo->prepare('SELECT * FROM leave_requests WHERE id = ?');
    $stmt->execute([$leaveId]);
    $leave = $stmt->fetch();
    if (!$leave || $leave['status'] !== 'pending') return;

    $pdo->prepare('UPDATE leave_requests SET status = ?, approved_by = ?, decision_note = ? WHERE id = ?')
        ->execute([$decision, $decidedBy, $note, $leaveId]);

    notify_user((int)$leave['employee_id'], 'leave_decision',
        'Your leave request was ' . $decision,
        ucfirst($leave['leave_type']) . ' leave (' . $leave['start_date'] . ' to ' . $leave['end_date'] . ') was ' . $decision . '.' . ($note ? ' Note: ' . $note : ''),
        '/backend/staff/leave.php');

    log_activity($decidedBy, 'Leave request ' . $decision, "Leave #$leaveId for employee #{$leave['employee_id']}");
}

/** Employees currently on approved leave, as of today — computed, never stored. */
function employees_on_leave_today(): array
{
    global $pdo;
    return $pdo->query("
        SELECT lr.*, u.full_name FROM leave_requests lr
        JOIN users u ON u.id = lr.employee_id
        WHERE lr.status = 'approved' AND CURDATE() BETWEEN lr.start_date AND lr.end_date
    ")->fetchAll();
}

function is_employee_on_leave_today(int $employeeId): bool
{
    global $pdo;
    $stmt = $pdo->prepare("SELECT 1 FROM leave_requests WHERE employee_id = ? AND status='approved' AND CURDATE() BETWEEN start_date AND end_date");
    $stmt->execute([$employeeId]);
    return (bool)$stmt->fetchColumn();
}

/** Simple task-completion summary, derived entirely from existing request_assignments data — no new tracking table. */
function employee_task_performance(int $employeeId): array
{
    global $pdo;
    $stmt = $pdo->prepare("
        SELECT
            COUNT(*) AS total_assigned,
            SUM(task_status = 'completed') AS completed,
            SUM(task_status = 'declined') AS declined,
            SUM(task_status IN ('new','accepted','in_progress')) AS active
        FROM request_assignments WHERE staff_id = ?
    ");
    $stmt->execute([$employeeId]);
    return $stmt->fetch();
}
