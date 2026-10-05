-- =====================================================================
-- MABUMBA TECH — Migration 025: Simplify Inventory Categories
-- Run this in phpMyAdmin (SQL tab), after 001-024. Purely additive/corrective.
--
-- Inventory is now restricted to exactly three categories: Laptops,
-- Desktops, and Materials/Equipment (see spec). `create_category` is
-- removed from the admin inventory API — categories are no longer
-- freely creatable — so this migration seeds the three fixed rows and
-- re-points any product that was filed under a different/custom
-- category into "Materials / Equipment" (the general-purpose bucket)
-- instead of leaving it orphaned. It does NOT delete products or types.
-- =====================================================================

INSERT IGNORE INTO product_categories (name) VALUES
    ('Laptops'),
    ('Desktops'),
    ('Materials / Equipment');

-- Anything filed under a category outside the fixed three moves to
-- "Materials / Equipment" so every product still has a valid, supported
-- category after this migration.
UPDATE products p
JOIN product_categories old_c ON old_c.id = p.category_id
SET p.category_id = (SELECT id FROM product_categories WHERE name = 'Materials / Equipment')
WHERE old_c.name NOT IN ('Laptops', 'Desktops', 'Materials / Equipment');

DELETE FROM product_categories WHERE name NOT IN ('Laptops', 'Desktops', 'Materials / Equipment');
