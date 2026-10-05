<?php
require_once __DIR__ . '/../../includes/api.php';

$user = current_user();
$permissions = [];
$jobRoleLabel = null;

if ($user) {
    $permissions = effective_permissions($user);
    if (!empty($user['job_role_key'])) {
        $stmt = $pdo->prepare('SELECT label FROM job_roles WHERE job_role_key = ?');
        $stmt->execute([$user['job_role_key']]);
        $jobRoleLabel = $stmt->fetchColumn() ?: null;
    }
}

json_response([
    'user' => $user,
    'permissions' => $permissions,
    'job_role_label' => $jobRoleLabel,
    'csrf_token' => csrf_token(),
]);
