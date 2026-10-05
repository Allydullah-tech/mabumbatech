-- =====================================================================
-- MABUMBA TECH — Migration 040: Sales & Stock Overview (view only)
-- Run this in phpMyAdmin (SQL tab), after 001-037. Purely additive.
--
-- Adds one permission that lets a person SEE the Sales & Stock Overview
-- page (stock, sales by time period, top products, who sold what). It is
-- read-only — it cannot record or change anything. The General / Operations
-- Manager gets it automatically. (The page also works for that role and for
-- full admins even before this is run; this makes it visible in the
-- permission screens and lets you grant it to other roles if you wish.)
-- =====================================================================

INSERT INTO permissions (permission_key, category, label) VALUES
('sales_overview.view', 'inventory', 'View sales & stock overview (read-only)')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('general_manager', 'sales_overview.view')
ON DUPLICATE KEY UPDATE job_role_key = job_role_key;
