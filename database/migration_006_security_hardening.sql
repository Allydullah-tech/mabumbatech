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
