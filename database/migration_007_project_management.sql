-- =====================================================================
-- MABUMBA TECH — Migration 007: Project Management workflow
-- Run this in phpMyAdmin (SQL tab) against your existing database.
-- Purely additive — existing requests keep their current status/data.
-- =====================================================================

-- 1) Extend the request lifecycle: Pending -> Assigned -> In Progress ->
--    Review -> Completed -> Delivered (Cancelled stays a separate exit).
--    Adding enum values is backward compatible; existing rows are untouched.
ALTER TABLE service_requests
  MODIFY COLUMN status ENUM('pending','assigned','in_progress','review','completed','delivered','cancelled')
    NOT NULL DEFAULT 'pending';

-- 2) Progress tracking + a place for notes that are for staff/admin eyes only
--    (separate from admin_note, which is already shown to the customer).
ALTER TABLE service_requests
  ADD COLUMN progress TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER priority,
  ADD COLUMN internal_notes TEXT DEFAULT NULL AFTER admin_note,
  ADD COLUMN delivered_at DATETIME DEFAULT NULL AFTER completed_at;

-- 3) Project milestones — the stages of a project, shown to the customer
--    as their progress timeline.
CREATE TABLE IF NOT EXISTS project_milestones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    title VARCHAR(160) NOT NULL,
    description VARCHAR(400) DEFAULT NULL,
    status ENUM('pending','in_progress','done') NOT NULL DEFAULT 'pending',
    due_date DATE DEFAULT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_by INT DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) Project links — website/demo/staging/etc URLs staff or admins attach to
--    a project. is_customer_visible controls whether the customer sees it;
--    internal links (e.g. a staging server or repo) default to hidden.
CREATE TABLE IF NOT EXISTS project_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    title VARCHAR(120) NOT NULL,
    url VARCHAR(500) NOT NULL,
    link_type ENUM('website','webapp','demo','staging','repository','documentation','other') NOT NULL DEFAULT 'other',
    description VARCHAR(300) DEFAULT NULL,
    is_customer_visible TINYINT(1) NOT NULL DEFAULT 0,
    added_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
