-- =====================================================================
-- MABUMBA TECH — Migration 041: Remove HR and Support Tickets
-- Run this in phpMyAdmin (SQL tab), after 001-040.
--
--   1. HR permissions (hr.view, hr.manage) are removed. The Employees page
--      is not permission-based: it is open only to Super Admin, Generic
--      Administrator and the Operations Manager (general_manager) in code.
--   2. Support Tickets are removed: permissions, tables and notifications.
--      WARNING: this permanently deletes all existing support-ticket data
--      (support_tickets, ticket_messages, ticket_attachments,
--      ticket_thread_reads). Back up first if you need to keep any of it.
--   3. Old leave-request notifications that pointed at the removed HR page
--      are re-pointed to the Employees page.
--
-- NOT touched: leave_requests (leave stays), users.hire_date and
-- users.employment_status (the Accountant payroll list still uses them),
-- and all payroll/finance tables.
-- =====================================================================

-- 1) HR permissions (FK cascades also clear job_role_permissions / user_permissions,
--    but they are removed explicitly so this is safe on any install).
DELETE FROM job_role_permissions WHERE permission_key IN ('hr.view', 'hr.manage');
DELETE FROM user_permissions     WHERE permission_key IN ('hr.view', 'hr.manage');
DELETE FROM permissions          WHERE permission_key IN ('hr.view', 'hr.manage');

-- employees.manage (account management) stays; it just no longer sits in an "hr" group.
UPDATE permissions SET category = 'people' WHERE permission_key = 'employees.manage';

-- 2) Support Tickets
DELETE FROM job_role_permissions WHERE permission_key IN ('tickets.view', 'tickets.manage');
DELETE FROM user_permissions     WHERE permission_key IN ('tickets.view', 'tickets.manage');
DELETE FROM permissions          WHERE permission_key IN ('tickets.view', 'tickets.manage');

DELETE FROM notifications WHERE type IN ('new_ticket', 'ticket_reply');

DROP TABLE IF EXISTS ticket_thread_reads;
DROP TABLE IF EXISTS ticket_attachments;
DROP TABLE IF EXISTS ticket_messages;
DROP TABLE IF EXISTS support_tickets;

-- 3) Leave notifications created before this update linked to the HR page.
UPDATE notifications
SET link = '/backend/admin/employees.php'
WHERE link LIKE '/backend/admin/hr.php%';
