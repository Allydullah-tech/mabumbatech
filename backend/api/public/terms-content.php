<?php
require_once __DIR__ . '/../../includes/api.php';
require_once __DIR__ . '/../../includes/terms_content.php';

json_response([
    'version' => TERMS_VERSION,
    'updated' => terms_updated_label(),
    'sections' => terms_sections(),
]);
