-- Only needed IF you already ran migration_044_customer_change.sql.
-- Removes the two tables it created. Safe to skip if you never ran it.
-- (Deletes any "change held" records that were saved.)
DROP TABLE IF EXISTS customer_change_payouts;
DROP TABLE IF EXISTS customer_change;
