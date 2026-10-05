<?php
/**
 * MABUMBA TECH — Accountant Desk API
 * Schema: migration_033_accountant_workflow.sql
 *
 * One endpoint for the Accountant / Finance Manager:
 *   - finished projects  -> record the project budget as company income
 *   - company budgets (emergency / marketing / special / other approved funds)
 *     -> pay them (part or full); every payment becomes an expense. Salaries
 *     are a SEPARATE tab and a separate ledger category; both reduce company funds.
 *   - company loans: loans received, repayments, balance, progress and history
 *   - company members' bank accounts + monthly salary
 *   - paying salaries from company profit (a shortfall is shown as a loss,
 *     but workers are always paid) and unpaid months
 */
require_once __DIR__ . '/../../includes/api.php';
require_once __DIR__ . '/../../includes/accountant.php';

$me = api_require_any_permission(['finance.view', 'payroll.view', 'finance.manage', 'payroll.manage']);
$canFinance = has_permission($me, 'finance.manage');
$canPayroll = has_permission($me, 'payroll.manage');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'record_project_income') {
        if (!$canFinance) json_error('You do not have permission to record income.', 403);
        json_response(acc_record_project_income((int)($input['request_id'] ?? 0), (float)($input['amount'] ?? 0), $input['payment_method'] ?? 'cash', $me['id']));
    }

    if ($action === 'mark_transferred' || $action === 'pay_budget') {
        if (!$canFinance) json_error('You do not have permission to record budget payments.', 403);
        $budgetId = (int)($input['budget_id'] ?? 0);
        if ($action === 'mark_transferred') {
            json_response(acc_mark_transferred($budgetId, (string)($input['reference'] ?? ''), $input['payment_method'] ?? 'bank_transfer', $me['id']));
        }
        $res = acc_pay_budget($budgetId, (float)str_replace(',', '', (string)($input['amount'] ?? 0)), (string)($input['reference'] ?? ''),
            $input['payment_method'] ?? 'bank_transfer', (string)($input['note'] ?? ''), $me['id']);
        if (!empty($res['success'])) {
            $net = acc_profit_position()['net'];
            if ($net < 0) $res['message'] .= ' The company is now at a loss of TZS ' . number_format(abs($net)) . '.';
        }
        json_response($res);
    }

    if ($action === 'loan_create' || $action === 'loan_repay' || $action === 'loan_delete') {
        if (!$canFinance) json_error('You do not have permission to manage company loans.', 403);
        if ($action === 'loan_create') json_response(acc_loan_create($input, $me['id']));
        if ($action === 'loan_repay') json_response(acc_loan_repay((int)($input['loan_id'] ?? 0), $input, $me['id']));
        json_response(acc_loan_delete((int)($input['loan_id'] ?? 0), $me['id']));
    }

    if ($action === 'record_expense' || $action === 'record_other_income') {
        if (!$canFinance) json_error('You do not have permission to record expenses.', 403);
        json_response(acc_record_entry($action === 'record_expense' ? 'expense' : 'income', $input, $me['id']));
    }

    if ($action === 'save_bank_account') {
        if (!$canFinance && !$canPayroll) json_error('You do not have permission to edit bank accounts.', 403);
        json_response(acc_save_bank_account((int)($input['user_id'] ?? 0), $input, $me['id']));
    }

    if ($action === 'pay_salary' || $action === 'pay_all_salaries') {
        if (!$canPayroll) json_error('You do not have permission to pay salaries.', 403);
        $monthStart = acc_month_start($input['month'] ?? null);
        if ($monthStart > date('Y-m-01')) json_response(['success' => false, 'message' => 'You cannot pay salaries for a future month.']);
        $method = $input['payment_method'] ?? 'bank_transfer';

        if ($action === 'pay_salary') {
            $res = acc_pay_salary((int)($input['user_id'] ?? 0), $monthStart, $method, $input['reference'] ?? null, $me['id']);
        } else {
            $paid = 0; $total = 0.0; $failed = [];
            foreach (acc_salary_month($monthStart, acc_members())['rows'] as $row) {
                if ($row['status'] !== 'unpaid') continue;
                $r = acc_pay_salary((int)$row['user_id'], $monthStart, $method, null, $me['id']);
                if ($r['success']) { $paid++; $total += $r['amount']; } else { $failed[] = $row['full_name'] . ': ' . $r['message']; }
            }
            $res = ['success' => $paid > 0 || !$failed, 'message' => $paid
                ? "Paid $paid " . ($paid === 1 ? 'person' : 'people') . ' — TZS ' . number_format($total) . ' in total.' . ($failed ? ' Could not pay: ' . implode('; ', $failed) : '')
                : ($failed ? implode('; ', $failed) : 'Nobody is waiting to be paid for that month.')];
        }
        if (!empty($res['success'])) {
            $net = acc_profit_position()['net'];
            $res['profit_after'] = $net;
            if ($net < 0) $res['message'] .= ' The company is now at a loss of TZS ' . number_format(abs($net)) . '.';
        }
        json_response($res);
    }

    json_error('Unknown action.');
}

// ---- GET ----
$monthStart = acc_month_start($_GET['month'] ?? null);
if ($monthStart > date('Y-m-01')) $monthStart = date('Y-m-01');

// Income & expense statement for one month (the Expenses tab).
if (($_GET['view'] ?? '') === 'ledger') {
    $ledger = acc_ledger($monthStart);
    $ledger['position'] = acc_profit_position();
    $ledger['can_finance'] = $canFinance;
    json_response($ledger);
}

// Company loans: repayments and history for the chosen period (the Loans tab).
if (($_GET['view'] ?? '') === 'loans') {
    $loans = acc_loans((string)($_GET['period'] ?? 'all'), trim((string)($_GET['from'] ?? '')), trim((string)($_GET['to'] ?? '')));
    $loans['can_finance'] = $canFinance;
    json_response($loans);
}

$members = acc_members();
$income = acc_income_queue();
$budgets = acc_budgets();
$transfers = acc_budget_transfers($budgets);
$position = acc_profit_position();
$salary = acc_salary_month($monthStart, $members);
$strip = acc_months_strip($members);

$waitingIncome = 0.0;
foreach ($income['waiting'] as $r) $waitingIncome += (float)$r['to_record'];
$awaitingAmount = 0.0;
foreach ($transfers['awaiting'] as $t) $awaitingAmount += (float)$t['amount'];

$loanCounts = ['active' => 0, 'overdue' => 0];
if (acc_has_table('company_loans') && acc_has_table('loan_repayments')) {
    $loanRows = $pdo->query("
        SELECT l.due_date, l.total_repayable - COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id), 0) AS balance
        FROM company_loans l
    ")->fetchAll();
    foreach ($loanRows as $lr) {
        if ((float)$lr['balance'] <= 0.004) continue;
        $loanCounts['active']++;
        if ($lr['due_date'] && $lr['due_date'] < date('Y-m-d')) $loanCounts['overdue']++;
    }
}

$overdueMonths = array_values(array_filter($strip, function ($m) { return $m['overdue']; }));
$overdueAmount = array_sum(array_map(function ($m) { return $m['unpaid_amount']; }, $overdueMonths));
$currentMonth = null;
foreach ($strip as $m) if ($m['is_current']) $currentMonth = $m;

json_response([
    'position' => $position,
    'overview' => [
        'income_waiting_count' => count($income['waiting']),
        'income_waiting_amount' => $waitingIncome,
        'transfers_count' => count($transfers['awaiting']),
        'transfers_amount' => $awaitingAmount,
        'overdue_months' => count($overdueMonths),
        'overdue_amount' => $overdueAmount,
        'current_unpaid' => $currentMonth ? $currentMonth['unpaid'] : 0,
        'current_unpaid_amount' => $currentMonth ? $currentMonth['unpaid_amount'] : 0,
        'missing_bank' => count(array_filter($members, function ($m) { return empty($m['account_number']); })),
        'budgets_pending_count' => $budgets['totals']['pending_count'],
        'loans_active' => $loanCounts['active'],
        'loans_overdue' => $loanCounts['overdue'],
    ],
    'budgets' => $budgets,
    'income' => $income,
    'transfers' => $transfers,
    'members' => $members,
    'salary' => $salary,
    'months' => $strip,
    'can_finance' => $canFinance,
    'can_payroll' => $canPayroll,
]);
