-- =====================================================================
-- MABUMBA TECH — Migration 038: Contact message conversions & history
-- Run this in phpMyAdmin (SQL tab), after 001-037. Purely additive.
--
-- Why: the Contact Messages page can now turn a message into a Lead AND
-- into a product Sale, and shows a history filtered by time. This stores
-- who converted a message and when, and which sale receipt it became, so
-- the page can show it and never convert the same message twice.
-- (converted_to_lead_id already exists from migration_028.)
-- =====================================================================

ALTER TABLE contact_messages
    ADD COLUMN IF NOT EXISTS converted_to_lead_at DATETIME DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS converted_to_lead_by INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS converted_to_sale_receipt VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS converted_to_sale_amount DECIMAL(12,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS converted_to_sale_at DATETIME DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS converted_to_sale_by INT DEFAULT NULL;

-- Messages already converted to leads before this migration: take the
-- conversion time/person from the lead that was created.
UPDATE contact_messages m
JOIN leads l ON l.id = m.converted_to_lead_id
SET m.converted_to_lead_at = l.created_at,
    m.converted_to_lead_by = l.created_by
WHERE m.converted_to_lead_at IS NULL;

-- Faster time filtering on the history list.
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages (created_at);
