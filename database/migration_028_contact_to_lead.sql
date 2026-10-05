-- =====================================================================
-- MABUMBA TECH — Migration 028: Convert Contact Message to Lead
-- Run this in phpMyAdmin (SQL tab), after 001-027. Purely additive.
--
-- Why: leads.source has always offered a "Website Contact" option, but
-- nothing anywhere ever actually created a lead from a real contact-form
-- submission — a Marketing Officer had to notice a new message and
-- manually re-type it into a new Lead themselves. This tracks which
-- contact message (if any) a lead was created from, so the Contact
-- Messages page can offer a one-click "Convert to Lead" and avoid
-- creating duplicates from the same message.
-- =====================================================================

ALTER TABLE contact_messages
    ADD COLUMN converted_to_lead_id INT DEFAULT NULL AFTER is_read,
    ADD FOREIGN KEY (converted_to_lead_id) REFERENCES leads(id) ON DELETE SET NULL;
