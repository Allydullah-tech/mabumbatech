<?php
/**
 * MABUMBA TECH — Mailer
 * No external libraries / composer packages are used. Sends via PHP's built-in
 * mail() function by default, or through a minimal hand-rolled SMTP client when
 * the admin configures SMTP credentials in Settings (useful for Gmail, Zoho, etc).
 *
 * PERFORMANCE (spec §4): send_email() does NOT dial out here anymore. A real
 * SMTP conversation (STARTTLS + AUTH + DATA) takes real round-trip time, and
 * notify_role()/notify_job_role() call this once per recipient in a loop —
 * doing that inline was the direct cause of multi-second delays on actions
 * like submitting or completing a request. send_email() now just records the
 * email (near-instant) and returns; backend/cron/send-emails.php is what
 * actually delivers it, outside the request/response cycle. See
 * process_email_queue() below for the "no cron configured yet" safety net.
 */

/**
 * Queue an email for delivery. Never throws — returns true/false so it can
 * never break a page. Same signature as before, so every existing call site
 * (dozens, across notify_user/notify_role/request handlers) needed no changes.
 */
function send_email(string $toEmail, string $toName, string $subject, string $htmlBody): bool
{
    global $pdo;
    if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    try {
        $pdo->prepare('INSERT INTO email_queue (to_email, to_name, subject, body_html) VALUES (?,?,?,?)')
            ->execute([$toEmail, $toName, $subject, $htmlBody]);
        return true;
    } catch (Throwable $e) {
        error_log('[MABUMBATECH] Failed to queue email: ' . $e->getMessage());
        return false;
    }
}

/**
 * Actually deliver one email over the wire (SMTP or php mail()) — this is the
 * slow part, moved out of send_email(). Called by process_email_queue(), never
 * directly from request-handling code.
 */
function deliver_email_now(string $toEmail, string $toName, string $subject, string $htmlBody): bool
{
    $fromEmail = get_setting('mail_from_email', 'no-reply@mabumbatech.com');
    $fromName  = get_setting('mail_from_name', SITE_NAME);
    $method    = get_setting('mail_method', 'php_mail');

    $wrapped = email_wrap_template($subject, $htmlBody);

    try {
        if ($method === 'smtp') {
            $smtp = new SimpleSmtpMailer(
                get_setting('smtp_host'),
                (int)get_setting('smtp_port', '587'),
                get_setting('smtp_username'),
                get_setting('smtp_password'),
                get_setting('smtp_secure', 'tls')
            );
            return $smtp->send($fromEmail, $fromName, $toEmail, $toName, $subject, $wrapped);
        }

        // Fallback: native PHP mail()
        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= 'From: ' . mb_encode_mimeheader($fromName) . " <$fromEmail>\r\n";
        $headers .= "Reply-To: $fromEmail\r\n";
        return @mail($toEmail, $subject, $wrapped, $headers);
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * Send up to $limit pending emails right now. Used by two callers:
 *  - backend/cron/send-emails.php, run on a schedule (the real fix — add a
 *    cron entry for this, e.g. every 1-2 minutes; see that file's header).
 *  - a small best-effort "drain" from includes/api.php after the HTTP
 *    response has already been sent to the browser (via
 *    fastcgi_finish_request()), so the queue doesn't sit unprocessed on a
 *    host where cron hasn't been set up yet. That drain never blocks a
 *    response — it only runs once the connection to the client is closed.
 * Returns how many were attempted, for the cron script to log.
 */
function process_email_queue(int $limit = 20): int
{
    global $pdo;
    $rows = $pdo->prepare("SELECT * FROM email_queue WHERE status = 'pending' AND attempts < 5 ORDER BY created_at ASC LIMIT ?");
    $rows->bindValue(1, $limit, PDO::PARAM_INT);
    $rows->execute();
    $rows = $rows->fetchAll();

    foreach ($rows as $row) {
        $ok = false;
        try {
            $ok = deliver_email_now($row['to_email'], $row['to_name'], $row['subject'], $row['body_html']);
        } catch (Throwable $e) {
            $ok = false;
        }
        if ($ok) {
            $pdo->prepare("UPDATE email_queue SET status = 'sent', sent_at = NOW() WHERE id = ?")->execute([$row['id']]);
        } else {
            $attempts = (int)$row['attempts'] + 1;
            $pdo->prepare("UPDATE email_queue SET attempts = ?, status = ?, last_error = ? WHERE id = ?")
                ->execute([$attempts, $attempts >= 5 ? 'failed' : 'pending', 'Delivery attempt failed', $row['id']]);
        }
    }
    return count($rows);
}

function email_wrap_template(string $subject, string $bodyHtml): string
{
    $site = SITE_NAME;
    $tagline = SITE_TAGLINE;
    return <<<HTML
<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f9ff;font-family:Segoe UI,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f9ff;padding:30px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e3e9f3;">
<tr><td style="background:#0a3d8f;padding:18px 24px;">
  <span style="color:#fff;font-size:16px;font-weight:700;">{$site}</span><br>
  <span style="color:#bcdcff;font-size:11px;">{$tagline}</span>
</td></tr>
<tr><td style="padding:24px;color:#16233b;font-size:14px;line-height:1.6;">
{$bodyHtml}
</td></tr>
<tr><td style="padding:16px 24px;background:#f5f9ff;color:#5b6b85;font-size:11px;">
This is an automated message from {$site}. Please do not reply directly to this email.
</td></tr>
</table>
</td></tr>
</table>
</body></html>
HTML;
}

/**
 * Minimal SMTP client — supports STARTTLS or implicit SSL, AUTH LOGIN.
 * Written without external dependencies since composer/PEAR packages are not
 * available in this environment.
 */
class SimpleSmtpMailer
{
    private string $host;
    private int $port;
    private string $user;
    private string $pass;
    private string $secure; // 'tls' | 'ssl' | ''

    public function __construct(string $host, int $port, string $user, string $pass, string $secure)
    {
        $this->host = $host;
        $this->port = $port;
        $this->user = $user;
        $this->pass = $pass;
        $this->secure = strtolower($secure);
    }

    public function send(string $fromEmail, string $fromName, string $toEmail, string $toName, string $subject, string $htmlBody): bool
    {
        if ($this->host === '') return false;

        $transport = $this->secure === 'ssl' ? 'ssl://' : '';
        $socket = @stream_socket_client($transport . $this->host . ':' . $this->port, $errno, $errstr, 12);
        if (!$socket) return false;

        $this->readResponse($socket);
        $this->command($socket, "EHLO " . SITE_NAME_SLUG . "\r\n");

        if ($this->secure === 'tls') {
            $this->command($socket, "STARTTLS\r\n", 220);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                fclose($socket);
                return false;
            }
            $this->command($socket, "EHLO " . SITE_NAME_SLUG . "\r\n");
        }

        if ($this->user !== '') {
            $this->command($socket, "AUTH LOGIN\r\n", 334);
            $this->command($socket, base64_encode($this->user) . "\r\n", 334);
            $this->command($socket, base64_encode($this->pass) . "\r\n", 235);
        }

        $this->command($socket, "MAIL FROM:<{$fromEmail}>\r\n", 250);
        $this->command($socket, "RCPT TO:<{$toEmail}>\r\n", 250);
        $this->command($socket, "DATA\r\n", 354);

        $headers = "From: {$fromName} <{$fromEmail}>\r\n";
        $headers .= "To: {$toName} <{$toEmail}>\r\n";
        $headers .= "Subject: {$subject}\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";

        $data = $headers . "\r\n" . str_replace("\r\n.", "\r\n..", $htmlBody) . "\r\n.\r\n";
        fwrite($socket, $data);
        $ok = $this->readResponse($socket, 250);

        fwrite($socket, "QUIT\r\n");
        fclose($socket);
        return $ok;
    }

    private function command($socket, string $cmd, int $expectCode = 250): bool
    {
        fwrite($socket, $cmd);
        return $this->readResponse($socket, $expectCode);
    }

    private function readResponse($socket, int $expectCode = 0): bool
    {
        $response = '';
        while ($line = fgets($socket, 515)) {
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        if ($expectCode === 0) return true;
        return (int)substr($response, 0, 3) === $expectCode;
    }
}
