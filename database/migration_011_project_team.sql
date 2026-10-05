-- =====================================================================
-- MABUMBA TECH — Migration 011
-- Run this in phpMyAdmin (SQL tab). Purely additive.
--
-- Context: `request_assignments` already exists and already supports
-- multiple staff per request (broadcast model) with an accept/decline
-- task workflow. That table is untouched here — it's specifically for
-- the people DELIVERING the work.
--
-- What's missing is the broader need from spec §16: a Sales Officer,
-- Marketing Manager, Accountant or Operations Manager attached to the
-- SAME project for visibility (e.g. the Accountant who invoices it, the
-- Sales Officer who sold it) without being a delivery task-taker. This
-- table adds exactly that, and nothing else, so `service_requests`
-- fully becomes the single "Project" entity from the spec instead of a
-- new parallel projects table being introduced.
-- =====================================================================

CREATE TABLE IF NOT EXISTS project_team (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    user_id INT NOT NULL,
    role_on_project ENUM('sales','marketing','accounting','oversight','support','other') NOT NULL DEFAULT 'other',
    added_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_request_user (request_id, user_id),
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
