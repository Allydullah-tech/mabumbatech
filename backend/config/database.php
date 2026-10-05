<?php
/**
 * MABUMBA TECH — Database connection (PDO)
 * The actual credentials live in config/db_config.php, which is generated
 * by install.php on first setup and is NOT part of version control.
 */

$configFile = __DIR__ . '/db_config.php';

if (!file_exists($configFile)) {
    $script = $_SERVER['SCRIPT_NAME'] ?? '';
    if (strpos($script, 'install.php') !== false) {
        return; // let install.php run without a config file
    }
    // No installation yet — guide the visitor to the installer.
    http_response_code(503);
    die('<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;">'
        . '<h2>MABUMBA TECH is not installed yet</h2>'
        . '<p>Please open <b>install.php</b> in the application\'s root folder to complete setup.</p></body></html>');
}

require $configFile; // defines DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS, APP_BASE_URL

$dbPort = defined('DB_PORT') && DB_PORT !== '' ? DB_PORT : '3306';

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';port=' . $dbPort . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    die('Database connection failed. Please contact the system administrator. (' . htmlspecialchars($e->getMessage()) . ')');
}
