<?php
/**
 * MABUMBA TECH — Shared helper functions
 */

/** Build an absolute site URL from a root-relative path, e.g. base_path('/backend/admin/dashboard.php') */
function base_path(string $path = '/'): string
{
    $root = defined('APP_BASE_URL') ? APP_BASE_URL : '';
    return $root . $path;
}

function redirect(string $path): void
{
    header('Location: ' . $path);
    exit;
}

function clean(?string $value): string
{
    return htmlspecialchars(trim($value ?? ''), ENT_QUOTES, 'UTF-8');
}

function flash(string $type, string $message): void
{
    $_SESSION['flash'][] = ['type' => $type, 'message' => $message];
}

function get_flashes(): array
{
    $flashes = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $flashes;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf_token" value="' . csrf_token() . '">';
}

/* ---------------------------------------------------------------------
 * Rate limiting — brute-force protection for login and password reset.
 * Backed by the `rate_limits` table (see migration_006_security_hardening.sql).
 * A "key" identifies what's being throttled, e.g. "login:jane@x.com:41.2.3.4"
 * or "reset_answer:17:41.2.3.4" (user id + IP). Keying by identity+IP (rather
 * than IP alone) stops both "guess one account's password many times" and
 * "spray many accounts from one IP" attacks without locking out shared IPs.
 * --------------------------------------------------------------------- */

const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 900;  // 15 minutes to accumulate attempts
const RATE_LIMIT_LOCK_SECONDS = 900;    // 15 minute lockout once tripped

/** Returns [blocked bool, retry_after_seconds int] without recording anything. */
function rate_limit_status(string $key): array
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT locked_until FROM rate_limits WHERE limit_key = ?');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    if ($row && $row['locked_until'] && strtotime($row['locked_until']) > time()) {
        return [true, strtotime($row['locked_until']) - time()];
    }
    return [false, 0];
}

/** Call after a failed login / failed security-answer attempt. */
function rate_limit_record_failure(string $key): void
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT * FROM rate_limits WHERE limit_key = ?');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    $now = time();

    if (!$row) {
        $pdo->prepare('INSERT INTO rate_limits (limit_key, attempts, first_attempt_at) VALUES (?, 1, NOW())')
            ->execute([$key]);
        return;
    }

    // Outside the tracking window — start a fresh count instead of piling on.
    if (strtotime($row['first_attempt_at']) < $now - RATE_LIMIT_WINDOW_SECONDS
        && (!$row['locked_until'] || strtotime($row['locked_until']) < $now)) {
        $pdo->prepare('UPDATE rate_limits SET attempts = 1, first_attempt_at = NOW(), locked_until = NULL WHERE limit_key = ?')
            ->execute([$key]);
        return;
    }

    $attempts = (int)$row['attempts'] + 1;
    if ($attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
        $lockedUntil = date('Y-m-d H:i:s', $now + RATE_LIMIT_LOCK_SECONDS);
        $pdo->prepare('UPDATE rate_limits SET attempts = ?, locked_until = ? WHERE limit_key = ?')
            ->execute([$attempts, $lockedUntil, $key]);
    } else {
        $pdo->prepare('UPDATE rate_limits SET attempts = ? WHERE limit_key = ?')
            ->execute([$attempts, $key]);
    }
}

/** Call after a successful login / correct security answer to clear the counter. */
function rate_limit_clear(string $key): void
{
    global $pdo;
    $pdo->prepare('DELETE FROM rate_limits WHERE limit_key = ?')->execute([$key]);
}

function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function csrf_verify(): bool
{
    return isset($_POST['csrf_token']) && isset($_SESSION['csrf_token'])
        && hash_equals($_SESSION['csrf_token'], $_POST['csrf_token']);
}

function generate_tracking_code(): string
{
    return 'MBT-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
}

function generate_username(string $fullName, PDO $pdo): string
{
    $base = strtolower(preg_replace('/[^a-z0-9]/i', '', str_replace(' ', '.', trim($fullName))));
    $base = substr($base ?: 'user', 0, 15);
    $username = $base;
    $i = 1;
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE username = ?');
    while (true) {
        $stmt->execute([$username]);
        if ((int)$stmt->fetchColumn() === 0) {
            return $username;
        }
        $username = $base . $i;
        $i++;
    }
}

/**
 * Records an audit trail entry. Snapshots the actor's name and role at the
 * time of the action (not just their user_id) so the Activity Log stays
 * readable and accurate even if that account is later deleted, suspended,
 * renamed, or has its role/job changed — a foreign key alone would lose
 * that identity the moment the account is removed (ON DELETE SET NULL).
 */
function log_activity(?int $userId, string $action, string $details = ''): void
{
    global $pdo;
    try {
        $actorName = null;
        $actorRole = null;
        if ($userId) {
            $stmt = $pdo->prepare('SELECT full_name, role, job_role_key FROM users WHERE id = ?');
            $stmt->execute([$userId]);
            $actor = $stmt->fetch();
            if ($actor) {
                $actorName = $actor['full_name'];
                $actorRole = $actor['role'] === 'admin' && !empty($actor['job_role_key'])
                    ? $actor['job_role_key']
                    : $actor['role'];
            }
        }
        $stmt = $pdo->prepare('INSERT INTO activity_logs (user_id, actor_name, actor_role, action, details, ip_address) VALUES (?,?,?,?,?,?)');
        $stmt->execute([$userId, $actorName, $actorRole, $action, $details, $_SERVER['REMOTE_ADDR'] ?? '']);
    } catch (Throwable $e) {
        // logging must never break the request
    }
}

/**
 * Safe, contact-only view of every active company member (all admin tiers
 * + staff) for the Company Members Directory. Deliberately excludes
 * anything sensitive or management-oriented (password data, job-role
 * permission internals, suspended accounts) — this is a read-only contact
 * list, not an account-management view.
 */
function get_company_directory(): array
{
    global $pdo;
    $rows = $pdo->query(
        "SELECT u.id, u.full_name, u.email, u.phone, u.role, u.staff_category,
                u.position_title, u.job_role_key, u.avatar, jr.label AS job_role_label
         FROM users u
         LEFT JOIN job_roles jr ON jr.job_role_key = u.job_role_key
         WHERE u.role IN ('super_admin','admin','staff') AND u.status = 'active'
         ORDER BY FIELD(u.role,'super_admin','admin','staff'), u.full_name ASC"
    )->fetchAll();

    foreach ($rows as &$row) {
        if ($row['role'] === 'staff') {
            $row['department'] = category_label($row['staff_category'] ?? '');
        } elseif ($row['role'] === 'admin' && $row['job_role_key']) {
            $row['department'] = $row['job_role_label'];
        } else {
            $row['department'] = role_label($row['role']);
        }
    }
    unset($row); // break the by-reference alias from the foreach above
    return $rows;
}

function time_ago(string $datetime): string
{
    $diff = time() - strtotime($datetime);
    if ($diff < 60) return 'just now';
    if ($diff < 3600) return floor($diff / 60) . 'm ago';
    if ($diff < 86400) return floor($diff / 3600) . 'h ago';
    if ($diff < 2592000) return floor($diff / 86400) . 'd ago';
    return date('d M Y', strtotime($datetime));
}

function status_badge(string $status): string
{
    $map = [
        'pending'     => 'badge-warn',
        'assigned'    => 'badge-info',
        'in_progress' => 'badge-info',
        'review'      => 'badge-info',
        'completed'   => 'badge-ok',
        'delivered'   => 'badge-ok',
        'cancelled'   => 'badge-off',
        'new'         => 'badge-warn',
        'accepted'    => 'badge-info',
        'declined'    => 'badge-off',
        'active'      => 'badge-ok',
        'suspended'   => 'badge-off',
        'done'        => 'badge-ok',
    ];
    $cls = $map[$status] ?? 'badge-info';
    $label = ucwords(str_replace('_', ' ', $status));
    return '<span class="badge ' . $cls . '">' . $label . '</span>';
}

/** Full request lifecycle, in order. 'cancelled' is a separate exit, not a step. */
const PROJECT_STATUSES = ['pending', 'assigned', 'in_progress', 'review', 'completed', 'delivered', 'cancelled'];

/** Link types staff/admins can attach to a project, with display labels/icons. */
const PROJECT_LINK_TYPES = [
    'website'       => ['label' => 'Live Website',       'icon' => 'bi-globe',             'cta' => 'View Website'],
    'webapp'        => ['label' => 'Web Application',    'icon' => 'bi-window',            'cta' => 'Open App'],
    'demo'          => ['label' => 'Project Demo',       'icon' => 'bi-play-circle',       'cta' => 'Open Demo'],
    'staging'       => ['label' => 'Staging Environment','icon' => 'bi-tools',             'cta' => 'Open Staging'],
    'repository'    => ['label' => 'Repository',         'icon' => 'bi-git',               'cta' => 'View Repository'],
    'documentation' => ['label' => 'Documentation',      'icon' => 'bi-file-earmark-text', 'cta' => 'View Docs'],
    'other'         => ['label' => 'Project Link',       'icon' => 'bi-link-45deg',        'cta' => 'Open Link'],
];

/** Only accept http(s) URLs — blocks javascript:/data: URIs from being stored and later rendered as clickable links. */
function is_valid_project_url(string $url): bool
{
    if (!filter_var($url, FILTER_VALIDATE_URL)) return false;
    $scheme = strtolower(parse_url($url, PHP_URL_SCHEME) ?: '');
    return in_array($scheme, ['http', 'https'], true);
}

function get_project_links(int $requestId, bool $customerVisibleOnly = false): array
{
    global $pdo;
    $sql = 'SELECT pl.*, u.full_name AS added_by_name FROM project_links pl LEFT JOIN users u ON u.id = pl.added_by WHERE pl.request_id = ?';
    if ($customerVisibleOnly) $sql .= ' AND pl.is_customer_visible = 1';
    $sql .= ' ORDER BY pl.created_at ASC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$requestId]);
    return $stmt->fetchAll();
}

/** Returns an error message on failure, or null on success. */
function add_project_link(int $requestId, int $addedBy, string $title, string $url, string $type, string $description, bool $visible): ?string
{
    global $pdo;
    $title = trim($title);
    $url = trim($url);
    if ($title === '' || $url === '') return 'Title and URL are required.';
    if (!is_valid_project_url($url)) return 'Please enter a valid link starting with http:// or https://.';
    if (!array_key_exists($type, PROJECT_LINK_TYPES)) $type = 'other';
    $description = trim($description);
    $pdo->prepare('INSERT INTO project_links (request_id, title, url, link_type, description, is_customer_visible, added_by) VALUES (?,?,?,?,?,?,?)')
        ->execute([$requestId, $title, $url, $type, $description !== '' ? $description : null, $visible ? 1 : 0, $addedBy]);
    return null;
}

function delete_project_link(int $linkId, int $requestId): void
{
    global $pdo;
    $pdo->prepare('DELETE FROM project_links WHERE id = ? AND request_id = ?')->execute([$linkId, $requestId]);
}

/**
 * Milestone helpers below are no longer called from any API endpoint as of
 * the system restructuring spec ("remove complicated milestones and
 * unnecessary project-management features") — kept only so the
 * `project_milestones` table and any historical data remain readable if
 * needed. Safe to delete these functions and the table in a later cleanup.
 */
function get_project_milestones(int $requestId): array
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT * FROM project_milestones WHERE request_id = ? ORDER BY sort_order ASC, created_at ASC');
    $stmt->execute([$requestId]);
    return $stmt->fetchAll();
}

/** Returns an error message on failure, or null on success. */
function add_project_milestone(int $requestId, int $createdBy, string $title, string $description, ?string $dueDate): ?string
{
    global $pdo;
    $title = trim($title);
    if ($title === '') return 'Milestone title is required.';
    $description = trim($description);
    $stmt = $pdo->prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM project_milestones WHERE request_id = ?');
    $stmt->execute([$requestId]);
    $nextOrder = (int)$stmt->fetchColumn();
    $pdo->prepare('INSERT INTO project_milestones (request_id, title, description, due_date, sort_order, created_by) VALUES (?,?,?,?,?,?)')
        ->execute([$requestId, $title, $description !== '' ? $description : null, $dueDate ?: null, $nextOrder, $createdBy]);
    return null;
}

function update_project_milestone_status(int $milestoneId, int $requestId, string $status): void
{
    global $pdo;
    if (!in_array($status, ['pending', 'in_progress', 'done'], true)) return;
    $completedAtSql = $status === 'done' ? ', completed_at = NOW()' : ', completed_at = NULL';
    $pdo->prepare("UPDATE project_milestones SET status = ? $completedAtSql WHERE id = ? AND request_id = ?")
        ->execute([$status, $milestoneId, $requestId]);
}

function delete_project_milestone(int $milestoneId, int $requestId): void
{
    global $pdo;
    $pdo->prepare('DELETE FROM project_milestones WHERE id = ? AND request_id = ?')->execute([$milestoneId, $requestId]);
}

/** $internalNotes = null leaves the existing notes untouched. */
function update_request_progress(int $requestId, int $progress, ?string $internalNotes): void
{
    global $pdo;
    $progress = max(0, min(100, $progress));
    if ($internalNotes !== null) {
        $pdo->prepare('UPDATE service_requests SET progress = ?, internal_notes = ? WHERE id = ?')
            ->execute([$progress, $internalNotes, $requestId]);
    } else {
        $pdo->prepare('UPDATE service_requests SET progress = ? WHERE id = ?')->execute([$progress, $requestId]);
    }
}

/** Looks up a department by key — checks the (admin-editable) departments table
 * first so custom departments resolve correctly, falling back to the built-in
 * STAFF_CATEGORIES list, then a readable guess from the key itself. */
function get_department(string $key): ?array
{
    static $cache = [];
    if (array_key_exists($key, $cache)) return $cache[$key];

    global $pdo;
    $row = null;
    try {
        $stmt = $pdo->prepare('SELECT * FROM departments WHERE dept_key = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch() ?: null;
    } catch (Throwable $e) {
        // departments table may not exist yet on older installs — fall through
    }
    return $cache[$key] = $row;
}

function category_label(string $key): string
{
    $dept = get_department($key);
    if ($dept) return $dept['label'];
    return STAFF_CATEGORIES[$key]['label'] ?? ucwords(str_replace('_', ' ', $key));
}

function category_icon(string $key): string
{
    $dept = get_department($key);
    if ($dept) return $dept['icon'];
    return STAFF_CATEGORIES[$key]['icon'] ?? 'bi-gear';
}

/* ---------------------------------------------------------------------
 * System settings (key/value store in the `settings` table)
 * ------------------------------------------------------------------- */

function get_setting(string $key, string $default = ''): string
{
    static $cache = null;
    global $pdo;
    if ($cache === null) {
        $cache = [];
        try {
            foreach ($pdo->query('SELECT setting_key, setting_value FROM settings') as $row) {
                $cache[$row['setting_key']] = $row['setting_value'];
            }
        } catch (Throwable $e) {
            // settings table may not exist yet (e.g. during install) — ignore
        }
    }
    return $cache[$key] ?? $default;
}

function set_setting(string $key, string $value): void
{
    global $pdo;
    $stmt = $pdo->prepare('INSERT INTO settings (setting_key, setting_value) VALUES (?,?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)');
    $stmt->execute([$key, $value]);
}

function file_size_human(int $bytes): string
{
    if ($bytes < 1024) return $bytes . ' B';
    if ($bytes < 1048576) return round($bytes / 1024, 1) . ' KB';
    return round($bytes / 1048576, 1) . ' MB';
}

function role_label(string $role): string
{
    $map = [
        'super_admin' => 'Super Admin',
        'admin'       => 'Admin',
        'staff'       => 'Staff',
        'customer'    => 'Customer',
        'system'      => 'System',
    ];
    return $map[$role] ?? ucfirst($role);
}

/* ---------------------------------------------------------------------
 * JSON API helpers
 * ------------------------------------------------------------------- */

/** Send a JSON response and stop execution. */
function json_response(array $data, int $httpCode = 200): void
{
    // Discard any stray output (PHP warnings/notices, accidental whitespace)
    // that may have been buffered before this point, so the response is always
    // pure, valid JSON — see the ob_start() call in includes/api.php.
    if (ob_get_length() !== false) {
        ob_clean();
    }
    http_response_code($httpCode);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function json_error(string $message, int $httpCode = 400): void
{
    json_response(['success' => false, 'message' => $message], $httpCode);
}

/** Reads JSON or form-encoded POST bodies into $_POST-like array, for API endpoints. */
function api_input(): array
{
    if (!empty($_POST)) return $_POST;
    $raw = file_get_contents('php://input');
    if ($raw) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) return $decoded;
    }
    return [];
}

/* ---------------------------------------------------------------------
 * Request Q&A thread + optional file attachments
 * ------------------------------------------------------------------- */

const ALLOWED_ATTACHMENT_EXT = ['jpg','jpeg','png','webp','gif','pdf','doc','docx','xls','xlsx','ppt','pptx','zip','txt'];
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB per file

function post_request_message(int $requestId, ?int $senderId, string $senderRole, string $message): int
{
    global $pdo;

    // Guard against accidental duplicate sends — a double-click on "Send",
    // a slow connection causing a retry, or a second tab submitting the
    // same draft. If this exact sender just posted this exact text on this
    // request within the last few seconds, treat it as the same message and
    // hand back its id instead of inserting a second copy.
    if ($senderId !== null) {
        $dupStmt = $pdo->prepare('SELECT id FROM request_messages
            WHERE request_id = ? AND sender_id = ? AND message = ? AND is_deleted = 0
              AND created_at >= (NOW() - INTERVAL 10 SECOND)
            ORDER BY id DESC LIMIT 1');
        $dupStmt->execute([$requestId, $senderId, $message]);
        if ($dup = $dupStmt->fetch()) {
            return (int)$dup['id'];
        }
    }

    $stmt = $pdo->prepare('INSERT INTO request_messages (request_id, sender_id, sender_role, message) VALUES (?,?,?,?)');
    $stmt->execute([$requestId, $senderId, $senderRole, $message]);
    $id = (int)$pdo->lastInsertId();
    notify_thread_new_message($requestId, $senderRole);
    return $id;
}

/**
 * Edit a message the caller sent themselves. Returns null on success,
 * or a user-facing error string.
 */
function edit_request_message(int $requestId, int $messageId, int $userId, string $newMessage): ?string
{
    global $pdo;

    $newMessage = trim($newMessage);
    if ($newMessage === '') return 'Message cannot be empty.';

    $stmt = $pdo->prepare('SELECT id, sender_id, is_deleted FROM request_messages WHERE id = ? AND request_id = ?');
    $stmt->execute([$messageId, $requestId]);
    $msg = $stmt->fetch();

    if (!$msg) return 'Message not found.';
    if ((int)$msg['is_deleted'] === 1) return 'This message has been deleted.';
    if ((int)$msg['sender_id'] !== $userId) return 'You can only edit your own messages.';

    $pdo->prepare('UPDATE request_messages SET message = ?, edited_at = NOW() WHERE id = ?')
        ->execute([$newMessage, $messageId]);
    return null;
}

/**
 * Soft-delete a message. The sender can always delete their own message;
 * an admin/super_admin can delete any message in a thread as moderation.
 * Returns null on success, or a user-facing error string.
 */
function delete_request_message(int $requestId, int $messageId, int $userId, string $userRole): ?string
{
    global $pdo;

    $stmt = $pdo->prepare('SELECT id, sender_id, is_deleted FROM request_messages WHERE id = ? AND request_id = ?');
    $stmt->execute([$messageId, $requestId]);
    $msg = $stmt->fetch();

    if (!$msg) return 'Message not found.';
    if ((int)$msg['is_deleted'] === 1) return null; // already deleted — nothing to do

    $isOwner = (int)$msg['sender_id'] === $userId;
    $isModerator = in_array($userRole, ['admin', 'super_admin'], true);
    if (!$isOwner && !$isModerator) return 'You can only delete your own messages.';

    $pdo->prepare('UPDATE request_messages SET is_deleted = 1 WHERE id = ?')->execute([$messageId]);
    return null;
}

function notify_thread_new_message(int $requestId, string $senderRole): void
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT sr.customer_id, sr.guest_name, sr.guest_email, sr.subject, sr.tracking_code FROM service_requests sr WHERE sr.id = ?');
    $stmt->execute([$requestId]);
    $req = $stmt->fetch();
    if (!$req) return;

    $title = 'New message on request ' . $req['tracking_code'];
    $msg = 'There is a new message on the request "' . $req['subject'] . '".';

    if ($senderRole === 'customer') {
        // notify assigned staff + admins
        $staffIds = $pdo->prepare("SELECT DISTINCT staff_id FROM request_assignments WHERE request_id = ? AND task_status != 'declined'");
        $staffIds->execute([$requestId]);
        foreach ($staffIds->fetchAll() as $s) {
            notify_user((int)$s['staff_id'], 'thread_message', $title, $msg, '/backend/staff/task-view.php?id=' . $requestId);
        }
        notify_role('admin', 'thread_message', $title, $msg, '/backend/admin/requests.php?view=' . $requestId);
    } else {
        // staff/admin replied — notify the request owner: the registered
        // customer (in-app + email), or the guest by email if this request
        // has no account attached.
        notify_request_owner($req, 'thread_message', $title, $msg, '/backend/customer/request-view.php?id=' . $requestId);
    }
}

function get_request_thread(int $requestId): array
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT rm.*, u.full_name FROM request_messages rm
        LEFT JOIN users u ON u.id = rm.sender_id
        WHERE rm.request_id = ? ORDER BY rm.created_at ASC');
    $stmt->execute([$requestId]);
    $rows = $stmt->fetchAll();

    // Deleted messages keep their row (and original text) in the database
    // for audit purposes, but the text is never sent to the client once
    // is_deleted is set — the UI only ever sees the placeholder.
    foreach ($rows as &$row) {
        if (!empty($row['is_deleted'])) {
            $row['message'] = 'This message was deleted.';
        }
    }
    unset($row);

    return $rows;
}

/** Call whenever a user opens a request's detail/thread view, so unread counts clear for them. */
/** Customer-safe view of who's working on a request — name and specialty only, never email/phone. */
function get_assigned_staff_public(int $requestId): array
{
    global $pdo;
    $stmt = $pdo->prepare("SELECT DISTINCT u.full_name, u.staff_category FROM request_assignments ra
        JOIN users u ON u.id = ra.staff_id
        WHERE ra.request_id = ? AND ra.task_status IN ('accepted', 'completed')");
    $stmt->execute([$requestId]);
    return $stmt->fetchAll();
}

function mark_thread_read(int $requestId, int $userId): void
{
    global $pdo;
    $pdo->prepare('INSERT INTO request_thread_reads (request_id, user_id, last_read_at) VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE last_read_at = NOW()')->execute([$requestId, $userId]);
}

/**
 * Batched unread-message lookup for a list page (my-requests, tasks, admin requests)
 * — one query instead of one per row. Returns [request_id => unread_count].
 * $viewerIsCustomer selects which "side" of the conversation counts as unread:
 * true = count staff/admin messages (for a customer's list), false = count
 * customer messages (for a staff/admin list).
 */
function get_thread_unread_counts(array $requestIds, int $userId, bool $viewerIsCustomer): array
{
    global $pdo;
    $requestIds = array_values(array_unique(array_map('intval', $requestIds)));
    if (empty($requestIds)) return [];

    $placeholders = implode(',', array_fill(0, count($requestIds), '?'));
    $senderCondition = $viewerIsCustomer
        ? "rm.sender_role IN ('staff','admin','super_admin')"
        : "rm.sender_role = 'customer'";

    $sql = "SELECT rm.request_id, COUNT(*) AS unread
            FROM request_messages rm
            LEFT JOIN request_thread_reads rtr ON rtr.request_id = rm.request_id AND rtr.user_id = ?
            WHERE rm.request_id IN ($placeholders)
              AND $senderCondition
              AND rm.created_at > COALESCE(rtr.last_read_at, '1970-01-01 00:00:00')
            GROUP BY rm.request_id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(array_merge([$userId], $requestIds));

    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[(int)$row['request_id']] = (int)$row['unread'];
    }
    return $out;
}

function get_request_attachments(int $requestId): array
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT ra.*, u.full_name FROM request_attachments ra
        LEFT JOIN users u ON u.id = ra.uploaded_by
        WHERE ra.request_id = ? ORDER BY ra.created_at ASC');
    $stmt->execute([$requestId]);
    return $stmt->fetchAll();
}

/**
 * Save an uploaded file (from a single $_FILES[...] entry) against a request.
 * Returns an error string on failure, or null on success. Attachments are optional —
 * call this only when a file was actually chosen.
 */
function save_request_attachment(int $requestId, ?int $uploadedBy, array $file): ?string
{
    global $pdo;
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null; // nothing chosen — attachments are optional, not an error
    }
    if ($file['error'] !== UPLOAD_ERR_OK) {
        return 'Upload failed. Please try again.';
    }
    if ($file['size'] > MAX_ATTACHMENT_BYTES) {
        return 'File "' . $file['name'] . '" is larger than the 10MB limit.';
    }
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ALLOWED_ATTACHMENT_EXT, true)) {
        return 'File type ".' . $ext . '" is not allowed.';
    }

    $dir = __DIR__ . '/../uploads/requests/' . $requestId . '/';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $storedName = 'att_' . time() . '_' . bin2hex(random_bytes(5)) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], $dir . $storedName)) {
        return 'Could not save the uploaded file.';
    }

    $stmt = $pdo->prepare('INSERT INTO request_attachments (request_id, uploaded_by, original_name, stored_name, file_size, mime_type) VALUES (?,?,?,?,?,?)');
    $stmt->execute([$requestId, $uploadedBy, $file['name'], $storedName, $file['size'], $file['type'] ?? null]);
    return null;
}

/* ---------------------------------------------------------------------
 * Profile photos — every role (admin, staff, customer) can upload their
 * own. Staff/admin photos are what then appear on the public Team page
 * (backend/api/public/team.php) once their profile is switched public;
 * customer photos are for their own dashboard only.
 * ------------------------------------------------------------------- */

const ALLOWED_AVATAR_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Save an uploaded profile photo (from a single $_FILES[...] entry) and
 * point that user's `avatar` column at it, replacing/deleting whatever
 * photo they had before. Returns an error string on failure, or null on
 * success. A file is optional — call this only when one was chosen.
 */
function save_avatar_upload(int $userId, array $file): ?string
{
    global $pdo;
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null; // nothing chosen — not an error
    }
    if ($file['error'] !== UPLOAD_ERR_OK) {
        return 'Upload failed. Please try again.';
    }
    if ($file['size'] > MAX_AVATAR_BYTES) {
        return 'Image must be under 2MB.';
    }
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ALLOWED_AVATAR_EXT, true)) {
        return 'Please upload a JPG, PNG, or WEBP image.';
    }

    $dir = UPLOADS_DIR . '/avatars/';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $storedName = 'avatar_' . $userId . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], $dir . $storedName)) {
        return 'Could not save the uploaded image.';
    }

    // Remove the old photo, if any, so uploads/avatars/ doesn't accumulate
    // an orphaned file every time someone changes their picture.
    $old = $pdo->prepare('SELECT avatar FROM users WHERE id = ?');
    $old->execute([$userId]);
    $oldFile = $old->fetchColumn();
    if ($oldFile && file_exists($dir . $oldFile)) {
        unlink($dir . $oldFile);
    }

    $pdo->prepare('UPDATE users SET avatar = ? WHERE id = ?')->execute([$storedName, $userId]);
    return null;
}
