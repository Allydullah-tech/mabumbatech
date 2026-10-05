<?php
require_once __DIR__ . '/../../includes/api.php';
require_once __DIR__ . '/../../includes/reports.php';
$admin = api_require_role('admin');
api_require_any_permission(['reports.financial', 'reports.operational']);

$rangePreset = $_GET['range'] ?? 'this_month';
[$start, $end, $rangePreset] = resolve_report_range($rangePreset, $_GET['from'] ?? null, $_GET['to'] ?? null);
$rangeLabel = report_range_label($rangePreset, $start, $end);

$report = build_operations_report($start, $end);
// Money figures only for people allowed to see finance; the customer-source
// section for anyone who can see operations or marketing.
$financial = has_permission($admin, 'reports.financial') ? build_financial_report($start, $end) : null;
$marketing = (has_permission($admin, 'reports.operational') || has_permission($admin, 'marketing.view')) ? build_marketing_report($start, $end) : null;

$export = $_GET['export'] ?? '';
if ($export !== '') {
    export_company_report($export, $report, $financial, $marketing, $rangeLabel, $admin);
    exit;
}

json_response([
    'range' => ['preset' => $rangePreset, 'start' => $start, 'end' => $end, 'label' => $rangeLabel],
    'report' => $report,
    'financial' => $financial,
    'marketing' => $marketing,
    'meta' => [
        'generated_at' => date('d M Y, H:i'),
        'generated_by' => $admin['full_name'],
        'currency' => 'TZS',
    ],
]);

function fm($n): string
{
    return number_format((float)$n, 2);
}

function export_company_report(string $format, array $report, ?array $financial, ?array $marketing, string $rangeLabel, array $admin): void
{
    global $pdo;
    $adminId = (int)$admin['id'];

    if (!in_array($format, ['csv', 'xlsx', 'pdf'], true)) {
        json_error('Unsupported export format.');
    }

    // Discard any stray buffered output before we write raw file bytes —
    // same reasoning as json_response(): a stray warning here would corrupt
    // the downloaded file.
    if (ob_get_length() !== false) {
        ob_clean();
    }

    $filenameBase = 'MABUMBATECH-Company-Report-' . date('Y-m-d');
    $s = $report['summary'];
    $summaryRows = [
        ['Total Requests', $s['total_requests']],
        ['New Customers', $s['new_customers']],
        ['Pending Requests', $s['pending_requests']],
        ['Active Projects', $s['active_projects']],
        ['Completed Projects', $s['completed_projects']],
        ['Messages Sent', $s['messages_sent']],
    ];
    $statusRows = array_map(fn($r) => [ucwords(str_replace('_', ' ', $r['status'])), $r['c']], $report['requests_by_status']);
    $serviceRows = array_map(fn($r) => [$r['name'], $r['c']], $report['requests_by_service']);
    $trendRows = array_map(fn($r) => [$r['d'], $r['c']], $report['request_trend']);
    $staffRows = array_map(fn($r) => [$r['full_name'], $r['position_title'] ?? '', $r['completed_in_range'], $r['active_now'], $r['total_assigned_all_time']], $report['staff_performance']);
    $customerRows = array_map(fn($r) => [$r['full_name'], $r['email'], $r['requests_in_range']], $report['customer_activity']);
    $commRows = array_map(fn($r) => [ucwords($r['sender_role']), $r['c']], $report['communication_activity']);

    // ---- Financial rows (only when the viewer may see finance) ----
    $finSummaryRows = $incomeRows = $expenseRows = $salesRows = $topProductRows = [];
    if ($financial) {
        $fs = $financial['summary'];
        $finSummaryRows = [
            ['Revenue (income)', fm($fs['revenue'])],
            ['Total expenses', fm($fs['expenses'])],
            ['   of which damaged stock (loss)', fm($fs['damage_loss'])],
            ['Cost of goods sold (product sales)', fm($fs['cost_of_goods'] ?? 0)],
            ['Net profit', fm($fs['net_profit'])],
        ];
        $incomeRows = array_map(fn($r) => [$r['category'], fm($r['total'])], $financial['income_by_category']);
        $expenseRows = array_map(fn($r) => [$r['category'], fm($r['total'])], $financial['expenses_by_category']);
        $sl = $financial['sales'];
        $salesRows = [
            ['Product sales (receipts)', $sl['count']],
            ['Units sold', $sl['units']],
            ['Sales revenue', fm($sl['revenue'])],
            ['Cost of goods sold', fm($sl['cost'])],
            ['Gross profit on sales', fm($sl['profit'])],
            ['Damaged units in period', $financial['damaged_units']],
            ['Stock on hand (units)', $financial['stock_on_hand']['units']],
            ['Stock on hand (selling value)', fm($financial['stock_on_hand']['value'])],
        ];
        $topProductRows = array_map(fn($r) => [$r['product_name'] . ' - ' . $r['type_name'], (int)$r['units'], fm($r['revenue']), fm($r['profit'])], $financial['top_products']);
    }

    // ---- Customer acquisition rows ----
    $mkSummaryRows = $sourceRows = [];
    if ($marketing) {
        $ms = $marketing['summary'];
        $mkSummaryRows = [
            ['Total customers registered', $ms['total_customers']],
            ['Source with most customers', $ms['top_source'] ?? '-'],
        ];
        $sourceRows = array_map(fn($r) => [$r['label'], $r['total']], $marketing['sources']);
    }

    if ($format === 'csv') {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filenameBase . '.csv"');
        $out = fopen('php://output', 'w');
        fputcsv($out, ['MABUMBA TECH - Company Performance Report']);
        fputcsv($out, ['Period', $rangeLabel]);
        fputcsv($out, ['Generated', date('d M Y H:i') . ' by ' . $admin['full_name']]);
        fputcsv($out, ['Amounts are in TZS']);
        fputcsv($out, []);

        if ($financial) {
            fputcsv($out, ['FINANCIAL SUMMARY']);
            foreach ($finSummaryRows as $r) fputcsv($out, $r);
            fputcsv($out, []);
            fputcsv($out, ['INCOME BY CATEGORY']);
            foreach ($incomeRows as $r) fputcsv($out, $r);
            fputcsv($out, []);
            fputcsv($out, ['EXPENSES BY CATEGORY']);
            foreach ($expenseRows as $r) fputcsv($out, $r);
            fputcsv($out, []);
            fputcsv($out, ['SALES & STOCK']);
            foreach ($salesRows as $r) fputcsv($out, $r);
            fputcsv($out, []);
            fputcsv($out, ['TOP SELLING PRODUCTS']);
            fputcsv($out, ['Product', 'Units', 'Revenue', 'Profit']);
            foreach ($topProductRows as $r) fputcsv($out, $r);
            fputcsv($out, []);
        }

        if ($marketing) {
            fputcsv($out, ['CUSTOMER ACQUISITION']);
            foreach ($mkSummaryRows as $r) fputcsv($out, $r);
            fputcsv($out, []);
            fputcsv($out, ['CUSTOMERS BY SOURCE']);
            fputcsv($out, ['Source', 'Customers']);
            foreach ($sourceRows as $r) fputcsv($out, $r);
            fputcsv($out, []);
        }

        fputcsv($out, ['OPERATIONS SUMMARY']);
        foreach ($summaryRows as $r) fputcsv($out, $r);
        fputcsv($out, []);

        fputcsv($out, ['REQUESTS BY STATUS']);
        fputcsv($out, ['Status', 'Count']);
        foreach ($statusRows as $r) fputcsv($out, $r);
        fputcsv($out, []);

        fputcsv($out, ['REQUESTS BY SERVICE']);
        fputcsv($out, ['Service', 'Requests']);
        foreach ($serviceRows as $r) fputcsv($out, $r);
        fputcsv($out, []);

        fputcsv($out, ['REQUEST TREND']);
        fputcsv($out, ['Date', 'Requests']);
        foreach ($trendRows as $r) fputcsv($out, $r);
        fputcsv($out, []);

        fputcsv($out, ['STAFF PERFORMANCE']);
        fputcsv($out, ['Staff', 'Position', 'Completed (in range)', 'Active Now', 'Total Assigned (all-time)']);
        foreach ($staffRows as $r) fputcsv($out, $r);
        fputcsv($out, []);

        fputcsv($out, ['CUSTOMER ACTIVITY (Top 15)']);
        fputcsv($out, ['Customer', 'Email', 'Requests in Range']);
        foreach ($customerRows as $r) fputcsv($out, $r);
        fputcsv($out, []);

        fputcsv($out, ['COMMUNICATION ACTIVITY']);
        fputcsv($out, ['Sender Role', 'Messages']);
        foreach ($commRows as $r) fputcsv($out, $r);
        fputcsv($out, []);

        fputcsv($out, ['Prepared by (name & signature):', '', 'Date:']);
        fputcsv($out, []);
        fputcsv($out, ['Approved by (name & signature):', '', 'Date:']);

        fclose($out);
        log_activity($adminId, 'Downloaded report', "Company Report (CSV) - $rangeLabel");
        exit;
    }

    if ($format === 'xlsx') {
        require_once __DIR__ . '/../../includes/simple_excel.php';
        $xl = new SimpleExcel();
        if ($financial) {
            $xl->addSheet('Financial Summary', ['Metric', 'Amount (TZS)'], $finSummaryRows);
            $xl->addSheet('Income', ['Category', 'Amount'], $incomeRows);
            $xl->addSheet('Expenses', ['Category', 'Amount'], $expenseRows);
            $xl->addSheet('Sales & Stock', ['Metric', 'Value'], $salesRows);
            $xl->addSheet('Top Products', ['Product', 'Units', 'Revenue', 'Profit'], $topProductRows);
        }
        if ($marketing) {
            $xl->addSheet('Acquisition', ['Metric', 'Value'], $mkSummaryRows);
            $xl->addSheet('Customer Sources', ['Source', 'Customers'], $sourceRows);
        }
        $xl->addSheet('Summary', ['Metric', 'Value'], $summaryRows);
        $xl->addSheet('By Status', ['Status', 'Count'], $statusRows);
        $xl->addSheet('By Service', ['Service', 'Requests'], $serviceRows);
        $xl->addSheet('Trend', ['Date', 'Requests'], $trendRows);
        $xl->addSheet('Staff Performance', ['Staff', 'Position', 'Completed', 'Active Now', 'Total Assigned'], $staffRows);
        $xl->addSheet('Customer Activity', ['Customer', 'Email', 'Requests'], $customerRows);
        $xl->addSheet('Communication', ['Sender Role', 'Messages'], $commRows);
        $xl->addSheet('Sign-off', ['Role', 'Name', 'Signature', 'Date'], [['Prepared by', '', '', ''], ['Approved by', '', '', '']]);

        header('Content-Type: application/vnd.ms-excel; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filenameBase . '.xls"');
        echo $xl->output();
        log_activity($adminId, 'Downloaded report', "Company Report (Excel) - $rangeLabel");
        exit;
    }

    // pdf
    require_once __DIR__ . '/../../includes/simple_pdf.php';
    $pdf = new SimplePdf();
    $pdf->setFooter('MABUMBA TECH - Company Performance Report - ' . $rangeLabel);

    // Header: a solid blue band across the top (the same brand blue used
    // site-wide), with the logo, company name and report title all
    // centered on it. Band height is sized to what's actually drawn inside
    // it (logo + 2 text lines), not a guessed constant.
    $bandTop = SimplePdf::PAGE_H;
    $bandHeight = 168;
    $pdf->rect(0, $bandTop - $bandHeight, SimplePdf::PAGE_W, $bandHeight, SimplePdf::BLUE_DARK);
    $pdf->spacer(12);
    $pdf->imagePng(__DIR__ . '/../../../frontend/img/logo.png', 90); // height follows the logo's own aspect ratio
    $pdf->centerLine('MABUMBA TECH', 18, true, SimplePdf::WHITE);
    $pdf->centerLine('Company Performance Report', 12, false, SimplePdf::WHITE);
    $pdf->spacer(18);

    $pdf->centerLine('Reporting period: ' . $rangeLabel, 9.5, true, SimplePdf::BLUE_DARK);
    $pdf->centerLine('Generated: ' . date('d M Y, H:i') . '   |   Amounts in TZS', 9, false, SimplePdf::GRAY);
    $pdf->spacer(10);

    if ($financial) {
        $pdf->section('1. Financial Summary');
        $pdf->table([['Metric', 330], ['Amount (TZS)', 150]], $finSummaryRows);
        $pdf->paragraph('Damaged stock is recorded as a loss (expense) at its buying price, so it is already included in total expenses and net profit.', 8, null, false);
        if ($incomeRows) {
            $pdf->line('Income by category', 10, true, SimplePdf::BLUE_DARK);
            $pdf->table([['Category', 330], ['Amount (TZS)', 150]], $incomeRows);
        }
        if ($expenseRows) {
            $pdf->line('Expenses by category', 10, true, SimplePdf::BLUE_DARK);
            $pdf->table([['Category', 330], ['Amount (TZS)', 150]], $expenseRows);
        }

        $pdf->section('2. Product Sales & Stock');
        $pdf->table([['Metric', 330], ['Value', 150]], $salesRows);
        if ($topProductRows) {
            $pdf->line('Top selling products', 10, true, SimplePdf::BLUE_DARK);
            $pdf->table([['Product', 230], ['Units', 55], ['Revenue', 115], ['Profit', 115]], $topProductRows);
        }
    }

    if ($marketing) {
        $pdf->section(($financial ? '3' : '1') . '. Customer Acquisition');
        $pdf->table([['Metric', 330], ['Value', 150]], $mkSummaryRows);
        $pdf->line('Customers by source', 10, true, SimplePdf::BLUE_DARK);
        $pdf->table([['Source', 330], ['Customers', 150]], $sourceRows);
    }

    $opsNumber = 1 + ($financial ? 2 : 0) + ($marketing ? 1 : 0);
    $pdf->section($opsNumber . '. Operations');
    $pdf->table([['Metric', 260], ['Value', 100]], $summaryRows);

    $pdf->line('Requests by status', 10, true, SimplePdf::BLUE_DARK);
    $pdf->table([['Status', 260], ['Count', 100]], $statusRows);

    $pdf->line('Requests by service', 10, true, SimplePdf::BLUE_DARK);
    $pdf->table([['Service', 260], ['Requests', 100]], $serviceRows);

    $pdf->line('Staff performance', 10, true, SimplePdf::BLUE_DARK);
    $pdf->table([['Staff', 150], ['Position', 130], ['Completed', 80], ['Active', 60], ['Total', 60]], $staffRows);

    $pdf->line('Top customer activity', 10, true, SimplePdf::BLUE_DARK);
    $pdf->table([['Customer', 180], ['Email', 220], ['Requests', 80]], $customerRows);

    $pdf->line('Communication activity', 10, true, SimplePdf::BLUE_DARK);
    $pdf->table([['Sender Role', 260], ['Messages', 100]], $commRows);

    $pdf->signatureBlock(['Prepared by', 'Approved by']);

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filenameBase . '.pdf"');
    echo $pdf->output();
    log_activity($adminId, 'Downloaded report', "Company Report (PDF) - $rangeLabel");
    exit;
}
