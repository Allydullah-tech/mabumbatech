<?php
require_once __DIR__ . '/../../includes/api.php';
$admin = api_require_role('admin');
api_require_permission('services.manage');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'update_service') {
        $id = (int)($input['service_id'] ?? 0);
        $stmt = $pdo->prepare('SELECT * FROM services WHERE id = ?');
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) json_error('Service not found.');

        $name = trim($input['name'] ?? $existing['name']);
        $categoryKey = trim($input['category_key'] ?? $existing['category_key']);
        $icon = trim($input['icon'] ?? '') ?: $existing['icon'];
        $desc = trim($input['description'] ?? '');

        if ($name === '') json_error('Service name cannot be empty.');

        $deptChk = $pdo->prepare('SELECT is_broadcast FROM departments WHERE dept_key = ?');
        $deptChk->execute([$categoryKey]);
        $dept = $deptChk->fetch();
        if (!$dept) json_error('Please choose a valid department.');

        $dupChk = $pdo->prepare('SELECT COUNT(*) FROM services WHERE category_key = ? AND name = ? AND id != ?');
        $dupChk->execute([$categoryKey, $name, $id]);
        if ((int)$dupChk->fetchColumn() > 0) {
            json_error('Another service with that exact name already exists under that department.');
        }

        $pdo->prepare('UPDATE services SET name = ?, category_key = ?, icon = ?, description = ?, is_broadcast = ? WHERE id = ?')
            ->execute([$name, $categoryKey, $icon, $desc, (int)$dept['is_broadcast'], $id]);
        log_activity($admin['id'], 'Updated service', $name);
        json_response(['success' => true, 'message' => 'Service updated.']);
    }

    if ($action === 'move_up' || $action === 'move_down') {
        $id = (int)($input['service_id'] ?? 0);
        $stmt = $pdo->prepare('SELECT id, sort_order FROM services WHERE id = ?');
        $stmt->execute([$id]);
        $current = $stmt->fetch();
        if (!$current) json_error('Service not found.');

        $cmp = $action === 'move_up' ? '<' : '>';
        $dir = $action === 'move_up' ? 'DESC' : 'ASC';
        $neighborStmt = $pdo->prepare("SELECT id, sort_order FROM services WHERE sort_order $cmp ? ORDER BY sort_order $dir LIMIT 1");
        $neighborStmt->execute([$current['sort_order']]);
        $neighbor = $neighborStmt->fetch();

        if (!$neighbor) {
            json_response(['success' => true, 'message' => 'Already at the ' . ($action === 'move_up' ? 'top' : 'bottom') . '.']);
        }

        $pdo->prepare('UPDATE services SET sort_order = ? WHERE id = ?')->execute([$neighbor['sort_order'], $current['id']]);
        $pdo->prepare('UPDATE services SET sort_order = ? WHERE id = ?')->execute([$current['sort_order'], $neighbor['id']]);
        json_response(['success' => true, 'message' => 'Order updated.']);
    }

    if ($action === 'toggle_active') {
        $id = (int)($input['service_id'] ?? 0);
        $pdo->prepare("UPDATE services SET is_active = IF(is_active=1,0,1) WHERE id = ?")->execute([$id]);
        $stmt = $pdo->prepare('SELECT is_active FROM services WHERE id = ?');
        $stmt->execute([$id]);
        $nowActive = (int)$stmt->fetchColumn() === 1;
        json_response([
            'success' => true,
            'message' => $nowActive
                ? 'Service reactivated — it is now requestable again.'
                : 'Service suspended — customers will still see it listed, marked as currently unavailable.',
        ]);
    }

    if ($action === 'add_service') {
        $name = trim($input['name'] ?? '');
        $categoryKey = trim($input['category_key'] ?? '');
        $icon = trim($input['icon'] ?? '') ?: 'bi-gear';
        $desc = trim($input['description'] ?? '');

        $deptChk = $pdo->prepare('SELECT is_broadcast FROM departments WHERE dept_key = ?');
        $deptChk->execute([$categoryKey]);
        $dept = $deptChk->fetch();

        if ($name === '' || !$dept) {
            json_response(['success' => false, 'message' => 'Please provide a service name and choose a department.']);
        }

        $chk = $pdo->prepare('SELECT COUNT(*) FROM services WHERE category_key = ? AND name = ?');
        $chk->execute([$categoryKey, $name]);
        if ((int)$chk->fetchColumn() > 0) {
            json_response(['success' => false, 'message' => 'A service with that exact name already exists under that department.']);
        }

        $isBroadcast = (int)$dept['is_broadcast'];
        $maxOrder = (int)$pdo->query('SELECT COALESCE(MAX(sort_order),0) FROM services')->fetchColumn();

        $stmt = $pdo->prepare('INSERT INTO services (category_key, name, icon, description, is_broadcast, is_custom, is_active, sort_order, added_by) VALUES (?,?,?,?,?,1,1,?,?)');
        $stmt->execute([$categoryKey, $name, $icon, $desc, $isBroadcast, $maxOrder + 1, $admin['id']]);
        log_activity($admin['id'], 'Added new service', $name);

        json_response(['success' => true, 'message' => 'New service added and published.']);
    }

    if ($action === 'delete_service') {
        $id = (int)($input['service_id'] ?? 0);
        $stmt = $pdo->prepare('SELECT is_custom FROM services WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            json_response(['success' => false, 'message' => 'Service not found.']);
        }
        if ((int)$row['is_custom'] !== 1) {
            json_response(['success' => false, 'message' => 'The original 8 core services cannot be deleted — you can suspend them instead.']);
        }
        $inUse = $pdo->prepare('SELECT COUNT(*) FROM service_requests WHERE service_id = ?');
        $inUse->execute([$id]);
        if ((int)$inUse->fetchColumn() > 0) {
            json_response(['success' => false, 'message' => 'This service already has requests against it, so it can only be suspended, not deleted.']);
        }
        $pdo->prepare('DELETE FROM services WHERE id = ?')->execute([$id]);
        json_response(['success' => true, 'message' => 'Service deleted.']);
    }

    json_error('Unknown action.');
}

$services = $pdo->query('SELECT * FROM services ORDER BY sort_order ASC')->fetchAll();
$departments = $pdo->query('SELECT * FROM departments ORDER BY is_custom ASC, label ASC')->fetchAll();
json_response(['services' => $services, 'departments' => $departments]);
