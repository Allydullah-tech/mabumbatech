-- =====================================================================
-- MABUMBA TECH — Migration 033: Accountant workflow
-- Run ONCE in phpMyAdmin (SQL tab), after 001-032. Safe to re-run.
--
--  1) staff_pay_details  — every company member's bank account
--     (bank name, account name, account number) + monthly salary.
--  2) budget_requests    — approved requests now go to the Accountant for
--     the money transfer; once transferred they become a company expense.
--  3) payroll_records    — remembers who paid a salary and the reference.
-- =====================================================================

CREATE TABLE IF NOT EXISTS staff_pay_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    bank_name VARCHAR(100) DEFAULT NULL,
    account_name VARCHAR(120) DEFAULT NULL,
    account_number VARCHAR(40) DEFAULT NULL,
    monthly_salary DECIMAL(12,2) DEFAULT NULL,
    salary_start DATE DEFAULT NULL,              -- first month this person must be paid (always the 1st)
    updated_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_pay_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE budget_requests
    ADD COLUMN IF NOT EXISTS transfer_status ENUM('none','awaiting','transferred') NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS transferred_by INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS transferred_at DATETIME DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS transfer_reference VARCHAR(80) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS transaction_id INT DEFAULT NULL;

-- Requests that were approved before this update now wait for the Accountant.
UPDATE budget_requests SET transfer_status = 'awaiting'
WHERE status = 'approved' AND transfer_status = 'none';

ALTER TABLE payroll_records
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(80) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS paid_by INT DEFAULT NULL;
