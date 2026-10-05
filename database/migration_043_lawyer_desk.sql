-- =====================================================================
-- MABUMBA TECH — migration_043: Lawyer Desk
-- Purely additive. Safe to run more than once.
--
--  * legal_notes      — the Lawyer's written legal notes
--  * legal_documents  — company legal documents (files) the Lawyer manages
--  * legal_cases      — legal issues / cases / emergencies the Lawyer reports
--  * permission legal.records.view — READ-ONLY access to the Lawyer's
--    records (granted to the General / Operations Manager; Super Admin and
--    Generic Admin already receive every permission automatically).
--
-- Only the Lawyer job role can create / edit / delete records. Everyone
-- else is view-only (enforced in backend/api/admin/legal-records.php).
-- =====================================================================

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
