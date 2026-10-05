<?php
/**
 * MABUMBA TECH — Operations Report data layer
 * Pulls together the numbers behind the admin Reports page: request volume,
 * status/service breakdowns, a day-by-day trend, staff performance, customer
 * activity, and communication activity — all scoped to a date range.
 */

function scalar_query(PDO $pdo, string $sql, array $params = [])
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchColumn();
}

/**
 * Resolves a named preset (or 'custom' + explicit dates) into a concrete
 * [start, end] datetime pair (inclusive, start-of-day to end-of-day).
 */
function resolve_report_range(string $preset, ?string $customFrom, ?string $customTo): array
{
    $now = new DateTime('now');

    switch ($preset) {
        case 'today':
            $start = (clone $now)->setTime(0, 0, 0);
            $end = (clone $now)->setTime(23, 59, 59);
            break;
        case 'yesterday':
            $start = (clone $now)->modify('-1 day')->setTime(0, 0, 0);
            $end = (clone $now)->modify('-1 day')->setTime(23, 59, 59);
            break;
        case 'this_week':
            $start = (clone $now)->modify('monday this week')->setTime(0, 0, 0);
            $end = (clone $now)->setTime(23, 59, 59);
            break;
        case 'last_month':
            $start = (clone $now)->modify('first day of last month')->setTime(0, 0, 0);
            $end = (clone $now)->modify('last day of last month')->setTime(23, 59, 59);
            break;
        case 'this_year':
            $start = (clone $now)->modify('first day of January this year')->setTime(0, 0, 0);
            $end = (clone $now)->setTime(23, 59, 59);
            break;
        case 'custom':
            try {
                $start = $customFrom ? new DateTime($customFrom) : (clone $now)->modify('-30 days');
            } catch (Exception $e) {
                $start = (clone $now)->modify('-30 days');
            }
            $start->setTime(0, 0, 0);
            try {
                $end = $customTo ? new DateTime($customTo) : $now;
            } catch (Exception $e) {
                $end = $now;
            }
            $end->setTime(23, 59, 59);
            break;
        case 'this_month':
        default:
            $preset = 'this_month';
            $start = (clone $now)->modify('first day of this month')->setTime(0, 0, 0);
            $end = (clone $now)->setTime(23, 59, 59);
    }

    if ($start > $end) { [$start, $end] = [$end, $start]; }

    return [$start->format('Y-m-d H:i:s'), $end->format('Y-m-d H:i:s'), $preset];
}

function report_range_label(string $preset, string $start, string $end): string
{
    $labels = [
        'today' => 'Today', 'yesterday' => 'Yesterday', 'this_week' => 'This Week',
        'this_month' => 'This Month', 'last_month' => 'Last Month', 'this_year' => 'This Year',
    ];
    if (isset($labels[$preset])) return $labels[$preset];
    return date('d M Y', strtotime($start)) . ' – ' . date('d M Y', strtotime($end));
}

function build_operations_report(string $start, string $end): array
{
    global $pdo;

    $summary = [
        'total_requests'     => (int)scalar_query($pdo, "SELECT COUNT(*) FROM service_requests WHERE created_at BETWEEN ? AND ?", [$start, $end]),
        'new_customers'      => (int)scalar_query($pdo, "SELECT COUNT(*) FROM users WHERE role='customer' AND created_at BETWEEN ? AND ?", [$start, $end]),
        'pending_requests'   => (int)scalar_query($pdo, "SELECT COUNT(*) FROM service_requests WHERE status='pending' AND created_at BETWEEN ? AND ?", [$start, $end]),
        'active_projects'    => (int)scalar_query($pdo, "SELECT COUNT(*) FROM service_requests WHERE status IN ('assigned','in_progress','review') AND created_at BETWEEN ? AND ?", [$start, $end]),
        'completed_projects' => (int)scalar_query($pdo, "SELECT COUNT(*) FROM service_requests WHERE status IN ('completed','delivered') AND (completed_at BETWEEN ? AND ? OR delivered_at BETWEEN ? AND ?)", [$start, $end, $start, $end]),
        'messages_sent'      => (int)scalar_query($pdo, "SELECT COUNT(*) FROM request_messages WHERE created_at BETWEEN ? AND ?", [$start, $end]),
    ];

    $byStatusStmt = $pdo->prepare("SELECT status, COUNT(*) AS c FROM service_requests WHERE created_at BETWEEN ? AND ? GROUP BY status ORDER BY c DESC");
    $byStatusStmt->execute([$start, $end]);
    $byStatus = $byStatusStmt->fetchAll();

    $byServiceStmt = $pdo->prepare("SELECT s.name, COUNT(sr.id) AS c FROM services s
        LEFT JOIN service_requests sr ON sr.service_id = s.id AND sr.created_at BETWEEN ? AND ?
        GROUP BY s.id ORDER BY c DESC");
    $byServiceStmt->execute([$start, $end]);
    $byService = $byServiceStmt->fetchAll();

    // Day-by-day trend, capped to keep the report readable on wide ranges.
    $trendStmt = $pdo->prepare("SELECT DATE(created_at) AS d, COUNT(*) AS c FROM service_requests
        WHERE created_at BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY d ASC");
    $trendStmt->execute([$start, $end]);
    $trend = $trendStmt->fetchAll();

    $staffStmt = $pdo->prepare("SELECT u.full_name, u.position_title,
        SUM(CASE WHEN ra.task_status = 'completed' AND ra.responded_at BETWEEN ? AND ? THEN 1 ELSE 0 END) AS completed_in_range,
        SUM(CASE WHEN ra.task_status IN ('new','accepted','in_progress') THEN 1 ELSE 0 END) AS active_now,
        COUNT(ra.id) AS total_assigned_all_time
        FROM users u LEFT JOIN request_assignments ra ON ra.staff_id = u.id
        WHERE u.role = 'staff' GROUP BY u.id ORDER BY completed_in_range DESC");
    $staffStmt->execute([$start, $end]);
    $staffPerformance = $staffStmt->fetchAll();

    $customerStmt = $pdo->prepare("SELECT u.full_name, u.email, COUNT(sr.id) AS requests_in_range
        FROM users u JOIN service_requests sr ON sr.customer_id = u.id AND sr.created_at BETWEEN ? AND ?
        WHERE u.role = 'customer' GROUP BY u.id ORDER BY requests_in_range DESC LIMIT 15");
    $customerStmt->execute([$start, $end]);
    $customerActivity = $customerStmt->fetchAll();

    $commStmt = $pdo->prepare("SELECT sender_role, COUNT(*) AS c FROM request_messages WHERE created_at BETWEEN ? AND ? GROUP BY sender_role");
    $commStmt->execute([$start, $end]);
    $communicationActivity = $commStmt->fetchAll();

    return [
        'summary' => $summary,
        'requests_by_status' => $byStatus,
        'requests_by_service' => $byService,
        'request_trend' => $trend,
        'staff_performance' => $staffPerformance,
        'customer_activity' => $customerActivity,
        'communication_activity' => $communicationActivity,
    ];
}

/**
 * Financial section of the company report: revenue, expenses (with damaged
 * stock shown as its own loss line), net profit, and the product-sales /
 * stock picture for the same date range. Everything comes from the ledger
 * (finance_transactions) and inventory tables — the same sources the
 * Finance and Inventory pages use — so the numbers always agree with them.
 */
function build_financial_report(string $start, string $end): array
{
    global $pdo;

    $summary = financial_summary($start, $end);

    $expStmt = $pdo->prepare("SELECT category, COALESCE(SUM(amount),0) AS total FROM finance_transactions
        WHERE type = 'expense' AND transaction_date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC");
    $expStmt->execute([$start, $end]);
    $expenseRows = [];
    foreach ($expStmt->fetchAll() as $r) {
        $expenseRows[] = [
            'category' => $r['category'] === 'inventory_damage' ? 'Damaged stock (loss)' : ucwords(str_replace('_', ' ', $r['category'])),
            'total' => (float)$r['total'],
        ];
    }

    $incStmt = $pdo->prepare("SELECT category, COALESCE(SUM(amount),0) AS total FROM finance_transactions
        WHERE type = 'income' AND transaction_date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC");
    $incStmt->execute([$start, $end]);
    $incomeRows = [];
    foreach ($incStmt->fetchAll() as $r) {
        $incomeRows[] = ['category' => ucwords(str_replace('_', ' ', $r['category'])), 'total' => (float)$r['total']];
    }

    $salesStmt = $pdo->prepare("SELECT COALESCE(SUM(total_amount),0) AS revenue, COALESCE(SUM(total_cost),0) AS cost,
        COALESCE(SUM(profit),0) AS profit, COUNT(DISTINCT COALESCE(receipt_code, sale_code)) AS sales_count,
        COALESCE(SUM(quantity),0) AS units
        FROM inventory_sales WHERE created_at BETWEEN ? AND ?");
    $salesStmt->execute([$start, $end]);
    $sales = $salesStmt->fetch();

    $topStmt = $pdo->prepare("SELECT p.name AS product_name, pt.name AS type_name, SUM(s.quantity) AS units,
        SUM(s.total_amount) AS revenue, SUM(s.profit) AS profit
        FROM inventory_sales s JOIN product_types pt ON pt.id = s.product_type_id JOIN products p ON p.id = pt.product_id
        WHERE s.created_at BETWEEN ? AND ? GROUP BY pt.id, p.name, pt.name ORDER BY revenue DESC LIMIT 8");
    $topStmt->execute([$start, $end]);

    $dmgStmt = $pdo->prepare("SELECT COALESCE(SUM(quantity),0) FROM stock_movements WHERE movement_type = 'damage' AND created_at BETWEEN ? AND ?");
    $dmgStmt->execute([$start, $end]);

    $stock = $pdo->query("SELECT COALESCE(SUM(quantity),0) AS units, COALESCE(SUM(quantity * selling_price),0) AS value
        FROM product_types WHERE is_active = 1")->fetch();

    return [
        'summary' => $summary,
        'income_by_category' => $incomeRows,
        'expenses_by_category' => $expenseRows,
        'sales' => [
            'revenue' => (float)$sales['revenue'], 'cost' => (float)$sales['cost'], 'profit' => (float)$sales['profit'],
            'count' => (int)$sales['sales_count'], 'units' => (int)$sales['units'],
        ],
        'top_products' => $topStmt->fetchAll(),
        'damaged_units' => (int)$dmgStmt->fetchColumn(),
        'stock_on_hand' => ['units' => (int)$stock['units'], 'value' => (float)$stock['value']],
    ];
}

/** Customer-acquisition section: which source brought how many customers. */
function build_marketing_report(string $start, string $end): array
{
    $sources = lead_source_stats($start, $end);
    $total = array_sum(array_column($sources, 'total'));

    $top = null;
    foreach ($sources as $s) {
        if ($top === null || $s['total'] > $top['total']) $top = $s;
    }

    return [
        'summary' => [
            'total_customers' => (int)$total,
            'top_source' => $top ? $top['label'] : null,
        ],
        'sources' => $sources,
    ];
}
