<?php
/**
 * MABUMBA TECH — Legal & Budget Requests
 * Schema: migration_030_system_restructure.sql
 *
 * Two small, deliberately simple things live here:
 *   1. Budget Requests — a Marketing Officer or Lawyer asks the General
 *      Operations Manager (or a Full Admin) for money; approve/reject.
 *   2. Project comments for the Lawyer's read-only view of company
 *      projects — reuses the existing request_messages thread
 *      (post_request_message() in functions.php) so there is no second,
 *      disconnected commenting system.
 */

function create_budget_request(int $requestedBy, string $department, string $purpose, float $amount, ?string $details): int
{
    global $pdo;
    $department = in_array($department, ['marketing', 'legal', 'other'], true) ? $department : 'other';
    $stmt = $pdo->prepare('INSERT INTO budget_requests (requested_by, department, purpose, amount, details) VALUES (?,?,?,?,?)');
    $stmt->execute([$requestedBy, $department, $purpose, $amount, $details]);
    $id = (int)$pdo->lastInsertId();

    $requester = $pdo->prepare('SELECT full_name FROM users WHERE id = ?');
    $requester->execute([$requestedBy]);
    $name = $requester->fetchColumn() ?: 'Someone';

    // General Operations Manager + every Full Admin (Super Admin / Generic
    // Admin) should see this — notify_job_role() only reaches the specific
    // job role, so Full Admins are notified separately via notify_role()
    // filtered down in the caller-agnostic way: notify every admin whose
    // job_role_key is NULL (Generic Admin) or who is super_admin, plus the
    // general_manager job role.
    notify_job_role('general_manager', 'budget_request', 'Budget Request: ' . $name,
        ucfirst($department) . ' budget request — ' . $purpose . ' (TZS ' . number_format($amount) . ').',
        '/backend/admin/legal.php?budget=' . $id);

    $fullAdmins = $pdo->query("SELECT id FROM users WHERE role = 'super_admin' OR (role = 'admin' AND job_role_key IS NULL)")->fetchAll();
    foreach ($fullAdmins as $a) {
        notify_user((int)$a['id'], 'budget_request', 'Budget Request: ' . $name,
            ucfirst($department) . ' budget request — ' . $purpose . ' (TZS ' . number_format($amount) . ').',
            '/backend/admin/legal.php?budget=' . $id);
    }

    return $id;
}

function decide_budget_request(int $requestId, string $decision, int $decidedBy, ?string $note = null): void
{
    global $pdo;
    if (!in_array($decision, ['approved', 'rejected'], true)) return;

    $stmt = $pdo->prepare('SELECT * FROM budget_requests WHERE id = ?');
    $stmt->execute([$requestId]);
    $req = $stmt->fetch();
    if (!$req || $req['status'] !== 'pending') return;

    $pdo->prepare('UPDATE budget_requests SET status = ?, decided_by = ?, decision_note = ?, decided_at = NOW() WHERE id = ?')
        ->execute([$decision, $decidedBy, $note, $requestId]);

    // An approved request goes to the Accountant, who makes the money transfer.
    // (transfer_status comes from migration_033; skipped quietly if not run yet.)
    if ($decision === 'approved') {
        try {
            $pdo->prepare("UPDATE budget_requests SET transfer_status = 'awaiting' WHERE id = ?")->execute([$requestId]);
            // What was approved (migration_037); the Accountant pays up to this amount.
            $pdo->prepare('UPDATE budget_requests SET approved_amount = amount WHERE id = ? AND approved_amount IS NULL')->execute([$requestId]);
            $who = $pdo->prepare('SELECT full_name FROM users WHERE id = ?');
            $who->execute([(int)$req['requested_by']]);
            notify_job_role('accountant', 'budget_transfer_due', 'Budget approved — transfer needed',
                ($who->fetchColumn() ?: 'A colleague') . ': ' . $req['purpose'] . ' (TZS ' . number_format((float)$req['amount']) . ') was approved. Please make the transfer.',
                '/backend/admin/accountant.php?tab=budgets');
        } catch (Throwable $e) {
            error_log('[MABUMBATECH] budget transfer hand-off skipped: ' . $e->getMessage());
        }
    }

    notify_user((int)$req['requested_by'], 'budget_decision',
        'Your budget request was ' . $decision,
        $req['purpose'] . ' (TZS ' . number_format((float)$req['amount']) . ') was ' . $decision . '.' . ($decision === 'approved' ? ' It has been sent to the Accountant for the money transfer.' : '') . ($note ? ' Note: ' . $note : ''),
        '/backend/admin/legal.php?budget=' . $requestId);

    log_activity($decidedBy, 'Budget request ' . $decision, "Budget request #$requestId: " . $req['purpose']);
}

/** Every project a Lawyer can view — trimmed to what a legal reviewer needs, plus counts of what they can open. */
function get_projects_for_legal_review(): array
{
    global $pdo;
    return $pdo->query("
        SELECT sr.id, sr.tracking_code, sr.subject, sr.status, sr.budget, sr.progress, sr.guest_name, sr.created_at,
               s.name AS service_name, s.icon AS service_icon,
               (SELECT COUNT(*) FROM project_links pl WHERE pl.request_id = sr.id) AS link_count,
               (SELECT COUNT(*) FROM request_attachments ra WHERE ra.request_id = sr.id) AS file_count
        FROM service_requests sr
        LEFT JOIN services s ON s.id = sr.service_id
        ORDER BY sr.created_at DESC
    ")->fetchAll();
}
