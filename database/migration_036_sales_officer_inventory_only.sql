-- =====================================================================
-- MABUMBA TECH — Migration 036: Sales Officer = inventory, sales & damages
-- Run ONCE in phpMyAdmin (SQL tab), after 001-035. Safe to re-run.
--
-- The Sales Officer deals with inventory, recording sales and recording
-- damaged stock — NOT with the "Sales & Leads" lead/quotation pipeline.
-- This removes the Sales & Leads permissions from that job role (and from
-- any personal override given to a Sales Officer). Damage recording and the
-- sales records need no new permission: they use inventory.sell /
-- inventory.manage, which the Sales Officer already has.
-- =====================================================================

DELETE FROM job_role_permissions
WHERE job_role_key = 'sales_officer'
  AND permission_key IN ('sales.view', 'sales.manage');

DELETE up FROM user_permissions up
JOIN users u ON u.id = up.user_id
WHERE u.job_role_key = 'sales_officer'
  AND up.permission_key IN ('sales.view', 'sales.manage');
