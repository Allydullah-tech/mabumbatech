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
    terms_accepted_at DATETIME DEFAULT NULL,        -- when this account agreed to the Terms & Conditions
    terms_version VARCHAR(20) DEFAULT NULL,         -- which version of the Terms they agreed to
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
    terms_accepted_at DATETIME DEFAULT NULL,        -- when the requester agreed to the Terms & Conditions
    terms_version VARCHAR(20) DEFAULT NULL,         -- which version of the Terms they agreed to
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
