<?php
require_once __DIR__ . '/../../includes/api.php';
$admin = api_require_role('admin');
api_require_permission('departments.manage');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'add') {
        $label = trim($input['label'] ?? '');
        $icon = trim($input['icon'] ?? '') ?: 'bi-briefcase';

        if ($label === '') {
            json_response(['success' => false, 'message' => 'Please enter a department name.']);
        }

        // auto-generate a stable key from the name, e.g. "Cloud Services" -> "cloud_services"
        $base = strtolower(preg_replace('/[^a-z0-9]+/i', '_', trim($label)));
        $base = trim($base, '_') ?: 'department';
        $key = $base;
        $i = 1;
        $chk = $pdo->prepare('SELECT COUNT(*) FROM departments WHERE dept_key = ?');
        while (true) {
            $chk->execute([$key]);
            if ((int)$chk->fetchColumn() === 0) break;
            $key = $base . '_' . (++$i);
        }

        $dup = $pdo->prepare('SELECT COUNT(*) FROM departments WHERE label = ?');
        $dup->execute([$label]);
        if ((int)$dup->fetchColumn() > 0) {
            json_response(['success' => false, 'message' => 'A department with that name already exists.']);
        }

        $stmt = $pdo->prepare('INSERT INTO departments (dept_key, label, icon, is_custom, added_by) VALUES (?,?,?,1,?)');
        $stmt->execute([$key, $label, $icon, $admin['id']]);
        log_activity($admin['id'], 'Added new department', $label);

        json_response(['success' => true, 'message' => "Department \"$label\" created.", 'dept_key' => $key, 'label' => $label]);
    }

    json_error('Unknown action.');
}

$departments = $pdo->query('SELECT * FROM departments ORDER BY is_custom ASC, label ASC')->fetchAll();
json_response(['departments' => $departments]);
