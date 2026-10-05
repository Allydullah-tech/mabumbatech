<?php
/**
 * MABUMBA TECH — Project team (cross-department project visibility)
 * See migration_011_project_team.sql for the schema this backs.
 */

/** Everyone attached to a project across every department (delivery staff + cross-dept team). */
function get_project_team(int $requestId): array
{
    global $pdo;
    $stmt = $pdo->prepare('
        SELECT pt.id, pt.user_id, pt.role_on_project, pt.created_at,
               u.full_name, u.role, u.job_role_key, u.position_title
        FROM project_team pt
        JOIN users u ON u.id = pt.user_id
        WHERE pt.request_id = ?
        ORDER BY pt.created_at ASC
    ');
    $stmt->execute([$requestId]);
    return $stmt->fetchAll();
}

/** Attaches a user to a project in a given role. Silently no-ops if already attached. */
function add_project_team_member(int $requestId, int $userId, string $roleOnProject, ?int $addedBy): void
{
    global $pdo;
    $stmt = $pdo->prepare('
        INSERT INTO project_team (request_id, user_id, role_on_project, added_by)
        VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE role_on_project = VALUES(role_on_project)
    ');
    $stmt->execute([$requestId, $userId, $roleOnProject, $addedBy]);
}

function remove_project_team_member(int $requestId, int $userId): void
{
    global $pdo;
    $stmt = $pdo->prepare('DELETE FROM project_team WHERE request_id = ? AND user_id = ?');
    $stmt->execute([$requestId, $userId]);
}

/**
 * True if $user may view this project because they're on its cross-department
 * team OR a delivery assignee — used by modules (finance, reports, etc.) that
 * need to check "can this admin see this specific project" beyond their
 * general role/permission check. Super_admin and full admin-tier roles with
 * projects.view should typically be checked separately before calling this.
 */
function is_on_project_team(int $requestId, int $userId): bool
{
    global $pdo;
    $stmt = $pdo->prepare('SELECT 1 FROM project_team WHERE request_id = ? AND user_id = ?');
    $stmt->execute([$requestId, $userId]);
    if ($stmt->fetchColumn()) return true;

    $stmt = $pdo->prepare('SELECT 1 FROM request_assignments WHERE request_id = ? AND staff_id = ?');
    $stmt->execute([$requestId, $userId]);
    return (bool)$stmt->fetchColumn();
}
