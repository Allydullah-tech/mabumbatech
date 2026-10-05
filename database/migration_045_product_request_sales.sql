-- =====================================================================
-- MABUMBA TECH — Migration 045: Product requests -> real sales
-- Run in phpMyAdmin (SQL tab) after 001-044. Run ONCE.
--
-- Until now, completing a customer-acquisition PRODUCT request only
-- changed the request's status: no sale row, no stock deduction, no
-- income and no profit. From now on completing one records a real sale
-- through the same record_sale_items() used by the Sales Officer, and
-- this column ties that sale back to the request it closed.
--
-- NULL = an ordinary over-the-counter sale (all existing rows).
-- =====================================================================

ALTER TABLE inventory_sales
    ADD COLUMN request_id INT DEFAULT NULL AFTER sold_by,
    ADD INDEX idx_inventory_sales_request (request_id),
    ADD CONSTRAINT fk_inventory_sales_request FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE SET NULL;
