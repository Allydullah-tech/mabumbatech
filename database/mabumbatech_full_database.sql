-- =====================================================================
-- MABUMBA TECH — Combined Database (for InfinityFree MySQL import)
-- Auto-combined from: schema.sql + migration_002 through migration_020
-- Generated 2026-09-15
-- =====================================================================
SET FOREIGN_KEY_CHECKS=0;

-- ============================================================
-- SOURCE FILE: schema.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — System Database Schema
-- Motto: Technology. Innovation. Solution.
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    username VARCHAR(60) NOT NULL UNIQUE,
    email VARCHAR(120) NOT NULL UNIQUE,
    phone VARCHAR(30) DEFAULT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('super_admin','admin','staff','customer') NOT NULL DEFAULT 'customer',
    staff_category VARCHAR(40) DEFAULT NULL,      -- matches services.category_key for staff
    position_title VARCHAR(80) DEFAULT NULL,       -- e.g. "Web Developer", "IT Consultant"
    status ENUM('active','suspended') NOT NULL DEFAULT 'active',
    must_reset TINYINT(1) NOT NULL DEFAULT 0,       -- forces password change on next login
    temp_code CHAR(1) DEFAULT NULL,                 -- one digit 1-9 given by admin during reset
    security_question VARCHAR(255) DEFAULT NULL,    -- customer self-service password reset
    security_answer_hash VARCHAR(255) DEFAULT NULL,
    avatar VARCHAR(255) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    last_login DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_key VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,
    icon VARCHAR(60) NOT NULL DEFAULT 'bi-gear',
    description VARCHAR(400) DEFAULT NULL,
    is_broadcast TINYINT(1) NOT NULL DEFAULT 0,     -- 1 = "Other Digital Services" (goes to all staff)
    is_custom TINYINT(1) NOT NULL DEFAULT 0,        -- 1 = added by an admin after installation
    is_active TINYINT(1) NOT NULL DEFAULT 1,        -- 0 = suspended (still shown to customers, marked unavailable)
    sort_order INT NOT NULL DEFAULT 0,
    added_by INT DEFAULT NULL,
    UNIQUE KEY uniq_category_name (category_key, name),
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tracking_code VARCHAR(20) NOT NULL UNIQUE,
    customer_id INT DEFAULT NULL,
    guest_name VARCHAR(120) DEFAULT NULL,
    guest_email VARCHAR(120) DEFAULT NULL,
    guest_phone VARCHAR(30) DEFAULT NULL,
    service_id INT NOT NULL,
    subject VARCHAR(160) NOT NULL,
    message TEXT NOT NULL,
    budget VARCHAR(60) DEFAULT NULL,
    deadline DATE DEFAULT NULL,
    status ENUM('pending','assigned','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
    priority ENUM('normal','urgent') NOT NULL DEFAULT 'normal',
    assigned_by INT DEFAULT NULL,
    assigned_at DATETIME DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    admin_note VARCHAR(400) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- links a request to one or more staff. A normal request has ONE row (direct assignment).
-- a "Other Digital Services" request is broadcast: one row per active staff member.
CREATE TABLE IF NOT EXISTS request_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    staff_id INT NOT NULL,
    is_broadcast TINYINT(1) NOT NULL DEFAULT 0,
    task_status ENUM('new','accepted','in_progress','completed','declined') NOT NULL DEFAULT 'new',
    remark VARCHAR(400) DEFAULT NULL,
    responded_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_request_staff (request_id, staff_id),
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS portfolio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    category_key VARCHAR(40) DEFAULT NULL,
    description VARCHAR(500) DEFAULT NULL,
    client_name VARCHAR(120) DEFAULT NULL,
    image VARCHAR(255) DEFAULT NULL,
    project_url VARCHAR(255) DEFAULT NULL,
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    added_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contact_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(120) NOT NULL,
    phone VARCHAR(30) DEFAULT NULL,
    subject VARCHAR(160) DEFAULT NULL,
    message TEXT NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    action VARCHAR(160) NOT NULL,
    details VARCHAR(400) DEFAULT NULL,
    ip_address VARCHAR(60) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- optional file attachments on a service request (uploaded by the customer, or later by staff/admin)
CREATE TABLE IF NOT EXISTS request_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    uploaded_by INT DEFAULT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_size INT NOT NULL DEFAULT 0,
    mime_type VARCHAR(100) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- question / answer & update thread attached to a service request
CREATE TABLE IF NOT EXISTS request_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    sender_id INT DEFAULT NULL,
    sender_role ENUM('super_admin','admin','staff','customer','system') NOT NULL DEFAULT 'system',
    message TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- in-app + email notification log for every user
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(60) NOT NULL,
    title VARCHAR(160) NOT NULL,
    message VARCHAR(400) DEFAULT NULL,
    link VARCHAR(255) DEFAULT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    email_sent TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- key/value system settings (mail configuration etc.), editable from the admin panel
CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
    setting_value VARCHAR(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO settings (setting_key, setting_value) VALUES
('mail_method', 'php_mail'),
('mail_from_email', 'no-reply@mabumbatech.com'),
('mail_from_name', 'MABUMBA TECH'),
('smtp_host', ''),
('smtp_port', '587'),
('smtp_username', ''),
('smtp_password', ''),
('smtp_secure', 'tls'),
('notify_new_request_admin', '1'),
('notify_status_change_customer', '1')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);

-- default service catalogue
INSERT INTO services (category_key, name, icon, description, is_broadcast, sort_order) VALUES
('web_dev', 'Web Development', 'bi-code-slash', 'Business websites, e-commerce platforms and web applications.', 0, 1),
('app_dev', 'App Development', 'bi-phone', 'Android, iOS and cross-platform mobile applications.', 0, 2),
('software_hardware', 'Software & Hardware Solutions', 'bi-cpu', 'Custom software, system installation, repair and maintenance.', 0, 3),
('it_consultancy', 'IT Consultancy', 'bi-diagram-3', 'Technology planning, systems audit and digital strategy.', 0, 4),
('ai_ml', 'AI/ML Projects', 'bi-cpu-fill', 'Machine learning models, automation and intelligent systems.', 0, 5),
('multimedia', 'Multimedia/Animation Projects', 'bi-film', 'Video editing, animation and multimedia production.', 0, 6),
('graphics', 'Graphics Designing', 'bi-palette', 'Branding, logos, posters and visual identity design.', 0, 7),
('other_services', 'All Other Digital Services', 'bi-grid-3x3-gap', 'Any other digital service request reviewed and assigned by the admin team.', 1, 8)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- departments: admin-manageable list of staff departments (seeded with the original 8)
CREATE TABLE IF NOT EXISTS departments (
    dept_key VARCHAR(60) NOT NULL PRIMARY KEY,
    label VARCHAR(120) NOT NULL,
    icon VARCHAR(60) NOT NULL DEFAULT 'bi-briefcase',
    is_broadcast TINYINT(1) NOT NULL DEFAULT 0,
    is_custom TINYINT(1) NOT NULL DEFAULT 0,
    added_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO departments (dept_key, label, icon, is_broadcast, is_custom) VALUES
('web_dev', 'Web Development', 'bi-code-slash', 0, 0),
('app_dev', 'App Development', 'bi-phone', 0, 0),
('software_hardware', 'Software & Hardware Solutions', 'bi-cpu', 0, 0),
('it_consultancy', 'IT Consultancy', 'bi-diagram-3', 0, 0),
('ai_ml', 'AI/ML Projects', 'bi-cpu-fill', 0, 0),
('multimedia', 'Multimedia/Animation Projects', 'bi-film', 0, 0),
('graphics', 'Graphics Designing', 'bi-palette', 0, 0),
('other_services', 'All Other Digital Services', 'bi-grid-3x3-gap', 1, 0)
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- ============================================================
-- SOURCE FILE: migration_002_security_and_services.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 002
-- Run this ONCE in phpMyAdmin (SQL tab) against your existing database.
-- Adds: customer security questions (forgot-password), and allows admins
-- to add more than one service under the same department.
-- =====================================================================

-- 1) Security question / answer for customer self-service password reset
ALTER TABLE users
  ADD COLUMN security_question VARCHAR(255) DEFAULT NULL AFTER temp_code,
  ADD COLUMN security_answer_hash VARCHAR(255) DEFAULT NULL AFTER security_question;

-- 2) Allow admins to add multiple services under the same department.
--    (category_key was UNIQUE before, limiting each department to one service.)
ALTER TABLE services DROP INDEX category_key;
ALTER TABLE services ADD UNIQUE KEY uniq_category_name (category_key, name);

-- 3) Let admins add brand-new services beyond the original 8, and track who added them.
ALTER TABLE services
  ADD COLUMN is_custom TINYINT(1) NOT NULL DEFAULT 0 AFTER is_broadcast,
  ADD COLUMN added_by INT DEFAULT NULL AFTER sort_order,
  ADD CONSTRAINT fk_services_added_by FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================
-- SOURCE FILE: migration_003_portfolio_safety_net.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 003
-- Run this in phpMyAdmin (SQL tab). Safe to run even if the table already
-- exists — CREATE TABLE IF NOT EXISTS does nothing in that case.
-- =====================================================================

CREATE TABLE IF NOT EXISTS portfolio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    category_key VARCHAR(40) DEFAULT NULL,
    description VARCHAR(500) DEFAULT NULL,
    client_name VARCHAR(120) DEFAULT NULL,
    image VARCHAR(255) DEFAULT NULL,
    project_url VARCHAR(255) DEFAULT NULL,
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    added_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SOURCE FILE: migration_004_departments.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 004
-- Run this in phpMyAdmin (SQL tab). Adds a departments table so admins can
-- create new departments beyond the original 8 — used when adding a new
-- service and when creating a new staff account.
-- =====================================================================

CREATE TABLE IF NOT EXISTS departments (
    dept_key VARCHAR(60) NOT NULL PRIMARY KEY,
    label VARCHAR(120) NOT NULL,
    icon VARCHAR(60) NOT NULL DEFAULT 'bi-briefcase',
    is_broadcast TINYINT(1) NOT NULL DEFAULT 0,
    is_custom TINYINT(1) NOT NULL DEFAULT 0,
    added_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO departments (dept_key, label, icon, is_broadcast, is_custom) VALUES
('web_dev', 'Web Development', 'bi-code-slash', 0, 0),
('app_dev', 'App Development', 'bi-phone', 0, 0),
('software_hardware', 'Software & Hardware Solutions', 'bi-cpu', 0, 0),
('it_consultancy', 'IT Consultancy', 'bi-diagram-3', 0, 0),
('ai_ml', 'AI/ML Projects', 'bi-cpu-fill', 0, 0),
('multimedia', 'Multimedia/Animation Projects', 'bi-film', 0, 0),
('graphics', 'Graphics Designing', 'bi-palette', 0, 0),
('other_services', 'All Other Digital Services', 'bi-grid-3x3-gap', 1, 0)
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- ============================================================
-- SOURCE FILE: migration_005_portfolio_fix.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 005
-- Run this in phpMyAdmin (SQL tab). This definitively fixes the portfolio
-- 500 errors. Safe to run regardless of whether the table currently exists,
-- is missing, or is broken — your Portfolio page is currently showing empty
-- anyway, so there is nothing to lose here.
-- =====================================================================

DROP TABLE IF EXISTS portfolio;

CREATE TABLE portfolio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    category_key VARCHAR(40) DEFAULT NULL,
    description VARCHAR(500) DEFAULT NULL,
    client_name VARCHAR(120) DEFAULT NULL,
    image VARCHAR(255) DEFAULT NULL,
    project_url VARCHAR(255) DEFAULT NULL,
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    added_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SOURCE FILE: migration_006_security_hardening.sql
-- ============================================================
-- MABUMBA TECH — Migration 006: Security hardening
-- Adds brute-force protection storage for login and password-reset (security
-- question) attempts. Safe to re-run; does not touch existing data.

CREATE TABLE IF NOT EXISTS rate_limits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    limit_key VARCHAR(191) NOT NULL,
    attempts INT NOT NULL DEFAULT 1,
    first_attempt_at DATETIME NOT NULL,
    locked_until DATETIME DEFAULT NULL,
    UNIQUE KEY uniq_limit_key (limit_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SOURCE FILE: migration_007_project_management.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 007: Project Management workflow
-- Run this in phpMyAdmin (SQL tab) against your existing database.
-- Purely additive — existing requests keep their current status/data.
-- =====================================================================

-- 1) Extend the request lifecycle: Pending -> Assigned -> In Progress ->
--    Review -> Completed -> Delivered (Cancelled stays a separate exit).
--    Adding enum values is backward compatible; existing rows are untouched.
ALTER TABLE service_requests
  MODIFY COLUMN status ENUM('pending','assigned','in_progress','review','completed','delivered','cancelled')
    NOT NULL DEFAULT 'pending';

-- 2) Progress tracking + a place for notes that are for staff/admin eyes only
--    (separate from admin_note, which is already shown to the customer).
ALTER TABLE service_requests
  ADD COLUMN progress TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER priority,
  ADD COLUMN internal_notes TEXT DEFAULT NULL AFTER admin_note,
  ADD COLUMN delivered_at DATETIME DEFAULT NULL AFTER completed_at;

-- 3) Project milestones — the stages of a project, shown to the customer
--    as their progress timeline.
CREATE TABLE IF NOT EXISTS project_milestones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    title VARCHAR(160) NOT NULL,
    description VARCHAR(400) DEFAULT NULL,
    status ENUM('pending','in_progress','done') NOT NULL DEFAULT 'pending',
    due_date DATE DEFAULT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_by INT DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) Project links — website/demo/staging/etc URLs staff or admins attach to
--    a project. is_customer_visible controls whether the customer sees it;
--    internal links (e.g. a staging server or repo) default to hidden.
CREATE TABLE IF NOT EXISTS project_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    title VARCHAR(120) NOT NULL,
    url VARCHAR(500) NOT NULL,
    link_type ENUM('website','webapp','demo','staging','repository','documentation','other') NOT NULL DEFAULT 'other',
    description VARCHAR(300) DEFAULT NULL,
    is_customer_visible TINYINT(1) NOT NULL DEFAULT 0,
    added_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SOURCE FILE: migration_008_messaging_and_deadlines.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 008: Messaging unread indicators + deadline reminders
-- Run this in phpMyAdmin (SQL tab). Purely additive.
-- =====================================================================

-- Tracks when each user last viewed a request's message thread, so unread
-- counts ("customer has replied", "staff has replied") can be shown in
-- request lists without a separate read-flag column per message.
CREATE TABLE IF NOT EXISTS request_thread_reads (
    request_id INT NOT NULL,
    user_id INT NOT NULL,
    last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (request_id, user_id),
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Prevents the deadline-reminder cron (backend/cron/check-deadlines.php) from
-- notifying the same people about the same deadline every time it runs.
ALTER TABLE service_requests
  ADD COLUMN deadline_reminder_sent TINYINT(1) NOT NULL DEFAULT 0 AFTER deadline;

-- ============================================================
-- SOURCE FILE: migration_009_portfolio_project_link.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 009: Portfolio ↔ Project linking
-- Run this in phpMyAdmin (SQL tab). Purely additive.
-- =====================================================================

-- Lets an admin optionally trace a portfolio showcase item back to the real
-- customer request/project it came from. This is for internal reference only
-- — the public portfolio API never selects or exposes this column or
-- anything from the linked request; the public page only ever shows the
-- admin-entered title/description/client_name/image/url, exactly as before.
ALTER TABLE portfolio
  ADD COLUMN linked_request_id INT DEFAULT NULL AFTER project_url,
  ADD FOREIGN KEY (linked_request_id) REFERENCES service_requests(id) ON DELETE SET NULL;

-- ============================================================
-- SOURCE FILE: migration_010_rbac_permissions.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 010
-- Run this in phpMyAdmin (SQL tab). Adds the permissions/RBAC foundation
-- for the new company-management roles (General Manager, Marketing
-- Manager, Secretary, Accountant, Store Manager, Sales Officer,
-- HR Manager, Customer Support, Data/Reports Officer, ...).
--
-- IMPORTANT — what this migration does NOT do:
-- It does not add the Finance, Inventory, Sales, Marketing or HR
-- *modules* themselves (those tables come with each module as it's
-- built). This migration only adds the permission system those modules
-- will plug into, so every future admin-tier role can be scoped
-- correctly from day one instead of being patched in later.
--
-- Design:
--   - The existing `users.role` ENUM ('super_admin','admin','staff',
--     'customer') is UNCHANGED. It still controls the broad account
--     tier and every existing require_role()/api_require_role() check
--     keeps working exactly as before.
--   - A new `job_role_key` column on `users` gives admin-tier accounts
--     (role = 'admin') a specific job (e.g. 'accountant',
--     'marketing_manager'). It is NULL for super_admin/staff/customer.
--   - `job_role_permissions` is the default permission template for
--     each job role, seeded below from the spec you provided.
--   - `user_permissions` lets a specific admin's access be widened or
--     narrowed beyond their job role's template ("unless explicitly
--     authorized" / "unless permitted" cases from the spec).
--   - super_admin always has full access in code (see permissions.php)
--     and is intentionally NOT represented as rows in these tables.
--
-- The seeded permission grants below are a reasonable FIRST PASS based
-- on the spec's prose descriptions of each role — review and adjust
-- them once the "Manage Roles & Permissions" admin screen exists.
-- =====================================================================

ALTER TABLE users
    ADD COLUMN job_role_key VARCHAR(40) DEFAULT NULL AFTER position_title;

CREATE TABLE IF NOT EXISTS job_roles (
    job_role_key VARCHAR(40) NOT NULL PRIMARY KEY,
    label VARCHAR(120) NOT NULL,
    icon VARCHAR(60) NOT NULL DEFAULT 'bi-person-badge',
    is_custom TINYINT(1) NOT NULL DEFAULT 0,
    added_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions (
    permission_key VARCHAR(60) NOT NULL PRIMARY KEY,
    category VARCHAR(40) NOT NULL,
    label VARCHAR(160) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS job_role_permissions (
    job_role_key VARCHAR(40) NOT NULL,
    permission_key VARCHAR(60) NOT NULL,
    PRIMARY KEY (job_role_key, permission_key),
    FOREIGN KEY (job_role_key) REFERENCES job_roles(job_role_key) ON DELETE CASCADE,
    FOREIGN KEY (permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Per-user overrides. granted=1 adds a permission beyond the job role
-- template; granted=0 revokes a permission the template would give.
CREATE TABLE IF NOT EXISTS user_permissions (
    user_id INT NOT NULL,
    permission_key VARCHAR(60) NOT NULL,
    granted TINYINT(1) NOT NULL DEFAULT 1,
    granted_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, permission_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Job roles (admin-tier positions from the org chart, minus SuperAdmin/
-- CEO, which is its own `role` value and always has full access).
-- ---------------------------------------------------------------------
INSERT INTO job_roles (job_role_key, label, icon) VALUES
('general_manager',      'General Manager / Operations Manager', 'bi-diagram-3'),
('marketing_manager',    'Marketing Manager',                    'bi-megaphone'),
('secretary',            'Secretary / Receptionist',             'bi-journal-text'),
('accountant',           'Accountant / Finance Manager',         'bi-cash-coin'),
('store_manager',        'Store / Inventory Manager',            'bi-box-seam'),
('sales_officer',        'Sales Officer',                        'bi-graph-up-arrow'),
('hr_manager',           'HR Manager',                           'bi-people'),
('customer_support',     'Customer Support',                     'bi-headset'),
('data_reports_officer', 'Data / Reports Officer',               'bi-bar-chart-line')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- ---------------------------------------------------------------------
-- Permissions catalogue.
-- ---------------------------------------------------------------------
INSERT INTO permissions (permission_key, category, label) VALUES
('users.manage',            'system',    'Manage user accounts'),
('roles.manage',            'system',    'Manage roles & permissions'),
('departments.manage',      'system',    'Manage departments'),
('settings.manage',         'system',    'Manage company/mail settings'),
('audit.view',              'system',    'View audit logs'),

('customers.manage',        'customers', 'Manage customer accounts'),
('services.manage',         'services',  'Manage services catalogue'),
('portfolio.manage',        'services',  'Manage portfolio'),
('messages.manage',         'services',  'Manage contact messages'),

('projects.view',           'projects',  'View projects/requests'),
('projects.manage',         'projects',  'Create/assign/manage projects & tasks'),

('finance.view',            'finance',   'View financial data'),
('finance.manage',          'finance',   'Record income/expenses, manage payments & invoices'),
('payroll.view',            'finance',   'View payroll'),
('payroll.manage',          'finance',   'Manage payroll'),
('reports.financial',       'finance',   'View financial reports'),

('inventory.view',          'inventory', 'View products & stock'),
('inventory.manage',        'inventory', 'Manage products, stock, purchases & suppliers'),

('sales.view',              'sales',     'View leads, prospects & sales pipeline'),
('sales.manage',            'sales',     'Manage leads, quotations, orders & sales pipeline'),

('marketing.view',          'marketing', 'View campaigns & leads'),
('marketing.manage',        'marketing', 'Manage campaigns, marketing tasks & expenses'),

('hr.view',                 'hr',        'View employee/HR records'),
('hr.manage',               'hr',        'Manage employees & HR records'),

('appointments.manage',     'admin_ops', 'Manage appointments, meetings & visitors'),
('reports.operational',     'admin_ops', 'View operational reports')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- ---------------------------------------------------------------------
-- Default permission templates per job role — first pass from the spec.
-- Payroll, sensitive financial data, system security and SuperAdmin
-- settings are deliberately withheld unless the spec explicitly grants
-- them, per the "unless explicitly authorized / unless permitted"
-- language for each role.
-- ---------------------------------------------------------------------
INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
-- General Manager / Operations Manager
('general_manager', 'projects.view'),
('general_manager', 'projects.manage'),
('general_manager', 'departments.manage'),
('general_manager', 'reports.operational'),
('general_manager', 'customers.manage'),

-- Marketing Manager
('marketing_manager', 'marketing.view'),
('marketing_manager', 'marketing.manage'),
('marketing_manager', 'sales.view'),
('marketing_manager', 'reports.operational'),

-- Secretary / Receptionist
('secretary', 'appointments.manage'),
('secretary', 'customers.manage'),
('secretary', 'messages.manage'),

-- Accountant / Finance Manager
('accountant', 'finance.view'),
('accountant', 'finance.manage'),
('accountant', 'payroll.view'),
('accountant', 'payroll.manage'),
('accountant', 'reports.financial'),

-- Store / Inventory Manager
('store_manager', 'inventory.view'),
('store_manager', 'inventory.manage'),
('store_manager', 'reports.operational'),

-- Sales Officer
('sales_officer', 'sales.view'),
('sales_officer', 'sales.manage'),
('sales_officer', 'customers.manage'),

-- HR Manager
('hr_manager', 'hr.view'),
('hr_manager', 'hr.manage'),

-- Customer Support
('customer_support', 'customers.manage'),
('customer_support', 'messages.manage'),

-- Data / Reports Officer (view-only across the board — spec for this
-- role was cut off in the document; scoped conservatively pending the
-- missing pages)
('data_reports_officer', 'reports.operational'),
('data_reports_officer', 'reports.financial'),
('data_reports_officer', 'audit.view')
ON DUPLICATE KEY UPDATE job_role_key = VALUES(job_role_key);

-- ============================================================
-- SOURCE FILE: migration_011_project_team.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 011
-- Run this in phpMyAdmin (SQL tab). Purely additive.
--
-- Context: `request_assignments` already exists and already supports
-- multiple staff per request (broadcast model) with an accept/decline
-- task workflow. That table is untouched here — it's specifically for
-- the people DELIVERING the work.
--
-- What's missing is the broader need from spec §16: a Sales Officer,
-- Marketing Manager, Accountant or Operations Manager attached to the
-- SAME project for visibility (e.g. the Accountant who invoices it, the
-- Sales Officer who sold it) without being a delivery task-taker. This
-- table adds exactly that, and nothing else, so `service_requests`
-- fully becomes the single "Project" entity from the spec instead of a
-- new parallel projects table being introduced.
-- =====================================================================

CREATE TABLE IF NOT EXISTS project_team (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    user_id INT NOT NULL,
    role_on_project ENUM('sales','marketing','accounting','oversight','support','other') NOT NULL DEFAULT 'other',
    added_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_request_user (request_id, user_id),
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SOURCE FILE: migration_012_sales_crm.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 012: Sales / CRM foundation
-- Run this in phpMyAdmin (SQL tab). Purely additive.
--
-- Design notes (read before building the UI on top of this):
--
-- 1) LEADS ARE PRE-REQUEST CUSTOMERS, PER THE EARLIER DECISION.
--    A lead is NOT a duplicate customer record. `leads.converted_customer_id`
--    links to `users.id` only once/if the person registers a real account,
--    exactly like `service_requests.guest_email` already lets someone submit
--    a request without an account. Most leads will simply carry their own
--    contact info (name/email/phone) until they convert.
--
-- 2) NO SEPARATE "ORDERS" TABLE.
--    The spec asks for Leads -> Quotation -> Negotiation -> Won, and
--    separately for an "orders" concept. Introducing an orders table would
--    create a second "project-ish" record alongside `service_requests`,
--    which is exactly the duplication flagged earlier. Instead: when a lead
--    is won, `leads.converted_request_id` points at the real
--    `service_requests` row created for it (see crm.php: convert_lead_won()).
--    That service_request IS the order/project — one entity, not two.
--
-- 3) QUOTATIONS can attach to a lead (pre-sale) or later to an existing
--    customer directly (e.g. upsell/renewal quote for someone who's already
--    a customer) — hence both lead_id and customer_id are nullable FKs.
-- =====================================================================

CREATE TABLE IF NOT EXISTS campaigns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    channel ENUM('social_media','email','sms','event','referral_program','search_ads','other') NOT NULL DEFAULT 'other',
    status ENUM('planned','active','paused','completed') NOT NULL DEFAULT 'planned',
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL,
    budget DECIMAL(12,2) DEFAULT NULL,
    description VARCHAR(500) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS campaign_expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campaign_id INT NOT NULL,
    description VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    spent_at DATE NOT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    company_name VARCHAR(160) DEFAULT NULL,
    email VARCHAR(120) DEFAULT NULL,
    phone VARCHAR(30) DEFAULT NULL,
    source ENUM('website_contact','campaign','referral','manual','other') NOT NULL DEFAULT 'manual',
    campaign_id INT DEFAULT NULL,
    requested_service_id INT DEFAULT NULL,
    status ENUM('new','contacted','qualified','quotation','negotiation','won','lost') NOT NULL DEFAULT 'new',
    assigned_to INT DEFAULT NULL,                    -- Sales Officer
    converted_customer_id INT DEFAULT NULL,          -- set once/if a real account exists
    converted_request_id INT DEFAULT NULL,           -- set when won (the resulting project)
    lost_reason VARCHAR(255) DEFAULT NULL,
    created_by INT DEFAULT NULL,                     -- NULL = came in from the public site itself
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
    FOREIGN KEY (requested_service_id) REFERENCES services(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (converted_customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (converted_request_id) REFERENCES service_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Timeline: notes, calls, emails, meetings, scheduled follow-ups, and an
-- automatic entry every time `status` changes (so the pipeline history is
-- always reconstructable, not just the current status).
CREATE TABLE IF NOT EXISTS lead_activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lead_id INT NOT NULL,
    user_id INT DEFAULT NULL,
    activity_type ENUM('note','call','email','meeting','follow_up','status_change') NOT NULL DEFAULT 'note',
    description VARCHAR(500) DEFAULT NULL,
    follow_up_at DATETIME DEFAULT NULL,
    old_status VARCHAR(20) DEFAULT NULL,
    new_status VARCHAR(20) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quote_code VARCHAR(20) NOT NULL UNIQUE,
    lead_id INT DEFAULT NULL,
    customer_id INT DEFAULT NULL,
    service_id INT DEFAULT NULL,
    title VARCHAR(160) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    valid_until DATE DEFAULT NULL,
    status ENUM('draft','sent','accepted','rejected','expired') NOT NULL DEFAULT 'draft',
    notes VARCHAR(500) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Links the resulting project back to the quotation that sold it, so a
-- project's price/scope traces back to what was actually agreed.
ALTER TABLE service_requests
    ADD COLUMN quotation_id INT DEFAULT NULL AFTER service_id,
    ADD CONSTRAINT fk_request_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL;

-- ============================================================
-- SOURCE FILE: migration_013_permission_fixups.sql
-- ============================================================
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

-- ============================================================
-- SOURCE FILE: migration_014_finance.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 014: Finance foundation
-- Run this in phpMyAdmin (SQL tab). Purely additive.
--
-- Design notes:
--
-- 1) ONE LEDGER, NOT FIVE FLAT TABLES.
--    The spec lists "record income / record expenses / manage payments /
--    manage receipts" as if they're separate things. They're not — they're
--    all movements of money. `finance_transactions` is the single ledger
--    every financial report (revenue, expenses, profit/loss, cash flow)
--    is computed from. This is the fix for the "no ledger concept" gap
--    flagged earlier: one source of truth instead of numbers that can
--    silently drift out of sync across tables.
--
-- 2) INVOICES CLOSE THE LOOP WITH SALES/CRM.
--    `invoices.quotation_id` and `invoices.request_id` connect directly
--    to the Sales module built earlier. A won lead's quotation becomes
--    an invoice; payments against that invoice are transactions in the
--    same ledger. Nothing new is invented to represent "an order."
--
-- 3) PAYROLL IS DELIBERATELY MINIMAL.
--    A `payroll_records` table (who, which month, gross/net, paid or
--    not) is enough to satisfy "manage payroll" for now. A full HR
--    module (leave, attendance, contracts) is separate, later work —
--    this only covers the Accountant's side: paying people and it
--    showing up in the ledger as an expense.
-- =====================================================================

CREATE TABLE IF NOT EXISTS finance_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('income','expense') NOT NULL,
    category VARCHAR(60) NOT NULL,          -- e.g. project_payment, salary, rent, utilities, marketing, supplies, other
    amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('cash','bank_transfer','mobile_money','card','other') NOT NULL DEFAULT 'other',
    transaction_date DATE NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    customer_id INT DEFAULT NULL,           -- who paid (income) — for the customer debt/history view
    request_id INT DEFAULT NULL,            -- which project this relates to
    invoice_id INT DEFAULT NULL,            -- which invoice this payment settles (income only)
    payroll_id INT DEFAULT NULL,            -- which payroll record this expense pays (expense only)
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_code VARCHAR(20) NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    request_id INT DEFAULT NULL,
    quotation_id INT DEFAULT NULL,
    title VARCHAR(160) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
    status ENUM('unpaid','partial','paid','overdue','cancelled') NOT NULL DEFAULT 'unpaid',
    due_date DATE DEFAULT NULL,
    issued_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
    FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE finance_transactions
    ADD CONSTRAINT fk_txn_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS payroll_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    period_month DATE NOT NULL,             -- always the 1st of the month, e.g. 2026-09-01
    gross_amount DECIMAL(12,2) NOT NULL,
    deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL,
    status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
    paid_at DATETIME DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_period (user_id, period_month),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE finance_transactions
    ADD CONSTRAINT fk_txn_payroll FOREIGN KEY (payroll_id) REFERENCES payroll_records(id) ON DELETE SET NULL;

-- ============================================================
-- SOURCE FILE: migration_015_support_tickets.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 015: Support Tickets
-- Run this in phpMyAdmin (SQL tab), after 010-014. Purely additive.
--
-- Design note: `request_messages`/`request_attachments` already do
-- threaded messaging + attachments for projects, but both have a NOT NULL
-- foreign key straight to `service_requests` — not safely reusable as a
-- shared/polymorphic table without altering two live tables everything
-- else depends on. `ticket_messages`/`ticket_attachments` mirror that same
-- shape and the same validation conventions instead (see tickets.php).
-- =====================================================================

CREATE TABLE IF NOT EXISTS support_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_code VARCHAR(20) NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    request_id INT DEFAULT NULL,
    subject VARCHAR(200) NOT NULL,
    category ENUM('technical_issue','website_issue','mobile_app_issue','software_issue','hardware_issue','payment_issue','project_issue','general_inquiry','complaint','other') NOT NULL DEFAULT 'general_inquiry',
    priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
    status ENUM('open','assigned','in_progress','waiting_customer','escalated','resolved','closed') NOT NULL DEFAULT 'open',
    assigned_to INT DEFAULT NULL,
    first_response_at DATETIME DEFAULT NULL,
    resolved_at DATETIME DEFAULT NULL,
    closed_at DATETIME DEFAULT NULL,
    reopened_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    sender_id INT DEFAULT NULL,
    sender_role ENUM('super_admin','admin','staff','customer','system') NOT NULL DEFAULT 'system',
    message TEXT NOT NULL,
    is_internal TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    uploaded_by INT DEFAULT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_size INT NOT NULL DEFAULT 0,
    mime_type VARCHAR(100) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_thread_reads (
    ticket_id INT NOT NULL,
    user_id INT NOT NULL,
    last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id, user_id),
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO permissions (permission_key, category, label) VALUES
('tickets.view',   'support', 'View support tickets'),
('tickets.manage', 'support', 'Manage and respond to support tickets')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('customer_support', 'tickets.view'),
('customer_support', 'tickets.manage')
ON DUPLICATE KEY UPDATE job_role_key = VALUES(job_role_key);

-- ============================================================
-- SOURCE FILE: migration_016_inventory.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 016: Inventory
-- Run this in phpMyAdmin (SQL tab), after 010-015. Purely additive.
--
-- Design notes:
--
-- 1) PARENT PRODUCT / TYPE STRUCTURE, EXACTLY AS SPECIFIED.
--    `products` is the parent (e.g. "Pen"). `product_types` is the actual
--    stockable, sellable thing (e.g. "Obama Pen - Black") with its own
--    buying/selling price, unit, quantity and minimum stock level. The
--    parent's "combined quantity" is a SUM over its types — computed, not
--    stored, so it can never drift from the real numbers.
--
-- 2) ONE STOCK LEDGER, SAME PRINCIPLE AS FINANCE.
--    `product_types.quantity` is never edited directly by any endpoint.
--    Every change — a purchase arriving, a sale, a damage, a manual
--    adjustment — is a row in `stock_movements`, and quantity is updated
--    atomically alongside it (see inventory.php: record_stock_movement()).
--    This is the same fix as the finance ledger: one source of truth
--    instead of a number that can silently drift from what actually
--    happened.
--
-- 3) NO SEPARATE "DAMAGES" OR "LOW STOCK ALERTS" TABLES.
--    A damage is just a stock_movement with movement_type='damage'. A
--    low-stock alert is just `quantity <= minimum_stock_level`, computed
--    on read. Both were explicitly listed in the spec as if they need
--    their own tables — they don't; that's the "unnecessary duplication"
--    the spec itself warns against in §33.
-- =====================================================================

CREATE TABLE IF NOT EXISTS product_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT DEFAULT NULL,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(500) DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,               -- e.g. "Obama Pen - Black"
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    buying_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    minimum_selling_price DECIMAL(12,2) DEFAULT NULL,
    quantity INT NOT NULL DEFAULT 0,          -- maintained ONLY via stock_movements
    minimum_stock_level INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(120) DEFAULT NULL,
    phone VARCHAR(30) DEFAULT NULL,
    email VARCHAR(120) DEFAULT NULL,
    address VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_code VARCHAR(20) NOT NULL UNIQUE,
    supplier_id INT DEFAULT NULL,
    purchase_date DATE NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes VARCHAR(255) DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    product_type_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_cost DECIMAL(12,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (product_type_id) REFERENCES product_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_type_id INT NOT NULL,
    movement_type ENUM('purchase','sale','damage','adjustment_in','adjustment_out') NOT NULL,
    quantity INT NOT NULL,                    -- always positive; direction comes from movement_type
    reference_type VARCHAR(30) DEFAULT NULL,  -- e.g. 'purchase'
    reference_id INT DEFAULT NULL,            -- e.g. purchases.id
    notes VARCHAR(255) DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_type_id) REFERENCES product_types(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SOURCE FILE: migration_017_hr.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 017: HR foundation
-- Run this in phpMyAdmin (SQL tab), after 010-016. Purely additive.
--
-- Honesty note: the spec's HR Manager section was cut off mid-sentence
-- before listing its Functions — there was no "Functions" list to build
-- against, unlike every other module so far. What's here is a reasonable,
-- conservatively-scoped HR foundation (employee directory fields + leave
-- requests) based on what the Dashboard section did specify (total/
-- active/new/on-leave employee counts) and ordinary HR practice — not a
-- literal implementation of a spec that didn't fully exist. Attendance
-- tracking and a formal performance-review system are deliberately NOT
-- included: they're substantial subsystems on their own and nothing in
-- the available spec asked for them specifically.
--
-- Design notes:
--
-- 1) `employment_status` is a NEW, separate column from the existing
--    `status` column. `status` already means "can this account log in"
--    (active/suspended) — conflating that with "is this person currently
--    employed" would mean suspending someone's login also (wrongly)
--    implies they've left the company, or vice versa.
--
-- 2) "ON LEAVE" IS COMPUTED, NOT STORED.
--    There's no `is_on_leave` flag to toggle and forget. Whether someone
--    is on leave today is derived from an approved leave_requests row
--    covering today's date (see hr.php: employees_on_leave_today()) —
--    same ledger principle as finance/inventory: one source of truth.
-- =====================================================================

ALTER TABLE users
    ADD COLUMN hire_date DATE DEFAULT NULL AFTER job_role_key,
    ADD COLUMN employment_status ENUM('active','terminated') NOT NULL DEFAULT 'active' AFTER hire_date;

CREATE TABLE IF NOT EXISTS leave_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    leave_type ENUM('annual','sick','unpaid','maternity_paternity','other') NOT NULL DEFAULT 'annual',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(400) DEFAULT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    approved_by INT DEFAULT NULL,
    decision_note VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SOURCE FILE: migration_018_team_profiles.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 018: Public team profiles
-- Run this in phpMyAdmin (SQL tab), after 010-017. Purely additive.
--
-- Off by default (`is_public_profile = 0`) for every existing account —
-- nobody's photo, name, or position appears on the public Team page
-- unless HR/admin explicitly turns it on for that person. This matches
-- the spec's own instruction not to expose private employee information.
-- =====================================================================

ALTER TABLE users
    ADD COLUMN is_public_profile TINYINT(1) NOT NULL DEFAULT 0 AFTER avatar,
    ADD COLUMN public_bio VARCHAR(300) DEFAULT NULL AFTER is_public_profile,
    ADD COLUMN public_skills VARCHAR(300) DEFAULT NULL AFTER public_bio;

-- ============================================================
-- SOURCE FILE: migration_019_portfolio_case_study.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 019: Portfolio case-study fields
-- Run this in phpMyAdmin (SQL tab), after 010-018. Purely additive.
--
-- These are empty until someone fills them in — no defaults invented.
-- =====================================================================

ALTER TABLE portfolio
    ADD COLUMN technologies VARCHAR(300) DEFAULT NULL AFTER description,
    ADD COLUMN project_outcome VARCHAR(500) DEFAULT NULL AFTER technologies,
    ADD COLUMN completion_date DATE DEFAULT NULL AFTER project_outcome;

-- ============================================================
-- SOURCE FILE: migration_020_rbac_hardening.sql
-- ============================================================
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

-- ============================================================
-- SOURCE FILE: migration_024_admin_password_reset.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,       -- sha256(raw token) — raw token only ever exists in the emailed link
    expires_at DATETIME NOT NULL,
    used_at DATETIME DEFAULT NULL,
    requested_ip VARCHAR(45) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_password_resets_token_hash (token_hash),
    INDEX idx_password_resets_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SOURCE FILE: migration_025_inventory_categories.sql
-- ============================================================
INSERT IGNORE INTO product_categories (name) VALUES
    ('Laptops'),
    ('Desktops'),
    ('Materials / Equipment');

-- ============================================================
-- SOURCE FILE: migration_026_sales.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_code VARCHAR(20) NOT NULL UNIQUE,
    product_type_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    unit_cost DECIMAL(12,2) NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    total_cost DECIMAL(12,2) NOT NULL,
    profit DECIMAL(12,2) NOT NULL,
    notes VARCHAR(255) DEFAULT NULL,
    sold_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_type_id) REFERENCES product_types(id) ON DELETE RESTRICT,
    FOREIGN KEY (sold_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_inventory_sales_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO permissions (permission_key, category, label) VALUES
('inventory.sell', 'inventory', 'Record product sales')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('sales_officer', 'inventory.sell')
ON DUPLICATE KEY UPDATE job_role_key = VALUES(job_role_key);

-- ============================================================
-- SOURCE FILE: migration_027_email_queue.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS email_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    to_email VARCHAR(190) NOT NULL,
    to_name VARCHAR(150) DEFAULT '',
    subject VARCHAR(255) NOT NULL,
    body_html MEDIUMTEXT NOT NULL,
    status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    last_error VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME DEFAULT NULL,
    INDEX idx_email_queue_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SOURCE FILE: migration_028_contact_to_lead.sql
-- ============================================================
ALTER TABLE contact_messages
    ADD COLUMN converted_to_lead_id INT DEFAULT NULL AFTER is_read,
    ADD FOREIGN KEY (converted_to_lead_id) REFERENCES leads(id) ON DELETE SET NULL;

-- ============================================================
-- SOURCE FILE: migration_029_sales_damage_campaign_sources.sql
-- ============================================================
-- =====================================================================
-- MABUMBA TECH — Migration 029: Multi-item sales, damage-as-loss,
--                Customer sources & public campaigns
-- Run this in phpMyAdmin (SQL tab), after 001-028. Purely additive.
--
-- 1) MULTI-ITEM SALES. One customer purchase can now contain several
--    products. Each product is still one row in `inventory_sales`; the
--    rows of one purchase share a `receipt_code`. Old rows are given
--    their own sale_code as receipt_code so nothing breaks.
--
-- 2) DAMAGE = LOSS. From now on every damage recorded in Inventory also
--    posts an EXPENSE to the finance ledger (category 'inventory_damage',
--    amount = quantity x buying price). That is what makes damages count
--    as a loss everywhere expenses are counted (Finance, Reports, net
--    profit). The INSERT below back-fills damages recorded before this
--    migration (safe to re-run: it skips ones already posted).
--
-- 3) CUSTOMER SOURCES. leads.source gets more options (social media,
--    advertisement, own search, walk-in, phone call, email) plus a free
--    text `source_detail` (which ad / who referred) and `message`.
--
-- 4) PUBLIC CAMPAIGNS. A campaign can be shown on the website landing
--    page (`is_public`) with its own `headline`; customers who show
--    interest become leads attributed to that campaign.
-- =====================================================================

-- 1) multi-item sales ---------------------------------------------------
ALTER TABLE inventory_sales
    ADD COLUMN receipt_code VARCHAR(20) DEFAULT NULL AFTER sale_code,
    ADD INDEX idx_inventory_sales_receipt (receipt_code);

UPDATE inventory_sales SET receipt_code = sale_code WHERE receipt_code IS NULL;

-- 2) damage posts a loss to the ledger ---------------------------------
INSERT INTO finance_transactions (type, category, amount, payment_method, transaction_date, description, recorded_by)
SELECT 'expense', 'inventory_damage', ROUND(sm.quantity * pt.buying_price, 2), 'other', DATE(sm.created_at),
       LEFT(CONCAT('Damaged stock #DMG', sm.id, ': ', p.name, ' - ', pt.name, ' (x', sm.quantity, ')'), 255),
       sm.recorded_by
FROM stock_movements sm
JOIN product_types pt ON pt.id = sm.product_type_id
JOIN products p ON p.id = pt.product_id
WHERE sm.movement_type = 'damage'
  AND sm.quantity * pt.buying_price > 0
  AND NOT EXISTS (
      SELECT 1 FROM finance_transactions ft
      WHERE ft.category = 'inventory_damage'
        AND ft.description LIKE CONCAT('Damaged stock #DMG', sm.id, ':%')
  );

-- 3) customer sources ---------------------------------------------------
ALTER TABLE leads
    MODIFY COLUMN source ENUM('website_contact','campaign','referral','manual','other',
                              'social_media','advertisement','own_search','walk_in','phone_call','email')
        NOT NULL DEFAULT 'manual',
    ADD COLUMN source_detail VARCHAR(160) DEFAULT NULL AFTER campaign_id,
    ADD COLUMN message VARCHAR(500) DEFAULT NULL AFTER source_detail,
    ADD INDEX idx_leads_source (source),
    ADD INDEX idx_leads_phone (phone);

-- 4) public campaigns ---------------------------------------------------
ALTER TABLE campaigns
    ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
    ADD COLUMN headline VARCHAR(160) DEFAULT NULL AFTER is_public;

SET FOREIGN_KEY_CHECKS=1;
