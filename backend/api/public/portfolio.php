<?php
require_once __DIR__ . '/../../includes/api.php';

// SELECT * on purpose: the case-study columns (technologies, project_outcome,
// completion_date — migration 019) may not exist yet on every database. Listing
// them by name made this endpoint fail with a 500 and the Portfolio page look
// empty. Now it works with whatever columns exist, and fills the missing
// optional ones with null.
$portfolio = [];
try {
    $rows = $pdo->query('SELECT * FROM portfolio ORDER BY is_featured DESC, created_at DESC')->fetchAll();
} catch (Throwable $e) {
    error_log('portfolio.php: ' . $e->getMessage());
    $rows = [];
}

$publicColumns = ['id', 'title', 'category_key', 'description', 'technologies', 'project_outcome', 'completion_date',
    'client_name', 'image', 'project_url', 'is_featured', 'created_at'];

// Only public-safe columns — never linked_request_id or added_by (both are
// internal admin-only fields; leaking either would expose internal record IDs).
foreach ($rows as $row) {
    $item = [];
    foreach ($publicColumns as $col) {
        $item[$col] = $row[$col] ?? null;
    }
    $portfolio[] = $item;
}

json_response(['portfolio' => $portfolio]);
