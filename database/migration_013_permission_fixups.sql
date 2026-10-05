-- =====================================================================
-- MABUMBA TECH — Migration 013
-- Run this in phpMyAdmin (SQL tab). Purely additive.
--
-- While gating the remaining admin endpoints with real permission checks
-- (see updated admins.php, customers.php, dashboard.php, departments.php,
-- messages.php, portfolio.php, reports.php, requests.php, services.php,
-- settings.php, staff.php), two gaps turned up from migration 010:
--
-- - `portfolio.manage` existed in the permissions catalogue but no job
--   role template granted it. Portfolio is public-site showcase content —
--   the Marketing Manager's job, not Sales or Ops.
-- - `employees.manage` (creating/managing Service Staff accounts) also
--   existed but was unused. This is distinct from `hr.manage` (personnel
--   records/leave — not built yet): staff.php is about who delivers work
--   and which department they're in, which is an Operations function.
-- =====================================================================

INSERT INTO permissions (permission_key, category, label) VALUES
('employees.manage', 'hr', 'Create and manage Service Staff accounts')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('marketing_manager', 'portfolio.manage'),
('general_manager',   'employees.manage')
ON DUPLICATE KEY UPDATE job_role_key = VALUES(job_role_key);
