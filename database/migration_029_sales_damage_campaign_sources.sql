-- =====================================================================
-- MABUMBA TECH — Migration 029: Multi-item sales, damage-as-loss,
--                Customer sources & public campaigns
-- Run this in phpMyAdmin (SQL tab), after 001-028. Purely additive.
--
-- 1) MULTI-ITEM SALES. One customer purchase can now contain several
--    products. Each product is still one row in `inventory_sales`; the
--    rows of one purchase share a `receipt_code`. Old rows are given
--    their own sale_code as receipt_code so nothing breaks.
--
-- 2) DAMAGE = LOSS. From now on every damage recorded in Inventory also
--    posts an EXPENSE to the finance ledger (category 'inventory_damage',
--    amount = quantity x buying price). That is what makes damages count
--    as a loss everywhere expenses are counted (Finance, Reports, net
--    profit). The INSERT below back-fills damages recorded before this
--    migration (safe to re-run: it skips ones already posted).
--
-- 3) CUSTOMER SOURCES. leads.source gets more options (social media,
--    advertisement, own search, walk-in, phone call, email) plus a free
--    text `source_detail` (which ad / who referred) and `message`.
--
-- 4) PUBLIC CAMPAIGNS. A campaign can be shown on the website landing
--    page (`is_public`) with its own `headline`; customers who show
--    interest become leads attributed to that campaign.
-- =====================================================================

-- 1) multi-item sales ---------------------------------------------------
ALTER TABLE inventory_sales
    ADD COLUMN receipt_code VARCHAR(20) DEFAULT NULL AFTER sale_code,
    ADD INDEX idx_inventory_sales_receipt (receipt_code);

UPDATE inventory_sales SET receipt_code = sale_code WHERE receipt_code IS NULL;

-- 2) damage posts a loss to the ledger ---------------------------------
INSERT INTO finance_transactions (type, category, amount, payment_method, transaction_date, description, recorded_by)
SELECT 'expense', 'inventory_damage', ROUND(sm.quantity * pt.buying_price, 2), 'other', DATE(sm.created_at),
       LEFT(CONCAT('Damaged stock #DMG', sm.id, ': ', p.name, ' - ', pt.name, ' (x', sm.quantity, ')'), 255),
       sm.recorded_by
FROM stock_movements sm
JOIN product_types pt ON pt.id = sm.product_type_id
JOIN products p ON p.id = pt.product_id
WHERE sm.movement_type = 'damage'
  AND sm.quantity * pt.buying_price > 0
  AND NOT EXISTS (
      SELECT 1 FROM finance_transactions ft
      WHERE ft.category = 'inventory_damage'
        AND ft.description LIKE CONCAT('Damaged stock #DMG', sm.id, ':%')
  );

-- 3) customer sources ---------------------------------------------------
ALTER TABLE leads
    MODIFY COLUMN source ENUM('website_contact','campaign','referral','manual','other',
                              'social_media','advertisement','own_search','walk_in','phone_call','email')
        NOT NULL DEFAULT 'manual',
    ADD COLUMN source_detail VARCHAR(160) DEFAULT NULL AFTER campaign_id,
    ADD COLUMN message VARCHAR(500) DEFAULT NULL AFTER source_detail,
    ADD INDEX idx_leads_source (source),
    ADD INDEX idx_leads_phone (phone);

-- 4) public campaigns ---------------------------------------------------
ALTER TABLE campaigns
    ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
    ADD COLUMN headline VARCHAR(160) DEFAULT NULL AFTER is_public;
