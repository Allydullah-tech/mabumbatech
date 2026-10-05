-- =====================================================================
-- MABUMBA TECH — Migration 022 — Terms & Conditions acceptance
-- Run this in phpMyAdmin (SQL tab). Purely additive.
--
-- Records that a person accepted the Terms & Conditions, and when:
--   - users.terms_accepted_at / terms_version — stamped at account creation.
--   - service_requests.terms_accepted_at / terms_version — stamped on every
--     submitted request (customer or guest), since a request can be made
--     without an account and a customer's terms can be updated over time.
--
-- Existing rows are left NULL (nobody retroactively "accepted" anything);
-- only new registrations/requests going forward are required to accept.
-- =====================================================================

ALTER TABLE users
    ADD COLUMN terms_accepted_at DATETIME NULL DEFAULT NULL AFTER security_answer_hash,
    ADD COLUMN terms_version VARCHAR(20) NULL DEFAULT NULL AFTER terms_accepted_at;

ALTER TABLE service_requests
    ADD COLUMN terms_accepted_at DATETIME NULL DEFAULT NULL AFTER admin_note,
    ADD COLUMN terms_version VARCHAR(20) NULL DEFAULT NULL AFTER terms_accepted_at;
