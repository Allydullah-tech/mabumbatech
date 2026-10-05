-- =====================================================================
-- MABUMBA TECH — Migration 002
-- Run this ONCE in phpMyAdmin (SQL tab) against your existing database.
-- Adds: customer security questions (forgot-password), and allows admins
-- to add more than one service under the same department.
-- =====================================================================

-- 1) Security question / answer for customer self-service password reset
ALTER TABLE users
  ADD COLUMN security_question VARCHAR(255) DEFAULT NULL AFTER temp_code,
  ADD COLUMN security_answer_hash VARCHAR(255) DEFAULT NULL AFTER security_question;

-- 2) Allow admins to add multiple services under the same department.
--    (category_key was UNIQUE before, limiting each department to one service.)
ALTER TABLE services DROP INDEX category_key;
ALTER TABLE services ADD UNIQUE KEY uniq_category_name (category_key, name);

-- 3) Let admins add brand-new services beyond the original 8, and track who added them.
ALTER TABLE services
  ADD COLUMN is_custom TINYINT(1) NOT NULL DEFAULT 0 AFTER is_broadcast,
  ADD COLUMN added_by INT DEFAULT NULL AFTER sort_order,
  ADD CONSTRAINT fk_services_added_by FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;
