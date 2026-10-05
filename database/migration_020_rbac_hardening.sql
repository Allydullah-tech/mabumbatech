-- =====================================================================
-- MABUMBA TECH — Migration 020 — RBAC hardening & Activity Log upgrade
-- Run this in phpMyAdmin (SQL tab). Purely additive/corrective.
--
-- Fixes applied:
--
-- 1) Staff/admin account management and the Activity Log must be usable
--    ONLY by Super Admin and Generic Administrator ("Full Admins"), per
--    spec. Two default grants from earlier migrations violated this:
--      - `employees.manage` was granted to `general_manager`, letting a
--        scoped admin create/suspend/reset Service Staff accounts.
--      - `audit.view` was granted to `data_reports_officer`, letting a
--        scoped admin read the audit trail.
--    Both are revoked below. (The corresponding backend endpoints —
--    admins.php, staff.php, activity-log.php — now also enforce this
--    with a hard role check via api_require_full_admin(), so this is
--    belt-and-braces: even a future accidental re-grant of these
--    permission keys will not reopen these two capabilities.)
--
-- 2) `activity_logs` relied solely on a `user_id` foreign key
--    (ON DELETE SET NULL) to identify who performed an action. If that
--    account is later deleted, the log entry becomes anonymous — a real
--    gap for an audit trail. `actor_name` and `actor_role` snapshot
--    columns are added so every entry stays attributable permanently.
--    Existing rows are backfilled from the current `users` table on a
--    best-effort basis (rows whose user has since been deleted stay
--    NULL, exactly as before this migration).
-- =====================================================================

DELETE FROM job_role_permissions WHERE job_role_key = 'general_manager' AND permission_key = 'employees.manage';
DELETE FROM job_role_permissions WHERE job_role_key = 'data_reports_officer' AND permission_key = 'audit.view';

ALTER TABLE activity_logs
    ADD COLUMN actor_name VARCHAR(120) DEFAULT NULL AFTER user_id,
    ADD COLUMN actor_role VARCHAR(40) DEFAULT NULL AFTER actor_name,
    ADD INDEX idx_activity_created_at (created_at),
    ADD INDEX idx_activity_action (action);

UPDATE activity_logs al
JOIN users u ON u.id = al.user_id
SET al.actor_name = u.full_name,
    al.actor_role = IF(u.role = 'admin' AND u.job_role_key IS NOT NULL, u.job_role_key, u.role)
WHERE al.actor_name IS NULL;
