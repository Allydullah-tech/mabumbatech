-- =====================================================================
-- MABUMBA TECH — Migration 044: Change left by customers (we owe them)
-- Run in phpMyAdmin (SQL tab) after 001-043. Run ONCE.
--
-- Customer debts (customer owes us) already exist (migration 042).
-- This adds the opposite side: a customer pays more than the sale total
-- and LEAVES the change with us. That money is NOT revenue — it is a
-- liability we hold for them:
--   * the sale still posts only its TOTAL as income in the ledger;
--   * `customer_change` records what we hold for the customer;
--   * `customer_change_payouts` records every time it is given back
--     ('refund') or used to pay one of their debts ('offset').
-- A refund posts nothing to the ledger (it is the customer's own money).
-- An offset posts the debt payment as income (through record_debt_payment).
-- =====================================================================

CREATE TABLE IF NOT EXISTS customer_change (
    id INT AUTO_INCREMENT PRIMARY KEY,
    change_code VARCHAR(20) NOT NULL UNIQUE,
    receipt_code VARCHAR(20) NOT NULL UNIQUE,       -- the sale the change was left on
    customer_name VARCHAR(120) NOT NULL,
    customer_phone VARCHAR(40) NOT NULL,
    customer_address VARCHAR(200) DEFAULT NULL,
    amount DECIMAL(12,2) NOT NULL,                  -- change the customer left with us
    amount_returned DECIMAL(12,2) NOT NULL DEFAULT 0,
    status ENUM('owed','partial','returned') NOT NULL DEFAULT 'owed',
    notes VARCHAR(255) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_customer_change_status (status),
    INDEX idx_customer_change_phone (customer_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_change_payouts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    change_id INT NOT NULL,
    kind ENUM('refund','offset') NOT NULL DEFAULT 'refund',
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,           -- change still held right after this payout
    payment_method ENUM('cash','mobile_money','bank_transfer') DEFAULT NULL,   -- refunds only
    payment_channel VARCHAR(40) DEFAULT NULL,
    debt_id INT DEFAULT NULL,                       -- offsets only: the debt that was reduced
    note VARCHAR(255) DEFAULT NULL,
    paid_date DATE NOT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (change_id) REFERENCES customer_change(id) ON DELETE CASCADE,
    FOREIGN KEY (debt_id) REFERENCES customer_debts(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_change_payouts_change (change_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
