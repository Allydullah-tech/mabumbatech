-- =====================================================================
-- MABUMBA TECH — Migration 024: Admin Password Reset (email-based)
-- Run this in phpMyAdmin (SQL tab), after 001-023. Purely additive.
--
-- Design note: customers already have a self-service reset via security
-- question (users.security_question / security_answer_hash), and staff
-- are reset by an administrator (users.temp_code + must_reset). Neither
-- fits Administrator accounts (Super Admin / CEO or job-role admins),
-- which now get an email-delivered reset link instead. Tokens are stored
-- as a SHA-256 hash (never the raw token) with a short expiry, mirroring
-- how password_hash is never stored in plain text elsewhere in this app.
-- =====================================================================

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
