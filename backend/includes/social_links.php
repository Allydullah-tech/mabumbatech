<?php
/**
 * MABUMBA TECH — Official social media links (footer icons)
 *
 * Single source of truth for which platforms exist, which domains each one
 * may point to, and how a URL is validated. Used by:
 *   - backend/api/admin/social-links.php   (Super Admin edits the URLs)
 *   - backend/api/public/social-links.php  (every public footer reads them)
 *
 * The URLs live in the existing `settings` table as  social_<platform>
 * (e.g. social_instagram), so no database migration is needed. A missing or
 * empty value simply means "don't show that icon".
 *
 * To add another platform later, add ONE entry to social_platforms() below —
 * the admin form and the footer pick it up automatically.
 */

function social_platforms(): array
{
    return [
        'facebook'  => ['label' => 'Facebook',  'icon' => 'bi-facebook',  'hosts' => ['facebook.com', 'fb.com', 'fb.me'],            'placeholder' => 'https://www.facebook.com/your-page'],
        'instagram' => ['label' => 'Instagram', 'icon' => 'bi-instagram', 'hosts' => ['instagram.com'],                              'placeholder' => 'https://www.instagram.com/your-account'],
        'tiktok'    => ['label' => 'TikTok',    'icon' => 'bi-tiktok',    'hosts' => ['tiktok.com'],                                 'placeholder' => 'https://www.tiktok.com/@your-account'],
        'x'         => ['label' => 'X (Twitter)', 'icon' => 'bi-twitter-x', 'hosts' => ['x.com', 'twitter.com'],                       'placeholder' => 'https://x.com/your-account'],
        'youtube'   => ['label' => 'YouTube',   'icon' => 'bi-youtube',   'hosts' => ['youtube.com', 'youtu.be'],                    'placeholder' => 'https://www.youtube.com/@your-channel'],
        'linkedin'  => ['label' => 'LinkedIn',  'icon' => 'bi-linkedin',  'hosts' => ['linkedin.com', 'lnkd.in'],                    'placeholder' => 'https://www.linkedin.com/company/your-company'],
        'whatsapp'  => ['label' => 'WhatsApp',  'icon' => 'bi-whatsapp',  'hosts' => ['wa.me', 'whatsapp.com'],                      'placeholder' => 'https://wa.me/255620839640'],
        'telegram'  => ['label' => 'Telegram',  'icon' => 'bi-telegram',  'hosts' => ['t.me', 'telegram.me'],                        'placeholder' => 'https://t.me/your-account'],
        'threads'   => ['label' => 'Threads',   'icon' => 'bi-threads',   'hosts' => ['threads.net', 'threads.com'],                 'placeholder' => 'https://www.threads.net/@your-account'],
        'snapchat'  => ['label' => 'Snapchat',  'icon' => 'bi-snapchat',  'hosts' => ['snapchat.com'],                               'placeholder' => 'https://www.snapchat.com/add/your-account'],
        'pinterest' => ['label' => 'Pinterest', 'icon' => 'bi-pinterest', 'hosts' => ['pinterest.com', 'pin.it'],                    'placeholder' => 'https://www.pinterest.com/your-account'],
        'github'    => ['label' => 'GitHub',    'icon' => 'bi-github',    'hosts' => ['github.com'],                                 'placeholder' => 'https://github.com/your-organisation'],
    ];
}

function social_setting_key(string $platform): string
{
    return 'social_' . $platform;
}

/** True if $host equals $domain or is a subdomain of it (www.facebook.com, m.facebook.com ...). */
function social_host_matches(string $host, string $domain): bool
{
    if ($host === $domain) {
        return true;
    }
    $suffix = '.' . $domain;
    return strlen($host) > strlen($suffix) && substr($host, -strlen($suffix)) === $suffix;
}

/**
 * Validates and normalises one URL for one platform.
 *
 * Returns the cleaned URL ('' means "cleared / hide the icon"), or null when
 * the value is not acceptable — in which case $error explains why.
 *
 * Rules: https only (a pasted http:// is upgraded), the host must belong to
 * the platform's own domains (so an icon labelled "Instagram" can never
 * point somewhere else), plain ASCII hostnames only, no embedded
 * username/password, no odd ports, and none of the characters that could
 * break out of an HTML attribute.
 */
function social_normalize_url(string $platform, string $raw, ?string &$error = null): ?string
{
    $platforms = social_platforms();
    if (!isset($platforms[$platform])) {
        $error = 'Unknown platform.';
        return null;
    }
    $label = $platforms[$platform]['label'];

    $url = trim($raw);
    if ($url === '') {
        return '';
    }
    if (strlen($url) > 300) {
        $error = $label . ' link is too long (maximum 300 characters).';
        return null;
    }
    if (preg_match('/[\x00-\x20\x7f]/', $url) || preg_match('/[<>"\'`\\\\]/', $url)) {
        $error = $label . ' link contains spaces or characters that are not allowed.';
        return null;
    }

    // Allow "instagram.com/mabumbatech" (no scheme) and upgrade http:// to https://.
    if (preg_match('#^[a-z][a-z0-9+.\-]*:#i', $url)) {
        if (preg_match('#^http://#i', $url)) {
            $url = 'https://' . substr($url, 7);
        }
        if (!preg_match('#^https://#i', $url)) {
            $error = $label . ' link must start with https://';
            return null;
        }
    } else {
        $url = 'https://' . ltrim($url, '/');
    }

    $parts = parse_url($url);
    if ($parts === false || empty($parts['host'])) {
        $error = $label . ' link is not a valid web address.';
        return null;
    }
    if (isset($parts['user']) || isset($parts['pass'])) {
        $error = $label . ' link must not contain a username or password.';
        return null;
    }
    if (isset($parts['port']) && (int)$parts['port'] !== 443) {
        $error = $label . ' link must not use a custom port.';
        return null;
    }

    $host = strtolower($parts['host']);
    if (!preg_match('/^[a-z0-9.\-]+$/', $host)) {
        $error = $label . ' link has an invalid domain name.';
        return null;
    }

    $ok = false;
    foreach ($platforms[$platform]['hosts'] as $domain) {
        if (social_host_matches($host, $domain)) {
            $ok = true;
            break;
        }
    }
    if (!$ok) {
        $error = $label . ' link must point to ' . implode(' or ', $platforms[$platform]['hosts']) . '.';
        return null;
    }

    return $url;
}

/**
 * Current links as the public site should show them: only platforms that have
 * a URL, in registry order. Each stored value is re-validated on the way out,
 * so a bad value (e.g. edited directly in the database) is never rendered.
 */
function social_get_links(): array
{
    $links = [];
    foreach (social_platforms() as $key => $p) {
        $stored = get_setting(social_setting_key($key));
        if ($stored === '') {
            continue;
        }
        $err = null;
        $url = social_normalize_url($key, $stored, $err);
        if ($url === null || $url === '') {
            continue;
        }
        $links[] = ['key' => $key, 'label' => $p['label'], 'icon' => $p['icon'], 'url' => $url];
    }
    return $links;
}
