<?php
/**
 * MABUMBA TECH — Email Queue Worker
 *
 * Delivers whatever is sitting in `email_queue` (see migration_027 and
 * includes/mailer.php for why emails are queued instead of sent inline).
 * This is what makes email delivery actually happen promptly — without a
 * cron entry, queued emails are only drained opportunistically as a
 * fallback (see the shutdown hook in includes/api.php), which is not
 * something to depend on for real timeliness.
 *
 * SET THIS UP: add a cron job (cPanel → "Cron Jobs", or your host's
 * equivalent) that runs every 1–2 minutes:
 *
 *     * * * * *  php /full/path/to/backend/cron/send-emails.php >> /full/path/to/backend/cron/send-emails.log 2>&1
 *
 * Ask your hosting provider for the exact PHP CLI path/command if `php`
 * alone doesn't work (shared hosting sometimes needs e.g. /usr/bin/php8.2).
 *
 * Safe to run from the command line only — refuses to run over HTTP so it
 * can never be triggered by an anonymous web request.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    die('This script can only be run from the command line (cron).');
}

require_once __DIR__ . '/../includes/session.php';

$sent = process_email_queue(50);
echo date('Y-m-d H:i:s') . " — processed {$sent} queued email(s).\n";
