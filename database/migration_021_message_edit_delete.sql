-- =====================================================================
-- MABUMBA TECH — Migration 021 — Message edit/delete support
-- Run this in phpMyAdmin (SQL tab). Purely additive.
--
-- Adds the ability for a sender to edit or delete their own message in a
-- request's Q&A thread (customer / staff / admin), and for admins to
-- moderate (delete) any message in a thread they manage.
--
-- Deletes are soft: `is_deleted` is set to 1 and the original text is
-- kept in place for audit purposes, but the API and UI always replace
-- the content with a "This message was deleted." placeholder once this
-- flag is set — the raw text is never sent to the browser again.
-- `edited_at` is stamped on every successful edit so the thread can show
-- an "(edited)" marker.
-- =====================================================================

ALTER TABLE request_messages
    ADD COLUMN edited_at DATETIME NULL DEFAULT NULL AFTER message,
    ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER edited_at;
