-- =====================================================================
-- MABUMBA TECH — Migration 016: Inventory
-- Run this in phpMyAdmin (SQL tab), after 010-015. Purely additive.
--
-- Design notes:
--
-- 1) PARENT PRODUCT / TYPE STRUCTURE, EXACTLY AS SPECIFIED.
--    `products` is the parent (e.g. "Pen"). `product_types` is the actual
--    stockable, sellable thing (e.g. "Obama Pen - Black") with its own
--    buying/selling price, unit, quantity and minimum stock level. The
--    parent's "combined quantity" is a SUM over its types — computed, not
--    stored, so it can never drift from the real numbers.
--
-- 2) ONE STOCK LEDGER, SAME PRINCIPLE AS FINANCE.
--    `product_types.quantity` is never edited directly by any endpoint.
--    Every change — a purchase arriving, a sale, a damage, a manual
--    adjustment — is a row in `stock_movements`, and quantity is updated
--    atomically alongside it (see inventory.php: record_stock_movement()).
--    This is the same fix as the finance ledger: one source of truth
--    instead of a number that can silently drift from what actually
--    happened.
--
-- 3) NO SEPARATE "DAMAGES" OR "LOW STOCK ALERTS" TABLES.
--    A damage is just a stock_movement with movement_type='damage'. A
--    low-stock alert is just `quantity <= minimum_stock_level`, computed
--    on read. Both were explicitly listed in the spec as if they need
--    their own tables — they don't; that's the "unnecessary duplication"
--    the spec itself warns against in §33.
-- =====================================================================

CREATE TABLE IF NOT EXISTS product_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT DEFAULT NULL,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(500) DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    name VARCHAR(150) NOT NULL,               -- e.g. "Obama Pen - Black"
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    buying_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    minimum_selling_price DECIMAL(12,2) DEFAULT NULL,
    quantity INT NOT NULL DEFAULT 0,          -- maintained ONLY via stock_movements
    minimum_stock_level INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(120) DEFAULT NULL,
    phone VARCHAR(30) DEFAULT NULL,
    email VARCHAR(120) DEFAULT NULL,
    address VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_code VARCHAR(20) NOT NULL UNIQUE,
    supplier_id INT DEFAULT NULL,
    purchase_date DATE NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    notes VARCHAR(255) DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    product_type_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_cost DECIMAL(12,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (product_type_id) REFERENCES product_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_type_id INT NOT NULL,
    movement_type ENUM('purchase','sale','damage','adjustment_in','adjustment_out') NOT NULL,
    quantity INT NOT NULL,                    -- always positive; direction comes from movement_type
    reference_type VARCHAR(30) DEFAULT NULL,  -- e.g. 'purchase'
    reference_id INT DEFAULT NULL,            -- e.g. purchases.id
    notes VARCHAR(255) DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_type_id) REFERENCES product_types(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
