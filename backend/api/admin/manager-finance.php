<?php
/**
 * Dashboard Financial Overview — read-only (income, expenses, profit, loans)
 * for a chosen period. GET only; nothing here can change any data.
 *
 *   ?period=this_month | last_month | last_3_months | this_year | all | custom
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD      (only used with period=custom)
 *
 * Allowed: Super Admin, Generic Admin (no job role), General / Operations Manager and
 * Accountant. It does not grant access to the Finance or Accountant pages; the figures are the same ones the
 * Accountant Desk uses (financial_summary() + loans tables).
 */
require_once __DIR__ . '/../../includes/api.php';
require_once __DIR__ . '/../../includes/accountant.php';

$me = api_require_role('admin');
if (!is_full_admin($me) && !in_array($me['job_role_key'] ?? null, ['general_manager', 'accountant'], true)) {
    json_error('You do not have access to the financial overview.', 403);
}

$period = (string)($_GET['period'] ?? 'this_month');
if (!in_array($period, ['this_month', 'last_month', 'last_3_months', 'this_year', 'all', 'custom'], true)) $period = 'this_month';
[$from, $to, $label] = acc_period_range($period, (string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''));
$allTime = ($from === null);

$sum = financial_summary($allTime ? '1970-01-01' : $from, $allTime ? '2999-12-31' : $to);
$income = (float)$sum['revenue'];
$expenses = (float)$sum['expenses'];
$profit = (float)$sum['net_profit'];

// ---- Loans (zeros when the loans tables have not been installed) ----
$loans = [
    'outstanding' => 0.0, 'total_received' => 0.0, 'total_repayable' => 0.0, 'total_repaid' => 0.0,
    'progress_pct' => 0, 'active_count' => 0, 'received_in_period' => 0.0, 'repaid_in_period' => 0.0,
];
if (acc_has_table('company_loans') && acc_has_table('loan_repayments')) {
    $pos = acc_loans_position();
    $row = $pdo->query("SELECT COALESCE(SUM(total_repayable),0) AS repayable, SUM(status='active') AS active FROM company_loans")->fetch();
    $repayable = (float)$row['repayable'];
    $loans['outstanding'] = (float)$pos['outstanding'];
    $loans['total_received'] = (float)$pos['received'];
    $loans['total_repayable'] = $repayable;
    $loans['total_repaid'] = (float)$pos['repaid'];
    $loans['progress_pct'] = $repayable > 0 ? (int)min(100, round(((float)$pos['repaid'] / $repayable) * 100)) : 0;
    $loans['active_count'] = (int)$row['active'];

    $stmt = $pdo->prepare('SELECT COALESCE(SUM(principal),0) FROM company_loans WHERE (? IS NULL OR date_received >= ?) AND (? IS NULL OR date_received <= ?)');
    $stmt->execute([$from, $from, $to, $to]);
    $loans['received_in_period'] = (float)$stmt->fetchColumn();
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM loan_repayments WHERE (? IS NULL OR paid_date >= ?) AND (? IS NULL OR paid_date <= ?)');
    $stmt->execute([$from, $from, $to, $to]);
    $loans['repaid_in_period'] = (float)$stmt->fetchColumn();
}

// ---- Last 6 months, income vs expenses (always shown, independent of the filter) ----
$stmt = $pdo->query("
    SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS ym,
           COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income,
           COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expenses
    FROM finance_transactions
    WHERE transaction_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
    GROUP BY ym
");
$byMonth = [];
foreach ($stmt->fetchAll() as $r) $byMonth[$r['ym']] = ['income' => (float)$r['income'], 'expenses' => (float)$r['expenses']];
$trend = [];
for ($i = 5; $i >= 0; $i--) {
    $ym = date('Y-m', strtotime("first day of -$i months"));
    $trend[] = ['ym' => $ym, 'label' => date('M', strtotime($ym . '-01')),
        'income' => $byMonth[$ym]['income'] ?? 0.0, 'expenses' => $byMonth[$ym]['expenses'] ?? 0.0];
}

json_response([
    'range' => ['period' => $allTime && $period !== 'all' ? 'all' : $period, 'from' => $from, 'to' => $to, 'label' => $label],
    'income' => $income,
    'expenses' => $expenses,
    'profit' => $profit,
    'margin_pct' => $income > 0 ? round(($profit / $income) * 100, 1) : null,
    'loans' => $loans,
    'trend' => $trend,
]);
