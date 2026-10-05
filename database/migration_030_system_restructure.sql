-- =====================================================================
-- MABUMBA TECH — Migration 030: System Restructuring (Stage 1)
-- Run this in phpMyAdmin (SQL tab), after 001-029.
--
-- Implements the roles/workflow spec:
--   1. New job role: Lawyer (legal.view/manage, budget request access,
--      read-only project access + project comments).
--   2. New "Budget Requests" workflow: Marketing Officer and Lawyer can
--      request a budget/expense; General Operations Manager (or a Full
--      Admin) reviews and approves/rejects it.
--   3. New "project comments" permission so a Lawyer can add a comment
--      to a project's thread without getting full project-management
--      rights (projects.manage stays assign/status/link/milestone-level).
--   4. Removes job roles that are no longer part of the spec (Marketing
--      Manager, Store/Inventory Manager, HR Manager, Customer Support,
--      Data/Reports Officer). Any admin currently holding one of these
--      is reset to job_role_key = NULL (Generic Administrator — full
--      access) rather than silently locked out; the CEO/Super Admin
--      should reassign them to one of the 8 roles from the Admin
--      Accounts screen.
--   5. Sales Officer absorbs stock/inventory management (previously
--      Store Manager's job) — spec §5.
--   6. Drops the Campaigns module (campaigns, campaign_expenses) and the
--      leads.campaign_id column — spec explicitly removes campaigns.
--      Customer-acquisition leads/quotations (migration_012/023) are
--      NOT touched; only the campaigns tables themselves are removed.
--
-- Purely forward-moving: nothing about service_requests, users, leads
-- (other than dropping campaign_id), leave_requests, or finance is
-- touched here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) New job role + permissions: Lawyer
-- ---------------------------------------------------------------------
INSERT INTO job_roles (job_role_key, label, icon) VALUES
('lawyer', 'Lawyer', 'bi-briefcase')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO permissions (permission_key, category, label) VALUES
('legal.view',           'legal',    'View legal matters & tax requirements'),
('legal.manage',         'legal',    'Manage legal matters & tax requirements'),
('projects.comment',     'projects', 'Add comments/concerns to a project (read + comment only)'),
('budget_requests.create','finance', 'Submit a budget/expense request'),
('budget_requests.manage','finance', 'Review & decide budget/expense requests')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('lawyer', 'legal.view'),
('lawyer', 'legal.manage'),
('lawyer', 'projects.view'),
('lawyer', 'projects.comment'),
('lawyer', 'budget_requests.create')
ON DUPLICATE KEY UPDATE job_role_key = job_role_key;

-- Marketing Officer can request a travel/search budget from the Ops Manager (spec §4).
INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('marketing_officer', 'budget_requests.create')
ON DUPLICATE KEY UPDATE job_role_key = job_role_key;

-- General Operations Manager reviews/decides budget requests (spec §3).
INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('general_manager', 'budget_requests.manage')
ON DUPLICATE KEY UPDATE job_role_key = job_role_key;

-- ---------------------------------------------------------------------
-- 2) Budget Requests table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requested_by INT NOT NULL,
    department ENUM('marketing','legal','other') NOT NULL DEFAULT 'other',
    purpose VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    details VARCHAR(500) DEFAULT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    decided_by INT DEFAULT NULL,
    decision_note VARCHAR(255) DEFAULT NULL,
    decided_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 3) Sales Officer absorbs stock/inventory management (was Store Manager's).
-- ---------------------------------------------------------------------
INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('sales_officer', 'inventory.view'),
('sales_officer', 'inventory.manage')
ON DUPLICATE KEY UPDATE job_role_key = job_role_key;

-- ---------------------------------------------------------------------
-- 4) Remove job roles outside the spec. Reassign any holders to Generic
--    Administrator (job_role_key NULL = full access) rather than leaving
--    them with a dangling/deleted job role.
-- ---------------------------------------------------------------------
UPDATE users SET job_role_key = NULL
WHERE job_role_key IN ('marketing_manager', 'store_manager', 'hr_manager', 'customer_support', 'data_reports_officer');

-- job_role_permissions rows for these roles are removed automatically via
-- ON DELETE CASCADE when the job_roles row is deleted.
DELETE FROM job_roles WHERE job_role_key IN
    ('marketing_manager', 'store_manager', 'hr_manager', 'customer_support', 'data_reports_officer');

-- ---------------------------------------------------------------------
-- 5) Drop the Campaigns module entirely (spec: "Completely remove...
--    Campaigns and all campaign-related functionality").
-- ---------------------------------------------------------------------
-- The FK on leads.campaign_id has an auto-generated name that varies by
-- install, so it's located dynamically instead of hardcoded.
SET @fk_name := (
    SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads'
      AND COLUMN_NAME = 'campaign_id' AND REFERENCED_TABLE_NAME = 'campaigns'
    LIMIT 1
);
SET @drop_fk_sql := IF(@fk_name IS NOT NULL,
    CONCAT('ALTER TABLE leads DROP FOREIGN KEY `', @fk_name, '`'),
    'SELECT 1');
PREPARE stmt FROM @drop_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE leads DROP COLUMN IF EXISTS campaign_id;

DROP TABLE IF EXISTS campaign_expenses;
DROP TABLE IF EXISTS campaigns;
