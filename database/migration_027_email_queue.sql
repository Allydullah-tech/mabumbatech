-- =====================================================================
-- MABUMBA TECH — Migration 027: Email Queue (Performance)
-- Run this in phpMyAdmin (SQL tab), after 001-026. Purely additive.
--
-- Why: send_email() used to dial out over SMTP synchronously, inside the
-- same request that's building the JSON response. notify_role('admin', ...)
-- (used on request submission, assignment, completion, etc.) sends one
-- such email PER ADMIN IN A LOOP — with a real SMTP provider (STARTTLS +
-- AUTH + DATA is several round-trips), that's easily several seconds per
-- email, stacked serially. This is the direct cause of "customer request
-- submission sometimes 7+ seconds" / "completing tasks sometimes 10+
-- seconds" (spec §4) — and it gets WORSE as more admins/staff are added.
--
-- Fix: send_email() now just inserts a row here and returns immediately
-- (near-zero cost) — see mailer.php. Actual delivery happens out of the
-- request/response cycle, via backend/cron/send-emails.php.
-- =====================================================================

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
