-- =====================================================================
-- MABUMBA TECH - Complete database (single file import)
-- Target: InfinityFree MySQL (phpMyAdmin > Import)
--
-- Built from: database/schema.sql + migration_006 ... migration_045
-- (migrations 002, 003, 004, 005 and 022 are already part of schema.sql,
-- so they are not repeated here).
--
-- USE ON AN EMPTY DATABASE ONLY. It creates 51 tables, the default
-- services, departments, job roles, permissions and settings, and one
-- first Super Administrator account (last section of this file).
-- Do NOT upload this file into htdocs / your website folder.
-- =====================================================================

-- ---------------------------------------------------------------------
-- schema
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    username VARCHAR(60) NOT NULL UNIQUE,
    email VARCHAR(120) NOT NULL UNIQUE,
    phone VARCHAR(30) DEFAULT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('super_admin','admin','staff','customer') NOT NULL DEFAULT 'customer',
    staff_category VARCHAR(40) DEFAULT NULL,
    position_title VARCHAR(80) DEFAULT NULL,
    status ENUM('active','suspended') NOT NULL DEFAULT 'active',
    must_reset TINYINT(1) NOT NULL DEFAULT 0,
    temp_code CHAR(1) DEFAULT NULL,
    security_question VARCHAR(255) DEFAULT NULL,
    security_answer_hash VARCHAR(255) DEFAULT NULL,
    terms_accepted_at DATETIME DEFAULT NULL,
    terms_version VARCHAR(20) DEFAULT NULL,
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
    is_broadcast TINYINT(1) NOT NULL DEFAULT 0,
    is_custom TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
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
    terms_accepted_at DATETIME DEFAULT NULL,
    terms_version VARCHAR(20) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

-- ---------------------------------------------------------------------
-- migration_006_security_hardening
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    limit_key VARCHAR(191) NOT NULL,
    attempts INT NOT NULL DEFAULT 1,
    first_attempt_at DATETIME NOT NULL,
    locked_until DATETIME DEFAULT NULL,
    UNIQUE KEY uniq_limit_key (limit_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- migration_007_project_management
-- ---------------------------------------------------------------------
ALTER TABLE service_requests
  MODIFY COLUMN status ENUM('pending','assigned','in_progress','review','completed','delivered','cancelled')
    NOT NULL DEFAULT 'pending';

ALTER TABLE service_requests
  ADD COLUMN progress TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER priority,
  ADD COLUMN internal_notes TEXT DEFAULT NULL AFTER admin_note,
  ADD COLUMN delivered_at DATETIME DEFAULT NULL AFTER completed_at;

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

-- ---------------------------------------------------------------------
-- migration_008_messaging_and_deadlines
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS request_thread_reads (
    request_id INT NOT NULL,
    user_id INT NOT NULL,
    last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (request_id, user_id),
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE service_requests
  ADD COLUMN deadline_reminder_sent TINYINT(1) NOT NULL DEFAULT 0 AFTER deadline;

-- ---------------------------------------------------------------------
-- migration_009_portfolio_project_link
-- ---------------------------------------------------------------------
ALTER TABLE portfolio
  ADD COLUMN linked_request_id INT DEFAULT NULL AFTER project_url,
  ADD FOREIGN KEY (linked_request_id) REFERENCES service_requests(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- migration_010_rbac_permissions
-- ---------------------------------------------------------------------
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

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('general_manager', 'projects.view'),
('general_manager', 'projects.manage'),
('general_manager', 'departments.manage'),
('general_manager', 'reports.operational'),
('general_manager', 'customers.manage'),
('marketing_manager', 'marketing.view'),
('marketing_manager', 'marketing.manage'),
('marketing_manager', 'sales.view'),
('marketing_manager', 'reports.operational'),
('secretary', 'appointments.manage'),
('secretary', 'customers.manage'),
('secretary', 'messages.manage'),
('accountant', 'finance.view'),
('accountant', 'finance.manage'),
('accountant', 'payroll.view'),
('accountant', 'payroll.manage'),
('accountant', 'reports.financial'),
('store_manager', 'inventory.view'),
('store_manager', 'inventory.manage'),
('store_manager', 'reports.operational'),
('sales_officer', 'sales.view'),
('sales_officer', 'sales.manage'),
('sales_officer', 'customers.manage'),
('hr_manager', 'hr.view'),
('hr_manager', 'hr.manage'),
('customer_support', 'customers.manage'),
('customer_support', 'messages.manage'),
('data_reports_officer', 'reports.operational'),
('data_reports_officer', 'reports.financial'),
('data_reports_officer', 'audit.view')
ON DUPLICATE KEY UPDATE job_role_key = VALUES(job_role_key);

-- ---------------------------------------------------------------------
-- migration_011_project_team
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- migration_012_sales_crm
-- ---------------------------------------------------------------------
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
    assigned_to INT DEFAULT NULL,
    converted_customer_id INT DEFAULT NULL,
    converted_request_id INT DEFAULT NULL,
    lost_reason VARCHAR(255) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
    FOREIGN KEY (requested_service_id) REFERENCES services(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (converted_customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (converted_request_id) REFERENCES service_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

ALTER TABLE service_requests
    ADD COLUMN quotation_id INT DEFAULT NULL AFTER service_id,
    ADD CONSTRAINT fk_request_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- migration_013_permission_fixups
-- ---------------------------------------------------------------------
INSERT INTO permissions (permission_key, category, label) VALUES
('employees.manage', 'hr', 'Create and manage Service Staff accounts')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('marketing_manager', 'portfolio.manage'),
('general_manager',   'employees.manage')
ON DUPLICATE KEY UPDATE job_role_key = VALUES(job_role_key);

-- ---------------------------------------------------------------------
-- migration_014_finance
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('income','expense') NOT NULL,
    category VARCHAR(60) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('cash','bank_transfer','mobile_money','card','other') NOT NULL DEFAULT 'other',
    transaction_date DATE NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    customer_id INT DEFAULT NULL,
    request_id INT DEFAULT NULL,
    invoice_id INT DEFAULT NULL,
    payroll_id INT DEFAULT NULL,
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
    period_month DATE NOT NULL,
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

-- ---------------------------------------------------------------------
-- migration_015_support_tickets
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- migration_016_inventory
-- ---------------------------------------------------------------------
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
    name VARCHAR(150) NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    buying_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    minimum_selling_price DECIMAL(12,2) DEFAULT NULL,
    quantity INT NOT NULL DEFAULT 0,
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
    quantity INT NOT NULL,
    reference_type VARCHAR(30) DEFAULT NULL,
    reference_id INT DEFAULT NULL,
    notes VARCHAR(255) DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_type_id) REFERENCES product_types(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- migration_017_hr
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- migration_018_team_profiles
-- ---------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN is_public_profile TINYINT(1) NOT NULL DEFAULT 0 AFTER avatar,
    ADD COLUMN public_bio VARCHAR(300) DEFAULT NULL AFTER is_public_profile,
    ADD COLUMN public_skills VARCHAR(300) DEFAULT NULL AFTER public_bio;

-- ---------------------------------------------------------------------
-- migration_019_portfolio_case_study
-- ---------------------------------------------------------------------
ALTER TABLE portfolio
    ADD COLUMN technologies VARCHAR(300) DEFAULT NULL AFTER description,
    ADD COLUMN project_outcome VARCHAR(500) DEFAULT NULL AFTER technologies,
    ADD COLUMN completion_date DATE DEFAULT NULL AFTER project_outcome;

-- ---------------------------------------------------------------------
-- migration_020_rbac_hardening
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- migration_021_message_edit_delete
-- ---------------------------------------------------------------------
ALTER TABLE request_messages
    ADD COLUMN edited_at DATETIME NULL DEFAULT NULL AFTER message,
    ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER edited_at;

-- ---------------------------------------------------------------------
-- migration_023_marketing_customer_acquisition
-- ---------------------------------------------------------------------
INSERT INTO job_roles (job_role_key, label, icon) VALUES
('marketing_officer', 'Marketing Officer', 'bi-person-lines-fill')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO permissions (permission_key, category, label) VALUES
('marketing.acquisition.manage', 'marketing', 'Review, assign & forward customer-acquisition requests')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('marketing_officer', 'marketing.view'),
('marketing_officer', 'marketing.manage'),
('marketing_manager', 'marketing.acquisition.manage'),
('sales_officer',     'marketing.view'),
('general_manager',   'marketing.view'),
('accountant',        'marketing.view')
ON DUPLICATE KEY UPDATE job_role_key = VALUES(job_role_key);

ALTER TABLE service_requests
    MODIFY COLUMN service_id INT NULL,
    ADD COLUMN request_type ENUM('service','product') NOT NULL DEFAULT 'service' AFTER service_id,
    ADD COLUMN product_type_id INT DEFAULT NULL AFTER request_type,
    ADD COLUMN product_name VARCHAR(160) DEFAULT NULL AFTER product_type_id,
    ADD COLUMN quantity INT DEFAULT NULL AFTER product_name,
    ADD COLUMN guest_location VARCHAR(255) DEFAULT NULL AFTER guest_phone,
    ADD COLUMN additional_notes TEXT DEFAULT NULL AFTER message,
    ADD COLUMN source ENUM('customer','marketing_officer') NOT NULL DEFAULT 'customer' AFTER priority,
    ADD COLUMN created_by_staff_id INT DEFAULT NULL AFTER source,
    ADD COLUMN acquisition_status ENUM('pending_review','reviewed','forwarded') DEFAULT NULL AFTER created_by_staff_id,
    ADD CONSTRAINT fk_request_product_type FOREIGN KEY (product_type_id) REFERENCES product_types(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_request_created_by_staff FOREIGN KEY (created_by_staff_id) REFERENCES users(id) ON DELETE SET NULL,
    ADD INDEX idx_service_requests_source (source),
    ADD INDEX idx_service_requests_created_by_staff (created_by_staff_id);

CREATE TABLE IF NOT EXISTS acquisition_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    user_id INT DEFAULT NULL,
    action VARCHAR(40) NOT NULL,
    note VARCHAR(500) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- migration_024_admin_password_reset
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME DEFAULT NULL,
    requested_ip VARCHAR(45) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_password_resets_token_hash (token_hash),
    INDEX idx_password_resets_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- migration_025_inventory_categories
-- ---------------------------------------------------------------------
INSERT IGNORE INTO product_categories (name) VALUES
    ('Laptops'),
    ('Desktops'),
    ('Materials / Equipment');

UPDATE products p
JOIN product_categories old_c ON old_c.id = p.category_id
SET p.category_id = (SELECT id FROM product_categories WHERE name = 'Materials / Equipment')
WHERE old_c.name NOT IN ('Laptops', 'Desktops', 'Materials / Equipment');

DELETE FROM product_categories WHERE name NOT IN ('Laptops', 'Desktops', 'Materials / Equipment');

-- ---------------------------------------------------------------------
-- migration_026_sales
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- migration_027_email_queue
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- migration_028_contact_to_lead
-- ---------------------------------------------------------------------
ALTER TABLE contact_messages
    ADD COLUMN converted_to_lead_id INT DEFAULT NULL AFTER is_read,
    ADD FOREIGN KEY (converted_to_lead_id) REFERENCES leads(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- migration_029_sales_damage_campaign_sources
-- ---------------------------------------------------------------------
ALTER TABLE inventory_sales
    ADD COLUMN receipt_code VARCHAR(20) DEFAULT NULL AFTER sale_code,
    ADD INDEX idx_inventory_sales_receipt (receipt_code);

UPDATE inventory_sales SET receipt_code = sale_code WHERE receipt_code IS NULL;

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

ALTER TABLE leads
    MODIFY COLUMN source ENUM('website_contact','campaign','referral','manual','other',
                              'social_media','advertisement','own_search','walk_in','phone_call','email')
        NOT NULL DEFAULT 'manual',
    ADD COLUMN source_detail VARCHAR(160) DEFAULT NULL AFTER campaign_id,
    ADD COLUMN message VARCHAR(500) DEFAULT NULL AFTER source_detail,
    ADD INDEX idx_leads_source (source),
    ADD INDEX idx_leads_phone (phone);

ALTER TABLE campaigns
    ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
    ADD COLUMN headline VARCHAR(160) DEFAULT NULL AFTER is_public;

-- ---------------------------------------------------------------------
-- migration_030_system_restructure
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

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('marketing_officer', 'budget_requests.create')
ON DUPLICATE KEY UPDATE job_role_key = job_role_key;

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('general_manager', 'budget_requests.manage')
ON DUPLICATE KEY UPDATE job_role_key = job_role_key;

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

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('sales_officer', 'inventory.view'),
('sales_officer', 'inventory.manage')
ON DUPLICATE KEY UPDATE job_role_key = job_role_key;

UPDATE users SET job_role_key = NULL
WHERE job_role_key IN ('marketing_manager', 'store_manager', 'hr_manager', 'customer_support', 'data_reports_officer');

DELETE FROM job_roles WHERE job_role_key IN
    ('marketing_manager', 'store_manager', 'hr_manager', 'customer_support', 'data_reports_officer');

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

ALTER TABLE leads DROP COLUMN campaign_id;

DROP TABLE IF EXISTS campaign_expenses;

DROP TABLE IF EXISTS campaigns;

-- ---------------------------------------------------------------------
-- migration_031_remove_customer_accounts
-- ---------------------------------------------------------------------
DELETE FROM job_role_permissions WHERE permission_key = 'customers.manage';

DELETE FROM permissions WHERE permission_key = 'customers.manage';

-- ---------------------------------------------------------------------
-- migration_032_remove_campaign_source
-- ---------------------------------------------------------------------
UPDATE leads SET source = 'other' WHERE source = 'campaign';

ALTER TABLE leads
    MODIFY COLUMN source ENUM('website_contact','referral','manual','other',
                              'social_media','advertisement','own_search','walk_in','phone_call','email')
        NOT NULL DEFAULT 'manual';

UPDATE permissions SET label = 'View customer acquisition & leads'
    WHERE permission_key = 'marketing.view';

UPDATE permissions SET label = 'Manage customer acquisition, marketing tasks & expenses'
    WHERE permission_key = 'marketing.manage';

-- ---------------------------------------------------------------------
-- migration_033_accountant_workflow
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_pay_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    bank_name VARCHAR(100) DEFAULT NULL,
    account_name VARCHAR(120) DEFAULT NULL,
    account_number VARCHAR(40) DEFAULT NULL,
    monthly_salary DECIMAL(12,2) DEFAULT NULL,
    salary_start DATE DEFAULT NULL,
    updated_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_pay_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE budget_requests
    ADD COLUMN transfer_status ENUM('none','awaiting','transferred') NOT NULL DEFAULT 'none',
    ADD COLUMN transferred_by INT DEFAULT NULL,
    ADD COLUMN transferred_at DATETIME DEFAULT NULL,
    ADD COLUMN transfer_reference VARCHAR(80) DEFAULT NULL,
    ADD COLUMN transaction_id INT DEFAULT NULL;

UPDATE budget_requests SET transfer_status = 'awaiting'
WHERE status = 'approved' AND transfer_status = 'none';

ALTER TABLE payroll_records
    ADD COLUMN payment_reference VARCHAR(80) DEFAULT NULL,
    ADD COLUMN paid_by INT DEFAULT NULL;

-- ---------------------------------------------------------------------
-- migration_034_expense_records
-- ---------------------------------------------------------------------
ALTER TABLE finance_transactions
    ADD COLUMN payee VARCHAR(120) DEFAULT NULL,
    ADD COLUMN reference VARCHAR(80) DEFAULT NULL;

-- ---------------------------------------------------------------------
-- migration_035_network_camera_services
-- ---------------------------------------------------------------------
INSERT INTO services (category_key, name, icon, description, is_broadcast, is_custom, is_active, sort_order)
SELECT 'software_hardware', 'Network Installation', 'bi-hdd-network',
       'LAN & WAN setup, switches and routers, Wi-Fi, structured cabling, firewall security and network monitoring.',
       0, 1, 1, (SELECT COALESCE(MAX(s.sort_order), 0) + 1 FROM services s)
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM services WHERE name LIKE 'Network%');

INSERT INTO services (category_key, name, icon, description, is_broadcast, is_custom, is_active, sort_order)
SELECT 'software_hardware', 'Camera Installation', 'bi-camera-video',
       'CCTV camera installation with HD footage, night vision and remote monitoring for homes, offices, shops and schools.',
       0, 1, 1, (SELECT COALESCE(MAX(s.sort_order), 0) + 1 FROM services s)
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM services WHERE name LIKE '%Camera%' OR name LIKE '%CCTV%');

-- ---------------------------------------------------------------------
-- migration_036_sales_officer_inventory_only
-- ---------------------------------------------------------------------
DELETE FROM job_role_permissions
WHERE job_role_key = 'sales_officer'
  AND permission_key IN ('sales.view', 'sales.manage');

DELETE up FROM user_permissions up
JOIN users u ON u.id = up.user_id
WHERE u.job_role_key = 'sales_officer'
  AND up.permission_key IN ('sales.view', 'sales.manage');

-- ---------------------------------------------------------------------
-- migration_037_budgets_loans
-- ---------------------------------------------------------------------
ALTER TABLE budget_requests
    ADD COLUMN approved_amount DECIMAL(12,2) DEFAULT NULL;

UPDATE budget_requests SET approved_amount = amount
WHERE status = 'approved' AND approved_amount IS NULL;

CREATE TABLE IF NOT EXISTS budget_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    budget_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('cash','bank_transfer','mobile_money','card','other') NOT NULL DEFAULT 'bank_transfer',
    reference VARCHAR(80) DEFAULT NULL,
    note VARCHAR(255) DEFAULT NULL,
    transaction_id INT DEFAULT NULL,
    paid_by INT DEFAULT NULL,
    paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bp_budget (budget_id),
    FOREIGN KEY (budget_id) REFERENCES budget_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO budget_payments (budget_id, amount, payment_method, reference, transaction_id, paid_by, paid_at)
SELECT br.id, br.amount, 'bank_transfer', br.transfer_reference, br.transaction_id, br.transferred_by, COALESCE(br.transferred_at, NOW())
FROM budget_requests br
WHERE br.transfer_status = 'transferred'
  AND NOT EXISTS (SELECT 1 FROM budget_payments bp WHERE bp.budget_id = br.id);

CREATE TABLE IF NOT EXISTS company_loans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(150) NOT NULL,
    principal DECIMAL(14,2) NOT NULL,
    total_repayable DECIMAL(14,2) NOT NULL,
    installment_amount DECIMAL(14,2) DEFAULT NULL,
    date_received DATE NOT NULL,
    due_date DATE DEFAULT NULL,
    purpose VARCHAR(255) DEFAULT NULL,
    notes VARCHAR(500) DEFAULT NULL,
    status ENUM('active','paid') NOT NULL DEFAULT 'active',
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS loan_repayments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    loan_id INT NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    principal_part DECIMAL(14,2) NOT NULL DEFAULT 0,
    interest_part DECIMAL(14,2) NOT NULL DEFAULT 0,
    paid_date DATE NOT NULL,
    payment_method ENUM('cash','bank_transfer','mobile_money','card','other') NOT NULL DEFAULT 'bank_transfer',
    reference VARCHAR(80) DEFAULT NULL,
    notes VARCHAR(255) DEFAULT NULL,
    transaction_id INT DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_lr_loan (loan_id),
    INDEX idx_lr_date (paid_date),
    FOREIGN KEY (loan_id) REFERENCES company_loans(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- migration_038_contact_message_conversions
-- ---------------------------------------------------------------------
ALTER TABLE contact_messages
    ADD COLUMN converted_to_lead_at DATETIME DEFAULT NULL,
    ADD COLUMN converted_to_lead_by INT DEFAULT NULL,
    ADD COLUMN converted_to_sale_receipt VARCHAR(20) DEFAULT NULL,
    ADD COLUMN converted_to_sale_amount DECIMAL(12,2) DEFAULT NULL,
    ADD COLUMN converted_to_sale_at DATETIME DEFAULT NULL,
    ADD COLUMN converted_to_sale_by INT DEFAULT NULL;

UPDATE contact_messages m
JOIN leads l ON l.id = m.converted_to_lead_id
SET m.converted_to_lead_at = l.created_at,
    m.converted_to_lead_by = l.created_by
WHERE m.converted_to_lead_at IS NULL;

CREATE INDEX idx_contact_messages_created_at ON contact_messages (created_at);

-- ---------------------------------------------------------------------
-- migration_039_remove_sales_leads_permissions
-- ---------------------------------------------------------------------
DELETE FROM job_role_permissions WHERE permission_key IN ('sales.view', 'sales.manage');

DELETE FROM user_permissions     WHERE permission_key IN ('sales.view', 'sales.manage');

DELETE FROM permissions          WHERE permission_key IN ('sales.view', 'sales.manage');

-- ---------------------------------------------------------------------
-- migration_040_sales_overview_permission
-- ---------------------------------------------------------------------
INSERT INTO permissions (permission_key, category, label) VALUES
('sales_overview.view', 'inventory', 'View sales & stock overview (read-only)')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('general_manager', 'sales_overview.view')
ON DUPLICATE KEY UPDATE job_role_key = job_role_key;

-- ---------------------------------------------------------------------
-- migration_041_remove_hr_and_tickets
-- ---------------------------------------------------------------------
DELETE FROM job_role_permissions WHERE permission_key IN ('hr.view', 'hr.manage');

DELETE FROM user_permissions     WHERE permission_key IN ('hr.view', 'hr.manage');

DELETE FROM permissions          WHERE permission_key IN ('hr.view', 'hr.manage');

UPDATE permissions SET category = 'people' WHERE permission_key = 'employees.manage';

DELETE FROM job_role_permissions WHERE permission_key IN ('tickets.view', 'tickets.manage');

DELETE FROM user_permissions     WHERE permission_key IN ('tickets.view', 'tickets.manage');

DELETE FROM permissions          WHERE permission_key IN ('tickets.view', 'tickets.manage');

DELETE FROM notifications WHERE type IN ('new_ticket', 'ticket_reply');

DROP TABLE IF EXISTS ticket_thread_reads;

DROP TABLE IF EXISTS ticket_attachments;

DROP TABLE IF EXISTS ticket_messages;

DROP TABLE IF EXISTS support_tickets;

UPDATE notifications
SET link = '/backend/admin/employees.php'
WHERE link LIKE '/backend/admin/hr.php%';

-- ---------------------------------------------------------------------
-- migration_042_credit_sales_and_debts
-- ---------------------------------------------------------------------
ALTER TABLE inventory_sales
    ADD COLUMN payment_method VARCHAR(20) DEFAULT NULL AFTER notes,
    ADD COLUMN payment_channel VARCHAR(40) DEFAULT NULL AFTER payment_method;

CREATE TABLE IF NOT EXISTS customer_debts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    debt_code VARCHAR(20) NOT NULL UNIQUE,
    receipt_code VARCHAR(20) NOT NULL UNIQUE,
    customer_name VARCHAR(120) NOT NULL,
    customer_phone VARCHAR(40) NOT NULL,
    customer_address VARCHAR(200) DEFAULT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
    due_date DATE DEFAULT NULL,
    status ENUM('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
    notes VARCHAR(255) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_customer_debts_status (status),
    INDEX idx_customer_debts_phone (customer_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_debt_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    debt_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    payment_method ENUM('cash','mobile_money','bank_transfer','card') NOT NULL DEFAULT 'cash',
    payment_channel VARCHAR(40) DEFAULT NULL,
    reference VARCHAR(80) DEFAULT NULL,
    note VARCHAR(255) DEFAULT NULL,
    paid_date DATE NOT NULL,
    transaction_id INT DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (debt_id) REFERENCES customer_debts(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_debt_payments_debt (debt_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- migration_043_lawyer_desk
-- ---------------------------------------------------------------------
INSERT INTO permissions (permission_key, category, label) VALUES
('legal.records.view', 'legal', 'View the Lawyer''s notes, documents and reported cases (read-only)')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('general_manager', 'legal.records.view')
ON DUPLICATE KEY UPDATE job_role_key = job_role_key;

CREATE TABLE IF NOT EXISTS legal_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    author_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    category VARCHAR(60) NOT NULL DEFAULT 'General',
    body TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_legal_notes_author (author_id),
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS legal_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uploaded_by INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    doc_type VARCHAR(60) NOT NULL DEFAULT 'Other',
    description VARCHAR(500) DEFAULT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    file_size INT NOT NULL DEFAULT 0,
    mime_type VARCHAR(120) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_legal_documents_user (uploaded_by),
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS legal_cases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reported_by INT NOT NULL,
    record_type ENUM('issue','case','emergency') NOT NULL DEFAULT 'issue',
    title VARCHAR(200) NOT NULL,
    priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
    status ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
    parties VARCHAR(255) DEFAULT NULL,
    incident_date DATE DEFAULT NULL,
    description TEXT NOT NULL,
    action_taken TEXT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_legal_cases_user (reported_by),
    INDEX idx_legal_cases_status (status),
    FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- migration_044_customer_change
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_change (
    id INT AUTO_INCREMENT PRIMARY KEY,
    change_code VARCHAR(20) NOT NULL UNIQUE,
    receipt_code VARCHAR(20) NOT NULL UNIQUE,
    customer_name VARCHAR(120) NOT NULL,
    customer_phone VARCHAR(40) NOT NULL,
    customer_address VARCHAR(200) DEFAULT NULL,
    amount DECIMAL(12,2) NOT NULL,
    amount_returned DECIMAL(12,2) NOT NULL DEFAULT 0,
    status ENUM('owed','partial','returned') NOT NULL DEFAULT 'owed',
    notes VARCHAR(255) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_customer_change_status (status),
    INDEX idx_customer_change_phone (customer_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_change_payouts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    change_id INT NOT NULL,
    kind ENUM('refund','offset') NOT NULL DEFAULT 'refund',
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    payment_method ENUM('cash','mobile_money','bank_transfer') DEFAULT NULL,
    payment_channel VARCHAR(40) DEFAULT NULL,
    debt_id INT DEFAULT NULL,
    note VARCHAR(255) DEFAULT NULL,
    paid_date DATE NOT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (change_id) REFERENCES customer_change(id) ON DELETE CASCADE,
    FOREIGN KEY (debt_id) REFERENCES customer_debts(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_change_payouts_change (change_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- migration_045_product_request_sales
-- ---------------------------------------------------------------------
ALTER TABLE inventory_sales
    ADD COLUMN request_id INT DEFAULT NULL AFTER sold_by,
    ADD INDEX idx_inventory_sales_request (request_id),
    ADD CONSTRAINT fk_inventory_sales_request FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- First Super Administrator (same rule the web installer uses: only
-- created when no administrator exists yet). Change the password after
-- your first login.
-- ---------------------------------------------------------------------
INSERT INTO users (full_name, username, email, phone, password_hash, role, position_title, status)
SELECT 'MABUMBA TECH Super Admin', 'superadmin', 'mabumbatech@gmail.com', NULL,
       '$2y$10$SW6CLtl5BdZaLWLHyQocNuSi.aglUpV6o29n85a.kj4XCg8L4hcRC',
       'super_admin', 'Founder / Super Administrator', 'active'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE role IN ('admin','super_admin'));
