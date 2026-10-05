<?php
require_once __DIR__ . '/../../includes/api.php';

$services = $pdo->query('SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order ASC')->fetchAll();
$portfolio = $pdo->query('SELECT * FROM portfolio ORDER BY is_featured DESC, created_at DESC LIMIT 4')->fetchAll();
$staffCount = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='staff' AND status='active'")->fetchColumn();
$doneCount  = (int)$pdo->query("SELECT COUNT(*) FROM service_requests WHERE status='completed'")->fetchColumn();

json_response([
    'services' => $services,
    'portfolio' => $portfolio,
    'staff_count' => $staffCount,
    'done_count' => $doneCount,
]);
