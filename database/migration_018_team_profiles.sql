-- =====================================================================
-- MABUMBA TECH — Migration 018: Public team profiles
-- Run this in phpMyAdmin (SQL tab), after 010-017. Purely additive.
--
-- Off by default (`is_public_profile = 0`) for every existing account —
-- nobody's photo, name, or position appears on the public Team page
-- unless HR/admin explicitly turns it on for that person. This matches
-- the spec's own instruction not to expose private employee information.
-- =====================================================================

ALTER TABLE users
    ADD COLUMN is_public_profile TINYINT(1) NOT NULL DEFAULT 0 AFTER avatar,
    ADD COLUMN public_bio VARCHAR(300) DEFAULT NULL AFTER is_public_profile,
    ADD COLUMN public_skills VARCHAR(300) DEFAULT NULL AFTER public_bio;
