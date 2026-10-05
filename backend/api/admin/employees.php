<?php
require_once __DIR__ . '/../../includes/api.php';

// Super Admin, Generic Administrator and Operations Manager only.
$me = api_require_employees_access();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'update_employment') {
        // The Operations Manager can view employment records (hire date & status) but not change them.
        if (!is_full_admin($me)) json_error('You have view-only access to employment records.', 403);
        $employeeId = (int)($input['employee_id'] ?? 0);
        $chk = $pdo->prepare("SELECT id FROM users WHERE id = ? AND role IN ('admin','staff')");
        $chk->execute([$employeeId]);
        if (!$chk->fetchColumn()) json_error('Employee not found.', 404);

        $hireDate = trim($input['hire_date'] ?? '') ?: null;
        if ($hireDate !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $hireDate)) json_error('Invalid hire date.');
        $employmentStatus = in_array($input['employment_status'] ?? '', ['active', 'terminated'], true) ? $input['employment_status'] : 'active';
        $pdo->prepare('UPDATE users SET hire_date = ?, employment_status = ? WHERE id = ?')
            ->execute([$hireDate, $employmentStatus, $employeeId]);
        log_activity($me['id'], 'Updated employment record', "Employee #$employeeId -> $employmentStatus");
        json_response(['success' => true, 'message' => 'Employment record updated.']);
    }

    if ($action === 'decide_leave') {
        $leaveId = (int)($input['leave_id'] ?? 0);
        $decision = $input['decision'] ?? '';
        decide_leave($leaveId, $decision, (int)$me['id'], trim($input['note'] ?? '') ?: null);
        json_response(['success' => true, 'message' => 'Leave request updated.']);
    }

    json_error('Unknown action.');
}

// ---- GET ----

// Every company member: Super Admin, Admins and Staff. Explicit column list
// on purpose — never SELECT * from users (password/security hashes).
$memberColumns = "u.id, u.full_name, u.email, u.phone, u.role, u.staff_category, u.position_title,
                  u.job_role_key, u.status, u.hire_date, u.employment_status, u.created_at, jr.label AS job_role_label";

function employee_department_label(array $row): string
{
    if ($row['role'] === 'staff') return category_label($row['staff_category'] ?? '');
    if ($row['role'] === 'admin' && !empty($row['job_role_key'])) return $row['job_role_label'] ?: role_label('admin');
    return role_label($row['role']);
}

$employeeView = (int)($_GET['employee'] ?? 0);
if ($employeeView) {
    $stmt = $pdo->prepare("
        SELECT $memberColumns FROM users u
        LEFT JOIN job_roles jr ON jr.job_role_key = u.job_role_key
        WHERE u.id = ? AND u.role IN ('super_admin','admin','staff')
    ");
    $stmt->execute([$employeeView]);
    $employee = $stmt->fetch();
    if (!$employee) json_error('Employee not found.', 404);
    $employee['department_label'] = employee_department_label($employee);

    $leaves = $pdo->prepare('SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC');
    $leaves->execute([$employeeView]);

    json_response([
        'employee' => $employee,
        'performance' => $employee['role'] === 'staff' ? employee_task_performance($employeeView) : null,
        'leave_history' => $leaves->fetchAll(),
        'on_leave_today' => is_employee_on_leave_today($employeeView),
    ]);
}

$employees = $pdo->query("
    SELECT $memberColumns FROM users u
    LEFT JOIN job_roles jr ON jr.job_role_key = u.job_role_key
    WHERE u.role IN ('super_admin','admin','staff')
    ORDER BY FIELD(u.role,'super_admin','admin','staff'), u.full_name ASC
")->fetchAll();
foreach ($employees as &$e) {
    $e['department_label'] = employee_department_label($e);
}
unset($e);

$onLeave = employees_on_leave_today();
$onLeaveIds = array_column($onLeave, 'employee_id');

$stats = $pdo->query("
    SELECT
        COUNT(*) AS total_employees,
        SUM(status = 'active') AS active_employees,
        SUM(created_at >= DATE_FORMAT(NOW(),'%Y-%m-01')) AS new_this_month
    FROM users WHERE role IN ('super_admin','admin','staff')
")->fetch();
$stats['on_leave_today'] = count($onLeave);

$pendingLeave = $pdo->query("
    SELECT lr.*, u.full_name FROM leave_requests lr JOIN users u ON u.id = lr.employee_id
    WHERE lr.status = 'pending' ORDER BY lr.created_at ASC
")->fetchAll();

json_response([
    'stats' => $stats,
    'employees' => $employees,
    'on_leave_ids' => $onLeaveIds,
    'pending_leave' => $pendingLeave,
]);
