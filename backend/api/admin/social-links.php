<?php
require_once __DIR__ . '/../../includes/api.php';
require_once __DIR__ . '/../../includes/social_links.php';

api_require_role('admin');
// Hard role check (not a configurable permission): the company's official
// social accounts are managed by the Super Admin only.
if (!is_super_admin()) {
    json_error('Only the Super Administrator can manage the official social media links.', 403);
}
$admin = current_user();

function social_admin_payload(): array
{
    $out = [];
    foreach (social_platforms() as $key => $p) {
        $out[] = [
            'key'         => $key,
            'label'       => $p['label'],
            'icon'        => $p['icon'],
            'placeholder' => $p['placeholder'],
            'url'         => get_setting(social_setting_key($key)),
        ];
    }
    return $out;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = api_input();
    api_require_csrf($input);

    if (($input['action'] ?? '') !== 'save_links') {
        json_error('Unknown action.');
    }

    // Validate everything first; save nothing unless every link is valid.
    $clean = [];
    $errors = [];
    foreach (social_platforms() as $key => $p) {
        $field = 'url_' . $key;
        if (!array_key_exists($field, $input)) {
            continue; // not submitted — leave as is
        }
        $err = null;
        $url = social_normalize_url($key, is_string($input[$field]) ? $input[$field] : '', $err);
        if ($url === null) {
            $errors[$key] = $err ?: 'Invalid link.';
        } else {
            $clean[$key] = $url;
        }
    }
    if ($errors) {
        json_response([
            'success' => false,
            'message' => 'Some links need fixing. Nothing was saved.',
            'errors'  => $errors,
        ], 422);
    }

    $changed = [];
    $cleared = [];
    foreach ($clean as $key => $url) {
        $old = get_setting(social_setting_key($key));
        if ($old === $url) {
            continue;
        }
        set_setting(social_setting_key($key), $url);
        if ($url === '') {
            $cleared[] = social_platforms()[$key]['label'];
        } else {
            $changed[] = social_platforms()[$key]['label'];
        }
    }

    if ($changed || $cleared) {
        $details = [];
        if ($changed) $details[] = 'Set/updated: ' . implode(', ', $changed);
        if ($cleared) $details[] = 'Removed: ' . implode(', ', $cleared);
        log_activity((int)$admin['id'], 'Updated social media links', implode('. ', $details));
    }

    // Report the values exactly as stored now (get_setting() caches per request).
    $links = [];
    foreach (social_platforms() as $key => $p) {
        $links[$key] = array_key_exists($key, $clean) ? $clean[$key] : get_setting(social_setting_key($key));
    }
    json_response([
        'success' => true,
        'message' => 'Social media links saved. The website footer is updated.',
        'links'   => $links,
    ]);
}

json_response(['platforms' => social_admin_payload()]);
