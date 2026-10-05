<?php
/**
 * MABUMBA TECH — Lawyer Desk (legal notes, legal documents, reported cases)
 * Schema: migration_043_lawyer_desk.sql
 *
 * ACCESS MODEL (enforced here, never only in the browser):
 *   - LAWYER (job role 'lawyer' + legal.manage): full control — create, edit,
 *     delete and submit their OWN notes, documents and cases. They only ever
 *     see their own records.
 *   - GENERAL / OPERATIONS MANAGER (legal.records.view), SUPER ADMIN and
 *     GENERIC ADMIN: VIEW-ONLY across every lawyer's records, including
 *     downloading documents. Every write action below is refused for them —
 *     even for a Full Admin, who otherwise passes every permission check —
 *     because writing requires the Lawyer job role itself.
 */
require_once __DIR__ . '/../../includes/api.php';

$me = api_require_login();
if (!is_admin_role($me['role'])) {
    json_error('You do not have permission to access this resource.', 403);
}

$isLawyer = $me['role'] === 'admin'
    && ($me['job_role_key'] ?? null) === 'lawyer'
    && has_permission($me, 'legal.manage');
$canView = $isLawyer || has_permission($me, 'legal.records.view');
if (!$canView) {
    json_error('You do not have permission to access this resource.', 403);
}
$canWrite = $isLawyer;
$myId = (int)$me['id'];

const LEGAL_DOC_TYPES = ['Contract', 'Agreement', 'License / Permit', 'Registration', 'Policy', 'Court / Legal Notice', 'Correspondence', 'Other'];
const LEGAL_NOTE_CATEGORIES = ['General', 'Contract', 'Compliance', 'Tax', 'Employment', 'Dispute', 'Advice', 'Other'];
const LEGAL_CASE_TYPES = ['issue', 'case', 'emergency'];
const LEGAL_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const LEGAL_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

function legal_dir(): string
{
    $dir = rtrim(UPLOADS_DIR, '/\\') . '/legal/';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    // Legal files are confidential: block direct URL access so they can only be
    // fetched through this endpoint (which checks who is asking).
    $ht = $dir . '.htaccess';
    if (!file_exists($ht)) {
        @file_put_contents($ht, "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Order deny,allow\n    Deny from all\n</IfModule>\nOptions -Indexes\n");
    }
    return $dir;
}

/** Validates + stores one uploaded file. Returns [storedName, error]. */
function legal_store_upload(array $file): array
{
    $err = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) return [null, 'That file is larger than the server upload limit.'];
    if ($err !== UPLOAD_ERR_OK) return [null, 'Upload failed. Please choose the file and try again.'];
    if ($file['size'] > MAX_ATTACHMENT_BYTES) return [null, 'That file is larger than the 10MB limit.'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ALLOWED_ATTACHMENT_EXT, true)) {
        return [null, 'File type ".' . $ext . '" is not allowed. Allowed: ' . implode(', ', ALLOWED_ATTACHMENT_EXT) . '.'];
    }
    $stored = 'legal_' . time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], legal_dir() . $stored)) {
        return [null, 'Could not save the uploaded file.'];
    }
    return [$stored, null];
}

function legal_notify_case(int $caseId, string $type, string $title, string $priority, string $reporterName): void
{
    global $pdo;
    $label = $type === 'emergency' ? 'EMERGENCY' : ucfirst($type);
    $heading = 'Legal ' . $label . ': ' . $title;
    $msg = $reporterName . ' reported a legal ' . $type . ' (' . $priority . ' priority): ' . $title . '.';
    $link = '/backend/admin/legal-desk.php?tab=cases&id=' . $caseId;
    try {
        notify_job_role('general_manager', 'legal_case', $heading, $msg, $link);
        $fullAdmins = $pdo->query("SELECT id FROM users WHERE role = 'super_admin' OR (role = 'admin' AND job_role_key IS NULL)")->fetchAll();
        foreach ($fullAdmins as $a) {
            notify_user((int)$a['id'], 'legal_case', $heading, $msg, $link);
        }
    } catch (Throwable $e) {
        error_log('[MABUMBATECH] legal case notification skipped: ' . $e->getMessage());
    }
}

/** Fetches one row the current user may modify, or ends the request. */
function legal_own_row(string $table, string $ownerCol, int $id): array
{
    global $pdo, $myId;
    $stmt = $pdo->prepare("SELECT * FROM $table WHERE id = ? AND $ownerCol = ?");
    $stmt->execute([$id, $myId]);
    $row = $stmt->fetch();
    if (!$row) json_error('That record was not found, or it belongs to another user.', 404);
    return $row;
}

/* ============================== POST ============================== */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    if (!$canWrite) {
        json_error('You have view-only access to legal records. Only the Lawyer can add or change them.', 403);
    }
    $action = $input['action'] ?? '';

    // ---- Notes ----
    if ($action === 'save_note') {
        $id = (int)($input['id'] ?? 0);
        $title = trim($input['title'] ?? '');
        $body = trim($input['body'] ?? '');
        $cat = trim($input['category'] ?? 'General');
        if (!in_array($cat, LEGAL_NOTE_CATEGORIES, true)) $cat = 'General';
        if ($title === '' || $body === '') json_error('Please give the note a title and write its content.');
        if (mb_strlen($title) > 200) json_error('The title is too long (200 characters maximum).');
        if ($id) {
            legal_own_row('legal_notes', 'author_id', $id);
            $pdo->prepare('UPDATE legal_notes SET title=?, category=?, body=? WHERE id=? AND author_id=?')->execute([$title, $cat, $body, $id, $myId]);
            log_activity($myId, 'Updated legal note', "Note #$id: $title");
            json_response(['success' => true, 'message' => 'Note updated.', 'id' => $id]);
        }
        $pdo->prepare('INSERT INTO legal_notes (author_id, title, category, body) VALUES (?,?,?,?)')->execute([$myId, $title, $cat, $body]);
        $newId = (int)$pdo->lastInsertId();
        log_activity($myId, 'Saved legal note', "Note #$newId: $title");
        json_response(['success' => true, 'message' => 'Note saved.', 'id' => $newId]);
    }

    if ($action === 'delete_note') {
        $id = (int)($input['id'] ?? 0);
        $row = legal_own_row('legal_notes', 'author_id', $id);
        $pdo->prepare('DELETE FROM legal_notes WHERE id=? AND author_id=?')->execute([$id, $myId]);
        log_activity($myId, 'Deleted legal note', "Note #$id: " . $row['title']);
        json_response(['success' => true, 'message' => 'Note deleted.']);
    }

    // ---- Documents ----
    if ($action === 'save_document') {
        $id = (int)($input['id'] ?? 0);
        $title = trim($input['title'] ?? '');
        $type = trim($input['doc_type'] ?? 'Other');
        if (!in_array($type, LEGAL_DOC_TYPES, true)) $type = 'Other';
        $desc = trim($input['description'] ?? '') ?: null;
        if ($desc !== null && mb_strlen($desc) > 500) json_error('The description is too long (500 characters maximum).');
        if ($title === '') json_error('Please give the document a title.');
        if (mb_strlen($title) > 200) json_error('The title is too long (200 characters maximum).');
        $hasFile = isset($_FILES['file']) && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;

        if ($id) {
            $row = legal_own_row('legal_documents', 'uploaded_by', $id);
            if ($hasFile) {
                [$stored, $err] = legal_store_upload($_FILES['file']);
                if ($err) json_error($err);
                $pdo->prepare('UPDATE legal_documents SET title=?, doc_type=?, description=?, original_name=?, stored_name=?, file_size=?, mime_type=? WHERE id=? AND uploaded_by=?')
                    ->execute([$title, $type, $desc, $_FILES['file']['name'], $stored, (int)$_FILES['file']['size'], $_FILES['file']['type'] ?? null, $id, $myId]);
                $old = legal_dir() . basename($row['stored_name']);
                if (is_file($old)) @unlink($old);
            } else {
                $pdo->prepare('UPDATE legal_documents SET title=?, doc_type=?, description=? WHERE id=? AND uploaded_by=?')->execute([$title, $type, $desc, $id, $myId]);
            }
            log_activity($myId, 'Updated legal document', "Document #$id: $title");
            json_response(['success' => true, 'message' => 'Document updated.', 'id' => $id]);
        }

        if (!$hasFile) json_error('Please choose the document file to upload.');
        [$stored, $err] = legal_store_upload($_FILES['file']);
        if ($err) json_error($err);
        $pdo->prepare('INSERT INTO legal_documents (uploaded_by, title, doc_type, description, original_name, stored_name, file_size, mime_type) VALUES (?,?,?,?,?,?,?,?)')
            ->execute([$myId, $title, $type, $desc, $_FILES['file']['name'], $stored, (int)$_FILES['file']['size'], $_FILES['file']['type'] ?? null]);
        $newId = (int)$pdo->lastInsertId();
        log_activity($myId, 'Uploaded legal document', "Document #$newId: $title");
        json_response(['success' => true, 'message' => 'Document uploaded.', 'id' => $newId]);
    }

    if ($action === 'delete_document') {
        $id = (int)($input['id'] ?? 0);
        $row = legal_own_row('legal_documents', 'uploaded_by', $id);
        $pdo->prepare('DELETE FROM legal_documents WHERE id=? AND uploaded_by=?')->execute([$id, $myId]);
        $path = legal_dir() . basename($row['stored_name']);
        if (is_file($path)) @unlink($path);
        log_activity($myId, 'Deleted legal document', "Document #$id: " . $row['title']);
        json_response(['success' => true, 'message' => 'Document deleted.']);
    }

    // ---- Issues / cases / emergencies ----
    if ($action === 'save_case') {
        $id = (int)($input['id'] ?? 0);
        $type = $input['record_type'] ?? 'issue';
        $priority = $input['priority'] ?? 'medium';
        $status = $input['status'] ?? 'open';
        $title = trim($input['title'] ?? '');
        $parties = trim($input['parties'] ?? '') ?: null;
        $date = trim($input['incident_date'] ?? '') ?: null;
        $desc = trim($input['description'] ?? '');
        $action_taken = trim($input['action_taken'] ?? '') ?: null;

        if (!in_array($type, LEGAL_CASE_TYPES, true)) json_error('Please choose what you are reporting (issue, case or emergency).');
        if (!in_array($priority, LEGAL_PRIORITIES, true)) $priority = 'medium';
        if (!in_array($status, LEGAL_STATUSES, true)) $status = 'open';
        if ($title === '' || $desc === '') json_error('Please give a title and describe what happened.');
        if (mb_strlen($title) > 200) json_error('The title is too long (200 characters maximum).');
        if ($parties !== null && mb_strlen($parties) > 255) json_error('The parties field is too long (255 characters maximum).');
        if ($date !== null) {
            $d = DateTime::createFromFormat('Y-m-d', $date);
            if (!$d || $d->format('Y-m-d') !== $date) json_error('Please enter a valid date.');
        }
        if ($type === 'emergency' && $priority === 'low') $priority = 'high'; // an emergency is never low priority

        if ($id) {
            $row = legal_own_row('legal_cases', 'reported_by', $id);
            $pdo->prepare('UPDATE legal_cases SET record_type=?, title=?, priority=?, status=?, parties=?, incident_date=?, description=?, action_taken=? WHERE id=? AND reported_by=?')
                ->execute([$type, $title, $priority, $status, $parties, $date, $desc, $action_taken, $id, $myId]);
            log_activity($myId, 'Updated legal ' . $type, "Case #$id: $title");
            json_response(['success' => true, 'message' => 'Record updated.', 'id' => $id]);
        }

        $pdo->prepare('INSERT INTO legal_cases (reported_by, record_type, title, priority, status, parties, incident_date, description, action_taken) VALUES (?,?,?,?,?,?,?,?,?)')
            ->execute([$myId, $type, $title, $priority, 'open', $parties, $date, $desc, $action_taken]);
        $newId = (int)$pdo->lastInsertId();
        log_activity($myId, 'Reported legal ' . $type, "Case #$newId: $title");
        legal_notify_case($newId, $type, $title, $priority, $me['full_name']);
        json_response(['success' => true, 'message' => 'Submitted. Management has been notified.', 'id' => $newId]);
    }

    if ($action === 'set_case_status') {
        $id = (int)($input['id'] ?? 0);
        $status = $input['status'] ?? '';
        if (!in_array($status, LEGAL_STATUSES, true)) json_error('Invalid status.');
        $row = legal_own_row('legal_cases', 'reported_by', $id);
        $pdo->prepare('UPDATE legal_cases SET status=? WHERE id=? AND reported_by=?')->execute([$status, $id, $myId]);
        log_activity($myId, 'Changed legal case status', "Case #$id: {$row['title']} → $status");
        json_response(['success' => true, 'message' => 'Status updated.']);
    }

    json_error('Unknown action.');
}

/* ============================== GET ============================== */

// Document download — same access rules as viewing the list.
if (isset($_GET['download'])) {
    $id = (int)$_GET['download'];
    $stmt = $pdo->prepare('SELECT * FROM legal_documents WHERE id = ?' . ($isLawyer ? ' AND uploaded_by = ?' : ''));
    $stmt->execute($isLawyer ? [$id, $myId] : [$id]);
    $doc = $stmt->fetch();
    $path = $doc ? legal_dir() . basename($doc['stored_name']) : '';
    if (!$doc || !is_file($path)) {
        http_response_code(404);
        header('Content-Type: text/plain');
        die('File not found.');
    }
    if (ob_get_length() !== false) ob_clean();
    $safeName = str_replace(['"', "\r", "\n", '\\', '/'], '_', $doc['original_name']);
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . $safeName . '"');
    header('Content-Length: ' . filesize($path));
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

$scope = $isLawyer ? ' WHERE %s = ' . $myId : '';

$notes = $pdo->query('SELECT n.id, n.author_id, n.title, n.category, n.body, n.created_at, n.updated_at, u.full_name AS author_name
    FROM legal_notes n JOIN users u ON u.id = n.author_id' . sprintf($scope, 'n.author_id') . ' ORDER BY n.updated_at DESC')->fetchAll();

$documents = $pdo->query('SELECT d.id, d.uploaded_by, d.title, d.doc_type, d.description, d.original_name, d.file_size, d.created_at, d.updated_at, u.full_name AS author_name
    FROM legal_documents d JOIN users u ON u.id = d.uploaded_by' . sprintf($scope, 'd.uploaded_by') . ' ORDER BY d.created_at DESC')->fetchAll();

$cases = $pdo->query('SELECT c.*, u.full_name AS author_name
    FROM legal_cases c JOIN users u ON u.id = c.reported_by' . sprintf($scope, 'c.reported_by') . "
    ORDER BY FIELD(c.status,'open','in_progress','resolved','closed'), FIELD(c.priority,'critical','high','medium','low'), c.created_at DESC")->fetchAll();

json_response([
    'can_write' => $canWrite,
    'viewer_name' => $me['full_name'],
    'notes' => $notes,
    'documents' => $documents,
    'cases' => $cases,
    'options' => [
        'doc_types' => LEGAL_DOC_TYPES,
        'note_categories' => LEGAL_NOTE_CATEGORIES,
    ],
]);
