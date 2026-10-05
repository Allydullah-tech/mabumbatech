<?php
/**
 * MABUMBA TECH — Payment options, credit sales & customer debts
 * Schema: migration_042_credit_sales_and_debts.sql
 *
 * One source of truth for the Mobile Money / Bank dropdown lists, and the
 * two money movements of a credit sale: the debt that is created when the
 * sale is made, and every payment made against it afterwards.
 */

const MOBILE_MONEY_PROVIDERS = ['M-Pesa', 'Airtel Money', 'HaloPesa', 'Mixx by Yas'];
const BANK_NAMES = [
    'CRDB Bank', 'NMB Bank', 'NBC Bank', 'Stanbic Bank', 'Exim Bank', 'Equity Bank',
    'DTB Bank', 'KCB Bank', 'Absa Bank', 'Azania Bank', 'TPB Bank', 'I&M Bank',
    'Standard Chartered', 'Other Bank',
];

/** Methods a customer can actually pay with (credit is not a payment, it is the absence of one). */
const PAYING_METHODS = ['cash', 'mobile_money', 'bank_transfer', 'card'];

/**
 * Checks a method + provider pair. Mobile Money needs one of the listed
 * providers, Bank Transfer needs one of the listed banks; Cash/Card carry none.
 * Returns the provider to store (or null). Throws a readable error otherwise.
 */
function validate_payment_channel(string $method, ?string $channel): ?string
{
    $channel = trim((string)$channel);
    if ($method === 'mobile_money') {
        if (!in_array($channel, MOBILE_MONEY_PROVIDERS, true)) throw new RuntimeException('Choose the Mobile Money provider (M-Pesa, Airtel Money, HaloPesa or Mixx by Yas).');
        return $channel;
    }
    if ($method === 'bank_transfer') {
        if (!in_array($channel, BANK_NAMES, true)) throw new RuntimeException('Choose the bank the payment went through.');
        return $channel;
    }
    return null;
}

function payment_options(): array
{
    return ['mobile_money_providers' => MOBILE_MONEY_PROVIDERS, 'banks' => BANK_NAMES];
}

function debt_status(float $total, float $paid): string
{
    if ($paid + 0.004 >= $total) return 'paid';
    return $paid > 0 ? 'partial' : 'unpaid';
}

function generate_debt_code(): string
{
    global $pdo;
    do {
        $code = 'DB-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        $stmt = $pdo->prepare('SELECT 1 FROM customer_debts WHERE debt_code = ?');
        $stmt->execute([$code]);
    } while ($stmt->fetchColumn());
    return $code;
}

/**
 * Opens the debt for a credit sale. Runs inside record_sale_items()'s
 * transaction, so the sale and its debt either both exist or neither does.
 */
function create_customer_debt(string $receiptCode, array $customer, float $total, ?int $createdBy, ?string $notes): int
{
    global $pdo;
    $code = generate_debt_code();
    $pdo->prepare('
        INSERT INTO customer_debts (debt_code, receipt_code, customer_name, customer_phone, customer_address, total_amount, amount_paid, due_date, status, notes, created_by)
        VALUES (?,?,?,?,?,?,0,?,?,?,?)
    ')->execute([
        $code, $receiptCode, $customer['name'], $customer['phone'], $customer['address'] ?: null,
        round($total, 2), $customer['due_date'] ?: null, 'unpaid', $notes, $createdBy,
    ]);
    return (int)$pdo->lastInsertId();
}

/**
 * Records one payment against a debt: the payment row (with the balance left
 * afterwards), the updated debt, and the income entry in the finance ledger —
 * all together. Never lets a customer pay more than they owe.
 */
function record_debt_payment(int $debtId, float $amount, string $method, ?string $channel, ?string $reference, ?string $note, string $date, ?int $recordedBy): array
{
    global $pdo;
    $amount = round($amount, 2);
    if ($amount <= 0) throw new RuntimeException('Enter the amount the customer is paying.');
    if (!in_array($method, PAYING_METHODS, true)) throw new RuntimeException('Choose how the customer paid.');
    $channel = validate_payment_channel($method, $channel);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date > date('Y-m-d')) throw new RuntimeException('The payment date cannot be in the future.');

    $own = !$pdo->inTransaction();
    if ($own) $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT * FROM customer_debts WHERE id = ? FOR UPDATE');
        $stmt->execute([$debtId]);
        $debt = $stmt->fetch();
        if (!$debt) throw new RuntimeException('Debt not found.');

        $balance = round((float)$debt['total_amount'] - (float)$debt['amount_paid'], 2);
        if ($balance <= 0) throw new RuntimeException('This debt is already fully paid.');
        if ($amount > $balance + 0.004) throw new RuntimeException('That is more than the customer owes. The balance is ' . number_format($balance, 2) . '.');

        $newPaid = round((float)$debt['amount_paid'] + $amount, 2);
        $balanceAfter = max(0, round((float)$debt['total_amount'] - $newPaid, 2));

        $txnId = record_transaction('income', 'product_sale', $amount, $date,
            mb_substr('Debt payment ' . $debt['receipt_code'] . ': ' . $debt['customer_name'], 0, 255),
            null, null, null, null, $recordedBy, $method);

        $pdo->prepare('
            INSERT INTO customer_debt_payments (debt_id, amount, balance_after, payment_method, payment_channel, reference, note, paid_date, transaction_id, recorded_by)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        ')->execute([$debtId, $amount, $balanceAfter, $method, $channel, trim((string)$reference) ?: null, trim((string)$note) ?: null, $date, $txnId, $recordedBy]);

        $pdo->prepare('UPDATE customer_debts SET amount_paid = ?, status = ? WHERE id = ?')
            ->execute([$newPaid, debt_status((float)$debt['total_amount'], $newPaid), $debtId]);

        if ($own) $pdo->commit();
    } catch (Throwable $e) {
        if ($own && $pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    return ['amount' => $amount, 'amount_paid' => $newPaid, 'balance' => $balanceAfter, 'receipt_code' => $debt['receipt_code'], 'customer_name' => $debt['customer_name']];
}
