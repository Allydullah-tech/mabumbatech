<?php
/**
 * MABUMBA TECH — Accountant Desk core logic
 * Schema: migration_033_accountant_workflow.sql
 *
 * Everything here ends up in the ONE finance ledger (finance_transactions) via
 * record_transaction(), so profit = income - expenses stays a single source of
 * truth:
 *   - finished project budget   -> income  (category 'project_income')
 *   - approved budget transfer  -> expense (category 'budget_request')
 *   - salary payment            -> expense (category 'salary')
 *   - loan repayment (interest) -> expense (category 'loan_interest')
 *
 * Product sales: the Sales Officer's recorded profit is what reaches company
 * profit (see sales_profit_summary() in finance.php) — never recalculated here.
 * Budgets (budget_payments) and salaries (payroll_records) are tracked in
 * separate tables and categories; both reduce company profit / available funds.
 * Schema for budgets payments + loans: migration_037_budgets_loans.sql
 */
require_once __DIR__ . '/finance.php';

const ACC_METHODS = ['cash', 'bank_transfer', 'mobile_money', 'card', 'other'];

function acc_method(?string $m, string $default = 'bank_transfer'): string
{
    return in_array($m, ACC_METHODS, true) ? $m : $default;
}

/** "TZS 1,500,000", "2.5m", "500k", "1,000,000 - 2,000,000" -> first amount as a number (0 if none). */
function acc_parse_amount(?string $text): float
{
    if ($text === null || trim($text) === '') return 0.0;
    if (!preg_match('/(\d[\d,]*(?:\.\d+)?)\s*(m|million|k|thousand)?/i', $text, $m)) return 0.0;
    $n = (float)str_replace(',', '', $m[1]);
    $unit = strtolower($m[2] ?? '');
    if ($unit === 'm' || $unit === 'million') $n *= 1000000;
    elseif ($unit === 'k' || $unit === 'thousand') $n *= 1000;
    return round($n, 2);
}

function acc_month_start(?string $ym): string
{
    $ym = trim((string)$ym);
    if (!preg_match('/^\d{4}-\d{2}$/', $ym)) $ym = date('Y-m');
    return $ym . '-01';
}

/** True when a table exists (new tables only appear after their migration has been run). */
function acc_has_table(string $table): bool
{
    global $pdo;
    static $cache = [];
    if (!isset($cache[$table])) {
        // (SHOW TABLES does not accept ? placeholders when PDO emulation is off — use information_schema.)
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
        $stmt->execute([$table]);
        $cache[$table] = ((int)$stmt->fetchColumn() > 0);
    }
    return $cache[$table];
}

/* ---------------------------------------------------------------------
 * Profit position (all-time ledger)
 *   income   = everything the ledger counts as income (product sales at full value)
 *   net      = company profit = income - cost of the goods sold - expenses
 *              i.e. only the Sales Officer's recorded profit comes from product sales
 *   available_funds = net profit + loan money received - loan principal repaid
 * ------------------------------------------------------------------- */
function acc_profit_position(): array
{
    global $pdo;
    $row = $pdo->query("
        SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income,
               COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expenses
        FROM finance_transactions
    ")->fetch();
    $income = (float)$row['income'];
    $expenses = (float)$row['expenses'];
    $sales = sales_profit_summary();
    $net = $income - $sales['cost'] - $expenses;
    $loans = acc_loans_position();
    return [
        'income' => $income, 'expenses' => $expenses, 'net' => $net,
        'sales_revenue' => $sales['revenue'], 'sales_profit' => $sales['profit'], 'cost_of_goods' => $sales['cost'],
        'loans_received' => $loans['received'], 'loans_repaid' => $loans['repaid'], 'loans_outstanding' => $loans['outstanding'],
        'available_funds' => $net + $loans['received'] - $loans['principal_repaid'],
    ];
}

/* ---------------------------------------------------------------------
 * 1) Finished projects -> record the budget as company income
 * ------------------------------------------------------------------- */
function acc_income_queue(): array
{
    global $pdo;
    $rows = $pdo->query("
        SELECT sr.id, sr.tracking_code, sr.subject, sr.budget, sr.completed_at, sr.customer_id,
               s.name AS service_name,
               COALESCE(sr.guest_name, u.full_name) AS customer_name,
               COALESCE((SELECT SUM(ft.amount) FROM finance_transactions ft WHERE ft.request_id = sr.id AND ft.type = 'income'), 0) AS collected,
               (SELECT MAX(ft.transaction_date) FROM finance_transactions ft WHERE ft.request_id = sr.id AND ft.type = 'income' AND ft.category = 'project_income') AS recorded_on,
               (SELECT COUNT(*) FROM finance_transactions ft WHERE ft.request_id = sr.id AND ft.type = 'income' AND ft.category = 'project_income') AS recorded_count
        FROM service_requests sr
        JOIN services s ON s.id = sr.service_id
        LEFT JOIN users u ON u.id = sr.customer_id
        WHERE sr.status IN ('completed', 'delivered')
        ORDER BY sr.completed_at DESC, sr.id DESC
        LIMIT 300
    ")->fetchAll();

    $waiting = [];
    $recorded = [];
    foreach ($rows as $r) {
        $budget = acc_parse_amount($r['budget']);
        $collected = (float)$r['collected'];
        $r['budget_amount'] = $budget;
        $r['to_record'] = $budget > 0 ? max($budget - $collected, 0) : 0;
        if ((int)$r['recorded_count'] > 0) {
            $recorded[] = $r;
        } elseif ($budget > 0 && $r['to_record'] <= 0) {
            $r['recorded_on'] = null;       // fully collected through invoices already
            $r['via_invoice'] = true;
            $recorded[] = $r;
        } else {
            $waiting[] = $r;
        }
    }
    return ['waiting' => $waiting, 'recorded' => array_slice($recorded, 0, 15)];
}

function acc_record_project_income(int $requestId, float $amount, string $method, int $by): array
{
    global $pdo;
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT id, tracking_code, subject, budget, customer_id, status FROM service_requests WHERE id = ? FOR UPDATE");
        $stmt->execute([$requestId]);
        $req = $stmt->fetch();
        if (!$req) throw new RuntimeException('Project not found.');
        if (!in_array($req['status'], ['completed', 'delivered'], true)) throw new RuntimeException('Only finished projects can be recorded as income.');

        $dupe = $pdo->prepare("SELECT COUNT(*) FROM finance_transactions WHERE request_id = ? AND type = 'income' AND category = 'project_income'");
        $dupe->execute([$requestId]);
        if ((int)$dupe->fetchColumn() > 0) throw new RuntimeException('This project has already been recorded as income.');

        $collected = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM finance_transactions WHERE request_id = ? AND type = 'income'");
        $collected->execute([$requestId]);
        $collectedAmount = (float)$collected->fetchColumn();
        $budget = acc_parse_amount($req['budget']);
        if ($budget > 0 && $amount > max($budget - $collectedAmount, 0) + 0.005) {
            throw new RuntimeException('The amount is more than the project budget still to be recorded (TZS ' . number_format(max($budget - $collectedAmount, 0)) . ').');
        }
        if ($amount <= 0) throw new RuntimeException('Enter a valid amount.');

        record_transaction('income', 'project_income', round($amount, 2), date('Y-m-d'),
            'Project income: ' . $req['subject'] . ' (' . $req['tracking_code'] . ')',
            $req['customer_id'] ? (int)$req['customer_id'] : null, $requestId, null, null, $by, acc_method($method, 'cash'));
        log_activity($by, 'Recorded project income', $req['tracking_code'] . ': TZS ' . number_format($amount));
        $pdo->commit();
        return ['success' => true, 'message' => 'Recorded TZS ' . number_format($amount) . ' as company income.'];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        return ['success' => false, 'message' => $e->getMessage()];
    }
}

/* ---------------------------------------------------------------------
 * 2) Company members + bank accounts
 * ------------------------------------------------------------------- */
function acc_members(): array
{
    global $pdo;
    return $pdo->query("
        SELECT u.id, u.full_name, u.role, u.job_role_key, u.phone, u.email, u.hire_date,
               COALESCE(jr.label, CASE u.role WHEN 'super_admin' THEN 'Super Admin' WHEN 'admin' THEN 'Administrator' ELSE 'Staff' END) AS position_label,
               p.bank_name, p.account_name, p.account_number, p.monthly_salary, p.salary_start, p.created_at AS pay_created_at
        FROM users u
        LEFT JOIN job_roles jr ON jr.job_role_key = u.job_role_key
        LEFT JOIN staff_pay_details p ON p.user_id = u.id
        WHERE u.role IN ('staff','admin','super_admin') AND u.status = 'active' AND u.employment_status = 'active'
        ORDER BY u.full_name ASC
    ")->fetchAll();
}

function acc_save_bank_account(int $userId, array $in, int $by): array
{
    global $pdo;
    $chk = $pdo->prepare("SELECT full_name FROM users WHERE id = ? AND role IN ('staff','admin','super_admin')");
    $chk->execute([$userId]);
    if (!$chk->fetchColumn()) return ['success' => false, 'message' => 'Company member not found.'];

    $bank = trim(preg_replace('/\s+/', ' ', $in['bank_name'] ?? ''));
    $accName = trim(preg_replace('/\s+/', ' ', $in['account_name'] ?? ''));
    $accNo = trim($in['account_number'] ?? '');
    $anyBank = ($bank !== '' || $accName !== '' || $accNo !== '');
    if ($anyBank) {
        if ($bank === '' || $accName === '' || $accNo === '') return ['success' => false, 'message' => 'Please fill all three: Bank name, Account name and Account number.'];
        if (mb_strlen($bank) > 100 || mb_strlen($accName) > 120) return ['success' => false, 'message' => 'Bank name or account name is too long.'];
        if (!preg_match('/^[0-9][0-9 \-]{4,39}$/', $accNo)) return ['success' => false, 'message' => 'Account number should contain digits only (5 to 40 characters).'];
    }

    $salaryRaw = trim((string)($in['monthly_salary'] ?? ''));
    $salary = $salaryRaw === '' ? null : (float)str_replace(',', '', $salaryRaw);
    if ($salary !== null && $salary < 0) return ['success' => false, 'message' => 'Salary cannot be negative.'];
    $startRaw = trim((string)($in['salary_start'] ?? ''));
    $start = preg_match('/^\d{4}-\d{2}$/', $startRaw) ? $startRaw . '-01' : null;
    if ($salary !== null && $salary > 0 && !$start) $start = date('Y-m-01');

    $pdo->prepare("
        INSERT INTO staff_pay_details (user_id, bank_name, account_name, account_number, monthly_salary, salary_start, updated_by)
        VALUES (?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE bank_name = VALUES(bank_name), account_name = VALUES(account_name), account_number = VALUES(account_number),
                                monthly_salary = VALUES(monthly_salary), salary_start = VALUES(salary_start), updated_by = VALUES(updated_by)
    ")->execute([$userId, $bank ?: null, $accName ?: null, $accNo ?: null, $salary, $start, $by]);
    log_activity($by, 'Updated bank account / salary', 'User #' . $userId);
    return ['success' => true, 'message' => 'Bank account and salary saved.'];
}

/* ---------------------------------------------------------------------
 * 3) Approved budget requests -> money transfer -> company expense
 * ------------------------------------------------------------------- */
function acc_budget_code(int $id): string { return 'BR-' . str_pad((string)$id, 4, '0', STR_PAD_LEFT); }

function acc_budget_type_label(string $department): string
{
    return ['marketing' => 'Marketing / promotional', 'legal' => 'Legal / special company expense', 'other' => 'Other / emergency'][$department] ?? 'Other';
}

/**
 * Every budget request with its approved amount, what has been paid so far and
 * what is still to pay, plus the payment records. (Needs migration_037; without
 * it the page falls back to the simple "mark as transferred" list.)
 */
function acc_budgets(): array
{
    global $pdo;
    $hasPay = acc_has_table('budget_payments');
    $hasApproved = (bool)$pdo->query("SHOW COLUMNS FROM budget_requests LIKE 'approved_amount'")->fetch();
    $approvedExpr = $hasApproved ? 'COALESCE(br.approved_amount, br.amount)' : 'br.amount';
    $paidExpr = $hasPay
        ? '(SELECT COALESCE(SUM(bp.amount),0) FROM budget_payments bp WHERE bp.budget_id = br.id)'
        : "(CASE WHEN br.transfer_status = 'transferred' THEN br.amount ELSE 0 END)";

    $rows = $pdo->query("
        SELECT br.id, br.requested_by, br.department, br.purpose, br.details, br.amount AS requested_amount,
               br.status, br.transfer_status, br.decision_note, br.decided_at, br.created_at,
               br.transfer_reference, br.transferred_at,
               $approvedExpr AS approved_amount, $paidExpr AS paid_total,
               u.full_name AS requester_name, u.phone AS requester_phone, du.full_name AS decided_by_name,
               p.bank_name, p.account_name, p.account_number
        FROM budget_requests br
        JOIN users u ON u.id = br.requested_by
        LEFT JOIN users du ON du.id = br.decided_by
        LEFT JOIN staff_pay_details p ON p.user_id = br.requested_by
        ORDER BY br.created_at DESC, br.id DESC
        LIMIT 300
    ")->fetchAll();

    $payments = [];
    if ($hasPay && $rows) {
        $ids = implode(',', array_map(function ($r) { return (int)$r['id']; }, $rows));
        foreach ($pdo->query("
            SELECT bp.*, u.full_name AS paid_by_name FROM budget_payments bp LEFT JOIN users u ON u.id = bp.paid_by
            WHERE bp.budget_id IN ($ids) ORDER BY bp.paid_at ASC, bp.id ASC
        ")->fetchAll() as $pay) $payments[(int)$pay['budget_id']][] = $pay;
    }

    $tot = ['requested' => 0.0, 'approved' => 0.0, 'paid' => 0.0, 'remaining' => 0.0, 'pending_count' => 0, 'awaiting_count' => 0];
    foreach ($rows as &$r) {
        $r['code'] = acc_budget_code((int)$r['id']);
        $r['type_label'] = acc_budget_type_label((string)$r['department']);
        $approved = $r['status'] === 'approved' ? (float)$r['approved_amount'] : 0.0;
        $paid = $r['status'] === 'approved' ? (float)$r['paid_total'] : 0.0;
        $r['approved_amount'] = $r['status'] === 'approved' ? $approved : null;
        $r['paid_total'] = $paid;
        $r['remaining'] = $r['status'] === 'approved' ? max($approved - $paid, 0) : 0.0;
        if ($r['status'] === 'rejected') $r['pay_state'] = 'rejected';
        elseif ($r['status'] === 'pending') $r['pay_state'] = 'pending';
        elseif ($r['remaining'] <= 0.004) $r['pay_state'] = 'paid';
        elseif ($paid > 0) $r['pay_state'] = 'partial';
        else $r['pay_state'] = 'awaiting';
        $r['payments'] = $payments[(int)$r['id']] ?? [];
        $tot['requested'] += (float)$r['requested_amount'];
        $tot['approved'] += $approved; $tot['paid'] += $paid; $tot['remaining'] += $r['remaining'];
        if ($r['status'] === 'pending') $tot['pending_count']++;
        if (in_array($r['pay_state'], ['awaiting', 'partial'], true)) $tot['awaiting_count']++;
    }
    unset($r);
    return ['requests' => $rows, 'totals' => $tot, 'migrated' => $hasPay];
}

/** What the Accountant still has to pay out: approved budgets with money remaining. */
function acc_budget_transfers(?array $all = null): array
{
    $all = $all ?? acc_budgets();
    $awaiting = array_values(array_filter($all['requests'], function ($r) { return in_array($r['pay_state'], ['awaiting', 'partial'], true); }));
    foreach ($awaiting as &$r) { $r['amount'] = $r['remaining']; }       // "amount waiting" = what is still to pay
    unset($r);
    return ['awaiting' => $awaiting, 'done' => []];
}

/** Pays (part of) an approved budget: reduces company funds as an expense in the 'budget_request' category. */
function acc_pay_budget(int $budgetId, float $amount, string $reference, string $method, string $note, int $by): array
{
    global $pdo;
    if (!acc_has_table('budget_payments')) return acc_mark_transferred($budgetId, $reference, $method, $by);   // migration 037 not run yet
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT br.*, u.full_name AS requester_name FROM budget_requests br JOIN users u ON u.id = br.requested_by WHERE br.id = ? FOR UPDATE");
        $stmt->execute([$budgetId]);
        $br = $stmt->fetch();
        if (!$br) throw new RuntimeException('Budget request not found.');
        if ($br['status'] !== 'approved') throw new RuntimeException('Only approved budgets can be paid.');

        $approved = (float)($br['approved_amount'] ?? $br['amount']);
        $paidStmt = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM budget_payments WHERE budget_id = ?');
        $paidStmt->execute([$budgetId]);
        $paid = (float)$paidStmt->fetchColumn();
        $remaining = round($approved - $paid, 2);
        if ($remaining <= 0.004) throw new RuntimeException('This budget has already been paid in full.');

        $amount = round($amount, 2);
        if ($amount <= 0) throw new RuntimeException('Enter an amount greater than zero.');
        if ($amount > $remaining + 0.004) throw new RuntimeException('The amount is more than what is still to pay (TZS ' . number_format($remaining) . ').');

        $ref = trim($reference) ?: null;
        $note = mb_substr(trim($note), 0, 255) ?: null;
        $isFinal = ($amount >= $remaining - 0.004);
        $txnId = record_transaction('expense', 'budget_request', $amount, date('Y-m-d'),
            mb_substr('Company budget ' . acc_budget_code($budgetId) . ': ' . $br['purpose'] . ' — ' . $br['requester_name'] . ($isFinal && $paid > 0 ? ' (final payment)' : (!$isFinal ? ' (part payment)' : '')), 0, 255),
            null, null, null, null, $by, acc_method($method));
        $pdo->prepare('INSERT INTO budget_payments (budget_id, amount, payment_method, reference, note, transaction_id, paid_by) VALUES (?,?,?,?,?,?,?)')
            ->execute([$budgetId, $amount, acc_method($method), $ref, $note, $txnId, $by]);
        if ($isFinal) {
            $pdo->prepare("UPDATE budget_requests SET transfer_status = 'transferred', transferred_by = ?, transferred_at = NOW(), transfer_reference = ?, transaction_id = ? WHERE id = ?")
                ->execute([$by, $ref, $txnId, $budgetId]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        return ['success' => false, 'message' => $e->getMessage()];
    }

    notify_user((int)$br['requested_by'], 'budget_transferred', 'Budget money paid',
        $br['purpose'] . ': TZS ' . number_format($amount) . ($isFinal ? ' (fully paid)' : ' (part payment)') . ' has been sent to you.' . ($ref ? ' Reference: ' . $ref . '.' : ''),
        '/backend/admin/legal.php?budget=' . $budgetId);
    log_activity($by, 'Budget payment', acc_budget_code($budgetId) . ': TZS ' . number_format($amount));
    return ['success' => true, 'message' => 'Payment recorded. TZS ' . number_format($amount) . ' was deducted from company funds as a budget expense' . ($isFinal ? ' — this budget is now fully paid.' : '.')];
}

/** Old one-step transfer (kept for installs that have not run migration 037 yet). */
function acc_mark_transferred(int $budgetId, string $reference, string $method, int $by): array
{
    global $pdo;
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT br.*, u.full_name AS requester_name FROM budget_requests br JOIN users u ON u.id = br.requested_by WHERE br.id = ? FOR UPDATE");
        $stmt->execute([$budgetId]);
        $br = $stmt->fetch();
        if (!$br) throw new RuntimeException('Budget request not found.');
        if ($br['status'] !== 'approved') throw new RuntimeException('Only approved requests can be transferred.');
        if ($br['transfer_status'] === 'transferred') throw new RuntimeException('This request was already transferred.');

        $ref = trim($reference) ?: null;
        $txnId = record_transaction('expense', 'budget_request', (float)$br['amount'], date('Y-m-d'),
            'Budget transfer BR-' . str_pad((string)$budgetId, 4, '0', STR_PAD_LEFT) . ': ' . $br['purpose'] . ' — ' . $br['requester_name'],
            null, null, null, null, $by, acc_method($method));
        $pdo->prepare("UPDATE budget_requests SET transfer_status = 'transferred', transferred_by = ?, transferred_at = NOW(), transfer_reference = ?, transaction_id = ? WHERE id = ?")
            ->execute([$by, $ref, $txnId, $budgetId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        return ['success' => false, 'message' => $e->getMessage()];
    }

    notify_user((int)$br['requested_by'], 'budget_transferred', 'Budget money transferred',
        $br['purpose'] . ' (TZS ' . number_format((float)$br['amount']) . ') has been transferred to your account.' . ($ref ? ' Reference: ' . $ref . '.' : ''),
        '/backend/admin/legal.php?budget=' . $budgetId);
    log_activity($by, 'Budget transferred', 'BR-' . $budgetId . ': TZS ' . number_format((float)$br['amount']));
    return ['success' => true, 'message' => 'Transfer recorded. TZS ' . number_format((float)$br['amount']) . ' was deducted from company profit.'];
}

/* ---------------------------------------------------------------------
 * 4) Salaries
 * ------------------------------------------------------------------- */

/** Is `$monthStart` (Y-m-01) a month this member must be paid for? */
function acc_salary_due_for_month(array $m, string $monthStart): bool
{
    if ($m['monthly_salary'] === null || (float)$m['monthly_salary'] <= 0) return false;
    $start = $m['salary_start'] ?: substr((string)($m['pay_created_at'] ?: date('Y-m-d')), 0, 7) . '-01';
    return $monthStart >= $start;
}

function acc_salary_month(string $monthStart, array $members): array
{
    global $pdo;
    $stmt = $pdo->prepare("SELECT * FROM payroll_records WHERE period_month = ?");
    $stmt->execute([$monthStart]);
    $payroll = [];
    foreach ($stmt->fetchAll() as $p) $payroll[(int)$p['user_id']] = $p;

    $rows = [];
    $due = 0.0; $paid = 0.0; $dueCount = 0; $paidCount = 0;
    foreach ($members as $m) {
        $uid = (int)$m['id'];
        $p = $payroll[$uid] ?? null;
        $expected = acc_salary_due_for_month($m, $monthStart);
        if (!$expected && !($p && $p['status'] === 'paid')) {
            $status = ((float)$m['monthly_salary'] > 0) ? 'not_started' : 'no_salary';
            $amount = (float)$m['monthly_salary'];
        } else {
            $amount = $p ? (float)$p['net_amount'] : (float)$m['monthly_salary'];
            $status = ($p && $p['status'] === 'paid') ? 'paid' : 'unpaid';
        }
        if ($status === 'paid') { $paid += $amount; $paidCount++; }
        if ($status === 'unpaid') { $due += $amount; $dueCount++; }
        $rows[] = [
            'user_id' => $uid, 'full_name' => $m['full_name'], 'position_label' => $m['position_label'],
            'bank_name' => $m['bank_name'], 'account_name' => $m['account_name'], 'account_number' => $m['account_number'],
            'amount' => $amount, 'status' => $status,
            'paid_at' => $p['paid_at'] ?? null, 'payment_reference' => $p['payment_reference'] ?? null,
        ];
    }
    return ['month' => substr($monthStart, 0, 7), 'rows' => $rows, 'due' => $due, 'paid' => $paid, 'due_count' => $dueCount, 'paid_count' => $paidCount];
}

/** One chip per month (oldest first) from when salaries started being tracked up to this month. */
function acc_months_strip(array $members): array
{
    global $pdo;
    $earliest = null;
    foreach ($members as $m) {
        if ((float)$m['monthly_salary'] <= 0) continue;
        $s = $m['salary_start'] ?: substr((string)($m['pay_created_at'] ?: date('Y-m-d')), 0, 7) . '-01';
        if ($earliest === null || $s < $earliest) $earliest = $s;
    }
    if ($earliest === null) return [];
    $limit = date('Y-m-01', strtotime('-23 months'));
    if ($earliest < $limit) $earliest = $limit;

    $paidMap = [];
    $stmt = $pdo->prepare("SELECT user_id, period_month, net_amount FROM payroll_records WHERE status = 'paid' AND period_month >= ?");
    $stmt->execute([$earliest]);
    foreach ($stmt->fetchAll() as $p) $paidMap[$p['period_month']][(int)$p['user_id']] = (float)$p['net_amount'];

    $current = date('Y-m-01');
    $out = [];
    for ($d = $earliest; $d <= $current; $d = date('Y-m-01', strtotime($d . ' +1 month'))) {
        $expected = 0; $unpaid = 0; $unpaidAmount = 0.0;
        foreach ($members as $m) {
            if (!acc_salary_due_for_month($m, $d)) continue;
            $expected++;
            if (!isset($paidMap[$d][(int)$m['id']])) { $unpaid++; $unpaidAmount += (float)$m['monthly_salary']; }
        }
        if ($expected === 0) continue;
        $state = $unpaid === 0 ? 'paid' : ($unpaid === $expected ? 'unpaid' : 'partial');
        $out[] = [
            'month' => substr($d, 0, 7), 'label' => date('M Y', strtotime($d)), 'expected' => $expected, 'unpaid' => $unpaid,
            'unpaid_amount' => $unpaidAmount, 'state' => $state, 'overdue' => ($d < $current && $unpaid > 0), 'is_current' => ($d === $current),
        ];
    }
    return $out;
}

/** Pays one member's salary for a month. Never blocked by low profit — workers must be paid. */
function acc_pay_salary(int $userId, string $monthStart, string $method, ?string $reference, int $by): array
{
    global $pdo;
    $pdo->beginTransaction();
    try {
        $u = $pdo->prepare("SELECT u.id, u.full_name, p.monthly_salary FROM users u LEFT JOIN staff_pay_details p ON p.user_id = u.id WHERE u.id = ? AND u.role IN ('staff','admin','super_admin')");
        $u->execute([$userId]);
        $m = $u->fetch();
        if (!$m) throw new RuntimeException('Company member not found.');

        $pr = $pdo->prepare("SELECT * FROM payroll_records WHERE user_id = ? AND period_month = ? FOR UPDATE");
        $pr->execute([$userId, $monthStart]);
        $payroll = $pr->fetch();
        if ($payroll && $payroll['status'] === 'paid') throw new RuntimeException($m['full_name'] . ' was already paid for ' . date('F Y', strtotime($monthStart)) . '.');

        if ($payroll) {
            $payrollId = (int)$payroll['id'];
            $net = (float)$payroll['net_amount'];
        } else {
            $salary = (float)$m['monthly_salary'];
            if ($salary <= 0) throw new RuntimeException('Set ' . $m['full_name'] . "'s monthly salary first (Bank Accounts tab).");
            $pdo->prepare('INSERT INTO payroll_records (user_id, period_month, gross_amount, deductions, net_amount, recorded_by) VALUES (?,?,?,?,?,?)')
                ->execute([$userId, $monthStart, $salary, 0, $salary, $by]);
            $payrollId = (int)$pdo->lastInsertId();
            $net = $salary;
        }

        $ref = $reference !== null && trim($reference) !== '' ? trim($reference) : null;
        record_transaction('expense', 'salary', $net, date('Y-m-d'),
            'Salary for ' . $m['full_name'] . ' — ' . date('F Y', strtotime($monthStart)),
            null, null, null, $payrollId, $by, acc_method($method));
        $pdo->prepare("UPDATE payroll_records SET status = 'paid', paid_at = NOW(), payment_reference = ?, paid_by = ? WHERE id = ?")
            ->execute([$ref, $by, $payrollId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        return ['success' => false, 'message' => $e->getMessage(), 'amount' => 0];
    }
    notify_user($userId, 'payment_received', 'Salary paid',
        'Your salary for ' . date('F Y', strtotime($monthStart)) . ' (TZS ' . number_format($net) . ') has been paid.', '');
    log_activity($by, 'Paid salary', $m['full_name'] . ' ' . date('Y-m', strtotime($monthStart)) . ': TZS ' . number_format($net));
    return ['success' => true, 'message' => 'Paid ' . $m['full_name'] . ' TZS ' . number_format($net) . '.', 'amount' => $net];
}

/* ---------------------------------------------------------------------
 * 5) Expenses (and other income) recorded by the Accountant
 * ------------------------------------------------------------------- */

/** Categories the Accountant can choose when recording an entry by hand. */
function acc_manual_categories(): array
{
    return [
        'expense' => [
            ['rent',          'Office rent',                 'bi-building',        'Premises & utilities'],
            ['utilities',     'Electricity & water',         'bi-lightning-charge', 'Premises & utilities'],
            ['internet',      'Internet & airtime',          'bi-wifi',            'Premises & utilities'],
            ['transport',     'Transport & fuel',            'bi-truck',           'Operations'],
            ['supplies',      'Office supplies',             'bi-pencil',          'Operations'],
            ['equipment',     'Equipment & tools',           'bi-pc-display',      'Operations'],
            ['maintenance',   'Repairs & maintenance',       'bi-tools',           'Operations'],
            ['software',      'Software & subscriptions',    'bi-cloud',           'Operations'],
            ['meals',         'Meals & refreshments',        'bi-cup-hot',         'Operations'],
            ['training',      'Training & development',      'bi-mortarboard',     'People'],
            ['staff_welfare', 'Staff welfare',               'bi-heart',           'People'],
            ['marketing',     'Marketing & advertising',     'bi-megaphone',       'Business'],
            ['professional',  'Professional & legal fees',   'bi-briefcase',       'Business'],
            ['taxes',         'Taxes & licences',            'bi-receipt',         'Business'],
            ['insurance',     'Insurance',                   'bi-shield-check',    'Business'],
            ['bank_charges',  'Bank charges',                'bi-bank',            'Business'],
            ['other',         'Other expense',               'bi-three-dots',      'Other'],
        ],
        'income' => [
            ['other_income',  'Other income',                'bi-plus-circle',     'Income'],
            ['interest',      'Interest received',           'bi-percent',         'Income'],
            ['grant',         'Grant / donation',            'bi-gift',            'Income'],
            ['refund',        'Refund received',             'bi-arrow-counterclockwise', 'Income'],
        ],
    ];
}

/** Entries the system posts by itself — shown in the statement but not editable by hand. */
function acc_system_categories(): array
{
    return [
        'salary' => 'Salary', 'budget_request' => 'Company budget', 'inventory_damage' => 'Damaged stock', 'loan_interest' => 'Loan interest',
        'product_sale' => 'Product sale', 'project_income' => 'Project income', 'project_payment' => 'Project payment',
    ];
}

function acc_category_label(string $key): string
{
    $sys = acc_system_categories();
    if (isset($sys[$key])) return $sys[$key];
    foreach (acc_manual_categories() as $list) foreach ($list as $c) if ($c[0] === $key) return $c[1];
    return ucfirst(str_replace('_', ' ', $key));
}

/** payee / reference columns exist only after migration_034 — never crash if it has not been run yet. */
function acc_has_entry_columns(): bool
{
    global $pdo;
    static $has = null;
    if ($has === null) {
        $has = (bool)$pdo->query("SHOW COLUMNS FROM finance_transactions LIKE 'payee'")->fetch();
    }
    return $has;
}

/** Every ledger entry of one month (income + expenses) with totals and a per-category breakdown. */
function acc_ledger(string $monthStart): array
{
    global $pdo;
    $end = date('Y-m-t', strtotime($monthStart));
    $extra = acc_has_entry_columns() ? 'ft.payee, ft.reference,' : 'NULL AS payee, NULL AS reference,';
    $stmt = $pdo->prepare("
        SELECT ft.id, ft.type, ft.category, ft.amount, ft.payment_method, ft.transaction_date, ft.description, ft.created_at,
               $extra u.full_name AS recorded_by_name, sr.tracking_code
        FROM finance_transactions ft
        LEFT JOIN users u ON u.id = ft.recorded_by
        LEFT JOIN service_requests sr ON sr.id = ft.request_id
        WHERE ft.transaction_date BETWEEN ? AND ?
        ORDER BY ft.transaction_date DESC, ft.id DESC
        LIMIT 1000
    ");
    $stmt->execute([$monthStart, $end]);
    $sys = acc_system_categories();
    $rows = [];
    foreach ($stmt->fetchAll() as $r) {
        $r['category_label'] = acc_category_label($r['category']);
        $r['auto'] = isset($sys[$r['category']]);
        $r['voucher'] = ($r['type'] === 'expense' ? 'EXP-' : 'INC-') . str_pad((string)$r['id'], 5, '0', STR_PAD_LEFT);
        $rows[] = $r;
    }

    $tot = $pdo->prepare("SELECT type, category, SUM(amount) AS total FROM finance_transactions WHERE transaction_date BETWEEN ? AND ? GROUP BY type, category");
    $tot->execute([$monthStart, $end]);
    $income = 0.0; $expense = 0.0; $byCat = [];
    foreach ($tot->fetchAll() as $t) {
        if ($t['type'] === 'income') { $income += (float)$t['total']; continue; }
        $expense += (float)$t['total'];
        $byCat[] = ['category' => $t['category'], 'label' => acc_category_label($t['category']), 'total' => (float)$t['total']];
    }
    usort($byCat, function ($a, $b) { return $b['total'] <=> $a['total']; });

    $sales = sales_profit_summary($monthStart, $end);
    return [
        'month' => substr($monthStart, 0, 7),
        'rows' => $rows,
        'totals' => [
            'income' => $income, 'expense' => $expense, 'net' => $income - $sales['cost'] - $expense,
            'sales_revenue' => $sales['revenue'], 'sales_profit' => $sales['profit'], 'cost_of_goods' => $sales['cost'],
        ],
        'by_category' => $byCat,
        'categories' => acc_manual_categories(),
    ];
}

/** Records a manual expense (or other income) — validated, de-duplicated and written to the ledger. */
function acc_record_entry(string $type, array $in, int $by): array
{
    global $pdo;
    if (!in_array($type, ['expense', 'income'], true)) return ['success' => false, 'message' => 'Unknown entry type.'];

    $category = trim((string)($in['category'] ?? ''));
    $valid = array_map(function ($c) { return $c[0]; }, acc_manual_categories()[$type]);
    if (!in_array($category, $valid, true)) return ['success' => false, 'message' => 'Please choose a category.'];

    $amount = round((float)str_replace(',', '', (string)($in['amount'] ?? 0)), 2);
    if ($amount <= 0) return ['success' => false, 'message' => 'Enter an amount greater than zero.'];
    if ($amount > 9999999999) return ['success' => false, 'message' => 'That amount is too large.'];

    $date = trim((string)($in['transaction_date'] ?? '')) ?: date('Y-m-d');
    $d = DateTime::createFromFormat('Y-m-d', $date);
    if (!$d || $d->format('Y-m-d') !== $date) return ['success' => false, 'message' => 'Enter a valid date.'];
    if ($date > date('Y-m-d')) return ['success' => false, 'message' => 'The date cannot be in the future.'];
    if ($date < '2000-01-01') return ['success' => false, 'message' => 'Enter a valid date.'];

    $payee = trim(preg_replace('/\s+/', ' ', (string)($in['payee'] ?? '')));
    $label = $type === 'expense' ? 'Paid to' : 'Received from';
    if (mb_strlen($payee) < 2) return ['success' => false, 'message' => "Please enter who the money was $label (2+ characters)."];
    if (mb_strlen($payee) > 120) return ['success' => false, 'message' => "'$label' is too long (120 characters maximum)."];

    $description = trim(preg_replace('/\s+/', ' ', (string)($in['description'] ?? '')));
    if (mb_strlen($description) < 3) return ['success' => false, 'message' => 'Please describe what the money was for.'];
    if (mb_strlen($description) > 255) return ['success' => false, 'message' => 'The description is too long (255 characters maximum).'];

    $reference = trim((string)($in['reference'] ?? ''));
    if (mb_strlen($reference) > 80) return ['success' => false, 'message' => 'The reference is too long (80 characters maximum).'];
    $method = acc_method($in['payment_method'] ?? null, 'cash');

    // A double-click or a refresh must not record the same entry twice.
    $hasCols = acc_has_entry_columns();
    $dupe = $pdo->prepare("SELECT id FROM finance_transactions WHERE type = ? AND category = ? AND amount = ? AND transaction_date = ? AND recorded_by = ? AND created_at >= (NOW() - INTERVAL 2 MINUTE) AND description = ? LIMIT 1");
    $dupe->execute([$type, $category, $amount, $date, $by, $hasCols ? $description : $payee . ' — ' . $description]);
    if ($dupe->fetchColumn()) return ['success' => false, 'message' => 'This entry was just recorded. Please check the list before adding it again.'];

    $id = record_transaction($type, $category, $amount, $date, $hasCols ? $description : $payee . ' — ' . $description, null, null, null, null, $by, $method);
    if ($hasCols) {
        $pdo->prepare('UPDATE finance_transactions SET payee = ?, reference = ? WHERE id = ?')->execute([$payee, $reference ?: null, $id]);
    }
    log_activity($by, $type === 'expense' ? 'Recorded expense' : 'Recorded other income', acc_category_label($category) . ': TZS ' . number_format($amount) . ' — ' . $payee);

    $voucher = ($type === 'expense' ? 'EXP-' : 'INC-') . str_pad((string)$id, 5, '0', STR_PAD_LEFT);
    $net = acc_profit_position()['net'];
    $msg = ($type === 'expense' ? 'Expense' : 'Income') . " $voucher recorded: TZS " . number_format($amount) . '.';
    if ($type === 'expense' && $net < 0) $msg .= ' The company is now at a loss of TZS ' . number_format(abs($net)) . '.';
    return ['success' => true, 'message' => $msg, 'voucher' => $voucher, 'profit_after' => $net];
}

/* ---------------------------------------------------------------------
 * 6) Company loans (migration_037)
 *   A loan is NOT income — it is money owed. The Loans records keep the
 *   loan, every repayment and the balance. Only the interest part of a
 *   repayment is an expense (ledger category 'loan_interest'); the principal
 *   part just pays the debt down. Company funds = profit + loans received
 *   - principal repaid (see acc_profit_position()).
 * ------------------------------------------------------------------- */
function acc_loan_code(int $id): string { return 'LN-' . str_pad((string)$id, 4, '0', STR_PAD_LEFT); }

/** Totals across all loans (zeros when the loans tables are not installed). */
function acc_loans_position(): array
{
    global $pdo;
    $zero = ['received' => 0.0, 'repaid' => 0.0, 'principal_repaid' => 0.0, 'outstanding' => 0.0];
    if (!acc_has_table('company_loans') || !acc_has_table('loan_repayments')) return $zero;
    $l = $pdo->query('SELECT COALESCE(SUM(principal),0) AS received, COALESCE(SUM(total_repayable),0) AS repayable FROM company_loans')->fetch();
    $r = $pdo->query('SELECT COALESCE(SUM(amount),0) AS repaid, COALESCE(SUM(principal_part),0) AS principal_repaid FROM loan_repayments')->fetch();
    return [
        'received' => (float)$l['received'], 'repaid' => (float)$r['repaid'], 'principal_repaid' => (float)$r['principal_repaid'],
        'outstanding' => max((float)$l['repayable'] - (float)$r['repaid'], 0),
    ];
}

/** [from, to, label] for a loans period filter; from/to are 'Y-m-d' or null for "all time". */
function acc_period_range(string $period, string $from, string $to): array
{
    $t = new DateTimeImmutable('today');
    $valid = function (string $d): bool {
        return (bool)preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
    };
    switch ($period) {
        case 'this_month': return [$t->format('Y-m-01'), $t->format('Y-m-d'), 'This month'];
        case 'last_month': return [$t->modify('first day of last month')->format('Y-m-d'), $t->modify('last day of last month')->format('Y-m-d'), 'Last month'];
        case 'last_3_months': return [$t->modify('first day of -2 months')->format('Y-m-d'), $t->format('Y-m-d'), 'Last 3 months'];
        case 'this_year': return [$t->format('Y-01-01'), $t->format('Y-m-d'), 'This year'];
        case 'custom':
            $okFrom = $valid($from); $okTo = $valid($to);
            if ($okFrom || $okTo) {
                if (!$okFrom) $from = $to;
                if (!$okTo) $to = $from;
                if ($from > $to) { $x = $from; $from = $to; $to = $x; }
                return [$from, $to, date('j M Y', strtotime($from)) . ($from === $to ? '' : ' – ' . date('j M Y', strtotime($to)))];
            }
            break;
    }
    return [null, null, 'All time'];
}

/** Loans with progress + the repayment history for the chosen period. */
function acc_loans(string $period = 'all', string $from = '', string $to = ''): array
{
    global $pdo;
    if (!acc_has_table('company_loans') || !acc_has_table('loan_repayments')) {
        return ['migrated' => false, 'loans' => [], 'repayments' => [], 'range' => ['period' => 'all', 'label' => 'All time'], 'summary' => [], 'position' => acc_loans_position()];
    }
    [$start, $end, $label] = acc_period_range($period, $from, $to);
    $today = date('Y-m-d');

    $loans = $pdo->query("
        SELECT l.*, COALESCE((SELECT SUM(r.amount) FROM loan_repayments r WHERE r.loan_id = l.id), 0) AS paid_total,
               COALESCE((SELECT SUM(r.principal_part) FROM loan_repayments r WHERE r.loan_id = l.id), 0) AS principal_paid,
               (SELECT MAX(r.paid_date) FROM loan_repayments r WHERE r.loan_id = l.id) AS last_payment_date,
               (SELECT COUNT(*) FROM loan_repayments r WHERE r.loan_id = l.id) AS payment_count,
               u.full_name AS created_by_name
        FROM company_loans l LEFT JOIN users u ON u.id = l.created_by
        ORDER BY (l.status = 'paid') ASC, l.date_received DESC, l.id DESC
    ")->fetchAll();
    foreach ($loans as &$l) {
        $l['code'] = acc_loan_code((int)$l['id']);
        $l['balance'] = max((float)$l['total_repayable'] - (float)$l['paid_total'], 0);
        $l['progress'] = (float)$l['total_repayable'] > 0 ? min(100, round((float)$l['paid_total'] / (float)$l['total_repayable'] * 100, 1)) : 100;
        $l['state'] = $l['balance'] <= 0.004 ? 'paid' : (($l['due_date'] && $l['due_date'] < $today) ? 'overdue' : 'active');
    }
    unset($l);

    $where = ' WHERE 1=1'; $params = [];
    if ($start !== null) { $where .= ' AND r.paid_date >= ?'; $params[] = $start; }
    if ($end !== null)   { $where .= ' AND r.paid_date <= ?'; $params[] = $end; }
    $stmt = $pdo->prepare("
        SELECT r.*, l.provider, u.full_name AS recorded_by_name
        FROM loan_repayments r JOIN company_loans l ON l.id = r.loan_id LEFT JOIN users u ON u.id = r.recorded_by
        $where ORDER BY r.paid_date DESC, r.id DESC LIMIT 500
    ");
    $stmt->execute($params);
    $repayments = $stmt->fetchAll();
    foreach ($repayments as &$r) $r['loan_code'] = acc_loan_code((int)$r['loan_id']);
    unset($r);

    $recv = ['received' => 0.0, 'count' => 0];
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(principal),0) AS received, COUNT(*) AS cnt FROM company_loans l WHERE 1=1' . ($start !== null ? ' AND l.date_received >= ?' : '') . ($end !== null ? ' AND l.date_received <= ?' : ''));
    $stmt->execute(array_values(array_filter([$start, $end], function ($x) { return $x !== null; })));
    $row = $stmt->fetch();
    $recv = ['received' => (float)$row['received'], 'count' => (int)$row['cnt']];

    $paidInPeriod = 0.0; $interestInPeriod = 0.0;
    foreach ($repayments as $r) { $paidInPeriod += (float)$r['amount']; $interestInPeriod += (float)$r['interest_part']; }

    return [
        'migrated' => true,
        'loans' => $loans,
        'repayments' => $repayments,
        'range' => ['period' => $start === null && $period !== 'all' ? 'all' : $period, 'from' => $start, 'to' => $end, 'label' => $label],
        'summary' => ['received_in_period' => $recv['received'], 'loans_in_period' => $recv['count'], 'repaid_in_period' => $paidInPeriod, 'interest_in_period' => $interestInPeriod, 'repayments_in_period' => count($repayments)],
        'position' => acc_loans_position(),
    ];
}

/** Records a new loan the company received. */
function acc_loan_create(array $in, int $by): array
{
    global $pdo;
    if (!acc_has_table('company_loans')) return ['success' => false, 'message' => 'Run migration_037_budgets_loans.sql first.'];
    $provider = trim(preg_replace('/\s+/', ' ', (string)($in['provider'] ?? '')));
    if (mb_strlen($provider) < 2 || mb_strlen($provider) > 150) return ['success' => false, 'message' => 'Enter the loan provider / bank (2 to 150 characters).'];

    $num = function ($v) { return round((float)str_replace(',', '', (string)$v), 2); };
    $principal = $num($in['principal'] ?? 0);
    if ($principal <= 0 || $principal > 99999999999) return ['success' => false, 'message' => 'Enter the loan amount received.'];
    $totalRaw = trim((string)($in['total_repayable'] ?? ''));
    $total = $totalRaw === '' ? $principal : $num($totalRaw);
    if ($total < $principal) return ['success' => false, 'message' => 'The total to repay cannot be less than the loan amount.'];
    $instRaw = trim((string)($in['installment_amount'] ?? ''));
    $inst = $instRaw === '' ? null : $num($instRaw);
    if ($inst !== null && ($inst <= 0 || $inst > $total)) return ['success' => false, 'message' => 'The instalment must be more than zero and not more than the total to repay.'];

    $date = trim((string)($in['date_received'] ?? ''));
    $d = DateTime::createFromFormat('Y-m-d', $date);
    if (!$d || $d->format('Y-m-d') !== $date || $date < '2000-01-01') return ['success' => false, 'message' => 'Enter the date the loan was received.'];
    if ($date > date('Y-m-d')) return ['success' => false, 'message' => 'The date received cannot be in the future.'];
    $due = trim((string)($in['due_date'] ?? ''));
    if ($due !== '') {
        $dd = DateTime::createFromFormat('Y-m-d', $due);
        if (!$dd || $dd->format('Y-m-d') !== $due) return ['success' => false, 'message' => 'Enter a valid final repayment date.'];
        if ($due < $date) return ['success' => false, 'message' => 'The final repayment date cannot be before the date received.'];
    }
    $purpose = mb_substr(trim(preg_replace('/\s+/', ' ', (string)($in['purpose'] ?? ''))), 0, 255);
    if (mb_strlen($purpose) < 3) return ['success' => false, 'message' => 'Please say what the loan is for.'];
    $notes = mb_substr(trim((string)($in['notes'] ?? '')), 0, 500) ?: null;

    $dupe = $pdo->prepare('SELECT id FROM company_loans WHERE provider = ? AND principal = ? AND date_received = ? AND created_at >= (NOW() - INTERVAL 2 MINUTE) LIMIT 1');
    $dupe->execute([$provider, $principal, $date]);
    if ($dupe->fetchColumn()) return ['success' => false, 'message' => 'This loan was just recorded. Please check the list.'];

    $pdo->prepare('INSERT INTO company_loans (provider, principal, total_repayable, installment_amount, date_received, due_date, purpose, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$provider, $principal, $total, $inst, $date, $due ?: null, $purpose, $notes, $by]);
    $id = (int)$pdo->lastInsertId();
    log_activity($by, 'Recorded company loan', acc_loan_code($id) . ': ' . $provider . ' TZS ' . number_format($principal));
    return ['success' => true, 'message' => 'Loan ' . acc_loan_code($id) . ' recorded: TZS ' . number_format($principal) . ' from ' . $provider . '.', 'loan_id' => $id];
}

/** Records one repayment. The interest part (if the loan carries interest) is posted to the ledger as an expense. */
function acc_loan_repay(int $loanId, array $in, int $by): array
{
    global $pdo;
    if (!acc_has_table('loan_repayments')) return ['success' => false, 'message' => 'Run migration_037_budgets_loans.sql first.'];
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT * FROM company_loans WHERE id = ? FOR UPDATE');
        $stmt->execute([$loanId]);
        $loan = $stmt->fetch();
        if (!$loan) throw new RuntimeException('Loan not found.');

        $sums = $pdo->prepare('SELECT COALESCE(SUM(amount),0) AS paid, COALESCE(SUM(principal_part),0) AS principal_paid FROM loan_repayments WHERE loan_id = ?');
        $sums->execute([$loanId]);
        $s = $sums->fetch();
        $total = (float)$loan['total_repayable'];
        $balance = round($total - (float)$s['paid'], 2);
        if ($balance <= 0.004) throw new RuntimeException('This loan is already fully repaid.');

        $amount = round((float)str_replace(',', '', (string)($in['amount'] ?? 0)), 2);
        if ($amount <= 0) throw new RuntimeException('Enter the repayment amount.');
        if ($amount > $balance + 0.004) throw new RuntimeException('The repayment is more than the remaining balance (TZS ' . number_format($balance) . ').');

        $date = trim((string)($in['paid_date'] ?? '')) ?: date('Y-m-d');
        $d = DateTime::createFromFormat('Y-m-d', $date);
        if (!$d || $d->format('Y-m-d') !== $date) throw new RuntimeException('Enter a valid repayment date.');
        if ($date > date('Y-m-d')) throw new RuntimeException('The repayment date cannot be in the future.');
        if ($date < $loan['date_received']) throw new RuntimeException('The repayment date cannot be before the loan was received.');

        // Split the repayment into principal and interest in the same proportion as the whole loan;
        // the final repayment settles whatever principal is left so the totals always add up.
        $principal = (float)$loan['principal'];
        $isFinal = ($amount >= $balance - 0.004);
        if ($isFinal) $principalPart = round($principal - (float)$s['principal_paid'], 2);
        else $principalPart = round($amount * ($principal / $total), 2);
        $principalPart = max(min($principalPart, $amount), 0);
        $interestPart = round($amount - $principalPart, 2);

        $method = acc_method($in['payment_method'] ?? null);
        $ref = mb_substr(trim((string)($in['reference'] ?? '')), 0, 80) ?: null;
        $notes = mb_substr(trim((string)($in['notes'] ?? '')), 0, 255) ?: null;

        $txnId = null;
        if ($interestPart > 0.004) {
            $txnId = record_transaction('expense', 'loan_interest', $interestPart, $date,
                mb_substr('Loan interest ' . acc_loan_code($loanId) . ': ' . $loan['provider'], 0, 255), null, null, null, null, $by, $method);
        }
        $pdo->prepare('INSERT INTO loan_repayments (loan_id, amount, principal_part, interest_part, paid_date, payment_method, reference, notes, transaction_id, recorded_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([$loanId, $amount, $principalPart, $interestPart, $date, $method, $ref, $notes, $txnId, $by]);
        if ($isFinal) $pdo->prepare("UPDATE company_loans SET status = 'paid' WHERE id = ?")->execute([$loanId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        return ['success' => false, 'message' => $e->getMessage()];
    }
    log_activity($by, 'Loan repayment', acc_loan_code($loanId) . ': TZS ' . number_format($amount));
    return ['success' => true, 'message' => 'Repayment of TZS ' . number_format($amount) . ' recorded' . ($isFinal ? ' — the loan is now fully repaid.' : '. Remaining balance: TZS ' . number_format($balance - $amount) . '.')];
}

/** Deletes a loan that has no repayments yet (e.g. entered by mistake). */
function acc_loan_delete(int $loanId, int $by): array
{
    global $pdo;
    if (!acc_has_table('company_loans')) return ['success' => false, 'message' => 'Run migration_037_budgets_loans.sql first.'];
    $cnt = $pdo->prepare('SELECT COUNT(*) FROM loan_repayments WHERE loan_id = ?');
    $cnt->execute([$loanId]);
    if ((int)$cnt->fetchColumn() > 0) return ['success' => false, 'message' => 'This loan already has repayments, so it cannot be deleted.'];
    $stmt = $pdo->prepare('DELETE FROM company_loans WHERE id = ?');
    $stmt->execute([$loanId]);
    if (!$stmt->rowCount()) return ['success' => false, 'message' => 'Loan not found.'];
    log_activity($by, 'Deleted company loan', acc_loan_code($loanId));
    return ['success' => true, 'message' => 'Loan deleted.'];
}
