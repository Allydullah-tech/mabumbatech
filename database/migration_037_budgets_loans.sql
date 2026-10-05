-- =====================================================================
-- MABUMBA TECH — Migration 037: Company budgets (payments) + Company loans
-- Run ONCE in phpMyAdmin (SQL tab), after 001-036. Safe to re-run.
--
--  1) budget_requests.approved_amount — what the manager approved (may be
--     lower than the requested amount).
--  2) budget_payments  — every payment made against an approved budget
--     (part or full), kept apart from salaries.
--  3) company_loans / loan_repayments — loans the company took, their
--     repayments, interest part and remaining balance.
-- =====================================================================

ALTER TABLE budget_requests
    ADD COLUMN IF NOT EXISTS approved_amount DECIMAL(12,2) DEFAULT NULL;

UPDATE budget_requests SET approved_amount = amount
WHERE status = 'approved' AND approved_amount IS NULL;

CREATE TABLE IF NOT EXISTS budget_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    budget_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('cash','bank_transfer','mobile_money','card','other') NOT NULL DEFAULT 'bank_transfer',
    reference VARCHAR(80) DEFAULT NULL,
    note VARCHAR(255) DEFAULT NULL,
    transaction_id INT DEFAULT NULL,
    paid_by INT DEFAULT NULL,
    paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bp_budget (budget_id),
    FOREIGN KEY (budget_id) REFERENCES budget_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Budgets that were already transferred before this update become one full payment.
INSERT INTO budget_payments (budget_id, amount, payment_method, reference, transaction_id, paid_by, paid_at)
SELECT br.id, br.amount, 'bank_transfer', br.transfer_reference, br.transaction_id, br.transferred_by, COALESCE(br.transferred_at, NOW())
FROM budget_requests br
WHERE br.transfer_status = 'transferred'
  AND NOT EXISTS (SELECT 1 FROM budget_payments bp WHERE bp.budget_id = br.id);

CREATE TABLE IF NOT EXISTS company_loans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(150) NOT NULL,                 -- bank / lender
    principal DECIMAL(14,2) NOT NULL,               -- loan amount received
    total_repayable DECIMAL(14,2) NOT NULL,         -- total to pay back (loan + interest/charges)
    installment_amount DECIMAL(14,2) DEFAULT NULL,  -- planned repayment per instalment (optional)
    date_received DATE NOT NULL,
    due_date DATE DEFAULT NULL,                     -- final repayment date (optional)
    purpose VARCHAR(255) DEFAULT NULL,
    notes VARCHAR(500) DEFAULT NULL,
    status ENUM('active','paid') NOT NULL DEFAULT 'active',
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS loan_repayments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    loan_id INT NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    principal_part DECIMAL(14,2) NOT NULL DEFAULT 0,
    interest_part DECIMAL(14,2) NOT NULL DEFAULT 0,
    paid_date DATE NOT NULL,
    payment_method ENUM('cash','bank_transfer','mobile_money','card','other') NOT NULL DEFAULT 'bank_transfer',
    reference VARCHAR(80) DEFAULT NULL,
    notes VARCHAR(255) DEFAULT NULL,
    transaction_id INT DEFAULT NULL,                -- ledger expense for the interest part (if any)
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_lr_loan (loan_id),
    INDEX idx_lr_date (paid_date),
    FOREIGN KEY (loan_id) REFERENCES company_loans(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
