<?php
/**
 * MABUMBA TECH — Sales & Stock Overview (VIEW ONLY)
 *
 * A read-only picture for the Operations Manager of how product selling is
 * going: stock position, sales/profit for any time period, trend, top products,
 * who sold what and recent receipts. It only READS the same tables the Sales
 * Officer writes to (inventory_sales, product_types, stock_movements) — nothing
 * here can record, edit or delete anything.
 *
 * Access: the General / Operations Manager job role, anyone granted
 * 'sales_overview.view' (migration_040), and full admins.
 */
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_role('admin');
$allowed = is_full_admin($me)
    || ($me['job_role_key'] ?? null) === 'general_manager'
    || has_permission($me, 'sales_overview.view');
if (!$allowed) json_error('You do not have permission to access this resource.', 403);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_error('This page is view-only.', 405);

/** [period, from, to, label] — from/to are 'Y-m-d' (null = no limit). */
function so_period_range(string $period, string $from, string $to, string $today): array
{
    $t = new DateTimeImmutable($today);
    $valid = function (string $d): bool {
        return (bool)preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
    };
    switch ($period) {
        case 'today':
            return ['today', $today, $today, 'Today'];
        case 'yesterday':
            $d = $t->modify('-1 day')->format('Y-m-d');
            return ['yesterday', $d, $d, 'Yesterday'];
        case 'week':
            return ['week', $t->modify('monday this week')->format('Y-m-d'), $today, 'This week'];
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
    return ['month', $t->format('Y-m-01'), $today, 'This month'];
}

$today = (string)$pdo->query('SELECT CURDATE()')->fetchColumn();
[$period, $from, $to, $periodLabel] = so_period_range(
    (string)($_GET['period'] ?? 'month'), trim($_GET['from'] ?? ''), trim($_GET['to'] ?? ''), $today
);

$win = '';
$params = [];
if ($from !== null) { $win .= ' AND s.created_at >= ?'; $params[] = $from . ' 00:00:00'; }
if ($to !== null)   { $win .= ' AND s.created_at <= ?'; $params[] = $to . ' 23:59:59'; }

/* ------------------------------------------------------------ stock position */
$stock = $pdo->query("
    SELECT
        (SELECT COUNT(*) FROM products WHERE is_active = 1) AS total_products,
        (SELECT COUNT(*) FROM product_types WHERE is_active = 1) AS total_variants,
        (SELECT COALESCE(SUM(quantity),0) FROM product_types WHERE is_active = 1) AS total_stock,
        (SELECT COALESCE(SUM(quantity * buying_price),0) FROM product_types WHERE is_active = 1) AS stock_value,
        (SELECT COALESCE(SUM(quantity * selling_price),0) FROM product_types WHERE is_active = 1) AS retail_value,
        (SELECT COUNT(*) FROM product_types WHERE is_active = 1 AND quantity <= minimum_stock_level AND quantity > 0) AS low_stock_count,
        (SELECT COUNT(*) FROM product_types WHERE is_active = 1 AND quantity = 0) AS out_of_stock_count
")->fetch();

$lowStock = $pdo->query("
    SELECT pt.id, pt.name, pt.unit, pt.quantity, pt.minimum_stock_level, p.name AS product_name
    FROM product_types pt JOIN products p ON p.id = pt.product_id
    WHERE pt.is_active = 1 AND p.is_active = 1 AND pt.quantity <= pt.minimum_stock_level
    ORDER BY pt.quantity ASC, p.name ASC LIMIT 8
")->fetchAll();

$stockList = $pdo->query("
    SELECT p.name AS product_name, pt.name AS type_name, pt.unit, pt.quantity, pt.minimum_stock_level,
           pt.selling_price, ROUND(pt.quantity * pt.buying_price, 2) AS stock_value, c.name AS category_name
    FROM product_types pt
    JOIN products p ON p.id = pt.product_id
    LEFT JOIN product_categories c ON c.id = p.category_id
    WHERE pt.is_active = 1 AND p.is_active = 1
    ORDER BY p.name ASC, pt.name ASC LIMIT 500
")->fetchAll();

/* ------------------------------------------------------------ sales in period */
$sumStmt = $pdo->prepare("
    SELECT COALESCE(SUM(s.total_amount),0) AS sales_total, COALESCE(SUM(s.profit),0) AS profit,
           COALESCE(SUM(s.quantity),0) AS units, COUNT(DISTINCT COALESCE(s.receipt_code, s.sale_code)) AS receipts
    FROM inventory_sales s WHERE 1=1 $win
");
$sumStmt->execute($params);
$summary = $sumStmt->fetch();
$summary['avg_sale'] = (int)$summary['receipts'] > 0 ? round((float)$summary['sales_total'] / (int)$summary['receipts'], 2) : 0;
$summary['margin'] = (float)$summary['sales_total'] > 0 ? round((float)$summary['profit'] * 100 / (float)$summary['sales_total'], 1) : 0;

// Damaged stock in the same period (units and the cost counted as a loss).
$dmgWin = str_replace('s.created_at', 'sm.created_at', $win);
$dmgStmt = $pdo->prepare("
    SELECT COALESCE(SUM(sm.quantity),0) AS units, COALESCE(SUM(sm.quantity * pt.buying_price),0) AS loss
    FROM stock_movements sm JOIN product_types pt ON pt.id = sm.product_type_id
    WHERE sm.movement_type = 'damage' $dmgWin
");
$dmgStmt->execute($params);
$dmg = $dmgStmt->fetch();
$summary['damage_units'] = (int)$dmg['units'];
$summary['damage_loss'] = round((float)$dmg['loss'], 2);

/* ------------------------------------------------------------ trend (bars) */
// One bar per hour (a single day), per day (up to ~2 months) or per month.
$gran = 'month';
if ($from !== null && $to !== null) {
    $days = (int)((strtotime($to) - strtotime($from)) / 86400) + 1;
    $gran = $days <= 1 ? 'hour' : ($days <= 62 ? 'day' : 'month');
}
$fmt = $gran === 'hour' ? '%H' : ($gran === 'day' ? '%Y-%m-%d' : '%Y-%m');
$trendStmt = $pdo->prepare("
    SELECT DATE_FORMAT(s.created_at, '$fmt') AS bucket, COALESCE(SUM(s.total_amount),0) AS sales, COALESCE(SUM(s.profit),0) AS profit
    FROM inventory_sales s WHERE 1=1 $win
    GROUP BY DATE_FORMAT(s.created_at, '$fmt')
    ORDER BY bucket ASC
");
$trendStmt->execute($params);
$byBucket = [];
foreach ($trendStmt->fetchAll() as $r) $byBucket[$r['bucket']] = $r;

$trend = [];
if ($gran === 'hour') {
    for ($h = 0; $h < 24; $h++) {
        $k = sprintf('%02d', $h);
        $trend[] = ['key' => $k, 'label' => $k . 'h', 'sales' => (float)($byBucket[$k]['sales'] ?? 0), 'profit' => (float)($byBucket[$k]['profit'] ?? 0)];
    }
} elseif ($gran === 'day') {
    for ($t = strtotime($from); $t <= strtotime($to); $t += 86400) {
        $k = date('Y-m-d', $t);
        $trend[] = ['key' => $k, 'label' => date('j M', $t), 'sales' => (float)($byBucket[$k]['sales'] ?? 0), 'profit' => (float)($byBucket[$k]['profit'] ?? 0)];
    }
} else {
    foreach ($byBucket as $k => $r) {
        $trend[] = ['key' => $k, 'label' => date('M Y', strtotime($k . '-01')), 'sales' => (float)$r['sales'], 'profit' => (float)$r['profit']];
    }
    $trend = array_slice($trend, -24);
}

/* ------------------------------------------------------------ top products & sellers */
$topStmt = $pdo->prepare("
    SELECT p.name AS product_name, pt.name AS type_name, SUM(s.quantity) AS units,
           SUM(s.total_amount) AS revenue, SUM(s.profit) AS profit
    FROM inventory_sales s
    JOIN product_types pt ON pt.id = s.product_type_id
    JOIN products p ON p.id = pt.product_id
    WHERE 1=1 $win
    GROUP BY pt.id, p.name, pt.name
    ORDER BY units DESC, revenue DESC LIMIT 5
");
$topStmt->execute($params);
$topProducts = $topStmt->fetchAll();

$sellerStmt = $pdo->prepare("
    SELECT COALESCE(u.full_name, 'Unknown') AS seller,
           COUNT(DISTINCT COALESCE(s.receipt_code, s.sale_code)) AS receipts,
           SUM(s.total_amount) AS revenue, SUM(s.profit) AS profit
    FROM inventory_sales s
    LEFT JOIN users u ON u.id = s.sold_by
    WHERE 1=1 $win
    GROUP BY s.sold_by, u.full_name
    ORDER BY revenue DESC LIMIT 6
");
$sellerStmt->execute($params);
$sellers = $sellerStmt->fetchAll();

/* ------------------------------------------------------------ recent receipts */
$recentStmt = $pdo->prepare("
    SELECT COALESCE(s.receipt_code, s.sale_code) AS receipt, MIN(s.created_at) AS created_at,
           SUM(s.total_amount) AS total, SUM(s.profit) AS profit, SUM(s.quantity) AS units,
           MAX(u.full_name) AS sold_by_name,
           GROUP_CONCAT(CONCAT(p.name, ' - ', pt.name, ' x', s.quantity) SEPARATOR '; ') AS items
    FROM inventory_sales s
    JOIN product_types pt ON pt.id = s.product_type_id
    JOIN products p ON p.id = pt.product_id
    LEFT JOIN users u ON u.id = s.sold_by
    WHERE 1=1 $win
    GROUP BY COALESCE(s.receipt_code, s.sale_code)
    ORDER BY MIN(s.created_at) DESC LIMIT 40
");
$recentStmt->execute($params);
$recent = $recentStmt->fetchAll();

json_response([
    'range' => ['period' => $period, 'from' => $from, 'to' => $to, 'label' => $periodLabel, 'granularity' => $gran],
    'stock' => $stock,
    'low_stock' => $lowStock,
    'stock_list' => $stockList,
    'summary' => $summary,
    'trend' => $trend,
    'top_products' => $topProducts,
    'sellers' => $sellers,
    'recent_sales' => $recent,
]);
