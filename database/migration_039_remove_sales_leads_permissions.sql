-- =====================================================================
-- MABUMBA TECH — Migration 039: Remove the Sales & Leads permissions
-- Run this in phpMyAdmin (SQL tab), after 001-037. OPTIONAL.
--
-- The Sales & Leads pipeline (leads, quotations, negotiation) was removed
-- from the system, so its two permissions no longer control anything.
-- This takes them off the roles/permission screens. No data is deleted:
-- the leads / quotations tables and their rows are left untouched (the
-- "By Source" report still reads customer sources from `leads`).
-- =====================================================================

DELETE FROM job_role_permissions WHERE permission_key IN ('sales.view', 'sales.manage');
DELETE FROM user_permissions     WHERE permission_key IN ('sales.view', 'sales.manage');
DELETE FROM permissions          WHERE permission_key IN ('sales.view', 'sales.manage');
