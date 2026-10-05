<?php
/**
 * Company Members Directory — read-only.
 *
 * Available to every authenticated non-customer account (Super Admin, any
 * Admin regardless of job role, and Staff). Returns contact information
 * only: no account-management fields (status/suspend controls, job-role
 * permission internals, password data) are exposed, and this endpoint has
 * no POST/mutation actions at all — it cannot be used to add, edit, or
 * remove anyone. That is the whole point: this is what a scoped Admin or
 * Staff member sees instead of the Admin/Staff management pages.
 */
require_once __DIR__ . '/../../includes/api.php';
api_require_role(['admin', 'staff']);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed.', 405);
}

json_response(['members' => get_company_directory()]);
