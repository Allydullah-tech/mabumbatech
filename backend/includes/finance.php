<?php
/**
 * MABUMBA TECH — Finance core logic
 * Schema: migration_014_finance.sql
 *
 * Every number the Accountant dashboard and financial reports show is
 * computed from `finance_transactions` here — not recomputed slightly
 * differently in five different places.
 */

function generate_invoice_code(): string
{
    global $pdo;
    do {
        $code = 'INV-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        $stmt = $pdo->prepare('SELECT 1 FROM invoices WHERE invoice_code = ?');
        $stmt->execute([$code]);
    } while ($stmt->fetchColumn());
    return $code;
}

/** Records one ledger entry. This is the ONLY way money should enter finance_transactions. */
function record_transaction(string $type, string $category, float $amount, string $date, ?string $description, ?int $customerId = null, ?int $requestId = null, ?int $invoiceId = null, ?int $payrollId = null, ?int $recordedBy = null, string $paymentMethod = 'other'): int
{
    global $pdo;
    if (!in_array($paymentMethod, ['cash', 'bank_transfer', 'mobile_money', 'card', 'other'], true)) $paymentMethod = 'other';
    $stmt = $pdo->prepare('
        INSERT INTO finance_transactions
            (type, category, amount, transaction_date, description, customer_id, request_id, invoice_id, payroll_id, recorded_by, payment_method)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ');
    $stmt->execute([$type, $category, $amount, $date, $description, $customerId, $requestId, $invoiceId, $payrollId, $recordedBy, $paymentMethod]);
    return (int)$pdo->lastInsertId();
}

/**
 * Records a payment against an invoice: creates the income transaction AND
 * updates the invoice's amount_paid/status together, so the two can never
 * drift out of sync. Notifies the customer.
 */
function apply_invoice_payment(int $invoiceId, float $amount, string $method, string $date, ?int $recordedBy): void
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
    $stmt->execute([$invoiceId]);
    $invoice = $stmt->fetch();
    if (!$invoice) throw new RuntimeException('Invoice not found.');

    $txnStmt = $pdo->prepare('
        INSERT INTO finance_transactions (type, category, amount, payment_method, transaction_date, description, customer_id, request_id, invoice_id, recorded_by)
        VALUES ("income","project_payment",?,?,?,?,?,?,?,?)
    ');
    $txnStmt->execute([$amount, $method, $date, 'Payment for invoice ' . $invoice['invoice_code'], $invoice['customer_id'], $invoice['request_id'], $invoiceId, $recordedBy]);

    $newPaid = (float)$invoice['amount_paid'] + $amount;
    $newStatus = $newPaid >= (float)$invoice['amount'] ? 'paid' : 'partial';
    $pdo->prepare('UPDATE invoices SET amount_paid = ?, status = ? WHERE id = ?')->execute([$newPaid, $newStatus, $invoiceId]);

    notify_user((int)$invoice['customer_id'], 'payment_received', 'Payment received: ' . $invoice['invoice_code'],
        'We received a payment of ' . $amount . ' towards invoice ' . $invoice['invoice_code'] . '. ' . ($newStatus === 'paid' ? 'This invoice is now fully paid.' : 'Remaining balance: ' . ((float)$invoice['amount'] - $newPaid) . '.'),
        '/backend/customer/invoices.php?id=' . $invoiceId);

    log_activity($recordedBy, 'Recorded payment', "Invoice {$invoice['invoice_code']}: +$amount ($newStatus)");
}

/** Marks a payroll record paid and logs the matching ledger expense in one step. */
function pay_payroll_record(int $payrollId, string $date, ?int $recordedBy): void
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT pr.*, u.full_name FROM payroll_records pr JOIN users u ON u.id = pr.user_id WHERE pr.id = ?');
    $stmt->execute([$payrollId]);
    $payroll = $stmt->fetch();
    if (!$payroll) throw new RuntimeException('Payroll record not found.');
    if ($payroll['status'] === 'paid') return;

    record_transaction('expense', 'salary', (float)$payroll['net_amount'], $date,
        'Salary for ' . $payroll['full_name'] . ' — ' . date('F Y', strtotime($payroll['period_month'])),
        null, null, null, $payrollId, $recordedBy);

    $pdo->prepare('UPDATE payroll_records SET status = "paid", paid_at = NOW() WHERE id = ?')->execute([$payrollId]);
    notify_user((int)$payroll['user_id'], 'payment_received', 'Salary paid',
        'Your salary for ' . date('F Y', strtotime($payroll['period_month'])) . ' has been paid.', '');
}

/**
 * Product-sales numbers for a date range (both dates null = all time).
 *   revenue = what the sales brought in, as posted to the ledger (category 'product_sale')
 *   profit  = the profit the Sales Officer recorded on those same sales (inventory_sales.profit)
 *   cost    = revenue - profit (what the sold goods cost to buy)
 * The Accountant never recalculates this profit — company profit takes the
 * Sales Officer's profit as it was recorded, and the buying cost of the goods
 * is not counted as profit.
 */
function sales_profit_summary(?string $start = null, ?string $end = null): array
{
    global $pdo;
    $range = ($start !== null && $end !== null);

    $stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM finance_transactions WHERE type = 'income' AND category = 'product_sale'" . ($range ? ' AND transaction_date BETWEEN ? AND ?' : ''));
    $stmt->execute($range ? [$start, $end] : []);
    $revenue = (float)$stmt->fetchColumn();

    try {
        // A sale on credit only counts towards profit for the share the customer
        // has actually paid (revenue is cash received, so profit must match it).
        $stmt = $pdo->prepare('
            SELECT COALESCE(SUM(s.profit * CASE WHEN d.id IS NULL OR d.total_amount <= 0 THEN 1 ELSE LEAST(1, d.amount_paid / d.total_amount) END), 0)
            FROM inventory_sales s
            LEFT JOIN customer_debts d ON d.receipt_code = COALESCE(s.receipt_code, s.sale_code)' . ($range ? ' WHERE DATE(s.created_at) BETWEEN ? AND ?' : ''));
        $stmt->execute($range ? [$start, $end] : []);
        $profit = (float)$stmt->fetchColumn();
    } catch (Throwable $e) {
        try {
            // Credit-sales tables not installed yet: original calculation.
            $stmt = $pdo->prepare('SELECT COALESCE(SUM(profit),0) FROM inventory_sales' . ($range ? ' WHERE DATE(created_at) BETWEEN ? AND ?' : ''));
            $stmt->execute($range ? [$start, $end] : []);
            $profit = (float)$stmt->fetchColumn();
        } catch (Throwable $e2) {
            $profit = $revenue;      // sales table not installed -> nothing to deduct
        }
    }
    return ['revenue' => round($revenue, 2), 'profit' => round($profit, 2), 'cost' => round($revenue - $profit, 2)];
}

/**
 * Revenue, expenses, and net profit for a date range — the numbers behind every
 * summary card. Damaged stock is posted to the ledger as an expense (category
 * 'inventory_damage'), so it is already inside `expenses` and reduces net
 * profit; `damage_loss` just breaks that part out so it can be shown on its own.
 */
function financial_summary(string $start, string $end): array
{
    global $pdo;
    $stmt = $pdo->prepare("
        SELECT
            COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expenses,
            COALESCE(SUM(CASE WHEN type='expense' AND category='inventory_damage' THEN amount ELSE 0 END), 0) AS damage_loss
        FROM finance_transactions WHERE transaction_date BETWEEN ? AND ?
    ");
    $stmt->execute([$start, $end]);
    $row = $stmt->fetch();
    $revenue = (float)$row['revenue'];
    $expenses = (float)$row['expenses'];
    // Product sales count in revenue at their full value, but only the Sales
    // Officer's recorded profit reaches company profit (the goods' cost does not).
    $sales = sales_profit_summary($start, $end);
    return [
        'revenue' => $revenue,
        'expenses' => $expenses,
        'damage_loss' => (float)$row['damage_loss'],
        'sales_revenue' => $sales['revenue'],
        'sales_profit' => $sales['profit'],
        'cost_of_goods' => $sales['cost'],
        'net_profit' => $revenue - $sales['cost'] - $expenses,
    ];
}
