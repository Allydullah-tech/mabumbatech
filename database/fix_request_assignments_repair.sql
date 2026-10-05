-- Run this in phpMyAdmin's SQL tab on the `mabumbatech` database.
-- Fixes the InnoDB corruption pattern: MySQL's metadata says the table
-- exists ("#1050 already exists") but the storage engine has no actual
-- data file for it ("1932 ... doesn't exist in engine"). This drops the
-- broken/orphaned table definition and recreates it cleanly. Since the
-- engine never had real data for it anyway, nothing is lost.

DROP TABLE IF EXISTS request_assignments;

CREATE TABLE request_assignments (
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
