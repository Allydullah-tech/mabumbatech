<?php
require_once __DIR__ . '/../../includes/api.php';
require_once __DIR__ . '/../../includes/social_links.php';

// Read-only and public: the footer on every page asks for this. Links are
// managed by the Super Admin (backend/api/admin/social-links.php).
// no-cache so a change made in the admin panel shows up on the next page view.
header('Cache-Control: no-cache, must-revalidate');

json_response(['links' => social_get_links()]);
