<?php
/** Root entry point — redirects to the static homepage. Not part of frontend/, just a root shim. */
$base = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
header('Location: ' . $base . '/frontend/html/home.html');
exit;
