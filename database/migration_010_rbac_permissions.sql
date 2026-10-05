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
