-- =====================================================================
-- MABUMBA TECH — Migration 008: Messaging unread indicators + deadline reminders
-- Run this in phpMyAdmin (SQL tab). Purely additive.
-- =====================================================================

-- Tracks when each user last viewed a request's message thread, so unread
-- counts ("customer has replied", "staff has replied") can be shown in
-- request lists without a separate read-flag column per message.
CREATE TABLE IF NOT EXISTS request_thread_reads (
    request_id INT NOT NULL,
    user_id INT NOT NULL,
    last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (request_id, user_id),
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Prevents the deadline-reminder cron (backend/cron/check-deadlines.php) from
-- notifying the same people about the same deadline every time it runs.
ALTER TABLE service_requests
  ADD COLUMN deadline_reminder_sent TINYINT(1) NOT NULL DEFAULT 0 AFTER deadline;
