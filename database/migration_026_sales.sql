-- =====================================================================
-- MABUMBA TECH — Migration 026: Sales (Inventory Sales Recording)
-- Run this in phpMyAdmin (SQL tab), after 001-025. Purely additive.
--
-- Design notes:
--
-- 1) NOT THE SAME "SALES" AS THE MARKETING SALES & LEADS MODULE.
--    `sales.view`/`sales.manage` (migration_010) and admin/sales.php
--    already mean the Marketing lead/quotation pipeline. This is a
--    different, simpler thing: recording an actual sale of a physical
--    product from Inventory. To avoid clashing with that existing
--    module, the table is `inventory_sales` and the new permission is
--    `inventory.sell`, kept in the same 'inventory' category as
--    inventory.view/inventory.manage.
--
-- 2) inventory.sell IS DELIBERATELY NARROWER THAN inventory.manage.
--    A Sales Officer needs to search a product, see its price, and
--    record a sale — not create products, edit prices, or manage
--    suppliers/purchases. Anyone with inventory.manage can also record
--    sales (checked in code as inventory.manage OR inventory.sell), so
--    Store Manager/full admins need no extra grant here.
--
-- 3) ONE MORE LEDGER ENTRY, NOT A SEPARATE MONEY TRAIL.
--    Same principle as migration_014/016: `inventory_sales` is the
--    detailed record (quantity, unit price/cost, profit) — the actual
--    cash inflow is still just one more 'income' row in
--    `finance_transactions` (category = 'product_sale'), so the
--    Accountant's existing revenue/profit figures already include it
--    with no separate calculation to keep in sync.
-- =====================================================================

CREATE TABLE IF NOT EXISTS inventory_sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_code VARCHAR(20) NOT NULL UNIQUE,
    product_type_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,   -- selling price at the time of sale
    unit_cost DECIMAL(12,2) NOT NULL,    -- buying/cost price at the time of sale (profit is computed from this snapshot)
    total_amount DECIMAL(12,2) NOT NULL, -- quantity * unit_price
    total_cost DECIMAL(12,2) NOT NULL,   -- quantity * unit_cost
    profit DECIMAL(12,2) NOT NULL,       -- total_amount - total_cost
    notes VARCHAR(255) DEFAULT NULL,
    sold_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_type_id) REFERENCES product_types(id) ON DELETE RESTRICT,
    FOREIGN KEY (sold_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_inventory_sales_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO permissions (permission_key, category, label) VALUES
('inventory.sell', 'inventory', 'Record product sales')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
('sales_officer', 'inventory.sell')
ON DUPLICATE KEY UPDATE job_role_key = VALUES(job_role_key);
