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
