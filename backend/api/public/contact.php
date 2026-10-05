<?php
require_once __DIR__ . '/../../includes/api.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed.', 405);
$input = api_input();
api_require_csrf($input);

$name = trim($input['name'] ?? '');
$email = trim($input['email'] ?? '');
$phone = trim($input['phone'] ?? '');
$subject = trim($input['subject'] ?? '');
$message = trim($input['message'] ?? '');

if ($name === '' || $email === '' || $message === '') {
    json_response(['success' => false, 'message' => 'Please fill in your name, email and message.']);
}

// A double-click on submit shouldn't create two identical messages.
$dupe = $pdo->prepare('SELECT id FROM contact_messages WHERE email = ? AND message = ? AND created_at >= (NOW() - INTERVAL 2 MINUTE) LIMIT 1');
$dupe->execute([$email, $message]);
if ($dupe->fetchColumn()) {
    json_response(['success' => true, 'message' => 'Thank you! Your message has already been sent.']);
}

$stmt = $pdo->prepare('INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?,?,?,?,?)');
$stmt->execute([$name, $email, $phone, $subject, $message]);

notify_role('admin', 'new_contact', 'New Contact Message: ' . ($subject ?: 'General Inquiry'),
    $name . ' sent a message: "' . mb_strimwidth($message, 0, 120, '…') . '"',
    '/backend/admin/messages.php');

json_response(['success' => true, 'message' => 'Thank you! Your message has been sent. We will get back to you shortly.']);
