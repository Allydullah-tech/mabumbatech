<?php
/**
 * MABUMBA TECH — System Installer
 * Creates the database schema and the first administrator account.
 * This file locks itself once config/db_config.php exists.
 */
session_start();
require_once __DIR__ . '/config/constants.php';
require_once __DIR__ . '/includes/functions.php';

$configFile = __DIR__ . '/config/db_config.php';
$already_installed = file_exists($configFile);

$errors = [];
$success = false;

if (!$already_installed && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $dbHost = trim($_POST['db_host'] ?? 'localhost');
    $dbName = trim($_POST['db_name'] ?? '');
    $dbUser = trim($_POST['db_user'] ?? '');
    $dbPass = $_POST['db_pass'] ?? '';

    $fullName = trim($_POST['full_name'] ?? '');
    $username = trim($_POST['username'] ?? '');
    $email    = trim($_POST['email'] ?? '');
    $phone    = trim($_POST['phone'] ?? '');
    $password = $_POST['password'] ?? '';
    $confirm  = $_POST['confirm_password'] ?? '';

    if ($dbName === '' || $dbUser === '') $errors[] = 'Database name and username are required.';
    if ($fullName === '' || $username === '' || $email === '') $errors[] = 'All admin account fields are required.';
    if (strlen($password) < 6) $errors[] = 'Password must be at least 6 characters.';
    if ($password !== $confirm) $errors[] = 'Passwords do not match.';

    if (empty($errors)) {
        try {
            // 1) connect to server (no db yet) and create database if needed
            $pdoServer = new PDO("mysql:host=$dbHost;charset=utf8mb4", $dbUser, $dbPass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
            $pdoServer->exec("CREATE DATABASE IF NOT EXISTS `$dbName` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");

            // 2) connect to the actual database and run schema
            $pdo = new PDO("mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
            $sql = file_get_contents(__DIR__ . '/database/schema.sql');
            foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
                if ($statement !== '') {
                    $pdo->exec($statement);
                }
            }

            // 3) create the first administrator as SUPER ADMIN (cannot be suspended)
            $check = $pdo->prepare('SELECT COUNT(*) FROM users WHERE role IN ("admin","super_admin")');
            $check->execute();
            if ((int)$check->fetchColumn() === 0) {
                $hash = password_hash($password, PASSWORD_DEFAULT);
                $stmt = $pdo->prepare('INSERT INTO users (full_name, username, email, phone, password_hash, role, position_title, status) VALUES (?,?,?,?,?,"super_admin","Founder / Super Administrator","active")');
                $stmt->execute([$fullName, $username, $email, $phone, $hash]);
            }

            // 4) detect base url path (works whether installed at domain root or a subfolder)
            $baseUrl = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
            if ($baseUrl === '/' ) $baseUrl = '';

            // 5) write config/db_config.php
            $configContent = "<?php\n"
                . "define('DB_HOST', " . var_export($dbHost, true) . ");\n"
                . "define('DB_NAME', " . var_export($dbName, true) . ");\n"
                . "define('DB_USER', " . var_export($dbUser, true) . ");\n"
                . "define('DB_PASS', " . var_export($dbPass, true) . ");\n"
                . "define('APP_BASE_URL', " . var_export($baseUrl, true) . ");\n";
            file_put_contents($configFile, $configContent);

            $success = true;
        } catch (PDOException $e) {
            $errors[] = 'Setup failed: ' . $e->getMessage();
        }
    }
}

require FRONTEND_HTML . '/install.php';
