<?php
/**
 * MABUMBA TECH — Installer API
 * Creates the database schema and the first (Super Admin) account.
 * Locks itself once backend/config/db_config.php exists.
 */

// Never let PHP warnings/notices/deprecations leak into the response body —
// they would corrupt the JSON and cause "unexpected response" errors in the
// browser even though the actual install logic worked fine. Errors are still
// logged server-side (via error_log), just not printed into the HTTP output.
ini_set('display_errors', '0');
error_reporting(E_ALL);
ob_start();

session_start();
require_once __DIR__ . '/../config/constants.php';
require_once __DIR__ . '/../includes/functions.php';

header('Content-Type: application/json');

/** Send JSON and stop, discarding any stray output (warnings, whitespace, etc.) buffered before this point. */
function send_json(array $data): void
{
    if (ob_get_length() !== false) {
        ob_clean();
    }
    echo json_encode($data);
    exit;
}

$configFile = __DIR__ . '/../config/db_config.php';
$alreadyInstalled = file_exists($configFile);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    send_json(['installed' => $alreadyInstalled]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    send_json(['success' => false, 'message' => 'Method not allowed.']);
}

if ($alreadyInstalled) {
    send_json(['success' => false, 'message' => 'The system is already installed.']);
}

$dbHost = trim($_POST['db_host'] ?? 'localhost');
$dbPort = trim($_POST['db_port'] ?? '') ?: '3307';
$dbName = trim($_POST['db_name'] ?? '');
$dbUser = trim($_POST['db_user'] ?? '');
$dbPass = $_POST['db_pass'] ?? '';

// "localhost" makes most MySQL client libraries connect via a local socket/pipe,
// silently ignoring any custom port. Force TCP (127.0.0.1) whenever a non-default
// port is given, so the port the person actually typed is the one that gets used.
if ($dbHost === 'localhost' && $dbPort !== '3306') {
    $dbHost = '127.0.0.1';
}

$fullName = trim($_POST['full_name'] ?? '');
$username = trim($_POST['username'] ?? '');
$email    = trim($_POST['email'] ?? '');
$phone    = trim($_POST['phone'] ?? '');
$password = $_POST['password'] ?? '';
$confirm  = $_POST['confirm_password'] ?? '';

$errors = [];
if ($dbName === '' || $dbUser === '') $errors[] = 'Database name and username are required.';
if ($fullName === '' || $username === '' || $email === '') $errors[] = 'All Super Administrator account fields are required.';
if (strlen($password) < 6) $errors[] = 'Password must be at least 6 characters.';
if ($password !== $confirm) $errors[] = 'Passwords do not match.';

if ($errors) {
    send_json(['success' => false, 'message' => implode(' ', $errors)]);
}

try {
    // 1) connect to server (no db yet) and create database if needed
    // ATTR_TIMEOUT stops this from hanging forever if MySQL is unreachable —
    // it will fail with a clear error after 5 seconds instead of spinning indefinitely.
    $pdoServer = new PDO("mysql:host=$dbHost;port=$dbPort;charset=utf8mb4", $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT  => 5,
    ]);
    $pdoServer->exec("CREATE DATABASE IF NOT EXISTS `$dbName` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");

    // 2) connect to the actual database and run schema
    $pdo = new PDO("mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT  => 5,
    ]);
    $schemaPath = __DIR__ . '/../../database/schema.sql';
    if (!is_file($schemaPath)) {
        throw new RuntimeException("Could not find database/schema.sql on the server (looked at: $schemaPath). Please make sure the whole project folder — including the top-level 'database' folder — was uploaded.");
    }
    $sql = file_get_contents($schemaPath);
    if ($sql === false || $sql === '') {
        throw new RuntimeException('database/schema.sql exists but could not be read (check file permissions).');
    }
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
        if ($statement !== '') {
            $pdo->exec($statement);
        }
    }

    // 3) create the first account as SUPER ADMIN (cannot be suspended)
    $check = $pdo->prepare('SELECT COUNT(*) FROM users WHERE role IN ("admin","super_admin")');
    $check->execute();
    if ((int)$check->fetchColumn() === 0) {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare('INSERT INTO users (full_name, username, email, phone, password_hash, role, position_title, status) VALUES (?,?,?,?,?,"super_admin","Founder / Super Administrator","active")');
        $stmt->execute([$fullName, $username, $email, $phone, $hash]);
    }

    // 4) detect base url path (works whether installed at domain root or a subfolder)
    // this install.php lives at backend/api/install.php, called via the root install.php redirect,
    // so we derive the app root from the HTTP Referer (the install page's own URL) when possible,
    // falling back to stripping the known /frontend/html/install.html suffix.
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    $baseUrl = '';
    if ($referer !== '') {
        $path = parse_url($referer, PHP_URL_PATH) ?: '';
        $marker = '/frontend/html/install.html';
        $idx = strpos($path, $marker);
        if ($idx !== false) {
            $baseUrl = substr($path, 0, $idx);
        }
    }

    // 5) write config/db_config.php
    $configDir = dirname($configFile);
    if (!is_writable($configDir)) {
        throw new RuntimeException("The backend/config folder is not writable by the web server (path: $configDir). Please give it write permission and try again.");
    }
    $configContent = "<?php\n"
        . "define('DB_HOST', " . var_export($dbHost, true) . ");\n"
        . "define('DB_PORT', " . var_export($dbPort, true) . ");\n"
        . "define('DB_NAME', " . var_export($dbName, true) . ");\n"
        . "define('DB_USER', " . var_export($dbUser, true) . ");\n"
        . "define('DB_PASS', " . var_export($dbPass, true) . ");\n"
        . "define('APP_BASE_URL', " . var_export($baseUrl, true) . ");\n";
    if (file_put_contents($configFile, $configContent) === false) {
        throw new RuntimeException('Database connected and schema created, but could not write backend/config/db_config.php. Please check folder write permissions.');
    }

    send_json(['success' => true, 'message' => 'Installation complete.']);
} catch (PDOException $e) {
    send_json(['success' => false, 'message' => 'Setup failed: ' . $e->getMessage()]);
} catch (Throwable $e) {
    // Catches anything else unexpected (missing files, permissions, etc.) so the
    // response is always valid JSON instead of a raw PHP error page.
    send_json(['success' => false, 'message' => 'Setup failed: ' . $e->getMessage()]);
}