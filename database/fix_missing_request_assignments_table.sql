-- Run this once in phpMyAdmin (SQL tab), on the `mabumbatech` database.
-- Fixes: "Base table or view not found: 1932 Table 'mabumbatech.request_assignments' doesn't exist"
-- This table is defined in database/schema.sql but is missing from your live database.

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
