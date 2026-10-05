-- =====================================================================
-- MABUMBA TECH — Migration 014: Finance foundation
-- Run this in phpMyAdmin (SQL tab). Purely additive.
--
-- Design notes:
--
-- 1) ONE LEDGER, NOT FIVE FLAT TABLES.
--    The spec lists "record income / record expenses / manage payments /
--    manage receipts" as if they're separate things. They're not — they're
--    all movements of money. `finance_transactions` is the single ledger
--    every financial report (revenue, expenses, profit/loss, cash flow)
--    is computed from. This is the fix for the "no ledger concept" gap
--    flagged earlier: one source of truth instead of numbers that can
--    silently drift out of sync across tables.
--
-- 2) INVOICES CLOSE THE LOOP WITH SALES/CRM.
--    `invoices.quotation_id` and `invoices.request_id` connect directly
--    to the Sales module built earlier. A won lead's quotation becomes
--    an invoice; payments against that invoice are transactions in the
--    same ledger. Nothing new is invented to represent "an order."
--
-- 3) PAYROLL IS DELIBERATELY MINIMAL.
--    A `payroll_records` table (who, which month, gross/net, paid or
--    not) is enough to satisfy "manage payroll" for now. A full HR
--    module (leave, attendance, contracts) is separate, later work —
--    this only covers the Accountant's side: paying people and it
--    showing up in the ledger as an expense.
-- =====================================================================

CREATE TABLE IF NOT EXISTS finance_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('income','expense') NOT NULL,
    category VARCHAR(60) NOT NULL,          -- e.g. project_payment, salary, rent, utilities, marketing, supplies, other
    amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('cash','bank_transfer','mobile_money','card','other') NOT NULL DEFAULT 'other',
    transaction_date DATE NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    customer_id INT DEFAULT NULL,           -- who paid (income) — for the customer debt/history view
    request_id INT DEFAULT NULL,            -- which project this relates to
    invoice_id INT DEFAULT NULL,            -- which invoice this payment settles (income only)
    payroll_id INT DEFAULT NULL,            -- which payroll record this expense pays (expense only)
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_code VARCHAR(20) NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    request_id INT DEFAULT NULL,
    quotation_id INT DEFAULT NULL,
    title VARCHAR(160) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
    status ENUM('unpaid','partial','paid','overdue','cancelled') NOT NULL DEFAULT 'unpaid',
    due_date DATE DEFAULT NULL,
    issued_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
    FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE finance_transactions
    ADD CONSTRAINT fk_txn_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS payroll_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    period_month DATE NOT NULL,             -- always the 1st of the month, e.g. 2026-09-01
    gross_amount DECIMAL(12,2) NOT NULL,
    deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL,
    status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
    paid_at DATETIME DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_period (user_id, period_month),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE finance_transactions
    ADD CONSTRAINT fk_txn_payroll FOREIGN KEY (payroll_id) REFERENCES payroll_records(id) ON DELETE SET NULL;
