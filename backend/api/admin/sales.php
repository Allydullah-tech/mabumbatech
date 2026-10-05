<?php
require_once __DIR__ . '/../../includes/api.php';
$me = api_require_permission('sales.view');
$canManage = has_permission($me, 'sales.manage');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$canManage) json_error('You do not have permission to make changes here.', 403);
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'create_lead') {
        $fullName = trim($input['full_name'] ?? '');
        if ($fullName === '') json_response(['success' => false, 'message' => 'Name is required.']);
        $source = isset(lead_source_options()[$input['source'] ?? '']) ? $input['source'] : 'manual';
        $stmt = $pdo->prepare('
            INSERT INTO leads (full_name, company_name, email, phone, source, source_detail, requested_service_id, assigned_to, created_by)
            VALUES (?,?,?,?,?,?,?,?,?)
        ');
        $stmt->execute([
            $fullName,
            trim($input['company_name'] ?? '') ?: null,
            trim($input['email'] ?? '') ?: null,
            trim($input['phone'] ?? '') ?: null,
            $source,
            mb_substr(trim($input['source_detail'] ?? ''), 0, 160) ?: null,
            (int)($input['requested_service_id'] ?? 0) ?: null,
            (int)($input['assigned_to'] ?? 0) ?: null,
            $me['id'],
        ]);
        $leadId = (int)$pdo->lastInsertId();
        log_lead_activity($leadId, $me['id'], 'note', 'Lead created.');
        log_activity($me['id'], 'Created lead', "Lead #$leadId: $fullName");
        json_response(['success' => true, 'message' => 'Lead added.', 'lead_id' => $leadId]);
    }

    // Every remaining action targets one existing lead.
    $leadId = (int)($input['lead_id'] ?? 0);
    $lead = $leadId ? get_lead($leadId) : null;
    if (!$lead) json_error('Lead not found.', 404);

    if ($action === 'add_activity') {
        $type = in_array($input['activity_type'] ?? '', ['note', 'call', 'email', 'meeting', 'follow_up'], true) ? $input['activity_type'] : 'note';
        $desc = trim($input['description'] ?? '');
        $followUpAt = trim($input['follow_up_at'] ?? '') ?: null;
        if ($desc === '' && !$followUpAt) json_response(['success' => false, 'message' => 'Add a note or a follow-up time.']);
        log_lead_activity($leadId, $me['id'], $type, $desc, $followUpAt);
        json_response(['success' => true, 'message' => 'Logged.']);
    }

    if ($action === 'assign_lead') {
        $staffId = (int)($input['assigned_to'] ?? 0) ?: null;
        $pdo->prepare('UPDATE leads SET assigned_to = ? WHERE id = ?')->execute([$staffId, $leadId]);
        if ($staffId) {
            notify_user($staffId, 'lead_status_changed', 'Lead assigned to you: ' . $lead['full_name'],
                'You have been assigned a lead.', '/backend/admin/sales.php?lead=' . $leadId);
        }
        json_response(['success' => true, 'message' => 'Lead assignment updated.']);
    }

    if ($action === 'change_status') {
        $status = $input['status'] ?? '';
        if (!in_array($status, ['new', 'contacted', 'qualified', 'quotation', 'negotiation', 'lost'], true)) {
            // 'won' is deliberately excluded here — it only happens through
            // convert_won, so a project always exists before a lead is won.
            json_response(['success' => false, 'message' => 'Invalid status. Use "Convert to Project" to mark a lead won.']);
        }
        change_lead_status($leadId, $status, $me['id'], trim($input['lost_reason'] ?? '') ?: null);
        json_response(['success' => true, 'message' => 'Status updated.']);
    }

    if ($action === 'create_quotation') {
        $title = trim($input['title'] ?? '');
        $amount = (float)($input['amount'] ?? 0);
        if ($title === '' || $amount <= 0) json_response(['success' => false, 'message' => 'Title and a valid amount are required.']);
        $code = generate_quote_code();
        $stmt = $pdo->prepare('
            INSERT INTO quotations (quote_code, lead_id, customer_id, service_id, title, amount, valid_until, notes, status, created_by)
            VALUES (?,?,?,?,?,?,?,?,"sent",?)
        ');
        $stmt->execute([
            $code, $leadId, $lead['converted_customer_id'],
            (int)($input['service_id'] ?? 0) ?: $lead['requested_service_id'],
            $title, $amount, trim($input['valid_until'] ?? '') ?: null, trim($input['notes'] ?? '') ?: null, $me['id'],
        ]);
        if (in_array($lead['status'], ['new', 'contacted', 'qualified'], true)) {
            change_lead_status($leadId, 'quotation', $me['id']);
        }
        log_lead_activity($leadId, $me['id'], 'note', "Quotation $code sent (amount: $amount).");
        json_response(['success' => true, 'message' => "Quotation $code created."]);
    }

    if ($action === 'update_quotation_status') {
        $qId = (int)($input['quotation_id'] ?? 0);
        $qStatus = $input['status'] ?? '';
        if (!in_array($qStatus, ['sent', 'accepted', 'rejected', 'expired'], true)) json_error('Invalid quotation status.');
        $stmt = $pdo->prepare('UPDATE quotations SET status = ? WHERE id = ? AND lead_id = ?');
        $stmt->execute([$qStatus, $qId, $leadId]);
        if ($qStatus === 'accepted' && $lead['status'] !== 'negotiation') {
            change_lead_status($leadId, 'negotiation', $me['id']);
        }
        json_response(['success' => true, 'message' => 'Quotation updated.']);
    }

    if ($action === 'convert_won') {
        $serviceId = (int)($input['service_id'] ?? 0) ?: (int)$lead['requested_service_id'];
        $subject = trim($input['subject'] ?? '') ?: ('New project for ' . $lead['full_name']);
        $message = trim($input['message'] ?? '') ?: 'Project created from a won sales lead.';
        if (!$serviceId) json_response(['success' => false, 'message' => 'Choose a service for the resulting project.']);
        try {
            $requestId = convert_lead_won($leadId, $serviceId, $subject, $message, (int)($input['quotation_id'] ?? 0) ?: null, $me['id']);
        } catch (Throwable $e) {
            json_response(['success' => false, 'message' => 'Could not convert lead: ' . $e->getMessage()]);
        }
        json_response(['success' => true, 'message' => 'Lead converted to a project.', 'request_id' => $requestId]);
    }

    json_error('Unknown action.');
}

// ---- GET ----

$leadView = (int)($_GET['view'] ?? 0);
if ($leadView) {
    $lead = get_lead($leadView);
    if (!$lead) json_error('Lead not found.', 404);
    $stmt = $pdo->prepare('SELECT id, quote_code, title, amount, status, valid_until, created_at FROM quotations WHERE lead_id = ? ORDER BY created_at DESC');
    $stmt->execute([$leadView]);
    json_response([
        'lead' => $lead,
        'activities' => get_lead_activities($leadView),
        'quotations' => $stmt->fetchAll(),
        'can_manage' => $canManage,
    ]);
}

$statusFilter = $_GET['status'] ?? 'all';
$sql = "SELECT l.*, u.full_name AS assigned_name, s.name AS service_name
        FROM leads l
        LEFT JOIN users u ON u.id = l.assigned_to
        LEFT JOIN services s ON s.id = l.requested_service_id";
if ($statusFilter !== 'all') {
    $sql .= ' WHERE l.status = ' . $pdo->quote($statusFilter);
}
$sql .= ' ORDER BY l.created_at DESC LIMIT 300';
$leads = $pdo->query($sql)->fetchAll();

$stats = $pdo->query("
    SELECT
        SUM(status='new') AS new_count,
        SUM(status='contacted') AS contacted_count,
        SUM(status='qualified') AS qualified_count,
        SUM(status='quotation') AS quotation_count,
        SUM(status='negotiation') AS negotiation_count,
        SUM(status='won' AND updated_at >= DATE_FORMAT(NOW(),'%Y-%m-01')) AS won_this_month,
        SUM(status='lost' AND updated_at >= DATE_FORMAT(NOW(),'%Y-%m-01')) AS lost_this_month
    FROM leads
")->fetch();

$followUpsDue = $pdo->query("
    SELECT la.lead_id, la.follow_up_at, l.full_name
    FROM lead_activities la
    JOIN leads l ON l.id = la.lead_id
    WHERE la.follow_up_at IS NOT NULL AND la.follow_up_at <= NOW() AND l.status NOT IN ('won','lost')
    ORDER BY la.follow_up_at ASC LIMIT 20
")->fetchAll();

$salesUsers = $pdo->query("
    SELECT id, full_name FROM users
    WHERE status='active' AND (role='super_admin' OR (role='admin' AND (job_role_key IS NULL OR job_role_key IN ('general_manager'))))
    ORDER BY full_name
")->fetchAll();

$services = $pdo->query('SELECT id, name FROM services WHERE is_active = 1 ORDER BY name')->fetchAll();

json_response([
    'stats' => $stats,
    'leads' => $leads,
    'follow_ups_due' => $followUpsDue,
    'sales_users' => $salesUsers,
    'services' => $services,
    'can_manage' => $canManage,
]);
