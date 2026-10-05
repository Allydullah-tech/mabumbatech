<?php
require_once __DIR__ . '/../../includes/api.php';
// Includes suspended services too — the public page shows them marked as
// "Currently Unavailable" instead of hiding them, per the admin's request.
$services = $pdo->query('SELECT * FROM services ORDER BY is_active DESC, sort_order ASC')->fetchAll();
json_response(['services' => $services]);
