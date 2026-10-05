-- =====================================================================
-- MABUMBA TECH — Migration 012: Sales / CRM foundation
-- Run this in phpMyAdmin (SQL tab). Purely additive.
--
-- Design notes (read before building the UI on top of this):
--
-- 1) LEADS ARE PRE-REQUEST CUSTOMERS, PER THE EARLIER DECISION.
--    A lead is NOT a duplicate customer record. `leads.converted_customer_id`
--    links to `users.id` only once/if the person registers a real account,
--    exactly like `service_requests.guest_email` already lets someone submit
--    a request without an account. Most leads will simply carry their own
--    contact info (name/email/phone) until they convert.
--
-- 2) NO SEPARATE "ORDERS" TABLE.
--    The spec asks for Leads -> Quotation -> Negotiation -> Won, and
--    separately for an "orders" concept. Introducing an orders table would
--    create a second "project-ish" record alongside `service_requests`,
--    which is exactly the duplication flagged earlier. Instead: when a lead
--    is won, `leads.converted_request_id` points at the real
--    `service_requests` row created for it (see crm.php: convert_lead_won()).
--    That service_request IS the order/project — one entity, not two.
--
-- 3) QUOTATIONS can attach to a lead (pre-sale) or later to an existing
--    customer directly (e.g. upsell/renewal quote for someone who's already
--    a customer) — hence both lead_id and customer_id are nullable FKs.
-- =====================================================================

CREATE TABLE IF NOT EXISTS campaigns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    channel ENUM('social_media','email','sms','event','referral_program','search_ads','other') NOT NULL DEFAULT 'other',
    status ENUM('planned','active','paused','completed') NOT NULL DEFAULT 'planned',
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL,
    budget DECIMAL(12,2) DEFAULT NULL,
    description VARCHAR(500) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS campaign_expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campaign_id INT NOT NULL,
    description VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    spent_at DATE NOT NULL,
    recorded_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    company_name VARCHAR(160) DEFAULT NULL,
    email VARCHAR(120) DEFAULT NULL,
    phone VARCHAR(30) DEFAULT NULL,
    source ENUM('website_contact','campaign','referral','manual','other') NOT NULL DEFAULT 'manual',
    campaign_id INT DEFAULT NULL,
    requested_service_id INT DEFAULT NULL,
    status ENUM('new','contacted','qualified','quotation','negotiation','won','lost') NOT NULL DEFAULT 'new',
    assigned_to INT DEFAULT NULL,                    -- Sales Officer
    converted_customer_id INT DEFAULT NULL,          -- set once/if a real account exists
    converted_request_id INT DEFAULT NULL,           -- set when won (the resulting project)
    lost_reason VARCHAR(255) DEFAULT NULL,
    created_by INT DEFAULT NULL,                     -- NULL = came in from the public site itself
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
    FOREIGN KEY (requested_service_id) REFERENCES services(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (converted_customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (converted_request_id) REFERENCES service_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Timeline: notes, calls, emails, meetings, scheduled follow-ups, and an
-- automatic entry every time `status` changes (so the pipeline history is
-- always reconstructable, not just the current status).
CREATE TABLE IF NOT EXISTS lead_activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lead_id INT NOT NULL,
    user_id INT DEFAULT NULL,
    activity_type ENUM('note','call','email','meeting','follow_up','status_change') NOT NULL DEFAULT 'note',
    description VARCHAR(500) DEFAULT NULL,
    follow_up_at DATETIME DEFAULT NULL,
    old_status VARCHAR(20) DEFAULT NULL,
    new_status VARCHAR(20) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quote_code VARCHAR(20) NOT NULL UNIQUE,
    lead_id INT DEFAULT NULL,
    customer_id INT DEFAULT NULL,
    service_id INT DEFAULT NULL,
    title VARCHAR(160) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    valid_until DATE DEFAULT NULL,
    status ENUM('draft','sent','accepted','rejected','expired') NOT NULL DEFAULT 'draft',
    notes VARCHAR(500) DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Links the resulting project back to the quotation that sold it, so a
-- project's price/scope traces back to what was actually agreed.
ALTER TABLE service_requests
    ADD COLUMN quotation_id INT DEFAULT NULL AFTER service_id,
    ADD CONSTRAINT fk_request_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL;
