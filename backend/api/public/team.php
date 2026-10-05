<?php
require_once __DIR__ . '/../../includes/api.php';

// Whole company, top to bottom: Super Admin (CEO) → Admins → Staff.
// Still gated by is_public_profile = 1, so nobody appears unless an admin
// explicitly switches their profile on.
$team = $pdo->query("
    SELECT u.id, u.full_name, u.email, u.phone, u.avatar, u.role,
           u.position_title, u.staff_category, u.public_bio,
           d.label AS department_label
    FROM users u
    LEFT JOIN departments d ON d.dept_key = u.staff_category
    WHERE u.role IN ('super_admin','admin','staff')
      AND u.status = 'active'
      AND u.is_public_profile = 1
    ORDER BY FIELD(u.role, 'super_admin', 'admin', 'staff'), u.full_name
")->fetchAll();

json_response(['team' => $team]);
