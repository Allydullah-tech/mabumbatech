<?php
/**
 * MABUMBA TECH — Legal & Budget Requests
 * Schema: migration_030_system_restructure.sql
 *
 * Two audiences share this one small endpoint:
 *   - Lawyer (legal.view/legal.manage): submit a budget/legal-expense request.
 *     (Company projects are read from Service Requests — admin/requests.php.)
 *   - General Operations Manager / Full Admin (budget_requests.manage):
 *     review and decide any pending budget request (Marketing or Legal).
 */
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_any_permission(['legal.view', 'legal.manage', 'budget_requests.manage', 'budget_requests.create']);

$canRequestBudget = has_permission($me, 'budget_requests.create');
$canDecideBudget = has_permission($me, 'budget_requests.manage');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'request_budget') {
        if (!$canRequestBudget) json_error('You do not have permission to submit budget requests.', 403);
        $department = has_permission($me, 'legal.view') ? 'legal' : 'marketing';
        $purpose = trim($input['purpose'] ?? '');
        $amount = (float)($input['amount'] ?? 0);
        $details = trim($input['details'] ?? '') ?: null;
        if ($purpose === '' || $amount <= 0) json_error('Please provide a purpose and a valid amount.');
        $id = create_budget_request((int)$me['id'], $department, $purpose, $amount, $details);
        json_response(['success' => true, 'message' => 'Budget request submitted.', 'budget_request_id' => $id]);
    }

    if ($action === 'decide_budget') {
        if (!$canDecideBudget) json_error('You do not have permission to decide budget requests.', 403);
        $id = (int)($input['request_id'] ?? 0);
        $decision = $input['decision'] ?? '';
        $note = trim($input['note'] ?? '') ?: null;
        decide_budget_request($id, $decision, (int)$me['id'], $note);
        json_response(['success' => true, 'message' => 'Budget request updated.']);
    }

    json_error('Unknown action.');
}

// ---- GET ----
$myBudgetRequests = [];
if ($canRequestBudget) {
    $mine = $pdo->prepare('SELECT br.*, du.full_name AS decided_by_name FROM budget_requests br LEFT JOIN users du ON du.id = br.decided_by WHERE br.requested_by = ? ORDER BY br.created_at DESC');
    $mine->execute([$me['id']]);
    $myBudgetRequests = $mine->fetchAll();
}

$pendingBudgetRequests = [];
if ($canDecideBudget) {
    $pendingBudgetRequests = $pdo->query("
        SELECT br.*, u.full_name AS requested_by_name, du.full_name AS decided_by_name
        FROM budget_requests br JOIN users u ON u.id = br.requested_by LEFT JOIN users du ON du.id = br.decided_by
        ORDER BY FIELD(br.status,'pending','approved','rejected'), br.created_at DESC
    ")->fetchAll();
}

json_response([
    'can_request_budget' => $canRequestBudget,
    'can_decide_budget' => $canDecideBudget,
    'my_budget_requests' => $myBudgetRequests,
    'pending_budget_requests' => $pendingBudgetRequests,
]);
