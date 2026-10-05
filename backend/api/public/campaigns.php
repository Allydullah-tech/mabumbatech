<?php
/**
 * MABUMBA TECH — Public Campaigns (REMOVED)
 * The Campaigns module has been removed per the system restructuring spec
 * (migration_030_system_restructure.sql drops the `campaigns` table).
 *
 * Returns an empty list rather than erroring, so the still-deployed
 * frontend/js/pages/home_page.js (which calls this endpoint and simply
 * hides the campaigns section when the list is empty) keeps working with
 * zero visible change until Stage 2 removes that markup/script entirely.
 */
require_once __DIR__ . '/../../includes/api.php';
json_response(['campaigns' => []]);
