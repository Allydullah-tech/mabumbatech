<?php
/**
 * MABUMBA TECH — Customer sources (what is left of the old Sales/CRM module)
 *
 * The Sales & Leads pipeline (leads, quotations, negotiation, lead -> project
 * conversion) has been removed. Only the "where did this customer come from?"
 * record remains: when a Marketing Officer registers a customer request, the
 * customer and the source they chose are stored in the `leads` table so the
 * By Source report keeps working. Nothing here moves a customer through stages.
 */

/** Records one timeline entry for a customer-source record. */
function log_lead_activity(int $leadId, ?int $userId, string $type, string $description = '', ?string $followUpAt = null, ?string $oldStatus = null, ?string $newStatus = null): void
{
    global $pdo;
    $stmt = $pdo->prepare('
        INSERT INTO lead_activities (lead_id, user_id, activity_type, description, follow_up_at, old_status, new_status)
        VALUES (?,?,?,?,?,?,?)
    ');
    $stmt->execute([$leadId, $userId, $type, $description, $followUpAt, $oldStatus, $newStatus]);
}

function get_lead(int $leadId): ?array
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT l.* FROM leads l WHERE l.id = ?');
    $stmt->execute([$leadId]);
    $lead = $stmt->fetch();
    return $lead ?: null;
}

/* ---------------------------------------------------------------------
 * Customer sources — where did this customer come from?
 * ------------------------------------------------------------------- */

/**
 * Every source a customer/lead can come from, key => label. The order is the
 * order shown in dropdowns.
 */
function lead_source_options(): array
{
    return [
        'advertisement'   => 'Advertisement (saw our ad)',
        'own_search'      => 'Own Search (Google / online)',
        'social_media'    => 'Social Media',
        'referral'        => 'Referral',
        'website_contact' => 'Website Contact Form',
        'phone_call'      => 'Phone Call',
        'walk_in'         => 'Walk-in',
        'email'           => 'Email',
        'manual'          => 'Direct Outreach',
        'other'           => 'Other',
    ];
}

/**
 * Creates one lead (a potential customer) with its source. Used by the
 * Customer Acquisition page so it and the public request flow both record
 * a source the same way.
 *
 * $d keys: full_name, phone, email, company_name, source, source_detail,
 * message, requested_service_id, assigned_to, force (1 = allow a second
 * lead with a phone number that already exists).
 *
 * Returns ['id' => int] on success, or ['error' => string, 'existing_id' => int?].
 */
function create_lead_record(array $d, ?int $createdBy): array
{
    global $pdo;

    $fullName = trim($d['full_name'] ?? '');
    $phone = trim($d['phone'] ?? '');
    $email = trim($d['email'] ?? '');
    $source = $d['source'] ?? '';
    $sources = lead_source_options();

    if ($fullName === '') return ['error' => 'Customer name is required.'];
    if ($phone === '' && $email === '') return ['error' => 'Add a phone number or an email so the customer can be reached.'];
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) return ['error' => 'That email address does not look right.'];
    if (!isset($sources[$source])) return ['error' => 'Choose where this customer came from (the source).'];

    if (empty($d['force']) && $phone !== '') {
        $dupe = $pdo->prepare("SELECT id, full_name, status FROM leads WHERE phone = ? AND status <> 'lost' ORDER BY created_at DESC LIMIT 1");
        $dupe->execute([$phone]);
        if ($row = $dupe->fetch()) {
            return [
                'error' => $row['full_name'] . ' (' . $row['status'] . ') is already registered with this phone number.',
                'existing_id' => (int)$row['id'],
            ];
        }
    }

    $stmt = $pdo->prepare('
        INSERT INTO leads (full_name, company_name, email, phone, source, source_detail, message, requested_service_id, assigned_to, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    ');
    $stmt->execute([
        mb_substr($fullName, 0, 120),
        mb_substr(trim($d['company_name'] ?? ''), 0, 160) ?: null,
        $email !== '' ? mb_substr($email, 0, 120) : null,
        $phone !== '' ? mb_substr($phone, 0, 30) : null,
        $source,
        mb_substr(trim($d['source_detail'] ?? ''), 0, 160) ?: null,
        mb_substr(trim($d['message'] ?? ''), 0, 500) ?: null,
        (int)($d['requested_service_id'] ?? 0) ?: null,
        (int)($d['assigned_to'] ?? 0) ?: null,
        $createdBy,
    ]);
    $leadId = (int)$pdo->lastInsertId();

    $note = 'Lead registered. Source: ' . $sources[$source];
    if (!empty($d['source_detail'])) $note .= ' (' . mb_substr(trim($d['source_detail']), 0, 160) . ')';
    log_lead_activity($leadId, $createdBy, 'note', $note . '.');

    return ['id' => $leadId];
}

/**
 * Tells everyone who should follow up about something new from the marketing
 * side: the Marketing Manager(s) and Officers, the General Manager, and the
 * company admins (super admins and admins without a narrower job role), so it
 * never lands in only one person's notifications. Each person is notified once.
 * A failure to notify (for example a mail server problem) is swallowed on
 * purpose — the lead itself is already saved and must never be lost over it.
 */
function notify_marketing_team(string $type, string $title, string $message, string $link = ''): void
{
    global $pdo;
    try {
        $ids = $pdo->query("
            SELECT id FROM users
            WHERE status = 'active' AND (
                role = 'super_admin'
                OR (role = 'admin' AND (job_role_key IS NULL OR job_role_key IN ('marketing_manager','marketing_officer','general_manager')))
            )
        ")->fetchAll(PDO::FETCH_COLUMN);
        foreach (array_unique($ids) as $id) {
            try {
                notify_user((int)$id, $type, $title, $message, $link);
            } catch (Throwable $e) {
                // keep going — one bad mailbox must not stop the others being told
            }
        }
    } catch (Throwable $e) {
        // ignore — see note above
    }
}

/**
 * How many customers each source has brought in.
 * $start/$end filter on the date the customer was registered (null = all time).
 */
function lead_source_stats(?string $start = null, ?string $end = null): array
{
    global $pdo;
    $where = '';
    $params = [];
    if ($start !== null && $end !== null) {
        $where = 'WHERE l.created_at BETWEEN ? AND ?';
        $params = [$start, $end];
    }
    $stmt = $pdo->prepare("
        SELECT l.source, COUNT(*) AS total
        FROM leads l $where
        GROUP BY l.source
        ORDER BY total DESC
    ");
    $stmt->execute($params);
    $labels = lead_source_options();
    $rows = [];
    foreach ($stmt->fetchAll() as $r) {
        $rows[] = [
            'source' => $r['source'],
            'label' => $labels[$r['source']] ?? ucwords(str_replace('_', ' ', $r['source'])),
            'total' => (int)$r['total'],
        ];
    }
    return $rows;
}

