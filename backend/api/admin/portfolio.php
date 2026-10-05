<?php
require_once __DIR__ . '/../../includes/api.php';
$admin = api_require_role('admin');
api_require_permission('portfolio.manage');
$uploadDir = UPLOADS_DIR . '/portfolio/';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);
    $action = $input['action'] ?? '';

    if ($action === 'add' || $action === 'update') {
        $title = trim($input['title'] ?? '');
        $category = trim($input['category_key'] ?? '') ?: null;
        $desc = trim($input['description'] ?? '');
        $client = trim($input['client_name'] ?? '');
        $url = trim($input['project_url'] ?? '');
        $technologies = trim($input['technologies'] ?? '') ?: null;
        $outcome = trim($input['project_outcome'] ?? '') ?: null;
        $completionDate = trim($input['completion_date'] ?? '') ?: null;
        $featured = isset($input['is_featured']) ? 1 : 0;
        $linkedRequestId = (int)($input['linked_request_id'] ?? 0) ?: null;

        if ($title === '') {
            json_error('Project title is required.');
        }
        if ($url !== '' && !is_valid_project_url($url)) {
            json_error('Please enter a valid link starting with http:// or https://, or leave it blank.');
        }

        $imageName = null;
        if (!empty($_FILES['image']['name'])) {
            $ext = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
            if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp'], true) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
                $imageName = 'proj_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
                move_uploaded_file($_FILES['image']['tmp_name'], $uploadDir . $imageName);
            }
        }

        if ($action === 'add') {
            $stmt = $pdo->prepare('INSERT INTO portfolio (title, category_key, description, technologies, project_outcome, completion_date, client_name, image, project_url, is_featured, linked_request_id, added_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
            $stmt->execute([$title, $category, $desc, $technologies, $outcome, $completionDate, $client, $imageName, $url, $featured, $linkedRequestId, $admin['id']]);
            log_activity($admin['id'], 'Added portfolio item', $title);
            json_response(['success' => true, 'message' => 'Portfolio item added.']);
        }

        // update
        $id = (int)($input['portfolio_id'] ?? 0);
        $stmt = $pdo->prepare('SELECT image FROM portfolio WHERE id = ?');
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) json_error('Portfolio item not found.');

        if ($imageName) {
            if ($existing['image'] && file_exists($uploadDir . $existing['image'])) {
                unlink($uploadDir . $existing['image']);
            }
            $pdo->prepare('UPDATE portfolio SET title=?, category_key=?, description=?, technologies=?, project_outcome=?, completion_date=?, client_name=?, image=?, project_url=?, is_featured=?, linked_request_id=? WHERE id=?')
                ->execute([$title, $category, $desc, $technologies, $outcome, $completionDate, $client, $imageName, $url, $featured, $linkedRequestId, $id]);
        } else {
            $pdo->prepare('UPDATE portfolio SET title=?, category_key=?, description=?, technologies=?, project_outcome=?, completion_date=?, client_name=?, project_url=?, is_featured=?, linked_request_id=? WHERE id=?')
                ->execute([$title, $category, $desc, $technologies, $outcome, $completionDate, $client, $url, $featured, $linkedRequestId, $id]);
        }
        log_activity($admin['id'], 'Updated portfolio item', $title);
        json_response(['success' => true, 'message' => 'Portfolio item updated.']);
    }

    if ($action === 'toggle_featured') {
        $id = (int)($input['portfolio_id'] ?? 0);
        $pdo->prepare('UPDATE portfolio SET is_featured = IF(is_featured=1,0,1) WHERE id = ?')->execute([$id]);
        json_response(['success' => true, 'message' => 'Featured status updated.']);
    }

    if ($action === 'delete') {
        $id = (int)($input['portfolio_id'] ?? 0);
        $stmt = $pdo->prepare('SELECT image, title FROM portfolio WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row && $row['image'] && file_exists($uploadDir . $row['image'])) unlink($uploadDir . $row['image']);
        $pdo->prepare('DELETE FROM portfolio WHERE id = ?')->execute([$id]);
        log_activity($admin['id'], 'Removed portfolio item', $row['title'] ?? "#$id");
        json_response(['success' => true, 'message' => 'Portfolio item removed.']);
    }

    json_error('Unknown action.');
}

$items = $pdo->query('SELECT * FROM portfolio ORDER BY created_at DESC')->fetchAll();

// Completed/delivered requests an admin can optionally link a showcase item to — for internal
// traceability only. Only id/subject/tracking_code go out; never customer contact details.
$linkable = $pdo->query("SELECT id, subject, tracking_code FROM service_requests
    WHERE status IN ('completed','delivered') ORDER BY created_at DESC LIMIT 100")->fetchAll();

json_response(['portfolio' => $items, 'categories' => STAFF_CATEGORIES, 'linkable_requests' => $linkable]);
