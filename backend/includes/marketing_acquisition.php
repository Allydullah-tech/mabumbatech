<?php
/**
 * MABUMBA TECH — Marketing & Customer Acquisition
 * Schema: migration_023_marketing_customer_acquisition.sql
 *
 * A Marketing Officer uses this to register a request on behalf of a
 * customer they found (not one who came in through the public site).
 * The result is a normal `service_requests` row — same table, same
 * tracking code, same Track Request page, same admin Requests screen —
 * just tagged with source='marketing_officer' so everyone downstream
 * knows where it came from. See the migration file for the full
 * rationale; this file is the logic that has to be correct once
 * (creation, review, forwarding, history) rather than reimplemented
 * per endpoint.
 */

/** One audit-trail entry for an acquisition request. */
function log_acquisition_event(int $requestId, ?int $userId, string $action, ?string $note = null): void
{
    global $pdo;
    $stmt = $pdo->prepare('INSERT INTO acquisition_history (request_id, user_id, action, note) VALUES (?,?,?,?)');
    $stmt->execute([$requestId, $userId, $action, $note]);
}

function get_acquisition_history(int $requestId): array
{
    global $pdo;
    $stmt = $pdo->prepare('
        SELECT ah.*, u.full_name AS user_name
        FROM acquisition_history ah
        LEFT JOIN users u ON u.id = ah.user_id
        WHERE ah.request_id = ?
        ORDER BY ah.created_at ASC
    ');
    $stmt->execute([$requestId]);
    return $stmt->fetchAll();
}

/** Fetches one acquisition request (source='marketing_officer' only). */
function get_acquisition_request(int $requestId): ?array
{
    global $pdo;
    $stmt = $pdo->prepare("
        SELECT sr.*, s.name AS service_name, s.icon AS service_icon,
               pt.name AS product_type_name,
               u.full_name AS created_by_name
        FROM service_requests sr
        LEFT JOIN services s ON s.id = sr.service_id
        LEFT JOIN product_types pt ON pt.id = sr.product_type_id
        LEFT JOIN users u ON u.id = sr.created_by_staff_id
        WHERE sr.id = ? AND sr.source = 'marketing_officer'
    ");
    $stmt->execute([$requestId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * Creates a service_requests row on behalf of a customer the Marketing
 * Officer found, generates its tracking code the same way a normal public
 * request does, and notifies the Marketing Manager(s) it needs review.
 *
 * Returns ['id' => ..., 'tracking_code' => ...] on success, or
 * ['error' => 'message'] on validation failure.
 */
function create_acquisition_request(array $data, int $officerId): array
{
    global $pdo;

    $fullName = trim($data['full_name'] ?? '');
    $phone = trim($data['phone'] ?? '');
    $email = trim($data['email'] ?? '');
    $location = trim($data['location'] ?? '');
    $requestType = ($data['request_type'] ?? '') === 'product' ? 'product' : 'service';
    $serviceId = (int)($data['service_id'] ?? 0) ?: null;
    $productTypeId = (int)($data['product_type_id'] ?? 0) ?: null;
    $productName = trim($data['product_name'] ?? '');
    $quantity = (int)($data['quantity'] ?? 0) ?: null;
    $requirements = trim($data['requirements'] ?? '');
    $budget = trim($data['budget'] ?? '');
    $deadline = trim($data['preferred_date'] ?? '') ?: null;
    $notes = trim($data['additional_notes'] ?? '');

    if ($fullName === '' || $phone === '') {
        return ['error' => 'Customer full name and phone number are required.'];
    }
    if ($requestType === 'service' && !$serviceId) {
        return ['error' => 'Select the service the customer needs.'];
    }
    if ($requestType === 'product' && !$productTypeId && $productName === '') {
        return ['error' => 'Select a product, or describe the product the customer wants.'];
    }
    if ($requirements === '') {
        return ['error' => 'Describe the customer\'s requirements.'];
    }

    // The customer's SOURCE is required — it is how the company learns which
    // channels (adverts, referrals...) actually bring customers in.
    $sourceOptions = lead_source_options();
    $source = $data['source'] ?? '';
    if (!isset($sourceOptions[$source])) {
        return ['error' => 'Choose where this customer came from (the customer source).'];
    }

    $subject = $requestType === 'product'
        ? ('Product interest: ' . ($productName !== '' ? $productName : 'product'))
        : ('Service request for ' . $fullName);

    $code = generate_tracking_code();
    $stmt = $pdo->prepare('
        INSERT INTO service_requests
            (tracking_code, guest_name, guest_email, guest_phone, guest_location,
             service_id, request_type, product_type_id, product_name, quantity,
             subject, message, additional_notes, budget, deadline, status,
             source, created_by_staff_id, acquisition_status)
        VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, "pending", "marketing_officer", ?, "pending_review")
    ');
    $stmt->execute([
        $code, $fullName, $email ?: null, $phone, $location ?: null,
        $serviceId, $requestType, $productTypeId, $productName ?: null, $quantity,
        $subject, $requirements, $notes ?: null, $budget ?: null, $deadline,
        $officerId,
    ]);
    $requestId = (int)$pdo->lastInsertId();

    link_request_to_lead($data, $requestId, $code, $fullName, $phone, $email, $serviceId, $officerId);

    log_acquisition_event($requestId, $officerId, 'created', 'Request registered on behalf of ' . $fullName . '.');
    log_activity($officerId, 'Marketing acquisition request created', "Request #$requestId ($code) for $fullName");

    if ($requestType === 'product') {
        // A product request is assigned by the Operations Manager (to the Super Admin, a General Admin or a Sales Officer).
        notify_job_role('general_manager', 'new_request', 'New Product Request: ' . $fullName,
            'A Marketing Officer registered a new product request for ' . $fullName . '. Please assign it to the Super Admin, a General Admin or a Sales Officer. Tracking code ' . $code . '.',
            '/backend/admin/marketing-acquisition.php?view=' . $requestId);
    } else {
        notify_job_role('marketing_manager', 'new_request', 'New Customer Acquisition Request: ' . $fullName,
            'A Marketing Officer registered a new service request for ' . $fullName . '. Tracking code ' . $code . '.',
            '/backend/admin/marketing-acquisition.php?view=' . $requestId);
    }

    return ['id' => $requestId, 'tracking_code' => $code];
}

/**
 * A customer who already has a real request is a customer WON — so the
 * request is tied to a lead carrying the customer's source. If this person
 * is already an open lead (same phone number) that lead is moved to Won and
 * keeps its original source; otherwise a new Won lead is created with the
 * source chosen in the form. Either way the customer is counted exactly once
 * in the source statistics.
 */
function link_request_to_lead(array $data, int $requestId, string $code, string $fullName, string $phone, string $email, ?int $serviceId, int $officerId): void
{
    global $pdo;

    $stmt = $pdo->prepare("SELECT id, status FROM leads WHERE phone = ? AND status NOT IN ('won','lost') AND converted_request_id IS NULL ORDER BY created_at DESC LIMIT 1");
    $stmt->execute([$phone]);
    $lead = $stmt->fetch();

    if ($lead) {
        $leadId = (int)$lead['id'];
        $old = $lead['status'];
        $pdo->prepare("UPDATE leads SET status = 'won', converted_request_id = ? WHERE id = ?")->execute([$requestId, $leadId]);
        log_lead_activity($leadId, $officerId, 'status_change', '', null, $old, 'won');
        log_lead_activity($leadId, $officerId, 'note', 'Customer request registered — tracking code ' . $code . '.');
        return;
    }

    $res = create_lead_record([
        'full_name' => $fullName, 'phone' => $phone, 'email' => $email,
        'source' => $data['source'] ?? '',
        'source_detail' => $data['source_detail'] ?? '',
        'requested_service_id' => $serviceId, 'force' => 1,
    ], $officerId);
    if (isset($res['id'])) {
        $pdo->prepare("UPDATE leads SET status = 'won', converted_request_id = ? WHERE id = ?")->execute([$requestId, $res['id']]);
        log_lead_activity($res['id'], $officerId, 'status_change', '', null, 'new', 'won');
        log_lead_activity($res['id'], $officerId, 'note', 'Customer request registered — tracking code ' . $code . '.');
    }
}

/** Marketing Manager marks an acquisition request as reviewed. */
function mark_acquisition_reviewed(int $requestId, int $managerId, string $note = ''): void
{
    global $pdo;
    $pdo->prepare("UPDATE service_requests SET acquisition_status = 'reviewed' WHERE id = ? AND source = 'marketing_officer'")
        ->execute([$requestId]);
    log_acquisition_event($requestId, $managerId, 'reviewed', $note ?: null);
    log_activity($managerId, 'Reviewed acquisition request', "Request #$requestId");
}

/**
 * Who a PRODUCT request can be forwarded to: the Super Admin, a General
 * (generic) Admin — an admin with no job role — or a Sales Officer.
 * Service requests keep using the wider staff/admin list.
 */
function acq_product_assignee_options(): array
{
    global $pdo;
    return $pdo->query("
        SELECT id, full_name, username,
               CASE
                   WHEN role = 'super_admin' THEN 'Super Admin / CEO'
                   WHEN job_role_key = 'sales_officer' THEN 'Sales Officer'
                   ELSE 'General Admin'
               END AS role_label
        FROM users
        WHERE status = 'active' AND (
            role = 'super_admin'
            OR (role = 'admin' AND (job_role_key IS NULL OR job_role_key = ''))
            OR (role = 'admin' AND job_role_key = 'sales_officer')
        )
        ORDER BY FIELD(role, 'super_admin', 'admin'), full_name
    ")->fetchAll();
}

/** True when this user has been forwarded the request. */
function acq_is_assigned(int $requestId, int $userId): bool
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT 1 FROM request_assignments WHERE request_id = ? AND staff_id = ? LIMIT 1');
    $stmt->execute([$requestId, $userId]);
    return (bool)$stmt->fetchColumn();
}

/**
 * Forwards (assigns) an acquisition request to a staff member — the same
 * underlying action as the normal admin Requests "assign" flow, scoped so
 * a Marketing Manager can do it without needing full projects.manage
 * access to every other request in the system.
 *
 * PRODUCT requests can only go to the Super Admin, a General Admin or a Sales
 * Officer, and they follow a simple three-step progress: pending (nobody has
 * responded yet) -> in progress (the assignee received and responded) ->
 * completed (the deal is done / the sale was made). Forwarding therefore does
 * NOT move a product request to "assigned" — it stays "pending" until the
 * assignee responds.
 *
 * Returns null on success, or an error string.
 */
function forward_acquisition_request(int $requestId, int $staffId, int $managerId): ?string
{
    global $pdo;
    $req = get_acquisition_request($requestId);
    if (!$req) return 'Request not found.';
    if (!$staffId) return 'Choose a staff member to forward this to.';
    if ($req['status'] === 'cancelled') return 'This request was cancelled.';
    $isProduct = ($req['request_type'] ?? '') === 'product';
    if ($isProduct && $req['status'] === 'completed') return 'This deal is already complete.';

    $stmt = $pdo->prepare('SELECT full_name FROM users WHERE id = ? AND status = "active"');
    $stmt->execute([$staffId]);
    $staff = $stmt->fetch();
    if (!$staff) return 'Selected staff member not found.';

    if ($isProduct) {
        $allowed = array_map('intval', array_column(acq_product_assignee_options(), 'id'));
        if (!in_array($staffId, $allowed, true)) {
            return 'A product request can only be forwarded to the Super Admin, a General Admin or a Sales Officer.';
        }
    }

    $pdo->prepare('INSERT IGNORE INTO request_assignments (request_id, staff_id, is_broadcast, task_status) VALUES (?,?,0,"new")')
        ->execute([$requestId, $staffId]);
    if ($isProduct) {
        // Stays "pending" until the assignee responds.
        $pdo->prepare("UPDATE service_requests SET assigned_by = ?, assigned_at = NOW(), acquisition_status = 'forwarded' WHERE id = ?")
            ->execute([$managerId, $requestId]);
    } else {
        $pdo->prepare("UPDATE service_requests SET status = 'assigned', assigned_by = ?, assigned_at = NOW(), acquisition_status = 'forwarded' WHERE id = ?")
            ->execute([$managerId, $requestId]);
    }

    log_acquisition_event($requestId, $managerId, 'forwarded', 'Forwarded to ' . $staff['full_name'] . '.');
    log_activity($managerId, 'Forwarded acquisition request', "Request #$requestId -> staff #$staffId");

    if ($isProduct) {
        $what = trim(($req['product_name'] ?: $req['product_type_name'] ?: 'a product') . ($req['quantity'] ? ' × ' . $req['quantity'] : ''));
        notify_user($staffId, 'task_assigned', 'Product Request: ' . $req['guest_name'],
            $req['guest_name'] . ' wants ' . $what . '. Please receive and respond to this request. Tracking code ' . $req['tracking_code'] . '.',
            '/backend/admin/marketing-acquisition.php?view=' . $requestId);
    } else {
        notify_user($staffId, 'task_assigned', 'New Task Assigned: ' . $req['subject'],
            'A Marketing Manager forwarded a customer-acquisition request to you. Tracking code ' . $req['tracking_code'] . '.',
            '/backend/staff/task-view.php?id=' . $requestId);
    }

    return null;
}

/**
 * Sale already recorded for a product request (rows of inventory_sales whose
 * request_id points at it), with product names — empty array when none.
 */
function get_product_request_sale(int $requestId): array
{
    global $pdo;
    $stmt = $pdo->prepare("
        SELECT s.id, COALESCE(s.receipt_code, s.sale_code) AS receipt_code, s.quantity, s.unit_price, s.total_amount,
               s.profit, s.payment_method, s.payment_channel, s.created_at,
               pt.name AS type_name, pt.unit AS unit, p.name AS product_name, u.full_name AS sold_by_name,
               d.debt_code, d.total_amount AS debt_total, d.amount_paid AS debt_paid
        FROM inventory_sales s
        JOIN product_types pt ON pt.id = s.product_type_id
        JOIN products p ON p.id = pt.product_id
        LEFT JOIN users u ON u.id = s.sold_by
        LEFT JOIN customer_debts d ON d.receipt_code = COALESCE(s.receipt_code, s.sale_code)
        WHERE s.request_id = ?
        ORDER BY s.id ASC
    ");
    $stmt->execute([$requestId]);
    return $stmt->fetchAll();
}

/**
 * Turns a PRODUCT request into a real sale — the same path as a Sales Officer
 * picking a product on Record Sale (record_sale_items): stock goes down, the
 * sale gets its cost/profit snapshot, and the income (or the customer debt for
 * a credit sale) reaches the finance ledger, so Sales history, Sales Overview,
 * Finance, Reports and the Accountant all include it.
 *
 * $sale = [product_type_id, quantity, unit_price (optional), payment_method,
 *          payment_channel, customer_name/phone/address, due_date,
 *          deposit_amount, deposit_method, deposit_channel]
 *
 * A request can only ever be sold once. Throws RuntimeException with a
 * user-facing message when something is wrong (nothing is saved then).
 * Returns the receipt array from record_sale_items().
 */
function record_product_request_sale(int $requestId, array $sale, int $userId): array
{
    global $pdo;
    $req = get_acquisition_request($requestId);
    if (!$req) throw new RuntimeException('Request not found.');
    if (($req['request_type'] ?? '') !== 'product') throw new RuntimeException('Only product requests can be sold.');
    if ($req['status'] === 'cancelled') throw new RuntimeException('This request was cancelled.');
    if (get_product_request_sale($requestId)) throw new RuntimeException('The sale for this request has already been recorded.');

    $typeId = (int)($sale['product_type_id'] ?? 0);
    $qty = (int)($sale['quantity'] ?? 0);
    if (!$typeId) throw new RuntimeException('Choose the product from stock that the customer bought.');
    if ($qty <= 0) throw new RuntimeException('Enter the quantity the customer bought (at least 1).');

    $payment = in_array($sale['payment_method'] ?? '', ['cash', 'mobile_money', 'bank_transfer', 'card', 'credit'], true) ? $sale['payment_method'] : 'cash';
    $channel = trim((string)($sale['payment_channel'] ?? '')) ?: null;
    $credit = null;
    if ($payment === 'credit') {
        $credit = [
            'name' => $sale['customer_name'] ?? $req['guest_name'],
            'phone' => $sale['customer_phone'] ?? $req['guest_phone'],
            'address' => $sale['customer_address'] ?? ($req['guest_location'] ?? ''),
            'due_date' => $sale['due_date'] ?? '',
            'deposit' => $sale['deposit_amount'] ?? 0,
            'deposit_method' => $sale['deposit_method'] ?? 'cash',
            'deposit_channel' => $sale['deposit_channel'] ?? '',
        ];
    }

    $price = $sale['unit_price'] ?? null;
    $items = [[
        'product_type_id' => $typeId,
        'quantity' => $qty,
        'unit_price' => ($price === '' || $price === null) ? null : $price,
    ]];
    $notes = mb_substr('Product request ' . $req['tracking_code'] . ' — ' . $req['guest_name'], 0, 255);

    return record_sale_items($items, $notes, $userId, $payment, $channel, $credit, $requestId);
}

/**
 * The three-step progress of a PRODUCT request, moved by whoever it was
 * forwarded to (or a full admin):
 *   pending     -> nobody has responded yet           (set automatically)
 *   in_progress -> received and responded to          ($newStatus = 'in_progress')
 *   completed   -> the deal is done, the sale was made ($newStatus = 'completed')
 * Completing a deal RECORDS THE SALE ($sale, see record_product_request_sale):
 * stock is reduced, income/profit are posted, and the Accountant is told the
 * receipt that is already in the books. Without sale details a deal cannot be
 * completed, so a "completed" product request always has a sale behind it.
 * $saleOut receives the receipt array when a sale was recorded.
 *
 * Returns null on success, or a user-facing error string.
 */
function update_product_progress(int $requestId, string $newStatus, int $userId, string $note = '', ?array $sale = null, ?array &$saleOut = null): ?string
{
    global $pdo;
    $req = get_acquisition_request($requestId);
    if (!$req) return 'Request not found.';
    if (($req['request_type'] ?? '') !== 'product') return 'This progress flow is only for product requests.';
    if ($req['status'] === 'cancelled') return 'This request was cancelled.';
    if (!in_array($newStatus, ['in_progress', 'completed'], true)) return 'Invalid progress step.';
    if ($req['status'] === 'completed') return 'This deal is already complete.';
    if ($newStatus === 'in_progress' && $req['status'] !== 'pending') return 'This request has already been responded to.';
    if ($newStatus === 'completed' && $req['status'] !== 'in_progress') return 'Receive and respond to the request first, then mark it complete.';

    $saleOut = null;
    if ($newStatus === 'completed') {
        if (empty($sale)) return 'Enter the sale details (product, quantity, price and payment) to complete this deal.';
        // The sale is recorded FIRST (its own transaction). If it fails — not enough
        // stock, price below minimum, bad payment details — nothing changes at all.
        try {
            $saleOut = record_product_request_sale($requestId, $sale, $userId);
        } catch (Throwable $e) {
            return $e->getMessage();
        }
    }

    if ($newStatus === 'completed') {
        $pdo->prepare("UPDATE service_requests SET status = 'completed', progress = 100, completed_at = NOW() WHERE id = ?")->execute([$requestId]);
        $pdo->prepare("UPDATE request_assignments SET task_status = 'completed' WHERE request_id = ?")->execute([$requestId]);
    } else {
        $pdo->prepare("UPDATE service_requests SET status = 'in_progress' WHERE id = ?")->execute([$requestId]);
        $pdo->prepare("UPDATE request_assignments SET task_status = 'in_progress' WHERE request_id = ? AND task_status = 'new'")->execute([$requestId]);
    }

    $who = $pdo->prepare('SELECT full_name FROM users WHERE id = ?');
    $who->execute([$userId]);
    $name = $who->fetchColumn() ?: 'The assignee';

    $eventNote = $newStatus === 'completed'
        ? ('Deal complete — sale recorded (receipt ' . ($saleOut['receipt_code'] ?? '?') . ', total ' . number_format((float)($saleOut['total_amount'] ?? 0), 2) . ', ' . str_replace('_', ' ', (string)($saleOut['payment_method'] ?? '')) . ').')
        : 'Received and responded to the customer request.';
    if ($note !== '') $eventNote .= ' ' . $note;
    log_acquisition_event($requestId, $userId, $newStatus === 'completed' ? 'completed' : 'responded', mb_substr($eventNote, 0, 500));
    log_activity($userId, $newStatus === 'completed' ? 'Completed product request' : 'Responded to product request', "Request #$requestId");

    $link = '/backend/admin/marketing-acquisition.php?view=' . $requestId;
    if (!empty($req['created_by_staff_id'])) {
        notify_user((int)$req['created_by_staff_id'], 'status_change',
            $newStatus === 'completed' ? 'Product deal completed: ' . $req['guest_name'] : 'Product request responded to: ' . $req['guest_name'],
            $name . ($newStatus === 'completed' ? ' completed the deal for ' : ' received and responded to the request of ') . $req['guest_name'] . '. Tracking code ' . $req['tracking_code'] . '.',
            $link);
    }
    if ($newStatus === 'completed') {
        foreach (['general_manager', 'marketing_manager'] as $jobKey) {
            notify_job_role($jobKey, 'task_completed', 'Product deal completed: ' . $req['guest_name'],
                $name . ' completed the product deal for ' . $req['guest_name'] . '. Tracking code ' . $req['tracking_code'] . '.', $link);
        }
        notify_job_role('accountant', 'task_completed', 'Product deal completed: ' . $req['guest_name'],
            'A product deal for ' . $req['guest_name'] . ' (' . $req['tracking_code'] . ') was completed by ' . $name . '. The sale (receipt ' . ($saleOut['receipt_code'] ?? '') . ', ' . number_format((float)($saleOut['total_amount'] ?? 0), 2) . ', ' . str_replace('_', ' ', (string)($saleOut['payment_method'] ?? '')) . ') is already recorded in sales, stock and the ledger.',
            '/backend/admin/accountant.php');
    }
    return null;
}

/** Staff currently forwarded to on an acquisition request. */
function get_acquisition_assignments(int $requestId): array
{
    global $pdo;
    $stmt = $pdo->prepare("
        SELECT ra.id, ra.staff_id, ra.task_status, ra.created_at, u.full_name
        FROM request_assignments ra
        JOIN users u ON u.id = ra.staff_id
        WHERE ra.request_id = ?
        ORDER BY ra.created_at ASC
    ");
    $stmt->execute([$requestId]);
    return $stmt->fetchAll();
}

/**
 * Undoes a forward — removes one staff member's assignment from an
 * acquisition request. For when it was forwarded to the wrong person, or
 * forwarded twice by mistake. If that was the last remaining assignment,
 * the request drops back to "pending" / "reviewed" so it doesn't sit
 * marked "assigned" with nobody actually on it — the Marketing Manager
 * can then forward it again to the right person from the same screen.
 *
 * Returns null on success, or a user-facing error string.
 */
function unforward_acquisition_request(int $requestId, int $staffId, int $managerId): ?string
{
    global $pdo;
    $req = get_acquisition_request($requestId);
    if (!$req) return 'Request not found.';
    // Once the assignee has responded to a product request it is being handled — it can't be pulled back.
    if (($req['request_type'] ?? '') === 'product' && $req['status'] !== 'pending') {
        return 'This product request is already being handled, so it can no longer be removed.';
    }

    $stmt = $pdo->prepare('SELECT full_name FROM users WHERE id = ?');
    $stmt->execute([$staffId]);
    $staff = $stmt->fetch();
    if (!$staff) return 'Staff member not found.';

    $del = $pdo->prepare('DELETE FROM request_assignments WHERE request_id = ? AND staff_id = ?');
    $del->execute([$requestId, $staffId]);
    if ($del->rowCount() === 0) return 'That staff member is not currently forwarded this request.';

    $remaining = $pdo->prepare('SELECT COUNT(*) FROM request_assignments WHERE request_id = ?');
    $remaining->execute([$requestId]);
    if ((int)$remaining->fetchColumn() === 0) {
        $pdo->prepare("UPDATE service_requests SET status = 'pending', acquisition_status = 'reviewed' WHERE id = ?")
            ->execute([$requestId]);
    }

    log_acquisition_event($requestId, $managerId, 'unforwarded', 'Removed ' . $staff['full_name'] . ' from this request.');
    log_activity($managerId, 'Removed acquisition forward', "Request #$requestId -> staff #$staffId");

    notify_user($staffId, 'task_unassigned', 'Task Removed: ' . $req['subject'],
        'A Marketing Manager removed you from a customer-acquisition request that was forwarded to you by mistake. Tracking code ' . $req['tracking_code'] . '.',
        '/backend/staff/tasks.php');

    return null;
}

/** Cancels an acquisition request (Marketing Manager only — see permission gate at the endpoint). */
function cancel_acquisition_request(int $requestId, int $managerId, string $reason = ''): void
{
    global $pdo;
    $pdo->prepare("UPDATE service_requests SET status = 'cancelled', admin_note = ? WHERE id = ? AND source = 'marketing_officer'")
        ->execute([$reason ?: null, $requestId]);
    log_acquisition_event($requestId, $managerId, 'cancelled', $reason ?: null);
    log_activity($managerId, 'Cancelled acquisition request', "Request #$requestId");
}

/**
 * Simple "search for potential customers" helper: looks across existing
 * customer accounts AND past guest requesters (people who submitted a
 * request without an account) so a Marketing Officer can tell whether
 * someone they found is already known to the company before registering
 * them again.
 */
function search_potential_customers(string $q): array
{
    global $pdo;
    $like = '%' . $q . '%';

    $stmt = $pdo->prepare("
        SELECT id AS customer_id, full_name, email, phone, 'account' AS kind
        FROM users
        WHERE role = 'customer' AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)
        ORDER BY full_name LIMIT 10
    ");
    $stmt->execute([$like, $like, $like]);
    $accounts = $stmt->fetchAll();

    $stmt = $pdo->prepare("
        SELECT MAX(id) AS customer_id, guest_name AS full_name, guest_email AS email, guest_phone AS phone, 'guest' AS kind
        FROM service_requests
        WHERE customer_id IS NULL AND (guest_name LIKE ? OR guest_email LIKE ? OR guest_phone LIKE ?)
        GROUP BY guest_name, guest_email, guest_phone
        ORDER BY MAX(created_at) DESC LIMIT 10
    ");
    $stmt->execute([$like, $like, $like]);
    $guests = $stmt->fetchAll();

    return array_merge($accounts, $guests);
}

/**
 * A short list of the most recent potential customers, shown before anyone
 * has typed a search: open leads, newly registered customer accounts, and
 * recent guest requesters. A person who appears more than once (same phone
 * or email) is listed once, preferring their lead record because it
 * carries the customer source.
 */
function recent_potential_customers(int $limit = 8): array
{
    global $pdo;
    $rows = [];
    $seen = [];
    $add = function (array $r) use (&$rows, &$seen) {
        $key = strtolower(trim(($r['phone'] ?? '') !== '' ? preg_replace('/\s+/', '', $r['phone']) : ($r['email'] ?? '')));
        if ($key !== '' && isset($seen[$key])) return;
        if ($key !== '') $seen[$key] = true;
        $rows[] = $r;
    };

    $leads = $pdo->query("
        SELECT id AS lead_id, full_name, email, phone, source, source_detail, created_at, 'lead' AS kind
        FROM leads WHERE status NOT IN ('won','lost') ORDER BY created_at DESC LIMIT 10
    ")->fetchAll();
    foreach ($leads as $r) $add($r);

    $accounts = $pdo->query("
        SELECT id AS customer_id, full_name, email, phone, created_at, 'account' AS kind
        FROM users WHERE role = 'customer' ORDER BY created_at DESC LIMIT 10
    ")->fetchAll();
    foreach ($accounts as $r) $add($r);

    $guests = $pdo->query("
        SELECT MAX(id) AS customer_id, guest_name AS full_name, guest_email AS email, guest_phone AS phone, MAX(created_at) AS created_at, 'guest' AS kind
        FROM service_requests WHERE customer_id IS NULL
        GROUP BY guest_name, guest_email, guest_phone ORDER BY MAX(created_at) DESC LIMIT 10
    ")->fetchAll();
    foreach ($guests as $r) $add($r);

    usort($rows, fn($a, $b) => strcmp($b['created_at'] ?? '', $a['created_at'] ?? ''));
    return array_slice($rows, 0, $limit);
}

