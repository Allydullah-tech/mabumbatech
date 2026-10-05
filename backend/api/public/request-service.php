<?php
require_once __DIR__ . '/../../includes/api.php';
$user = current_user();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed.', 405);
$input = api_input();
api_require_csrf($input);

$serviceId = (int)($input['service_id'] ?? 0);
$subject = trim($input['subject'] ?? '');
$message = trim($input['message'] ?? '');
$budget = trim($input['budget'] ?? '');
$deadline = trim($input['deadline'] ?? '') ?: null;
$agreeTerms = !empty($input['agree_terms']);

$isCustomer = $user && $user['role'] === 'customer';
$name = $isCustomer ? $user['full_name'] : trim($input['guest_name'] ?? '');
$email = $isCustomer ? $user['email'] : trim($input['guest_email'] ?? '');
$phone = $isCustomer ? ($user['phone'] ?? '') : trim($input['guest_phone'] ?? '');

if (!$serviceId || $subject === '' || $message === '' || $name === '' || $email === '') {
    json_response(['success' => false, 'message' => 'Please complete all required fields.']);
}
if (!$agreeTerms) {
    json_response(['success' => false, 'message' => 'You must agree to the Terms & Conditions before submitting a request.']);
}

// A double-click (or resubmitted form) shouldn't create two identical requests.
$dupeCheck = $pdo->prepare('SELECT tracking_code FROM service_requests
    WHERE service_id = ? AND subject = ? AND message = ? AND guest_email = ?
      AND created_at >= (NOW() - INTERVAL 2 MINUTE)
    ORDER BY id DESC LIMIT 1');
$dupeCheck->execute([$serviceId, $subject, $message, $email]);
if ($existingCode = $dupeCheck->fetchColumn()) {
    json_response(['success' => true, 'tracking_code' => $existingCode, 'message' => 'This request was already submitted. Your tracking code is ' . $existingCode . '.']);
}

$code = generate_tracking_code();
$stmt = $pdo->prepare('INSERT INTO service_requests
    (tracking_code, customer_id, guest_name, guest_email, guest_phone, service_id, subject, message, budget, deadline, status, terms_accepted_at, terms_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,"pending",NOW(),?)');
$stmt->execute([
    $code,
    $isCustomer ? $user['id'] : null,
    $name, $email, $phone,
    $serviceId, $subject, $message, $budget, $deadline,
    TERMS_VERSION
]);
$newRequestId = (int)$pdo->lastInsertId();
log_activity($user['id'] ?? null, 'New service request', "Tracking code $code");

// optional file attachment(s) — up to 3 files, none required
if (!empty($_FILES['attachments'])) {
    $count = count($_FILES['attachments']['name']);
    for ($i = 0; $i < min($count, 3); $i++) {
        if (($_FILES['attachments']['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;
        $singleFile = [
            'name'     => $_FILES['attachments']['name'][$i],
            'type'     => $_FILES['attachments']['type'][$i],
            'tmp_name' => $_FILES['attachments']['tmp_name'][$i],
            'error'    => $_FILES['attachments']['error'][$i],
            'size'     => $_FILES['attachments']['size'][$i],
        ];
        save_request_attachment($newRequestId, $user['id'] ?? null, $singleFile);
    }
}

$svc = $pdo->prepare('SELECT name FROM services WHERE id = ?');
$svc->execute([$serviceId]);
$serviceName = $svc->fetchColumn();

send_email($email, $name, 'We received your request — ' . $code,
    notification_email_body('Request Received', 'Thank you, ' . $name . '! We received your "' . $serviceName . '" request "' . $subject . '". Your tracking code is ' . $code . '. Our team will review it shortly.', '/frontend/html/public/track-request.html?code=' . $code));

if ($isCustomer) {
    notify_user((int)$user['id'], 'request_submitted', 'Request Received: ' . $subject,
        'We received your "' . $serviceName . '" request. Tracking code: ' . $code . '.',
        '/backend/customer/request-view.php?id=' . $newRequestId);
}

notify_role('admin', 'new_request', 'New Service Request: ' . $subject,
    $name . ' submitted a new "' . $serviceName . '" request (' . $code . ').',
    '/backend/admin/requests.php?view=' . $newRequestId);

json_response(['success' => true, 'tracking_code' => $code]);
