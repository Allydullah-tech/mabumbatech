-- =====================================================================
-- MABUMBA TECH — Migration 035: Network Installation & Camera Installation
-- Run ONCE in phpMyAdmin (SQL tab). Safe to re-run — a service is only added
-- if one with that name does not exist yet (for example, if you already added
-- it in Admin > Services Catalogue).
-- Both are placed under the "Software & Hardware Solutions" department, so
-- requests reach that team, and customers can pick them on the request form.
-- =====================================================================
INSERT INTO services (category_key, name, icon, description, is_broadcast, is_custom, is_active, sort_order)
SELECT 'software_hardware', 'Network Installation', 'bi-hdd-network',
       'LAN & WAN setup, switches and routers, Wi-Fi, structured cabling, firewall security and network monitoring.',
       0, 1, 1, (SELECT COALESCE(MAX(s.sort_order), 0) + 1 FROM services s)
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM services WHERE name LIKE 'Network%');

INSERT INTO services (category_key, name, icon, description, is_broadcast, is_custom, is_active, sort_order)
SELECT 'software_hardware', 'Camera Installation', 'bi-camera-video',
       'CCTV camera installation with HD footage, night vision and remote monitoring for homes, offices, shops and schools.',
       0, 1, 1, (SELECT COALESCE(MAX(s.sort_order), 0) + 1 FROM services s)
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM services WHERE name LIKE '%Camera%' OR name LIKE '%CCTV%');
