<?php
require_once __DIR__ . '/../../includes/api.php';
require_once __DIR__ . '/../../includes/reports.php';

$me = api_require_any_permission(['finance.view', 'payroll.view']);
$canFinance = has_permission($me, 'finance.manage');
$canPayroll = has_permission($me, 'payroll.manage');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    $financeActions = ['record_income', 'record_expense', 'create_invoice', 'record_payment'];
    $payrollActions = ['create_payroll', 'pay_payroll'];
    if (in_array($action, $financeActions, true) && !$canFinance) json_error('You do not have permission to make changes here.', 403);
    if (in_array($action, $payrollActions, true) && !$canPayroll) json_error('You do not have permission to manage payroll.', 403);

    if ($action === 'record_income' || $action === 'record_expense') {
        $amount = (float)($input['amount'] ?? 0);
        $category = trim($input['category'] ?? '') ?: 'other';
        $date = trim($input['transaction_date'] ?? '') ?: date('Y-m-d');
        $desc = trim($input['description'] ?? '') ?: null;
        if ($amount <= 0) json_response(['success' => false, 'message' => 'Enter a valid amount.']);
        record_transaction(
            $action === 'record_income' ? 'income' : 'expense',
            $category, $amount, $date, $desc,
            (int)($input['customer_id'] ?? 0) ?: null,
            (int)($input['request_id'] ?? 0) ?: null,
            null, null, $me['id']
        );
        log_activity($me['id'], ucfirst(str_replace('_', ' ', $action)), "$category: $amount");
        json_response(['success' => true, 'message' => 'Transaction recorded.']);
    }

    if ($action === 'create_invoice') {
        $customerId = (int)($input['customer_id'] ?? 0);
        $title = trim($input['title'] ?? '');
        $amount = (float)($input['amount'] ?? 0);
        if (!$customerId || $title === '' || $amount <= 0) {
            json_response(['success' => false, 'message' => 'Customer, title and a valid amount are required.']);
        }
        $code = generate_invoice_code();
        $stmt = $pdo->prepare('
            INSERT INTO invoices (invoice_code, customer_id, request_id, title, amount, due_date, issued_by)
            VALUES (?,?,?,?,?,?,?)
        ');
        $stmt->execute([
            $code, $customerId,
            (int)($input['request_id'] ?? 0) ?: null,
            $title, $amount, trim($input['due_date'] ?? '') ?: null, $me['id'],
        ]);
        $invoiceId = (int)$pdo->lastInsertId();
        notify_user($customerId, 'invoice_issued', 'New Invoice: ' . $code,
            'An invoice for "' . $title . '" (' . $amount . ') has been issued to you.',
            '/backend/customer/invoices.php?id=' . $invoiceId);
        log_activity($me['id'], 'Created invoice', "$code for customer #$customerId: $amount");
        json_response(['success' => true, 'message' => "Invoice $code created."]);
    }

    if ($action === 'record_payment') {
        $invoiceId = (int)($input['invoice_id'] ?? 0);
        $amount = (float)($input['amount'] ?? 0);
        if (!$invoiceId || $amount <= 0) json_response(['success' => false, 'message' => 'Choose an invoice and a valid amount.']);
        try {
            apply_invoice_payment($invoiceId, $amount, $input['payment_method'] ?? 'other', trim($input['transaction_date'] ?? '') ?: date('Y-m-d'), $me['id']);
        } catch (Throwable $e) {
            json_response(['success' => false, 'message' => $e->getMessage()]);
        }
        json_response(['success' => true, 'message' => 'Payment recorded.']);
    }

    if ($action === 'create_payroll') {
        $userId = (int)($input['user_id'] ?? 0);
        $period = trim($input['period_month'] ?? '');
        $gross = (float)($input['gross_amount'] ?? 0);
        $deductions = (float)($input['deductions'] ?? 0);
        if (!$userId || !$period || $gross <= 0) json_response(['success' => false, 'message' => 'Employee, period and gross amount are required.']);
        $periodDate = date('Y-m-01', strtotime($period));
        $stmt = $pdo->prepare('
            INSERT INTO payroll_records (user_id, period_month, gross_amount, deductions, net_amount, recorded_by)
            VALUES (?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE gross_amount = VALUES(gross_amount), deductions = VALUES(deductions), net_amount = VALUES(net_amount)
        ');
        $stmt->execute([$userId, $periodDate, $gross, $deductions, $gross - $deductions, $me['id']]);
        json_response(['success' => true, 'message' => 'Payroll record saved.']);
    }

    if ($action === 'pay_payroll') {
        $payrollId = (int)($input['payroll_id'] ?? 0);
        try {
            pay_payroll_record($payrollId, date('Y-m-d'), $me['id']);
        } catch (Throwable $e) {
            json_response(['success' => false, 'message' => $e->getMessage()]);
        }
        json_response(['success' => true, 'message' => 'Payroll marked paid and recorded as an expense.']);
    }

    json_error('Unknown action.');
}

// ---- GET ----

$rangePreset = $_GET['range'] ?? 'this_month';
[$start, $end, $rangePreset] = resolve_report_range($rangePreset, $_GET['from'] ?? null, $_GET['to'] ?? null);
$summary = financial_summary($start, $end);

$outstanding = (float)$pdo->query("SELECT COALESCE(SUM(amount - amount_paid),0) FROM invoices WHERE status IN ('unpaid','partial','overdue')")->fetchColumn();
$payrollPending = (float)$pdo->query("SELECT COALESCE(SUM(net_amount),0) FROM payroll_records WHERE status = 'pending'")->fetchColumn();

$overdueInvoices = $pdo->query("
    SELECT id, invoice_code, amount, amount_paid, due_date FROM invoices
    WHERE status IN ('unpaid','partial') AND due_date IS NOT NULL AND due_date < CURDATE()
    ORDER BY due_date ASC LIMIT 20
")->fetchAll();

$customerDebts = $pdo->query("
    SELECT u.id, u.full_name, SUM(i.amount - i.amount_paid) AS balance
    FROM invoices i JOIN users u ON u.id = i.customer_id
    WHERE i.status IN ('unpaid','partial','overdue')
    GROUP BY u.id, u.full_name
    ORDER BY balance DESC LIMIT 20
")->fetchAll();

$recentTransactions = $pdo->query("
    SELECT ft.*, u.full_name AS customer_name
    FROM finance_transactions ft
    LEFT JOIN users u ON u.id = ft.customer_id
    ORDER BY ft.transaction_date DESC, ft.id DESC LIMIT 50
")->fetchAll();

$invoices = $pdo->query("
    SELECT i.*, u.full_name AS customer_name
    FROM invoices i JOIN users u ON u.id = i.customer_id
    ORDER BY i.created_at DESC LIMIT 200
")->fetchAll();

$payroll = $pdo->query("
    SELECT pr.*, u.full_name FROM payroll_records pr JOIN users u ON u.id = pr.user_id
    ORDER BY pr.period_month DESC, u.full_name ASC LIMIT 200
")->fetchAll();

$customers = $pdo->query("SELECT id, full_name FROM users WHERE role='customer' ORDER BY full_name LIMIT 500")->fetchAll();
$payableStaff = $pdo->query("SELECT id, full_name FROM users WHERE role IN ('staff','admin','super_admin') AND status='active' ORDER BY full_name")->fetchAll();

// ---- Accountant view: completed service requests + company income ----
// Every completed/delivered request, with how much has actually been
// collected against it so far (summed straight from the finance ledger —
// the same source of truth every other figure on this page uses). This
// answers "which finished jobs have/haven't been paid for" at a glance.
$completedRequests = $pdo->query("
    SELECT sr.id, sr.tracking_code, sr.subject, sr.completed_at, sr.created_at,
           s.name AS service_name, s.icon,
           COALESCE(sr.guest_name, u.full_name) AS customer_name,
           COALESCE((SELECT SUM(ft.amount) FROM finance_transactions ft WHERE ft.request_id = sr.id AND ft.type = 'income'), 0) AS amount_earned,
           COALESCE((SELECT SUM(i.amount) FROM invoices i WHERE i.request_id = sr.id AND i.status != 'cancelled'), 0) AS amount_invoiced
    FROM service_requests sr
    JOIN services s ON s.id = sr.service_id
    LEFT JOIN users u ON u.id = sr.customer_id
    WHERE sr.status IN ('completed', 'delivered')
    ORDER BY sr.completed_at DESC, sr.created_at DESC
    LIMIT 300
")->fetchAll();

// Company-wide totals — deliberately NOT limited to the selected date range,
// since "total income generated by the company" means all-time, not just
// this month/week. Shown alongside (not instead of) the ranged summary card.
$row = $pdo->query("
    SELECT
        COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS total_expenses
    FROM finance_transactions
")->fetch();
$totalIncomeAllTime = (float)$row['total_income'];
$totalExpensesAllTime = (float)$row['total_expenses'];
$salesAllTime = sales_profit_summary();
$netProfitAllTime = $totalIncomeAllTime - $salesAllTime['cost'] - $totalExpensesAllTime;

$incomeFromCompletedRequests = (float)$pdo->query("
    SELECT COALESCE(SUM(amount), 0) FROM finance_transactions WHERE type = 'income' AND request_id IS NOT NULL
")->fetchColumn();

// Income (not net profit) over the last 6 months — a simple month-over-month
// trend for the Accountant, same shape as the operational dashboard's demand
// trend so it renders with the same lightweight bar-chart pattern.
$incomeTrend = $pdo->query("
    SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS ym, COALESCE(SUM(amount), 0) AS total
    FROM finance_transactions
    WHERE type = 'income' AND transaction_date >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 5 MONTH)
    GROUP BY ym ORDER BY ym ASC
")->fetchAll();

// ---- Sales (Inventory Sales) integration (spec §11) — the revenue from
// every recorded sale already landed in finance_transactions (category
// 'product_sale') via record_sale(), so it's already inside $summary and
// the all-time totals above. This block only adds the extra detail
// (cost, profit, per-sale breakdown) that finance_transactions alone
// doesn't carry, so the Accountant doesn't have to recompute it.
$salesSummaryStmt = $pdo->prepare("
    SELECT COALESCE(SUM(total_amount),0) AS revenue, COALESCE(SUM(total_cost),0) AS cost,
           COALESCE(SUM(profit),0) AS profit, COUNT(*) AS count
    FROM inventory_sales WHERE DATE(created_at) BETWEEN ? AND ?
");
$salesSummaryStmt->execute([$start, $end]);
$salesSummary = $salesSummaryStmt->fetch();

$recentSales = $pdo->query("
    SELECT s.sale_code, s.quantity, s.total_amount, s.total_cost, s.profit, s.created_at,
           pt.name AS type_name, p.name AS product_name, u.full_name AS sold_by_name
    FROM inventory_sales s
    JOIN product_types pt ON pt.id = s.product_type_id
    JOIN products p ON p.id = pt.product_id
    LEFT JOIN users u ON u.id = s.sold_by
    ORDER BY s.created_at DESC LIMIT 50
")->fetchAll();

json_response([
    'range' => ['preset' => $rangePreset, 'start' => $start, 'end' => $end, 'label' => report_range_label($rangePreset, $start, $end)],
    'summary' => $summary,
    'outstanding' => $outstanding,
    'payroll_pending' => $payrollPending,
    'overdue_invoices' => $overdueInvoices,
    'customer_debts' => $customerDebts,
    'transactions' => $recentTransactions,
    'invoices' => $invoices,
    'payroll' => $payroll,
    'customers' => $customers,
    'payable_staff' => $payableStaff,
    'completed_requests' => $completedRequests,
    'total_income_all_time' => $totalIncomeAllTime,
    'total_expenses_all_time' => $totalExpensesAllTime,
    'net_profit_all_time' => $netProfitAllTime,
    'cost_of_goods_all_time' => $salesAllTime['cost'],
    'income_from_completed_requests' => $incomeFromCompletedRequests,
    'income_trend' => $incomeTrend,
    'sales_summary' => $salesSummary,
    'recent_sales' => $recentSales,
    'can_finance' => $canFinance,
    'can_payroll' => $canPayroll,
]);
