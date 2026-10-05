-- =====================================================================
-- MABUMBA TECH — Migration 034: Professional expense records
-- Run ONCE in phpMyAdmin (SQL tab), after 033. Safe to re-run.
-- Adds "Paid to / Received from" and a "Reference no." to every ledger
-- entry, so each expense can be traced to a payee and a receipt.
-- =====================================================================
ALTER TABLE finance_transactions
    ADD COLUMN IF NOT EXISTS payee VARCHAR(120) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS reference VARCHAR(80) DEFAULT NULL;
