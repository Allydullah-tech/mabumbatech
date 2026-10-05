<?php
/**
 * MABUMBA TECH — Customer Debts (credit sales)
 * Schema: migration_042_credit_sales_and_debts.sql
 *
 * Who sees it: anyone who records sales (inventory.sell / inventory.manage),
 * the Sales & Stock Overview viewers, and the Accountant (finance.view /
 * finance.manage). Who can record a customer's payment: the people who record
 * sales, and finance.manage. Full admins pass every check.
 *
 * Every payment is posted to the finance ledger as income (category
 * 'product_sale') by record_debt_payment(), so revenue always equals the cash
 * actually received.
 */
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_any_permission(['inventory.sell', 'inventory.manage', 'sales_overview.view', 'finance.view', 'finance.manage']);
$canRecord = has_permission($me, 'inventory.sell') || has_permission($me, 'inventory.manage') || has_permission($me, 'finance.manage');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$canRecord) json_error('You do not have permission to record payments.', 403);
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'record_payment') {
        $debtId = (int)($input['debt_id'] ?? 0);
        try {
            $result = record_debt_payment(
                $debtId,
                (float)($input['amount'] ?? 0),
                (string)($input['payment_method'] ?? ''),
                trim($input['payment_channel'] ?? '') ?: null,
                trim($input['reference'] ?? '') ?: null,
                trim($input['note'] ?? '') ?: null,
                trim($input['paid_date'] ?? '') ?: date('Y-m-d'),
                (int)$me['id']
            );
        } catch (Throwable $e) {
            json_response(['success' => false, 'message' => $e->getMessage()]);
        }
        log_activity($me['id'], 'Recorded debt payment', $result['receipt_code'] . ' (' . $result['customer_name'] . '): ' . number_format($result['amount'], 2) . ', balance ' . number_format($result['balance'], 2));
        $msg = $result['balance'] > 0
            ? 'Payment recorded. Remaining balance: ' . number_format($result['balance'], 2) . '.'
            : 'Payment recorded. This debt is now fully paid.';
        json_response(['success' => true, 'message' => $msg, 'balance' => $result['balance']]);
    }

    json_error('Unknown action.');
}

// ---- GET: one debt in full (customer, items bought, payment history) ----
$debtView = (int)($_GET['debt'] ?? 0);
if ($debtView) {
    $stmt = $pdo->prepare("
        SELECT d.*, (d.total_amount - d.amount_paid) AS balance, u.full_name AS created_by_name,
               (d.status <> 'paid' AND d.due_date IS NOT NULL AND d.due_date < CURDATE()) AS is_overdue,
               (SELECT MIN(s.created_at) FROM inventory_sales s WHERE COALESCE(s.receipt_code, s.sale_code) = d.receipt_code) AS sale_date
        FROM customer_debts d LEFT JOIN users u ON u.id = d.created_by WHERE d.id = ?
    ");
    $stmt->execute([$debtView]);
    $debt = $stmt->fetch();
    if (!$debt) json_error('Debt not found.', 404);

    $items = $pdo->prepare("
        SELECT s.quantity, s.unit_price, s.total_amount, pt.name AS type_name, pt.unit AS unit, p.name AS product_name
        FROM inventory_sales s JOIN product_types pt ON pt.id = s.product_type_id JOIN products p ON p.id = pt.product_id
        WHERE COALESCE(s.receipt_code, s.sale_code) = ? ORDER BY s.id
    ");
    $items->execute([$debt['receipt_code']]);

    $payments = $pdo->prepare("
        SELECT cp.*, u.full_name AS recorded_by_name FROM customer_debt_payments cp
        LEFT JOIN users u ON u.id = cp.recorded_by
        WHERE cp.debt_id = ? ORDER BY cp.paid_date ASC, cp.id ASC
    ");
    $payments->execute([$debtView]);

    json_response([
        'debt' => $debt,
        'items' => $items->fetchAll(),
        'payments' => $payments->fetchAll(),
        'can_record' => $canRecord,
        'options' => payment_options(),
    ]);
}

// ---- GET: the list ----
$q = trim($_GET['q'] ?? '');
$status = $_GET['status'] ?? 'open';
$where = '1=1';
$params = [];
if ($q !== '') {
    $where .= ' AND (d.customer_name LIKE ? OR d.customer_phone LIKE ? OR d.debt_code LIKE ? OR d.receipt_code LIKE ?)';
    $like = '%' . $q . '%';
    array_push($params, $like, $like, $like, $like);
}
switch ($status) {
    case 'unpaid':  $where .= " AND d.status = 'unpaid'"; break;
    case 'partial': $where .= " AND d.status = 'partial'"; break;
    case 'paid':    $where .= " AND d.status = 'paid'"; break;
    case 'overdue': $where .= " AND d.status <> 'paid' AND d.due_date IS NOT NULL AND d.due_date < CURDATE()"; break;
    case 'all':     break;
    default:        $status = 'open'; $where .= " AND d.status <> 'paid'";
}

$list = $pdo->prepare("
    SELECT d.id, d.debt_code, d.receipt_code, d.customer_name, d.customer_phone, d.customer_address,
           d.total_amount, d.amount_paid, (d.total_amount - d.amount_paid) AS balance, d.due_date, d.status, d.created_at,
           u.full_name AS created_by_name,
           (d.status <> 'paid' AND d.due_date IS NOT NULL AND d.due_date < CURDATE()) AS is_overdue,
           (SELECT MAX(cp.paid_date) FROM customer_debt_payments cp WHERE cp.debt_id = d.id) AS last_payment_date
    FROM customer_debts d LEFT JOIN users u ON u.id = d.created_by
    WHERE $where
    ORDER BY (d.status = 'paid'), is_overdue DESC, d.created_at DESC
    LIMIT 500
");
$list->execute($params);

// Totals always cover every debt, whatever the filter above shows.
$stats = $pdo->query("
    SELECT
        COALESCE(SUM(total_amount), 0) AS total_credit,
        COALESCE(SUM(amount_paid), 0) AS total_paid,
        COALESCE(SUM(total_amount - amount_paid), 0) AS total_balance,
        COALESCE(SUM(status <> 'paid'), 0) AS open_count,
        COUNT(DISTINCT CASE WHEN status <> 'paid' THEN customer_phone END) AS customers_owing,
        COALESCE(SUM(status <> 'paid' AND due_date IS NOT NULL AND due_date < CURDATE()), 0) AS overdue_count,
        COALESCE(SUM(CASE WHEN status <> 'paid' AND due_date IS NOT NULL AND due_date < CURDATE() THEN total_amount - amount_paid ELSE 0 END), 0) AS overdue_amount
    FROM customer_debts
")->fetch();

json_response([
    'stats' => $stats,
    'debts' => $list->fetchAll(),
    'filter' => ['q' => $q, 'status' => $status],
    'can_record' => $canRecord,
    'options' => payment_options(),
]);
