-- ============================================================
-- MABUMBA TECH — Remove the last traces of "Campaigns"
-- Run ONCE (phpMyAdmin > SQL). Safe to re-run.
--   1) Leads that were recorded with the "campaign" source become "other"
--   2) "campaign" is removed from the allowed lead sources
--   3) Permission labels no longer mention campaigns
-- ============================================================

UPDATE leads SET source = 'other' WHERE source = 'campaign';

ALTER TABLE leads
    MODIFY COLUMN source ENUM('website_contact','referral','manual','other',
                              'social_media','advertisement','own_search','walk_in','phone_call','email')
        NOT NULL DEFAULT 'manual';

UPDATE permissions SET label = 'View customer acquisition & leads'
    WHERE permission_key = 'marketing.view';
UPDATE permissions SET label = 'Manage customer acquisition, marketing tasks & expenses'
    WHERE permission_key = 'marketing.manage';
