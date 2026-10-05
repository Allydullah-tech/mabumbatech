<?php
/**
 * MABUMBA TECH — Marketing Campaigns (REMOVED)
 * The system restructuring spec explicitly removes "Campaigns and all
 * campaign-related functionality." migration_030_system_restructure.sql
 * has already dropped the `campaigns` and `campaign_expenses` tables and
 * the `leads.campaign_id` column.
 *
 * Kept only as a safe stub so a stale bookmark or cached page gets a
 * clear response instead of a SQL error against a dropped table. Delete
 * this file, frontend/html/admin/marketing.html, and
 * frontend/js/pages/admin-marketing.js entirely, and remove their nav
 * link, in Stage 2. Customer acquisition (leads/quotations) is unaffected
 * and still lives at backend/api/admin/marketing-acquisition.php.
 */
require_once __DIR__ . '/../../includes/api.php';
api_require_role('admin');
json_error('The Campaigns module has been removed. Use Customer Acquisition instead.', 410);
