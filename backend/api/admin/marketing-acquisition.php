<?php
require_once __DIR__ . '/../../includes/api.php';

$me = api_require_any_permission(['marketing.view', 'marketing.manage', 'marketing.acquisition.manage']);
$canCreate = has_permission($me, 'marketing.manage');
$canReview = has_permission($me, 'marketing.acquisition.manage');
// A plain Marketing Officer (marketing.manage, no review permission, not a full admin)
// only sees requests they personally created — the review/company-wide view is a
// Marketing Manager (or full admin) privilege. Anyone a request was forwarded to
// (e.g. a Sales Officer handling a product request) also sees that request.
// The Operations Manager sees every request (to assign product requests) but cannot review/cancel them.
$isOpsManager = ($me['job_role_key'] ?? null) === 'general_manager';
$ownOnly = !$canReview && !is_full_admin($me) && !$isOpsManager;
// Product requests are assigned by the Operations Manager (or a full admin); service requests by the Marketing Manager (or a full admin).
$canForward = function (array $req) use ($me, $canReview, $isOpsManager): bool {
    if (is_full_admin($me)) return true;
    return ($req['request_type'] ?? '') === 'product' ? $isOpsManager : $canReview;
};
$canSeeRequest = function (array $req) use ($me, $ownOnly): bool {
    if (!$ownOnly) return true;
    return (int)$req['created_by_staff_id'] === (int)$me['id'] || acq_is_assigned((int)$req['id'], (int)$me['id']);
};

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'create') {
        if (!$canCreate) json_error('You do not have permission to create requests here.', 403);
        $result = create_acquisition_request($input, (int)$me['id']);
        if (isset($result['error'])) {
            json_response(['success' => false, 'message' => $result['error']]);
        }

        // optional file attachment(s) — logos, brand colors, reference docs, etc. — up to 3 files, none required
        if (!empty($_FILES['attachments'])) {
            $count = count($_FILES['attachments']['name']);
            for ($i = 0; $i < min($count, 3); $i++) {
                if (($_FILES['attachments']['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;
                $singleFile = [
                    'name'     => $_FILES['attachments']['name'][$i],
                    'type'     => $_FILES['attachments']['type'][$i],
                    'tmp_name' => $_FILES['attachments']['tmp_name'][$i],
                    'error'    => $_FILES['attachments']['error'][$i],
                    'size'     => $_FILES['attachments']['size'][$i],
                ];
                save_request_attachment($result['id'], (int)$me['id'], $singleFile);
            }
        }

        json_response(['success' => true, 'message' => 'Request submitted. Tracking code: ' . $result['tracking_code'], 'tracking_code' => $result['tracking_code'], 'request_id' => $result['id']]);
    }

    // Every remaining action targets one existing acquisition request.
    $requestId = (int)($input['request_id'] ?? 0);
    $req = $requestId ? get_acquisition_request($requestId) : null;
    if (!$req) json_error('Request not found.', 404);

    if (!$canSeeRequest($req)) {
        json_error('You do not have permission to access this request.', 403);
    }

    if ($action === 'add_note') {
        $note = trim($input['note'] ?? '');
        if ($note === '') json_response(['success' => false, 'message' => 'Write a note first.']);
        log_acquisition_event($requestId, $me['id'], 'note', $note);
        json_response(['success' => true, 'message' => 'Note added.']);
    }

    // Product requests: whoever it was forwarded to (Sales Officer, General Admin or Super Admin)
    // moves it through pending -> in progress -> completed. COMPLETING it records the real sale
    // (stock, income, profit — see record_product_request_sale), so it needs the sale details.
    if ($action === 'respond' || $action === 'complete' || $action === 'record_sale') {
        $isAssignee = acq_is_assigned($requestId, (int)$me['id']);
        if (!$isAssignee && !is_full_admin($me)) {
            json_error('Only the person this request was forwarded to can update its progress.', 403);
        }

        if ($action === 'record_sale') {
            // Catch-up for a deal that was marked complete BEFORE sales were tied to product
            // requests: it has no sale behind it, so stock/income/profit are still missing.
            if (($req['request_type'] ?? '') !== 'product' || $req['status'] !== 'completed') {
                json_response(['success' => false, 'message' => 'Only a completed product request that has no sale yet can be recorded this way.']);
            }
            try {
                $receipt = record_product_request_sale($requestId, $input, (int)$me['id']);
            } catch (Throwable $e) {
                json_response(['success' => false, 'message' => $e->getMessage()]);
            }
            log_acquisition_event($requestId, (int)$me['id'], 'note', 'Sale recorded for this completed deal (receipt ' . $receipt['receipt_code'] . ', total ' . number_format($receipt['total_amount'], 2) . ').');
            log_activity($me['id'], 'Recorded sale for product request', "Request #$requestId, receipt " . $receipt['receipt_code']);
            json_response(['success' => true, 'message' => 'Sale recorded. Stock, income and profit are now updated.', 'receipt' => $receipt]);
        }

        $saleOut = null;
        $err = update_product_progress($requestId, $action === 'complete' ? 'completed' : 'in_progress', (int)$me['id'], trim($input['note'] ?? ''),
            $action === 'complete' ? $input : null, $saleOut);
        json_response([
            'success' => !$err,
            'message' => $err ?: ($action === 'complete'
                ? 'Deal complete. Sale ' . $saleOut['receipt_code'] . ' recorded — stock reduced and income posted. The Accountant has been notified.'
                : 'Marked as received and responded to.'),
            'receipt' => $saleOut,
        ]);
    }

    if ($action === 'forward' || $action === 'unforward') {
        if (!$canForward($req)) {
            json_error(($req['request_type'] ?? '') === 'product'
                ? 'Product requests are assigned by the Operations Manager.'
                : 'You do not have permission to make changes here.', 403);
        }
        if ($action === 'forward') {
            $err = forward_acquisition_request($requestId, (int)($input['staff_id'] ?? 0), (int)$me['id']);
            json_response(['success' => !$err, 'message' => $err ?: 'Request forwarded.']);
        }
        $err = unforward_acquisition_request($requestId, (int)($input['staff_id'] ?? 0), (int)$me['id']);
        json_response(['success' => !$err, 'message' => $err ?: 'Removed from that staff member.']);
    }

    // Everything past this point is Marketing Manager (or full admin) territory.
    if (!$canReview && !is_full_admin($me)) {
        json_error('You do not have permission to make changes here.', 403);
    }

    if ($action === 'mark_reviewed') {
        mark_acquisition_reviewed($requestId, (int)$me['id'], trim($input['note'] ?? ''));
        json_response(['success' => true, 'message' => 'Marked as reviewed.']);
    }

    if ($action === 'cancel') {
        cancel_acquisition_request($requestId, (int)$me['id'], trim($input['reason'] ?? ''));
        json_response(['success' => true, 'message' => 'Request cancelled.']);
    }

    json_error('Unknown action.');
}

// ---- GET ----

// ---- Customer sources (which source brings the most customers) ----------
$mode = $_GET['mode'] ?? '';

if ($mode === 'sources') {
    require_once __DIR__ . '/../../includes/reports.php';
    $rangePreset = $_GET['range'] ?? 'all';
    if ($rangePreset === 'all') {
        $start = $end = null;
        $label = 'All time';
    } else {
        [$start, $end, $rangePreset] = resolve_report_range($rangePreset, null, null);
        $label = report_range_label($rangePreset, $start, $end);
    }
    json_response([
        'range' => ['preset' => $rangePreset, 'label' => $label],
        'sources' => lead_source_stats($start, $end),
    ]);
}

// "Search for potential customers" — existing accounts + past guest requesters.
if (isset($_GET['recent_customers'])) {
    json_response(['results' => recent_potential_customers(8)]);
}

$searchQ = trim($_GET['search_customers'] ?? '');
if ($searchQ !== '') {
    json_response(['results' => search_potential_customers($searchQ)]);
}

$viewId = (int)($_GET['view'] ?? 0);
if ($viewId) {
    $req = get_acquisition_request($viewId);
    if (!$req) json_error('Request not found.', 404);
    if (!$canSeeRequest($req)) {
        json_error('You do not have permission to access this request.', 403);
    }

    // A product request can only be forwarded to the Super Admin, a General Admin or a Sales Officer.
    if (($req['request_type'] ?? '') === 'product') {
        $staffOptions = acq_product_assignee_options();
    } else {
        $staffOptions = $pdo->query("SELECT id, full_name, username FROM users WHERE role IN ('staff','admin') AND status = 'active' ORDER BY full_name")->fetchAll();
    }
    $isAssignee = acq_is_assigned($viewId, (int)$me['id']);
    $canProgress = ($req['request_type'] ?? '') === 'product' && ($isAssignee || is_full_admin($me));

    // The sale this product request ended in (empty until it is completed), and — only for
    // the person who is about to record it — the in-stock products to pick from. Cost price
    // is never sent; the server re-checks stock and the minimum price when the sale is saved.
    $requestSale = ($req['request_type'] ?? '') === 'product' ? get_product_request_sale($viewId) : [];
    $saleProducts = [];
    if ($canProgress && !$requestSale && in_array($req['status'], ['in_progress', 'completed'], true)) {
        $saleProducts = $pdo->query("
            SELECT pt.id, pt.name, pt.unit, pt.quantity, pt.selling_price, pt.minimum_selling_price, p.name AS product_name
            FROM product_types pt JOIN products p ON p.id = pt.product_id
            WHERE pt.is_active = 1 AND p.is_active = 1 AND pt.quantity > 0
            ORDER BY p.name, pt.name
        ")->fetchAll();
    }

    json_response([
        'request' => $req,
        'sale' => $requestSale,
        'sale_products' => $saleProducts,
        'payment_options' => payment_options(),
        'history' => get_acquisition_history($viewId),
        'attachments' => get_request_attachments($viewId),
        'assignments' => get_acquisition_assignments($viewId),
        'staff_options' => $staffOptions,
        'can_review' => $canReview || is_full_admin($me),
        'can_forward' => $canForward($req),
        // May this user move a product request along (pending -> in progress -> completed)?
        'can_progress' => $canProgress,
    ]);
}

// ---- LIST ----
$statusFilter = $_GET['status'] ?? 'all';
$typeFilter = $_GET['type'] ?? 'all';

$sql = "
    SELECT sr.id, sr.tracking_code, sr.guest_name, sr.guest_phone, sr.guest_email, sr.request_type,
           sr.status, sr.acquisition_status, sr.budget, sr.deadline, sr.created_at,
           s.name AS service_name, pt.name AS product_type_name, sr.product_name,
           u.full_name AS created_by_name
    FROM service_requests sr
    LEFT JOIN services s ON s.id = sr.service_id
    LEFT JOIN product_types pt ON pt.id = sr.product_type_id
    LEFT JOIN users u ON u.id = sr.created_by_staff_id
    WHERE sr.source = 'marketing_officer'
";
$params = [];
if ($ownOnly) {
    $sql .= ' AND (sr.created_by_staff_id = ? OR sr.id IN (SELECT ra.request_id FROM request_assignments ra WHERE ra.staff_id = ?))';
    $params[] = $me['id'];
    $params[] = $me['id'];
}
if ($statusFilter !== 'all') {
    $sql .= ' AND sr.status = ?';
    $params[] = $statusFilter;
}
if ($typeFilter !== 'all') {
    $sql .= ' AND sr.request_type = ?';
    $params[] = $typeFilter;
}
$sql .= ' ORDER BY sr.created_at DESC LIMIT 300';
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$requests = $stmt->fetchAll();

$statsSql = "SELECT
        COUNT(*) AS total,
        SUM(acquisition_status = 'pending_review') AS pending_review,
        SUM(status NOT IN ('cancelled') AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())) AS created_this_month,
        SUM(status IN ('completed','delivered')) AS converted
    FROM service_requests WHERE source = 'marketing_officer'";
if ($ownOnly) {
    $statsStmt = $pdo->prepare($statsSql . ' AND (created_by_staff_id = ? OR id IN (SELECT ra.request_id FROM request_assignments ra WHERE ra.staff_id = ?))');
    $statsStmt->execute([$me['id'], $me['id']]);
    $stats = $statsStmt->fetch();
} else {
    $stats = $pdo->query($statsSql)->fetch();
}

$services = $pdo->query('SELECT id, name FROM services WHERE is_active = 1 ORDER BY name')->fetchAll();
$products = $pdo->query("
    SELECT pt.id, pt.name, p.name AS category_name
    FROM product_types pt
    JOIN products p ON p.id = pt.product_id
    WHERE pt.is_active = 1 AND p.is_active = 1
    ORDER BY p.name, pt.name
")->fetchAll();

json_response([
    'stats' => $stats,
    'requests' => $requests,
    'services' => $services,
    'products' => $products,
    'sources' => lead_source_options(),
    'can_create' => $canCreate,
    'can_review' => $canReview || is_full_admin($me),
]);
