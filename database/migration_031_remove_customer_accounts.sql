-- =====================================================================
-- MABUMBA TECH — Migration 031: Remove Customer Account Management
-- Run in phpMyAdmin, after migration_030.
--
-- Spec: "Completely remove customer accounts from the system... no
-- customer dashboard, customer login, customer profile, customer account
-- management." Stage 1 already blocked customer login server-side; this
-- removes the admin-side "Customer Accounts" permission/page access.
-- Existing `customer`-role rows in `users` and their past service requests
-- are left untouched (historical data), they just can no longer log in
-- or be managed as accounts from the admin panel.
-- =====================================================================

DELETE FROM job_role_permissions WHERE permission_key = 'customers.manage';
DELETE FROM permissions WHERE permission_key = 'customers.manage';
