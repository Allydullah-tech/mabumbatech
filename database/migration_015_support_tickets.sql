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
