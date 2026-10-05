-- =====================================================================
-- MABUMBA TECH — Migration 023: Marketing & Customer Acquisition
-- Run this in phpMyAdmin (SQL tab). Purely additive.
--
-- Design notes:
--
-- 1) NO NEW "REQUEST" TABLE. A Marketing Officer's request-on-behalf-of-
--    customer becomes a real row in `service_requests` — the SAME table
--    used by the public request form and the customer dashboard. This is
--    what lets the existing Track Request page (backend/api/public/
--    track-request.php), the existing admin Requests screen, and the
--    existing notification/assignment machinery all work on it for free,
--    with zero duplication (per the spec's explicit "do not create a
--    disconnected system" requirement).
--
-- 2) `source` + `created_by_staff_id` are how a request is "clearly
--    indicated" as created by a Marketing Officer on behalf of a
--    customer, instead of coming from the customer directly.
--
-- 3) `request_type` + `product_type_id`/`product_name`/`quantity` extend
--    service_requests to also cover product/sales opportunities (a
--    customer who wants to buy a computer, for example), reusing the
--    existing `product_types` catalogue (migration_016_inventory.sql)
--    instead of inventing a parallel "product interest" table.
--    `service_id` is relaxed to nullable to allow a pure product request.
--
-- 4) `acquisition_history` is a lightweight, append-only audit trail
--    scoped to marketing-acquisition requests only (status changes,
--    review, forwarding, notes) — separate from the existing per-request
--    customer/staff message thread (request_messages), which is for
--    conversation, not an audit log.
-- =====================================================================

-- ---------------------------------------------------------------------
-- New job role: Marketing Officer (sits alongside the existing
-- Marketing Manager job role from migration_010).
-- ---------------------------------------------------------------------
INSERT INTO job_roles (job_role_key, label, icon) VALUES
('marketing_officer', 'Marketing Officer', 'bi-person-lines-fill')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- ---------------------------------------------------------------------
-- New permission: the manager-level review/approve/assign/forward
-- actions on acquisition requests. `marketing.manage` already covers
-- creating one (Officer level); this is the extra Manager-level gate.
-- ---------------------------------------------------------------------
INSERT INTO permissions (permission_key, category, label) VALUES
('marketing.acquisition.manage', 'marketing', 'Review, assign & forward customer-acquisition requests')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- ---------------------------------------------------------------------
-- Job role permission templates.
-- ---------------------------------------------------------------------
INSERT INTO job_role_permissions (job_role_key, permission_key) VALUES
-- Marketing Officer: can search/register customers, create requests on
-- their behalf, and manage their own campaigns/leads records.
('marketing_officer', 'marketing.view'),
('marketing_officer', 'marketing.manage'),

-- Marketing Manager: everything an Officer has, PLUS the review/assign/
-- forward authority over acquisition requests company-wide.
('marketing_manager', 'marketing.acquisition.manage'),

-- Department visibility (spec section 6) — read-only access to
-- marketing/acquisition data for the roles the spec names, without
-- granting them the ability to create or edit it.
('sales_officer',     'marketing.view'),
('general_manager',   'marketing.view'),
('accountant',        'marketing.view')
ON DUPLICATE KEY UPDATE job_role_key = VALUES(job_role_key);

-- ---------------------------------------------------------------------
-- Extend service_requests so a Marketing Officer's request-on-behalf-of-
-- customer, whether for a service or a product, can live in the same
-- table and flow through the same tracking/assignment/notification code.
-- ---------------------------------------------------------------------
ALTER TABLE service_requests
    MODIFY COLUMN service_id INT NULL,
    ADD COLUMN request_type ENUM('service','product') NOT NULL DEFAULT 'service' AFTER service_id,
    ADD COLUMN product_type_id INT DEFAULT NULL AFTER request_type,
    ADD COLUMN product_name VARCHAR(160) DEFAULT NULL AFTER product_type_id,
    ADD COLUMN quantity INT DEFAULT NULL AFTER product_name,
    ADD COLUMN guest_location VARCHAR(255) DEFAULT NULL AFTER guest_phone,
    ADD COLUMN additional_notes TEXT DEFAULT NULL AFTER message,
    ADD COLUMN source ENUM('customer','marketing_officer') NOT NULL DEFAULT 'customer' AFTER priority,
    ADD COLUMN created_by_staff_id INT DEFAULT NULL AFTER source,
    ADD COLUMN acquisition_status ENUM('pending_review','reviewed','forwarded') DEFAULT NULL AFTER created_by_staff_id,
    ADD CONSTRAINT fk_request_product_type FOREIGN KEY (product_type_id) REFERENCES product_types(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_request_created_by_staff FOREIGN KEY (created_by_staff_id) REFERENCES users(id) ON DELETE SET NULL,
    ADD INDEX idx_service_requests_source (source),
    ADD INDEX idx_service_requests_created_by_staff (created_by_staff_id);

-- A request created directly by a customer/guest never has an
-- "acquisition" review state — only marketing-officer-created ones do.
-- Existing rows already default to source='customer', acquisition_status
-- stays NULL for them, which is what the code below relies on.

-- ---------------------------------------------------------------------
-- Audit trail for acquisition requests: every status change, review,
-- forward, and note, with who did it and when.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acquisition_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    user_id INT DEFAULT NULL,
    action VARCHAR(40) NOT NULL,          -- created, reviewed, forwarded, note, status_change, cancelled
    note VARCHAR(500) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
