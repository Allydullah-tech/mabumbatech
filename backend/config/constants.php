<?php
/**
 * MABUMBA TECH — Global constants
 */

define('SITE_NAME', 'MABUMBA TECH');
define('SITE_NAME_SLUG', 'mabumbatech');

// Keep FALSE in production. When TRUE, API error responses include the real
// exception message (useful while developing, but leaks internals — file
// paths, SQL, table/column names — to anyone who can trigger a server error).
define('DEBUG_MODE', true);

// Required to run backend/cron/check-deadlines.php over HTTP (e.g. on hosts
// that only offer "visit a URL" cron jobs). Set this to a long random string
// and use the same value as ?key=... when configuring the cron job. Leave the
// placeholder value and the script will refuse to run over HTTP.
define('CRON_SECRET', 'change-this-to-a-random-string');

// Filesystem locations (absolute paths, safe from any file depth)
define('APP_ROOT', dirname(__DIR__, 2));
define('UPLOADS_DIR', APP_ROOT . '/backend/uploads');
define('SITE_TAGLINE', 'Technology. Innovation. Solution.');
define('SITE_MISSION', 'To deliver quality and affordable technology solutions that turn ideas into practical results and help people, businesses, and organizations grow.');
define('SITE_VISION', 'To become a trusted African technology company creating practical solutions that improve how people, businesses, and organizations work.');
define('SITE_EMAIL', 'mabumbatech@gmail.com');
define('SITE_PHONE', '+255 620 839 640 / +255 760 620 418');
define('SITE_ADDRESS', 'Mbeya, Tanzania');

// Bump this whenever the wording in frontend/js/terms.js (TERMS_CONTENT_HTML)
// changes materially. It's stamped on every stored acceptance (users.terms_version,
// service_requests.terms_version) so past acceptances stay tied to the text a
// person actually agreed to — keep the two values in sync by hand.
define('TERMS_VERSION', '1.0');

define('BASE_URL', rtrim((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'] . dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/'));

// Staff categories — keys MUST match services.category_key in the database.
// 'other_services' is the broadcast category: visible to every staff member.
const STAFF_CATEGORIES = [
    'web_dev'           => ['label' => 'Web Development',                 'icon' => 'bi-code-slash'],
    'app_dev'           => ['label' => 'App Development',                 'icon' => 'bi-phone'],
    'software_hardware' => ['label' => 'Software & Hardware Solutions',   'icon' => 'bi-cpu'],
    'it_consultancy'    => ['label' => 'IT Consultancy',                  'icon' => 'bi-diagram-3'],
    'ai_ml'             => ['label' => 'AI/ML Projects',                  'icon' => 'bi-cpu-fill'],
    'multimedia'        => ['label' => 'Multimedia/Animation Projects',   'icon' => 'bi-film'],
    'graphics'          => ['label' => 'Graphics Designing',              'icon' => 'bi-palette'],
    'other_services'    => ['label' => 'All Other Digital Services',      'icon' => 'bi-grid-3x3-gap'],
];

const BROADCAST_CATEGORY = 'other_services';
