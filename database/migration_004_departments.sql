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
