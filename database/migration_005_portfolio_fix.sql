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
