-- =====================================================================
-- MABUMBA TECH — Migration 009: Portfolio ↔ Project linking
-- Run this in phpMyAdmin (SQL tab). Purely additive.
-- =====================================================================

-- Lets an admin optionally trace a portfolio showcase item back to the real
-- customer request/project it came from. This is for internal reference only
-- — the public portfolio API never selects or exposes this column or
-- anything from the linked request; the public page only ever shows the
-- admin-entered title/description/client_name/image/url, exactly as before.
ALTER TABLE portfolio
  ADD COLUMN linked_request_id INT DEFAULT NULL AFTER project_url,
  ADD FOREIGN KEY (linked_request_id) REFERENCES service_requests(id) ON DELETE SET NULL;
