-- =====================================================================
-- MABUMBA TECH — Migration 042: Credit sales & Customer Debts
-- Run this in phpMyAdmin (SQL tab), after 001-041. Run ONCE (like the earlier migrations).
--
-- 1) inventory_sales remembers HOW a sale was paid (payment_method) and,
--    for Mobile Money / Bank, WHICH provider (payment_channel: M-Pesa,
--    Airtel Money, HaloPesa, Mixx by Yas, CRDB, NMB, ...). Old rows stay
--    NULL and keep working (their method is still read from the ledger).
--
-- 2) CREDIT SALES. A sale made on credit still leaves the shelf and is
--    recorded in inventory_sales as normal, but NO income is posted to the
--    ledger at that moment — the money has not been received. Instead a
--    row in `customer_debts` records what the customer owes.
--
-- 3) Every payment the customer makes (including a deposit taken at the
--    time of sale) is a row in `customer_debt_payments` AND one 'income'
--    row in finance_transactions (category 'product_sale'), so the
--    Accountant's revenue always equals the cash actually received.
-- =====================================================================

ALTER TABLE inventory_sales
    ADD COLUMN payment_method VARCHAR(20) DEFAULT NULL AFTER notes,
    ADD COLUMN payment_channel VARCHAR(40) DEFAULT NULL AFTER payment_method;

CREATE TABLE IF NOT EXISTS customer_debts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    debt_code VARCHAR(20) NOT NULL UNIQUE,
    receipt_code VARCHAR(20) NOT NULL UNIQUE,      -- the sale this debt belongs to
    customer_name VARCHAR(120) NOT NULL,
    customer_phone VARCHAR(40) NOT NULL,
    customer_address VARCHAR(200) DEFAULT NULL,
    total_amount DECIMAL(12,2) NOT NULL,           -- what the customer owes for the sale
    amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
    due_date DATE DEFAULT NULL,
    status ENUM('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
    notes VARCHAR(255) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_customer_debts_status (status),
    INDEX idx_customer_debts_phone (customer_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_debt_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    debt_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,          -- what is still owed right after this payment
    payment_method ENUM('cash','mobile_money','bank_transfer','card') NOT NULL DEFAULT 'cash',
    payment_channel VARCHAR(40) DEFAULT NULL,
    reference VARCHAR(80) DEFAULT NULL,
    note VARCHAR(255) DEFAULT NULL,
    paid_date DATE NOT NULL,
    transaction_id INT DEFAULT NULL,               -- the finance_transactions row this created
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (debt_id) REFERENCES customer_debts(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_debt_payments_debt (debt_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
