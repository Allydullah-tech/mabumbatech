-- =====================================================================
-- MABUMBA TECH — Migration 017: HR foundation
-- Run this in phpMyAdmin (SQL tab), after 010-016. Purely additive.
--
-- Honesty note: the spec's HR Manager section was cut off mid-sentence
-- before listing its Functions — there was no "Functions" list to build
-- against, unlike every other module so far. What's here is a reasonable,
-- conservatively-scoped HR foundation (employee directory fields + leave
-- requests) based on what the Dashboard section did specify (total/
-- active/new/on-leave employee counts) and ordinary HR practice — not a
-- literal implementation of a spec that didn't fully exist. Attendance
-- tracking and a formal performance-review system are deliberately NOT
-- included: they're substantial subsystems on their own and nothing in
-- the available spec asked for them specifically.
--
-- Design notes:
--
-- 1) `employment_status` is a NEW, separate column from the existing
--    `status` column. `status` already means "can this account log in"
--    (active/suspended) — conflating that with "is this person currently
--    employed" would mean suspending someone's login also (wrongly)
--    implies they've left the company, or vice versa.
--
-- 2) "ON LEAVE" IS COMPUTED, NOT STORED.
--    There's no `is_on_leave` flag to toggle and forget. Whether someone
--    is on leave today is derived from an approved leave_requests row
--    covering today's date (see hr.php: employees_on_leave_today()) —
--    same ledger principle as finance/inventory: one source of truth.
-- =====================================================================

ALTER TABLE users
    ADD COLUMN hire_date DATE DEFAULT NULL AFTER job_role_key,
    ADD COLUMN employment_status ENUM('active','terminated') NOT NULL DEFAULT 'active' AFTER hire_date;

CREATE TABLE IF NOT EXISTS leave_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    leave_type ENUM('annual','sick','unpaid','maternity_paternity','other') NOT NULL DEFAULT 'annual',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(400) DEFAULT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    approved_by INT DEFAULT NULL,
    decision_note VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
