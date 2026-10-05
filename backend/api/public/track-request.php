<?php
require_once __DIR__ . '/../../includes/api.php';

$code = trim($_GET['code'] ?? '');
$phone = trim($_GET['phone'] ?? '');

if ($code !== '') {
    // Track by tracking code — returns exactly one request.
    $stmt = $pdo->prepare('SELECT sr.*, s.name AS service_name, s.icon, pt.name AS product_type_name FROM service_requests sr
        LEFT JOIN services s ON s.id = sr.service_id
        LEFT JOIN product_types pt ON pt.id = sr.product_type_id
        WHERE sr.tracking_code = ?');
    $stmt->execute([$code]);
    $request = $stmt->fetch() ?: null;

    if ($request) {
        // internal_notes is a staff/admin-only field — sr.* pulls it in along
        // with everything else, so it must be stripped before this public,
        // unauthenticated endpoint ever sends it out.
        unset($request['internal_notes']);

        json_response([
            'request' => $request,
            'requests' => null,
            'searched' => true,
            // Same detail a registered customer sees on their request-view page
            // (spec §6) — a guest shouldn't just see "Completed" with nothing else.
            'assigned_staff' => get_assigned_staff_public($request['id']),
            'attachments' => get_request_attachments($request['id']),
            'links' => get_project_links($request['id'], true), // customer-visible only
            'link_types' => PROJECT_LINK_TYPES,
        ]);
    }

    json_response(['request' => null, 'requests' => null, 'searched' => true]);
}

if ($phone !== '') {
    // Track by phone number (for when the tracking code was lost) — a phone
    // may have submitted several requests, so this returns a list instead.
    // Kept as a lightweight summary list (no attachments/links per row) — the tracking code lookup above is where the full detail lives.
    $stmt = $pdo->prepare("SELECT sr.*, s.name AS service_name, s.icon, pt.name AS product_type_name FROM service_requests sr
        LEFT JOIN services s ON s.id = sr.service_id
        LEFT JOIN product_types pt ON pt.id = sr.product_type_id
        WHERE sr.guest_phone = ? OR sr.customer_id IN (SELECT id FROM users WHERE phone = ?)
        ORDER BY sr.created_at DESC");
    $stmt->execute([$phone, $phone]);
    $requests = $stmt->fetchAll();
    foreach ($requests as &$r) { unset($r['internal_notes']); }
    unset($r);
    json_response(['request' => null, 'requests' => $requests, 'searched' => true]);
}

json_response(['request' => null, 'requests' => null, 'searched' => false]);
