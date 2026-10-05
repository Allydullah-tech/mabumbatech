<?php
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_role('staff');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'request_leave') {
        $type = in_array($input['leave_type'] ?? '', ['annual', 'sick', 'unpaid', 'maternity_paternity', 'other'], true) ? $input['leave_type'] : 'annual';
        $start = trim($input['start_date'] ?? '');
        $end = trim($input['end_date'] ?? '');
        if (!$start || !$end || $end < $start) {
            json_response(['success' => false, 'message' => 'Please provide a valid date range.']);
        }
        $leaveId = request_leave((int)$me['id'], $type, $start, $end, trim($input['reason'] ?? '') ?: null);
        if ($leaveId === false) {
            json_error('You already have a pending leave request for those dates.');
        }
        json_response(['success' => true, 'message' => 'Leave request submitted.', 'leave_id' => $leaveId]);
    }

    json_error('Unknown action.');
}

$leaves = $pdo->prepare('SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC');
$leaves->execute([$me['id']]);

json_response([
    'leaves' => $leaves->fetchAll(),
    'on_leave_today' => is_employee_on_leave_today((int)$me['id']),
]);
