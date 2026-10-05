<?php
/**
 * MABUMBA TECH — Sales (Inventory Sales Recording)
 * Schema: migration_026_sales.sql + migration_029 (receipt_code)
 *
 * Deliberately separate from admin/sales.php (the Marketing Sales & Leads
 * pipeline) — this is the "pick products, sell them" page for a Sales
 * Officer or anyone with inventory.manage.
 *
 * Also home to the Sales Officer's damaged-stock recording ('record_damage':
 * stock goes down AND the buying cost is posted to the ledger as a loss, via
 * record_damage() in includes/inventory.php) and to the time-filtered
 * sales / damage records ('period' = today|yesterday|week|month|last_month|
 * year|all|custom, with 'from'/'to' for custom).
 *
 * A sale can be paid by cash, mobile money (M-Pesa, Airtel Money, HaloPesa, Mixx by Yas),
 * bank transfer (CRDB, NMB, ...), card — or taken on CREDIT, which opens a customer debt
 * (see includes/debts.php and admin/customer-debts.php) instead of posting income.
 *
 * One sale ("receipt") can contain several products. Each product may be
 * sold at a custom price, but never below its minimum allowed selling
 * price — that rule is enforced in record_sale_items(), not just the form.
 */
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_any_permission(['inventory.sell', 'inventory.manage']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'record_sale') {
        $items = json_decode($input['items'] ?? '[]', true);
        if (!is_array($items)) $items = [];
        $notes = trim($input['notes'] ?? '') ?: null;
        $payment = in_array($input['payment_method'] ?? '', ['cash', 'mobile_money', 'bank_transfer', 'card', 'credit'], true) ? $input['payment_method'] : 'cash';
        $channel = trim($input['payment_channel'] ?? '') ?: null;   // Mobile Money provider / bank name
        $credit = $payment === 'credit' ? [
            'name' => $input['customer_name'] ?? '', 'phone' => $input['customer_phone'] ?? '', 'address' => $input['customer_address'] ?? '',
            'due_date' => $input['due_date'] ?? '', 'deposit' => $input['deposit_amount'] ?? 0,
            'deposit_method' => $input['deposit_method'] ?? 'cash', 'deposit_channel' => $input['deposit_channel'] ?? '',
        ] : null;

        try {
            $receipt = record_sale_items($items, $notes, $me['id'], $payment, $channel, $credit);
        } catch (Throwable $e) {
            json_response(['success' => false, 'message' => $e->getMessage()]);
        }
        log_activity($me['id'], 'Recorded sale', $receipt['receipt_code'] . ': ' . count($receipt['items']) . ' item(s), total ' . $receipt['total_amount']);
        json_response(['success' => true, 'message' => 'Sale recorded.', 'receipt' => $receipt]);
    }

    if ($action === 'record_damage') {
        $typeId = (int)($input['product_type_id'] ?? 0);
        $qty = (int)($input['quantity'] ?? 0);
        $notes = trim($input['notes'] ?? '');
        if (!$typeId || $qty <= 0) json_response(['success' => false, 'message' => 'Choose the damaged product and a valid quantity.']);
        if (mb_strlen($notes) < 3) json_response(['success' => false, 'message' => 'Please add a remark explaining what happened to the damaged item.']);

        // Takes the stock out AND posts quantity x buying price to the finance
        // ledger as an expense (category 'inventory_damage') = the loss.
        try {
            $result = record_damage($typeId, $qty, $notes, $me['id']);
        } catch (Throwable $e) {
            json_response(['success' => false, 'message' => $e->getMessage()]);
        }
        log_activity($me['id'], 'Recorded damage', "Type #$typeId: $qty (loss " . $result['loss'] . ')');
        $msg = 'Damage recorded and removed from stock.';
        if ($result['loss'] > 0) $msg .= ' ' . number_format($result['loss'], 2) . ' has been counted as a loss.';
        json_response(['success' => true, 'message' => $msg, 'loss' => $result['loss']]);
    }

    json_error('Unknown action.');
}

// ---- GET ----

// In-stock products for the "Record Damage" form. The buying (cost) price is
// only sent to people who can already see costs (inventory.manage) so the form
// can preview the loss; the server always calculates the real loss itself.
if (isset($_GET['damage_products'])) {
    $showCost = has_permission($me, 'inventory.manage');
    $rows = $pdo->query("
        SELECT pt.id, pt.name, pt.unit, pt.quantity, pt.buying_price, p.name AS product_name, pc.name AS category_name
        FROM product_types pt JOIN products p ON p.id = pt.product_id LEFT JOIN product_categories pc ON pc.id = p.category_id
        WHERE pt.is_active = 1 AND p.is_active = 1 AND pt.quantity > 0
        ORDER BY p.name, pt.name
    ")->fetchAll();
    foreach ($rows as &$r) { if (!$showCost) $r['buying_price'] = null; }
    unset($r);
    json_response(['products' => $rows, 'show_cost' => $showCost]);
}

// Product picker. With no search text it returns a handful of products that
// are in stock (most recently sold first), so the page is never an empty box;
// with search text it filters by product or type name.
if (isset($_GET['q'])) {
    $query = trim($_GET['q']);
    $select = "
        SELECT pt.id, pt.name, pt.unit, pt.selling_price, pt.buying_price, pt.minimum_selling_price, pt.quantity,
               p.name AS product_name, c.name AS category_name
        FROM product_types pt
        JOIN products p ON p.id = pt.product_id
        LEFT JOIN product_categories c ON c.id = p.category_id
        WHERE pt.is_active = 1 AND p.is_active = 1
    ";
    if ($query === '') {
        $stmt = $pdo->query($select . "
            AND pt.quantity > 0
            ORDER BY (SELECT MAX(s.created_at) FROM inventory_sales s WHERE s.product_type_id = pt.id) DESC, p.name, pt.name
            LIMIT 12
        ");
    } else {
        $stmt = $pdo->prepare($select . "
            AND (p.name LIKE ? OR pt.name LIKE ? OR c.name LIKE ?)
            ORDER BY (pt.quantity > 0) DESC, p.name, pt.name LIMIT 20
        ");
        $like = '%' . $query . '%';
        $stmt->execute([$like, $like, $like]);
    }
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['min_price'] = sale_floor_price($r);
        $r['min_is_set'] = $r['minimum_selling_price'] !== null && (float)$r['minimum_selling_price'] > 0;
        unset($r['buying_price']); // cost price is not needed by the browser
    }
    unset($r);
    json_response(['results' => $rows]);
}

// "Today" is taken from the database clock so it always agrees with the
// created_at timestamps being filtered.
$today = (string)$pdo->query('SELECT CURDATE()')->fetchColumn();
$stats = $pdo->prepare("
    SELECT
        (SELECT COALESCE(SUM(total_amount),0) FROM inventory_sales WHERE DATE(created_at) = ?) AS today_sales,
        (SELECT COALESCE(SUM(profit),0) FROM inventory_sales WHERE DATE(created_at) = ?) AS today_profit,
        (SELECT COUNT(DISTINCT COALESCE(receipt_code, sale_code)) FROM inventory_sales WHERE DATE(created_at) = ?) AS today_count,
        (SELECT COALESCE(SUM(total_amount - amount_paid),0) FROM customer_debts WHERE status <> 'paid') AS debts_balance,
        (SELECT COUNT(*) FROM customer_debts WHERE status <> 'paid') AS debts_open
");
$stats->execute([$today, $today, $today]);

/**
 * Turns a period name (or a custom from/to) into [from, to, label] where from/to
 * are 'Y-m-d' strings (null = no limit, for "all time").
 */
function sales_period_range(string $period, string $from, string $to, string $today): array
{
    $t = new DateTimeImmutable($today);
    $valid = function (string $d): bool {
        return (bool)preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
    };
    switch ($period) {
        case 'yesterday':
            $d = $t->modify('-1 day')->format('Y-m-d');
            return ['yesterday', $d, $d, 'Yesterday'];
        case 'week':
            return ['week', $t->modify('monday this week')->format('Y-m-d'), $today, 'This week'];
        case 'month':
            return ['month', $t->format('Y-m-01'), $today, 'This month'];
        case 'last_month':
            return ['last_month', $t->modify('first day of last month')->format('Y-m-d'), $t->modify('last day of last month')->format('Y-m-d'), 'Last month'];
        case 'year':
            return ['year', $t->format('Y-01-01'), $today, 'This year'];
        case 'all':
            return ['all', null, null, 'All time'];
        case 'custom':
            $okFrom = $valid($from);
            $okTo = $valid($to);
            if ($okFrom || $okTo) {
                if (!$okFrom) $from = $to;
                if (!$okTo) $to = $from;
                if ($from > $to) { $tmp = $from; $from = $to; $to = $tmp; }
                $label = $from === $to ? date('j M Y', strtotime($from)) : date('j M Y', strtotime($from)) . ' – ' . date('j M Y', strtotime($to));
                return ['custom', $from, $to, $label];
            }
            break;
    }
    return ['today', $today, $today, 'Today'];
}

[$period, $from, $to, $periodLabel] = sales_period_range(
    (string)($_GET['period'] ?? 'today'), trim($_GET['from'] ?? ''), trim($_GET['to'] ?? ''), $today
);

// Date window applied to a created_at column (alias passed in).
$windowSql = function (string $col) use ($from, $to): array {
    $sql = '';
    $params = [];
    if ($from !== null) { $sql .= " AND $col >= ?"; $params[] = $from . ' 00:00:00'; }
    if ($to !== null)   { $sql .= " AND $col <= ?"; $params[] = $to . ' 23:59:59'; }
    return [$sql, $params];
};

[$salesWin, $salesParams] = $windowSql('s.created_at');
$SALES_LIMIT = 1000;

$salesStmt = $pdo->prepare("
    SELECT s.*, COALESCE(s.receipt_code, s.sale_code) AS receipt, pt.name AS type_name, pt.unit AS unit, p.name AS product_name, u.full_name AS sold_by_name,
           COALESCE(s.payment_method,
             (SELECT ft.payment_method FROM finance_transactions ft
               WHERE ft.category = 'product_sale' AND ft.description LIKE CONCAT('Sale ', COALESCE(s.receipt_code, s.sale_code), ':%')
               ORDER BY ft.id DESC LIMIT 1)) AS payment_method,
           d.id AS debt_id, d.debt_code, d.customer_name, d.customer_phone, d.total_amount AS debt_total, d.amount_paid AS debt_paid, d.due_date AS debt_due,
           sr.tracking_code AS request_code, sr.guest_name AS request_customer
    FROM inventory_sales s
    JOIN product_types pt ON pt.id = s.product_type_id
    JOIN products p ON p.id = pt.product_id
    LEFT JOIN users u ON u.id = s.sold_by
    LEFT JOIN customer_debts d ON d.receipt_code = COALESCE(s.receipt_code, s.sale_code)
    LEFT JOIN service_requests sr ON sr.id = s.request_id
    WHERE 1=1 $salesWin
    ORDER BY s.created_at DESC, s.id DESC LIMIT $SALES_LIMIT
");
$salesStmt->execute($salesParams);
$sales = $salesStmt->fetchAll();

$sumStmt = $pdo->prepare("
    SELECT COALESCE(SUM(s.total_amount),0) AS sales_total, COALESCE(SUM(s.profit),0) AS profit,
           COALESCE(SUM(s.quantity),0) AS units, COUNT(DISTINCT COALESCE(s.receipt_code, s.sale_code)) AS receipts
    FROM inventory_sales s WHERE 1=1 $salesWin
");
$sumStmt->execute($salesParams);
$summary = $sumStmt->fetch();

// How much of that period's sales was given on credit.
$creditStmt = $pdo->prepare("SELECT COALESCE(SUM(s.total_amount),0) FROM inventory_sales s WHERE s.payment_method = 'credit' $salesWin");
$creditStmt->execute($salesParams);
$summary['credit_sales'] = (float)$creditStmt->fetchColumn();

// Damaged items in the same window. The loss is the amount that was actually
// posted to the ledger when the damage was recorded (quantity x buying price at
// that moment); for older rows with no ledger entry it falls back to the
// current buying price.
[$dmgWin, $dmgParams] = $windowSql('sm.created_at');
$dmgStmt = $pdo->prepare("
    SELECT sm.id, sm.quantity, sm.notes, sm.created_at, pt.name AS type_name, pt.unit AS unit, p.name AS product_name, u.full_name AS recorded_by_name,
           COALESCE(
             (SELECT ft.amount FROM finance_transactions ft
               WHERE ft.category = 'inventory_damage' AND ft.description LIKE CONCAT('Damaged stock #DMG', sm.id, ':%')
               ORDER BY ft.id DESC LIMIT 1),
             ROUND(sm.quantity * pt.buying_price, 2)
           ) AS loss
    FROM stock_movements sm
    JOIN product_types pt ON pt.id = sm.product_type_id
    JOIN products p ON p.id = pt.product_id
    LEFT JOIN users u ON u.id = sm.recorded_by
    WHERE sm.movement_type = 'damage' $dmgWin
    ORDER BY sm.created_at DESC, sm.id DESC LIMIT 500
");
$dmgStmt->execute($dmgParams);
$damages = $dmgStmt->fetchAll();

$dmgUnits = 0;
$dmgLoss = 0.0;
foreach ($damages as $d) { $dmgUnits += (int)$d['quantity']; $dmgLoss += (float)$d['loss']; }
$summary['damage_units'] = $dmgUnits;
$summary['damage_loss'] = round($dmgLoss, 2);

json_response([
    'stats' => $stats->fetch(),
    'range' => ['period' => $period, 'from' => $from, 'to' => $to, 'label' => $periodLabel],
    'summary' => $summary,
    'sales' => $sales,
    'sales_truncated' => count($sales) >= $SALES_LIMIT,
    'damages' => $damages,
    'options' => payment_options(),
]);
