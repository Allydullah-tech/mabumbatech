-- =====================================================================
-- MABUMBA TECH — Migration 019: Portfolio case-study fields
-- Run this in phpMyAdmin (SQL tab), after 010-018. Purely additive.
--
-- These are empty until someone fills them in — no defaults invented.
-- =====================================================================

ALTER TABLE portfolio
    ADD COLUMN technologies VARCHAR(300) DEFAULT NULL AFTER description,
    ADD COLUMN project_outcome VARCHAR(500) DEFAULT NULL AFTER technologies,
    ADD COLUMN completion_date DATE DEFAULT NULL AFTER project_outcome;
