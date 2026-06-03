<?php
declare(strict_types=1);

define('GIFT_ROOT', __DIR__);
define('GIFT_PUBLIC_ROOT', GIFT_ROOT . '/public');
define('GIFT_DATA_ROOT', GIFT_ROOT . '/data');
define('GIFT_IDEAS_FILE', GIFT_DATA_ROOT . '/gift-ideas.json');
define('USERS_FILE', GIFT_DATA_ROOT . '/users.json');
define('DEFAULT_AUTH_EMAIL', 'team@giftflow.local');
define('DEFAULT_AUTH_PASSWORD', 'giftflow-demo');
define('SESSION_COOKIE', 'giftflow_session');
define('SESSION_MAX_AGE', 60 * 60 * 24 * 7);
define('PASSWORD_RESET_MAX_AGE', 60 * 30);
define('GOOGLE_STATE_COOKIE', 'giftflow_google_state');
define('GOOGLE_STATE_MAX_AGE', 600);
define('GOOGLE_AUTH_ENDPOINT', 'https://accounts.google.com/o/oauth2/v2/auth');
define('GOOGLE_TOKEN_ENDPOINT', 'https://oauth2.googleapis.com/token');
define('GOOGLE_USERINFO_ENDPOINT', 'https://openidconnect.googleapis.com/v1/userinfo');
define('AMAZON_OAUTH_STATE_COOKIE', 'giftflow_amazon_oauth_state');
define('AMAZON_OAUTH_STATE_MAX_AGE', 600);
define('AMAZON_LWA_TOKEN_ENDPOINT', 'https://api.amazon.com/auth/O2/token');

load_env_file(GIFT_ROOT . '/.env');
handle_request();

function load_env_file(string $path): void
{
    if (!is_file($path) || !is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strncmp($line, '#', 1) === 0 || strpos($line, '=') === false) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if ($key === '' || getenv($key) !== false) {
            continue;
        }

        $quote = substr($value, 0, 1);
        if (($quote === '"' || $quote === "'") && substr($value, -1) === $quote) {
            $value = substr($value, 1, -1);
        }

        putenv($key . '=' . $value);
        $_ENV[$key] = $value;
    }
}

function env_value(string $key, string $default = ''): string
{
    $value = getenv($key);
    return $value === false ? $default : $value;
}

function auth_email(): string
{
    return strtolower(trim(env_value('AUTH_EMAIL', demo_login_enabled() ? DEFAULT_AUTH_EMAIL : '')));
}

function auth_password(): string
{
    return env_value('AUTH_PASSWORD', demo_login_enabled() ? DEFAULT_AUTH_PASSWORD : '');
}

function auth_name(): string
{
    return trim(env_value('AUTH_NAME', 'GiftFlow Team'));
}

function password_login_configured(): bool
{
    return present(auth_email()) && present(auth_password());
}

function account_registration_enabled(): bool
{
    return strtolower(trim(env_value('ALLOW_ACCOUNT_REGISTRATION', 'true'))) !== 'false';
}

function gift_idea_admin_emails(): array
{
    $raw = env_value('GIFT_IDEA_ADMIN_EMAILS', auth_email());
    return array_values(array_filter(array_map(function (string $email): string {
        return strtolower(trim($email));
    }, explode(',', $raw))));
}

function demo_login_enabled(): bool
{
    return strtolower(trim(env_value('ALLOW_DEMO_LOGIN', 'false'))) === 'true';
}

function session_secret(): string
{
    return env_value('SESSION_SECRET', 'development-only-change-me');
}

function using_default_credentials(): bool
{
    return demo_login_enabled() && (getenv('AUTH_EMAIL') === false || getenv('AUTH_PASSWORD') === false);
}

function google_client_id(): string
{
    return trim(env_value('GOOGLE_CLIENT_ID', ''));
}

function google_client_secret(): string
{
    return trim(env_value('GOOGLE_CLIENT_SECRET', ''));
}

function google_allowed_emails(): array
{
    $raw = trim(env_value('GOOGLE_ALLOWED_EMAILS', ''));
    if ($raw === '' && present(auth_email())) {
        $raw = auth_email();
    }

    return array_values(array_filter(array_map(function (string $email): string {
        return strtolower(trim($email));
    }, explode(',', $raw))));
}

function google_allowed_domains(): array
{
    return array_values(array_filter(array_map(function (string $domain): string {
        return strtolower(ltrim(trim($domain), '@'));
    }, explode(',', env_value('GOOGLE_ALLOWED_DOMAINS', '')))));
}

function google_login_configured(): bool
{
    $enabled = strtolower(trim(env_value('ENABLE_GOOGLE_LOGIN', 'false'))) === 'true';
    return $enabled &&
        present(google_client_id()) &&
        present(google_client_secret()) &&
        (count(google_allowed_emails()) > 0 || count(google_allowed_domains()) > 0);
}

function openai_api_key(): string
{
    $key = trim(env_value('OPENAI_API_KEY', ''));
    return $key !== '' ? $key : trim(env_value('AI_API_KEY', ''));
}

function openai_model(): string
{
    return trim(env_value('OPENAI_MODEL', 'gpt-4.1-mini'));
}

function openai_responses_endpoint(): string
{
    return trim(env_value('OPENAI_RESPONSES_ENDPOINT', 'https://api.openai.com/v1/responses'));
}

function openai_configured(): bool
{
    return present(openai_api_key());
}

function amazon_application_id(): string
{
    return trim(env_value('AMAZON_BUSINESS_APPLICATION_ID', ''));
}

function amazon_client_id(): string
{
    return trim(env_value('AMAZON_BUSINESS_CLIENT_ID', ''));
}

function amazon_client_secret(): string
{
    return trim(env_value('AMAZON_BUSINESS_CLIENT_SECRET', ''));
}

function amazon_marketplace_url(): string
{
    return rtrim(trim(env_value('AMAZON_BUSINESS_MARKETPLACE_URL', 'https://www.amazon.com')), '/');
}

function amazon_marketplace_id(): string
{
    return trim(env_value('AMAZON_BUSINESS_MARKETPLACE_ID', 'ATVPDKIKX0DER'));
}

function amazon_api_endpoint(): string
{
    return rtrim(trim(env_value('AMAZON_BUSINESS_API_ENDPOINT', 'https://na.business-api.amazon.com')), '/');
}

function amazon_redirect_uri(): string
{
    $configured = trim(env_value('AMAZON_BUSINESS_REDIRECT_URI', ''));
    return $configured !== '' ? $configured : app_origin() . '/api/amazon/oauth/callback';
}

function amazon_oauth_missing_settings(): array
{
    $missing = [];
    if (!present(amazon_application_id())) {
        $missing[] = 'AMAZON_BUSINESS_APPLICATION_ID';
    }
    if (!present(amazon_client_id())) {
        $missing[] = 'AMAZON_BUSINESS_CLIENT_ID';
    }
    if (!present(amazon_client_secret())) {
        $missing[] = 'AMAZON_BUSINESS_CLIENT_SECRET';
    }
    return $missing;
}

function amazon_oauth_configured(): bool
{
    return count(amazon_oauth_missing_settings()) === 0;
}

function app_origin(): string
{
    $host = trim((string) ($_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') {
        $host = '127.0.0.1';
    }

    $proto = trim((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    if ($proto === '') {
        $proto = is_https_request() ? 'https' : 'http';
    }
    $proto = strtolower(explode(',', $proto)[0]);

    return $proto . '://' . $host;
}

function google_redirect_uri(): string
{
    $configured = trim(env_value('GOOGLE_REDIRECT_URI', ''));
    return $configured !== '' ? $configured : app_origin() . '/api/auth/google/callback';
}

function present($value): bool
{
    return trim((string) $value) !== '';
}

function json_response(array $body, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
}

function default_gift_ideas(): array
{
    return [
        [
            'title' => 'Premium coffee sampler',
            'query' => 'premium coffee sampler gift box',
            'imageUrl' => '',
            'message' => 'Hi {{firstName}}, thought this would make your next planning session a little better. - {{owner}}',
        ],
        [
            'title' => 'Desk notebook set',
            'query' => 'premium desk notebook set',
            'imageUrl' => '',
            'message' => 'Hi {{firstName}}, a useful place for the next round of big ideas. - {{owner}}',
        ],
        [
            'title' => 'Insulated desk tumbler',
            'query' => 'insulated desk tumbler gift',
            'imageUrl' => '',
            'message' => 'Hi {{firstName}}, hope this keeps the good ideas fueled. - {{owner}}',
        ],
        [
            'title' => 'Wireless charging stand',
            'query' => 'wireless charging stand desk',
            'imageUrl' => '',
            'message' => 'Hi {{firstName}}, a small desk upgrade for the workday. - {{owner}}',
        ],
    ];
}

function sanitize_gift_idea($idea): array
{
    $idea = is_array($idea) ? $idea : [];
    return [
        'title' => trim((string) ($idea['title'] ?? '')),
        'query' => trim((string) ($idea['query'] ?? '')),
        'imageUrl' => trim((string) ($idea['imageUrl'] ?? '')),
        'imageUrlSavedAt' => trim((string) ($idea['imageUrlSavedAt'] ?? '')),
        'message' => trim((string) ($idea['message'] ?? '')),
    ];
}

function read_gift_ideas(): array
{
    if (!is_file(GIFT_IDEAS_FILE) || !is_readable(GIFT_IDEAS_FILE)) {
        return default_gift_ideas();
    }

    $decoded = json_decode((string) file_get_contents(GIFT_IDEAS_FILE), true);
    if (!is_array($decoded)) {
        return default_gift_ideas();
    }

    $ideas = array_values(array_filter(array_map('sanitize_gift_idea', $decoded), function (array $idea): bool {
        return present($idea['title']) && present($idea['query']);
    }));

    return count($ideas) ? $ideas : default_gift_ideas();
}

function write_gift_ideas(array $ideas): array
{
    $cleaned = array_values(array_filter(array_map('sanitize_gift_idea', $ideas), function (array $idea): bool {
        return present($idea['title']) && present($idea['query']);
    }));

    if (!count($cleaned)) {
        throw new InvalidArgumentException('Add at least one gift idea with a title and Amazon search query.');
    }

    if (!is_dir(GIFT_DATA_ROOT)) {
        mkdir(GIFT_DATA_ROOT, 0775, true);
    }

    file_put_contents(GIFT_IDEAS_FILE, json_encode($cleaned, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL);
    return $cleaned;
}

function base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64url_decode(string $value): string
{
    $padding = str_repeat('=', (4 - strlen($value) % 4) % 4);
    $decoded = base64_decode(strtr($value . $padding, '-_', '+/'), true);
    return $decoded === false ? '' : $decoded;
}

function normalize_email($email): string
{
    return strtolower(trim((string) $email));
}

function read_registered_users(): array
{
    if (!is_file(USERS_FILE)) {
        return [];
    }

    if (!is_readable(USERS_FILE)) {
        throw new RuntimeException('The account file is not readable.');
    }

    $decoded = json_decode((string) file_get_contents(USERS_FILE), true);
    if (!is_array($decoded)) {
        throw new RuntimeException('The account file is not valid JSON.');
    }

    return array_values(array_filter($decoded, function ($record): bool {
        return is_array($record) && present($record['id'] ?? '') && present($record['email'] ?? '');
    }));
}

function write_registered_users(array $users): void
{
    if (!is_dir(GIFT_DATA_ROOT)) {
        mkdir(GIFT_DATA_ROOT, 0775, true);
    }

    file_put_contents(USERS_FILE, json_encode(array_values($users), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL, LOCK_EX);
}

function registered_user_count(): int
{
    return count(read_registered_users());
}

function user_accounts_enabled(): bool
{
    return account_registration_enabled() || registered_user_count() > 0;
}

function find_registered_user_by_email(string $email): ?array
{
    $normalizedEmail = normalize_email($email);
    foreach (read_registered_users() as $record) {
        if (normalize_email($record['email'] ?? '') === $normalizedEmail) {
            return $record;
        }
    }

    return null;
}

function find_registered_user_by_id(string $id): ?array
{
    foreach (read_registered_users() as $record) {
        if ((string) ($record['id'] ?? '') === $id) {
            return $record;
        }
    }

    return null;
}

function password_digest(string $password): string
{
    $iterations = 310000;
    $salt = random_bytes(16);
    $hash = hash_pbkdf2('sha256', $password, $salt, $iterations, 32, true);
    return implode('$', [
        'pbkdf2_sha256',
        (string) $iterations,
        base64url_encode($salt),
        base64url_encode($hash),
    ]);
}

function verify_password_digest(string $password, string $digest): bool
{
    $parts = explode('$', $digest);
    if (count($parts) !== 4 || $parts[0] !== 'pbkdf2_sha256') {
        return false;
    }

    $iterations = (int) $parts[1];
    if ($iterations < 100000) {
        return false;
    }

    $salt = base64url_decode($parts[2]);
    $expected = base64url_decode($parts[3]);
    if ($salt === '' || $expected === '') {
        return false;
    }

    $actual = hash_pbkdf2('sha256', $password, $salt, $iterations, strlen($expected), true);
    return hash_equals($expected, $actual);
}

function password_reset_token_digest(string $token): string
{
    return hash('sha256', $token);
}

function password_reset_link_visible(): bool
{
    if (strtolower(trim(env_value('SHOW_PASSWORD_RESET_LINKS', 'false'))) === 'true') {
        return true;
    }

    $host = strtolower(explode(':', (string) ($_SERVER['HTTP_HOST'] ?? ''))[0]);
    return in_array($host, ['127.0.0.1', 'localhost', '::1'], true);
}

function password_reset_url(string $token): string
{
    return app_origin() . '/?resetToken=' . rawurlencode($token);
}

function create_password_reset_request($email): array
{
    $message = 'If that account exists, reset instructions will be available shortly.';
    $normalizedEmail = normalize_email($email);
    $user = find_registered_user_by_email($normalizedEmail);
    $result = ['ok' => true, 'message' => $message];
    if ($user === null) {
        return $result;
    }

    $token = base64url_encode(random_bytes(32));
    $resetUrl = password_reset_url($token);
    $users = read_registered_users();
    $index = null;
    foreach ($users as $userIndex => $record) {
        if (normalize_email($record['email'] ?? '') === $normalizedEmail) {
            $index = $userIndex;
            break;
        }
    }

    if ($index === null) {
        return $result;
    }

    $users[$index]['passwordResetTokenHash'] = password_reset_token_digest($token);
    $users[$index]['passwordResetRequestedAt'] = iso_now();
    $users[$index]['passwordResetExpiresAt'] = gmdate('Y-m-d\TH:i:s\Z', time() + PASSWORD_RESET_MAX_AGE);
    $users[$index]['passwordResetUsedAt'] = '';
    write_registered_users($users);

    error_log('[GiftFlow] Password reset link for ' . $normalizedEmail . ': ' . $resetUrl);

    if (password_reset_link_visible()) {
        $result['message'] = 'Use the reset link below to choose a new password.';
        $result['resetUrl'] = $resetUrl;
    }

    return $result;
}

function reset_password_with_token($token, $password, $confirmPassword): array
{
    $cleanToken = trim((string) $token);
    $passwordValue = (string) $password;
    $confirmValue = (string) $confirmPassword;
    $errors = [];

    if ($cleanToken === '') {
        $errors[] = 'Reset link is missing or expired.';
    }
    if (strlen($passwordValue) < 8) {
        $errors[] = 'Use a password with at least 8 characters.';
    }
    if ($confirmValue !== '' && $passwordValue !== $confirmValue) {
        $errors[] = 'Passwords do not match.';
    }
    if (count($errors) > 0) {
        throw new InvalidArgumentException(implode(' ', $errors));
    }

    $digest = password_reset_token_digest($cleanToken);
    $users = read_registered_users();
    $index = null;
    foreach ($users as $userIndex => $record) {
        $storedHash = (string) ($record['passwordResetTokenHash'] ?? '');
        $expiresAt = strtotime((string) ($record['passwordResetExpiresAt'] ?? ''));
        if ($storedHash !== '' && hash_equals($storedHash, $digest) && $expiresAt !== false && $expiresAt > time()) {
            $index = $userIndex;
            break;
        }
    }

    if ($index === null) {
        throw new InvalidArgumentException('Reset link is invalid or expired.');
    }

    $users[$index]['passwordHash'] = password_digest($passwordValue);
    $users[$index]['updatedAt'] = iso_now();
    $users[$index]['passwordResetUsedAt'] = iso_now();
    unset($users[$index]['passwordResetTokenHash'], $users[$index]['passwordResetExpiresAt'], $users[$index]['passwordResetRequestedAt']);
    write_registered_users($users);

    return public_user_from_record($users[$index]);
}

function public_user_from_record(array $record): array
{
    $email = normalize_email($record['email'] ?? '');
    return [
        'sub' => 'account:' . (string) ($record['id'] ?? $email),
        'id' => (string) ($record['id'] ?? ''),
        'email' => $email,
        'name' => trim((string) ($record['name'] ?? '')) ?: explode('@', $email)[0],
        'picture' => '',
        'hostedDomain' => '',
        'role' => (string) ($record['role'] ?? 'user'),
        'onboarded' => bool_value($record['onboarded'] ?? false),
        'onboarding' => is_array($record['onboarding'] ?? null) ? $record['onboarding'] : null,
        'signedInAt' => iso_now(),
    ];
}

function validate_registration_payload(array $payload): array
{
    $name = trim((string) ($payload['name'] ?? ''));
    $email = normalize_email($payload['email'] ?? '');
    $password = (string) ($payload['password'] ?? '');
    $confirmPassword = (string) ($payload['confirmPassword'] ?? '');
    $errors = [];

    if ($name === '') {
        $errors[] = 'Enter your name.';
    }

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Enter a valid email address.';
    }

    if (strlen($password) < 8) {
        $errors[] = 'Use a password with at least 8 characters.';
    }

    if ($confirmPassword !== '' && $password !== $confirmPassword) {
        $errors[] = 'Passwords do not match.';
    }

    if (find_registered_user_by_email($email) !== null || (password_login_configured() && hash_equals(auth_email(), $email))) {
        $errors[] = 'An account already exists for that email.';
    }

    if (count($errors) > 0) {
        throw new InvalidArgumentException(implode(' ', $errors));
    }

    return [
        'name' => $name,
        'email' => $email,
        'password' => $password,
    ];
}

function register_user(array $payload): array
{
    if (!account_registration_enabled()) {
        throw new RuntimeException('Account creation is not enabled for this workspace.');
    }

    $clean = validate_registration_payload($payload);
    $users = read_registered_users();
    $role = count($users) === 0 ? 'admin' : 'user';
    $record = [
        'id' => base64url_encode(random_bytes(18)),
        'email' => $clean['email'],
        'name' => $clean['name'],
        'passwordHash' => password_digest($clean['password']),
        'role' => $role,
        'onboarded' => false,
        'onboarding' => null,
        'createdAt' => iso_now(),
        'updatedAt' => iso_now(),
    ];

    $users[] = $record;
    write_registered_users($users);
    return public_user_from_record($record);
}

function session_signature(string $payload): string
{
    return hash_hmac('sha256', $payload, session_secret());
}

function iso_now(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function today_iso(): string
{
    return gmdate('Y-m-d');
}

function set_session_cookie(array $user): void
{
    $payload = $user;
    $payload['expiresAt'] = gmdate('Y-m-d\TH:i:s\Z', time() + SESSION_MAX_AGE);
    $encoded = base64url_encode(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $cookieValue = $encoded . '.' . session_signature($encoded);

    setcookie(SESSION_COOKIE, $cookieValue, [
        'expires' => time() + SESSION_MAX_AGE,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => is_https_request(),
    ]);
}

function clear_session_cookie(): void
{
    setcookie(SESSION_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => is_https_request(),
    ]);
}

function is_https_request(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function current_user(): ?array
{
    $raw = $_COOKIE[SESSION_COOKIE] ?? '';
    $parts = explode('.', (string) $raw, 2);
    if (count($parts) !== 2 || !present($parts[0]) || !present($parts[1])) {
        return null;
    }

    [$encoded, $signature] = $parts;
    if (!hash_equals(session_signature($encoded), $signature)) {
        return null;
    }

    $decoded = json_decode(base64url_decode($encoded), true);
    if (!is_array($decoded)) {
        return null;
    }

    $expiresAt = strtotime((string) ($decoded['expiresAt'] ?? ''));
    if ($expiresAt === false || $expiresAt < time()) {
        return null;
    }

    return $decoded;
}

function bool_value($value): bool
{
    return $value === true || $value === 1 || $value === '1' || strtolower((string) $value) === 'true';
}

function set_google_state_cookie(string $state): void
{
    setcookie(GOOGLE_STATE_COOKIE, $state, [
        'expires' => time() + GOOGLE_STATE_MAX_AGE,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => is_https_request(),
    ]);
}

function clear_google_state_cookie(): void
{
    setcookie(GOOGLE_STATE_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => is_https_request(),
    ]);
}

function set_amazon_oauth_state_cookie(string $state): void
{
    setcookie(AMAZON_OAUTH_STATE_COOKIE, $state, [
        'expires' => time() + AMAZON_OAUTH_STATE_MAX_AGE,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => is_https_request(),
    ]);
}

function clear_amazon_oauth_state_cookie(): void
{
    setcookie(AMAZON_OAUTH_STATE_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => is_https_request(),
    ]);
}

function redirect_response(string $location): void
{
    http_response_code(302);
    header('Location: ' . $location);
}

function redirect_auth_error(string $message): void
{
    clear_google_state_cookie();
    redirect_response('/?authError=' . rawurlencode($message));
}

function google_authorization_url(string $state): string
{
    return GOOGLE_AUTH_ENDPOINT . '?' . http_build_query([
        'client_id' => google_client_id(),
        'redirect_uri' => google_redirect_uri(),
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => $state,
        'prompt' => 'select_account',
    ]);
}

function amazon_authorization_url(string $state): string
{
    return amazon_marketplace_url() . '/b2b/abws/oauth?' . http_build_query([
        'state' => $state,
        'redirect_uri' => amazon_redirect_uri(),
        'applicationId' => amazon_application_id(),
    ]);
}

function http_json_request(string $method, string $url, array $headers = [], string $body = ''): array
{
    $status = 0;
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($curl, CURLOPT_TIMEOUT, 12);
        if (count($headers) > 0) {
            curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
        }
        if ($body !== '') {
            curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
        }

        $response = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($curl);
        curl_close($curl);

        if ($response === false) {
            throw new RuntimeException('OAuth request could not reach the provider. ' . ($curlError ?: 'Check outbound HTTPS from Forge.'));
        }
    } else {
        $headerText = implode("\r\n", $headers);
        $options = [
            'http' => [
                'method' => $method,
                'header' => $headerText,
                'ignore_errors' => true,
                'timeout' => 12,
            ],
        ];

        if ($body !== '') {
            $options['http']['content'] = $body;
        }

        $response = @file_get_contents($url, false, stream_context_create($options));
        if ($response === false) {
            throw new RuntimeException('OAuth request could not reach the provider. Check outbound HTTPS from Forge.');
        }

        $responseHeaders = $http_response_header ?? [];
        if (isset($responseHeaders[0]) && preg_match('/\s(\d{3})\s/', $responseHeaders[0], $matches)) {
            $status = (int) $matches[1];
        }
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('OAuth provider returned an unreadable response.');
    }

    if ($status < 200 || $status >= 300) {
        $reason = (string) ($decoded['error_description'] ?? $decoded['error'] ?? 'OAuth request failed.');
        throw new RuntimeException($reason);
    }

    return $decoded;
}

function post_json_request(string $url, array $headers, array $body): array
{
    $headers[] = 'Content-Type: application/json';
    $status = 0;
    $encodedBody = json_encode($body, JSON_UNESCAPED_SLASHES);

    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl, CURLOPT_POST, true);
        curl_setopt($curl, CURLOPT_TIMEOUT, 20);
        curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($curl, CURLOPT_POSTFIELDS, $encodedBody);

        $response = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($curl);
        curl_close($curl);

        if ($response === false) {
            throw new RuntimeException('AI request could not reach the provider. ' . ($curlError ?: 'Check outbound HTTPS from Forge.'));
        }
    } else {
        $options = [
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", $headers),
                'content' => $encodedBody,
                'ignore_errors' => true,
                'timeout' => 20,
            ],
        ];
        $response = @file_get_contents($url, false, stream_context_create($options));
        if ($response === false) {
            throw new RuntimeException('AI request could not reach the provider. Check outbound HTTPS from Forge.');
        }

        $responseHeaders = $http_response_header ?? [];
        if (isset($responseHeaders[0]) && preg_match('/\s(\d{3})\s/', $responseHeaders[0], $matches)) {
            $status = (int) $matches[1];
        }
    }

    $decoded = json_decode((string) $response, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('AI provider returned an unreadable response.');
    }

    if ($status < 200 || $status >= 300) {
        $error = $decoded['error'] ?? null;
        $message = is_array($error) ? (string) ($error['message'] ?? 'AI request failed.') : 'AI request failed.';
        throw new RuntimeException($message);
    }

    return $decoded;
}

function gift_enrichment_schema(): array
{
    return [
        'type' => 'json_schema',
        'name' => 'gift_enrichment',
        'strict' => true,
        'schema' => [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => [
                'itemName' => ['type' => 'string'],
                'asin' => ['type' => 'string'],
                'giftMessage' => ['type' => 'string'],
                'imageUrl' => ['type' => 'string'],
                'imageNote' => ['type' => 'string'],
            ],
            'required' => ['itemName', 'asin', 'giftMessage', 'imageUrl', 'imageNote'],
        ],
    ];
}

function extract_openai_text(array $payload): string
{
    foreach (($payload['output'] ?? []) as $item) {
        foreach (($item['content'] ?? []) as $content) {
            $text = (string) ($content['text'] ?? '');
            if (($content['type'] ?? '') === 'output_text' && $text !== '') {
                return $text;
            }
        }
    }

    return '';
}

function safe_image_url($value): bool
{
    $url = trim((string) $value);
    if (!preg_match('/^https?:\/\//i', $url)) {
        return false;
    }

    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    $path = strtolower((string) parse_url($url, PHP_URL_PATH));
    return in_array($host, ['m.media-amazon.com', 'images-na.ssl-images-amazon.com'], true) &&
        preg_match('/\.(jpg|jpeg|png|webp)$/i', $path) === 1;
}

function enrich_amazon_gift(array $payload): array
{
    if (!openai_configured()) {
        throw new RuntimeException('AI enrichment is not configured on this server.');
    }

    $itemUrl = trim((string) ($payload['itemUrl'] ?? ''));
    if ($itemUrl === '') {
        throw new InvalidArgumentException('Paste an Amazon product URL before using AI fill.');
    }

    $prompt = [
        'itemUrl' => $itemUrl,
        'asinFromUrlParser' => trim((string) ($payload['asin'] ?? '')),
        'titleFromUrlSlug' => trim((string) ($payload['title'] ?? '')),
        'currentGiftName' => trim((string) ($payload['currentName'] ?? '')),
        'campaignOwner' => trim((string) ($payload['owner'] ?? '')),
    ];

    $response = post_json_request(
        openai_responses_endpoint(),
        ['Authorization: Bearer ' . openai_api_key()],
        [
            'model' => openai_model(),
            'instructions' => implode(' ', [
                'You help GiftFlow fill a gift-sequence card from an Amazon product URL.',
                'Infer only lightweight product metadata from the provided URL, ASIN, and slug text.',
                'Do not claim you verified live Amazon page details.',
                'Do not invent official Amazon product image URLs.',
                'Set imageUrl to an empty string unless the provided input includes a safe direct image URL.',
                'Write giftMessage with {{firstName}} and {{owner}} placeholders when useful.',
                'Keep all fields concise.',
            ]),
            'input' => json_encode($prompt, JSON_UNESCAPED_SLASHES),
            'text' => ['format' => gift_enrichment_schema()],
            'max_output_tokens' => 450,
        ]
    );

    $enrichment = json_decode(extract_openai_text($response), true);
    if (!is_array($enrichment)) {
        throw new RuntimeException('AI provider returned enrichment in an unreadable format.');
    }

    $imageUrl = trim((string) ($enrichment['imageUrl'] ?? ''));
    return [
        'itemName' => trim((string) ($enrichment['itemName'] ?? '')),
        'asin' => strtoupper(trim((string) ($enrichment['asin'] ?? ''))),
        'giftMessage' => trim((string) ($enrichment['giftMessage'] ?? '')),
        'imageUrl' => safe_image_url($imageUrl) ? $imageUrl : '',
        'imageNote' => trim((string) ($enrichment['imageNote'] ?? '')),
    ];
}

function exchange_google_code(string $code): array
{
    return http_json_request(
        'POST',
        GOOGLE_TOKEN_ENDPOINT,
        ['Content-Type: application/x-www-form-urlencoded'],
        http_build_query([
            'code' => $code,
            'client_id' => google_client_id(),
            'client_secret' => google_client_secret(),
            'redirect_uri' => google_redirect_uri(),
            'grant_type' => 'authorization_code',
        ])
    );
}

function exchange_amazon_oauth_code(string $code): array
{
    return http_json_request(
        'POST',
        AMAZON_LWA_TOKEN_ENDPOINT,
        ['Content-Type: application/x-www-form-urlencoded'],
        http_build_query([
            'grant_type' => 'authorization_code',
            'code' => $code,
            'client_id' => amazon_client_id(),
            'client_secret' => amazon_client_secret(),
            'redirect_uri' => amazon_redirect_uri(),
        ])
    );
}

function amazon_oauth_callback_payload(): array
{
    if (!amazon_oauth_configured()) {
        throw new RuntimeException('Amazon Business connection is not configured. Set the Amazon Business application ID, client ID, and client secret on Forge.');
    }

    $expectedState = (string) ($_COOKIE[AMAZON_OAUTH_STATE_COOKIE] ?? '');
    $actualState = (string) ($_GET['state'] ?? '');
    if ($expectedState === '' || $actualState === '' || !hash_equals($expectedState, $actualState)) {
        throw new RuntimeException('Amazon authorization expired. Try connecting again.');
    }

    if (present($_GET['error'] ?? '')) {
        throw new RuntimeException('Amazon authorization was canceled or denied.');
    }

    $code = trim((string) ($_GET['code'] ?? ''));
    if ($code === '') {
        throw new RuntimeException('Amazon did not return the temporary connection code.');
    }

    $token = exchange_amazon_oauth_code($code);
    $refreshToken = trim((string) ($token['refresh_token'] ?? ''));
    if ($refreshToken === '') {
        throw new RuntimeException('Amazon did not approve a reusable workspace connection.');
    }

    return [
        'type' => 'giftflow-amazon-oauth',
        'ok' => true,
        'refreshToken' => $refreshToken,
        'accessToken' => trim((string) ($token['access_token'] ?? '')),
        'expiresIn' => (int) ($token['expires_in'] ?? 3600),
        'clientId' => amazon_client_id(),
        'marketplace' => amazon_marketplace_id(),
        'endpoint' => amazon_api_endpoint(),
    ];
}

function amazon_oauth_result_page(array $payload): void
{
    clear_amazon_oauth_state_cookie();
    http_response_code(200);
    header('Content-Type: text/html; charset=utf-8');
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $origin = json_encode(app_origin(), JSON_UNESCAPED_SLASHES);
    $title = $payload['ok'] ? 'Amazon connected' : 'Amazon connection failed';
    $message = $payload['ok']
        ? 'Amazon Business approved the GiftFlow workspace connection. You can close this window.'
        : (string) ($payload['error'] ?? 'Amazon Business could not connect.');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title>';
    echo '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Inter,Arial,sans-serif;background:#fbfaf6;color:#171717}main{width:min(560px,calc(100% - 40px));padding:32px;border:1px solid #ded8cc;background:#fff;border-radius:8px;box-shadow:0 18px 48px rgba(0,0,0,.12)}h1{margin:0 0 12px;font-size:32px}p{margin:0;color:#5f5a52;line-height:1.5}</style>';
    echo '</head><body><main><h1>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</h1><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p></main>';
    echo '<script>const payload=' . $json . ';const targetOrigin=' . $origin . ';if(window.opener){window.opener.postMessage(payload,targetOrigin);setTimeout(()=>window.close(),900);}else{localStorage.setItem("giftflow-amazon-oauth-result",JSON.stringify(payload));setTimeout(()=>{window.location.href="/automation.html";},900);}</script>';
    echo '</body></html>';
}

function fetch_google_profile(string $accessToken): array
{
    return http_json_request(
        'GET',
        GOOGLE_USERINFO_ENDPOINT,
        ['Authorization: Bearer ' . $accessToken]
    );
}

function google_profile_allowed(string $email, string $hostedDomain): bool
{
    $allowedEmails = google_allowed_emails();
    if (count($allowedEmails) > 0 && in_array($email, $allowedEmails, true)) {
        return true;
    }

    $allowedDomains = google_allowed_domains();
    if (count($allowedDomains) > 0 && $hostedDomain !== '' && in_array($hostedDomain, $allowedDomains, true)) {
        return true;
    }

    return false;
}

function google_user_from_profile(array $profile): array
{
    $email = strtolower(trim((string) ($profile['email'] ?? '')));
    $hostedDomain = strtolower(trim((string) ($profile['hd'] ?? '')));
    $verified = bool_value($profile['email_verified'] ?? $profile['verified_email'] ?? false);

    if ($email === '' || !$verified) {
        throw new RuntimeException('Google did not return a verified email address.');
    }

    if (!google_profile_allowed($email, $hostedDomain)) {
        throw new RuntimeException('That Google account is not authorized for this workspace.');
    }

    $sub = trim((string) ($profile['sub'] ?? ''));
    return [
        'sub' => 'google:' . ($sub !== '' ? $sub : $email),
        'email' => $email,
        'name' => trim((string) ($profile['name'] ?? '')) ?: explode('@', $email)[0],
        'picture' => trim((string) ($profile['picture'] ?? '')),
        'hostedDomain' => $hostedDomain,
        'onboarded' => true,
        'signedInAt' => iso_now(),
    ];
}

function authenticate_google_callback(): array
{
    if (!google_login_configured()) {
        throw new RuntimeException('Google login is not configured for this workspace.');
    }

    $expectedState = (string) ($_COOKIE[GOOGLE_STATE_COOKIE] ?? '');
    $actualState = (string) ($_GET['state'] ?? '');
    if ($expectedState === '' || $actualState === '' || !hash_equals($expectedState, $actualState)) {
        throw new RuntimeException('Google sign-in expired. Try again.');
    }

    if (present($_GET['error'] ?? '')) {
        throw new RuntimeException('Google sign-in was canceled or denied.');
    }

    $code = trim((string) ($_GET['code'] ?? ''));
    if ($code === '') {
        throw new RuntimeException('Google did not return a sign-in code.');
    }

    $token = exchange_google_code($code);
    $accessToken = trim((string) ($token['access_token'] ?? ''));
    if ($accessToken === '') {
        throw new RuntimeException('Google did not return an access token.');
    }

    return google_user_from_profile(fetch_google_profile($accessToken));
}

function authenticate_user($email, $password): array
{
    if (!user_accounts_enabled() && !password_login_configured()) {
        throw new RuntimeException('Authentication is not configured. Enable account creation or set AUTH_EMAIL and AUTH_PASSWORD.');
    }

    $normalizedEmail = normalize_email($email);
    $passwordValue = (string) $password;
    $registeredUser = find_registered_user_by_email($normalizedEmail);
    if ($registeredUser !== null && verify_password_digest($passwordValue, (string) ($registeredUser['passwordHash'] ?? ''))) {
        return public_user_from_record($registeredUser);
    }

    $demoCredentials = demo_login_enabled() &&
        hash_equals(DEFAULT_AUTH_EMAIL, $normalizedEmail) &&
        hash_equals(DEFAULT_AUTH_PASSWORD, $passwordValue);
    $privateCredentials = password_login_configured() &&
        hash_equals(auth_email(), $normalizedEmail) &&
        hash_equals(auth_password(), $passwordValue);

    if (!$demoCredentials && !$privateCredentials) {
        throw new RuntimeException('Email or password is incorrect.');
    }

    $name = auth_name();
    $signedInEmail = $demoCredentials ? DEFAULT_AUTH_EMAIL : auth_email();
    $signedInName = $demoCredentials ? 'GiftFlow Demo' : ($name === '' ? explode('@', auth_email())[0] : $name);

    return [
        'sub' => 'local-auth:' . $signedInEmail,
        'email' => $signedInEmail,
        'name' => $signedInName,
        'picture' => '',
        'hostedDomain' => '',
        'onboarded' => $demoCredentials,
        'signedInAt' => iso_now(),
    ];
}

function update_registered_user_onboarding(array $sessionUser, array $onboarding): ?array
{
    $sub = (string) ($sessionUser['sub'] ?? '');
    if (strpos($sub, 'account:') !== 0) {
        return null;
    }

    $id = substr($sub, strlen('account:'));
    $users = read_registered_users();
    foreach ($users as $index => $record) {
        if ((string) ($record['id'] ?? '') !== $id) {
            continue;
        }

        $record['onboarded'] = true;
        $record['onboarding'] = $onboarding;
        $record['updatedAt'] = iso_now();
        $users[$index] = $record;
        write_registered_users($users);
        return public_user_from_record($record);
    }

    return null;
}

function require_user(): ?array
{
    $user = current_user();
    if ($user !== null) {
        return $user;
    }

    json_response(['ok' => false, 'errors' => ['Sign in to continue.']], 401);
    return null;
}

function gift_idea_admin($user): bool
{
    if (!is_array($user)) {
        return false;
    }

    if (($user['role'] ?? '') === 'admin') {
        return true;
    }

    return in_array(strtolower(trim((string) ($user['email'] ?? ''))), gift_idea_admin_emails(), true);
}

function require_gift_idea_admin(): ?array
{
    $user = require_user();
    if ($user === null) {
        return null;
    }

    if (gift_idea_admin($user)) {
        return $user;
    }

    json_response(['ok' => false, 'errors' => ['You are not authorized to edit gift suggestions.']], 403);
    return null;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($payload)) {
        throw new InvalidArgumentException('Request body must be valid JSON.');
    }

    return $payload;
}

function parse_date_value($value): ?string
{
    $raw = trim((string) $value);
    if ($raw === '') {
        return null;
    }

    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $raw, new DateTimeZone('UTC'));
    return $date && $date->format('Y-m-d') === $raw ? $raw : null;
}

function template_text($text, array $recipient, array $campaign): string
{
    return preg_replace_callback('/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/', function (array $matches) use ($recipient, $campaign): string {
        $key = $matches[1];
        if ($key === 'firstName') {
            $parts = preg_split('/\s+/', trim((string) ($recipient['name'] ?? '')));
            return $parts[0] ?? '';
        }
        if ($key === 'name') {
            return (string) ($recipient['name'] ?? '');
        }
        if ($key === 'company') {
            return (string) ($recipient['company'] ?? '');
        }
        if ($key === 'campaign') {
            return (string) ($campaign['name'] ?? '');
        }
        if ($key === 'owner') {
            return (string) ($campaign['owner'] ?? '');
        }
        return '';
    }, (string) $text);
}

function sequence_signature(array $steps): string
{
    $comparable = array_map(function (array $step): array {
        return [
            (int) ($step['order'] ?? 0),
            (string) ($step['name'] ?? ''),
            (string) ($step['sendDate'] ?? ''),
            (string) ($step['itemName'] ?? ''),
            (string) ($step['asin'] ?? ''),
            (string) ($step['itemUrl'] ?? ''),
            (string) ($step['imageUrl'] ?? ''),
            (string) ($step['imageUrlSavedAt'] ?? ''),
            (int) ($step['quantity'] ?? 0),
            (string) ($step['message'] ?? ''),
            (string) ($step['emailSubjectWhenSent'] ?? ''),
            (string) ($step['emailBodyWhenSent'] ?? ''),
            (string) ($step['emailSubjectWhenDelivered'] ?? ''),
            (string) ($step['emailBodyWhenDelivered'] ?? ''),
            (string) ($step['note'] ?? ''),
        ];
    }, $steps);

    return json_encode($comparable, JSON_UNESCAPED_SLASHES);
}

function uuid_v4(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function ready_for_live_amazon(array $state): bool
{
    $amazon = is_array($state['amazon'] ?? null) ? $state['amazon'] : [];
    foreach (['clientId', 'refreshToken', 'marketplace', 'endpoint'] as $key) {
        if (!present($amazon[$key] ?? '')) {
            return false;
        }
    }
    return true;
}

function process_orders(array $state, $runDate): array
{
    $campaign = is_array($state['campaign'] ?? null) ? $state['campaign'] : [];
    $steps = is_array($state['steps'] ?? null) ? $state['steps'] : [];
    $recipients = is_array($state['recipients'] ?? null) ? $state['recipients'] : [];
    $execution = is_array($state['execution'] ?? null) ? $state['execution'] : [];
    $existingHistory = is_array($state['orderHistory'] ?? null) ? $state['orderHistory'] : [];
    $today = parse_date_value($runDate) ?? today_iso();
    $signature = sequence_signature($steps);
    $confirmedSignature = (string) ($execution['confirmedSequenceSignature'] ?? '');
    $sequenceConfirmed = ((string) ($execution['sequenceConfirmedAt'] ?? '')) !== '' && $confirmedSignature === $signature;
    $amazonMode = (string) ($execution['amazonMode'] ?? 'queue-only');

    $errors = [];
    if (!$sequenceConfirmed) {
        $errors[] = 'Confirm the gift sequence before automation runs.';
    }

    $validSteps = array_values(array_filter($steps, function ($step) use ($today): bool {
        if (!is_array($step)) {
            return false;
        }
        $dueDate = parse_date_value($step['sendDate'] ?? '');
        return $dueDate !== null &&
            $dueDate <= $today &&
            present($step['itemName'] ?? '') &&
            (present($step['asin'] ?? '') || present($step['itemUrl'] ?? ''));
    }));

    $eligibleRecipients = array_values(array_filter($recipients, function ($recipient): bool {
        if (!is_array($recipient) || ($recipient['readyToSend'] ?? false) !== true) {
            return false;
        }
        foreach (['name', 'street', 'city', 'state', 'zip'] as $field) {
            if (!present($recipient[$field] ?? '')) {
                return false;
            }
        }
        return true;
    }));

    if (count($validSteps) === 0) {
        $errors[] = 'No gift steps are due as of ' . $today . '.';
    }
    if (count($eligibleRecipients) === 0) {
        $errors[] = 'No prospects are marked ready with complete shipping addresses.';
    }

    $created = [];
    $history = $existingHistory;
    $existingKeys = [];
    foreach ($history as $record) {
        if (is_array($record)) {
            $existingKeys[(string) ($record['dedupeKey'] ?? '')] = true;
        }
    }

    if (count($errors) === 0) {
        foreach ($eligibleRecipients as $recipient) {
            foreach ($validSteps as $step) {
                $recipientKey = (string) ($recipient['id'] ?? ($recipient['email'] ?? ''));
                $stepKey = (string) ($step['id'] ?? ($step['order'] ?? ''));
                $dedupeKey = $recipientKey . ':' . $stepKey;
                if (isset($existingKeys[$dedupeKey])) {
                    continue;
                }

                if ($amazonMode === 'amazon-business-api') {
                    $status = ready_for_live_amazon($state) ? 'ready_for_live_connector' : 'needs_amazon_credentials';
                } elseif ($amazonMode === 'sandbox') {
                    $status = 'simulated';
                } else {
                    $status = 'queued_for_review';
                }

                $record = [
                    'id' => uuid_v4(),
                    'dedupeKey' => $dedupeKey,
                    'status' => $status,
                    'createdAt' => iso_now(),
                    'runDate' => $today,
                    'campaignName' => (string) ($campaign['name'] ?? ''),
                    'recipientId' => (string) ($recipient['id'] ?? ''),
                    'recipientName' => (string) ($recipient['name'] ?? ''),
                    'recipientEmail' => (string) ($recipient['email'] ?? ''),
                    'company' => (string) ($recipient['company'] ?? ''),
                    'assignedTo' => (string) ($recipient['assignedTo'] ?? ''),
                    'stepId' => (string) ($step['id'] ?? ''),
                    'stepName' => (string) ($step['name'] ?? ''),
                    'sendDate' => (string) ($step['sendDate'] ?? ''),
                    'itemName' => (string) ($step['itemName'] ?? ''),
                    'asin' => (string) ($step['asin'] ?? ''),
                    'itemUrl' => (string) ($step['itemUrl'] ?? ''),
                    'quantity' => max((int) ($step['quantity'] ?? 1), 1),
                    'giftMessage' => template_text($step['message'] ?? '', $recipient, $campaign),
                    'shippingAddress' => [
                        'name' => (string) ($recipient['name'] ?? ''),
                        'street' => (string) ($recipient['street'] ?? ''),
                        'city' => (string) ($recipient['city'] ?? ''),
                        'state' => (string) ($recipient['state'] ?? ''),
                        'zip' => (string) ($recipient['zip'] ?? ''),
                    ],
                    'amazonPayload' => [
                        'marketplace' => (string) (($state['amazon']['marketplace'] ?? '') ?: ''),
                        'asin' => (string) ($step['asin'] ?? ''),
                        'url' => (string) ($step['itemUrl'] ?? ''),
                        'quantity' => max((int) ($step['quantity'] ?? 1), 1),
                        'giftMessage' => template_text($step['message'] ?? '', $recipient, $campaign),
                        'shippingDefaults' => (string) ($execution['shippingDefaults'] ?? ''),
                    ],
                ];

                $history[] = $record;
                $created[] = $record;
                $existingKeys[$dedupeKey] = true;
            }
        }
    }

    $newExecution = $execution;
    $newExecution['lastRunAt'] = iso_now();
    $newExecution['lastRunDate'] = $today;
    $newState = $state;
    $newState['orderHistory'] = $history;
    $newState['execution'] = $newExecution;

    return [
        'ok' => count($errors) === 0,
        'errors' => $errors,
        'summary' => [
            'runDate' => $today,
            'dueSteps' => count($validSteps),
            'eligibleRecipients' => count($eligibleRecipients),
            'createdOrders' => count($created),
            'skippedDuplicates' => count($existingHistory) + (count($validSteps) * count($eligibleRecipients)) - count($history),
            'mode' => $amazonMode,
        ],
        'createdOrders' => $created,
        'state' => $newState,
    ];
}

function handle_request(): void
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

    if ($path === '/api/health') {
        json_response(['ok' => true, 'service' => 'gift-campaigns', 'runtime' => 'php-herd']);
        return;
    }

    if ($path === '/api/auth/config') {
        $user = current_user();
        $accountLoginEnabled = user_accounts_enabled();
        $passwordLoginConfigured = password_login_configured();
        $googleLoginConfigured = google_login_configured();
        json_response([
            'ok' => true,
            'configured' => $accountLoginEnabled || $passwordLoginConfigured || $googleLoginConfigured,
            'authMode' => 'account',
            'accountLoginEnabled' => $accountLoginEnabled,
            'accountRegistrationEnabled' => account_registration_enabled(),
            'hasRegisteredUsers' => registered_user_count() > 0,
            'passwordLoginEnabled' => $passwordLoginConfigured,
            'googleLoginEnabled' => $googleLoginConfigured,
            'demoLoginEnabled' => demo_login_enabled(),
            'usingDefaultCredentials' => using_default_credentials(),
            'user' => $user,
            'permissions' => [
                'giftIdeaAdmin' => gift_idea_admin($user),
            ],
        ]);
        return;
    }

    if ($path === '/api/auth/register') {
        try {
            $payload = read_json_body();
            $user = register_user($payload);
            set_session_cookie($user);
            json_response(['ok' => true, 'user' => $user]);
        } catch (InvalidArgumentException $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 400);
        } catch (Throwable $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 403);
        }
        return;
    }

    if ($path === '/api/auth/google/start') {
        if (!google_login_configured()) {
            redirect_auth_error('Google login is not configured yet.');
            return;
        }

        $state = base64url_encode(random_bytes(32));
        set_google_state_cookie($state);
        redirect_response(google_authorization_url($state));
        return;
    }

    if ($path === '/api/auth/google/callback') {
        try {
            $user = authenticate_google_callback();
            clear_google_state_cookie();
            set_session_cookie($user);
            redirect_response('/');
        } catch (Throwable $error) {
            redirect_auth_error($error->getMessage());
        }
        return;
    }

    if ($path === '/api/auth/session') {
        $user = current_user();
        json_response(['ok' => true, 'authenticated' => $user !== null, 'user' => $user]);
        return;
    }

    if ($path === '/api/auth/login') {
        try {
            $payload = read_json_body();
            $user = authenticate_user($payload['email'] ?? '', $payload['password'] ?? '');
            set_session_cookie($user);
            json_response(['ok' => true, 'user' => $user]);
        } catch (InvalidArgumentException $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 400);
        } catch (Throwable $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 401);
        }
        return;
    }

    if ($path === '/api/auth/password-reset/request') {
        try {
            $payload = read_json_body();
            json_response(create_password_reset_request($payload['email'] ?? ''));
        } catch (InvalidArgumentException $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 400);
        } catch (Throwable $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 400);
        }
        return;
    }

    if ($path === '/api/auth/password-reset/confirm') {
        try {
            $payload = read_json_body();
            $user = reset_password_with_token(
                $payload['token'] ?? '',
                $payload['password'] ?? '',
                $payload['confirmPassword'] ?? ''
            );
            set_session_cookie($user);
            json_response(['ok' => true, 'user' => $user]);
        } catch (InvalidArgumentException $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 400);
        } catch (Throwable $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 400);
        }
        return;
    }

    if ($path === '/api/auth/onboarding') {
        $user = require_user();
        if ($user === null) {
            return;
        }

        try {
            $payload = read_json_body();
            $onboarding = [
                'companyName' => trim((string) ($payload['companyName'] ?? '')),
                'teamName' => trim((string) ($payload['teamName'] ?? '')),
                'role' => trim((string) ($payload['role'] ?? '')),
                'useCase' => trim((string) ($payload['useCase'] ?? '')),
                'completedAt' => iso_now(),
            ];
            $updatedUser = update_registered_user_onboarding($user, $onboarding) ??
                array_merge($user, ['onboarded' => true, 'onboarding' => $onboarding]);
            set_session_cookie($updatedUser);
            json_response(['ok' => true, 'user' => $updatedUser]);
        } catch (InvalidArgumentException $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 400);
        }
        return;
    }

    if ($path === '/api/auth/logout') {
        clear_session_cookie();
        json_response(['ok' => true]);
        return;
    }

    if ($path === '/api/amazon/oauth/config') {
        if (require_user() === null) {
            return;
        }

        $missing = amazon_oauth_missing_settings();
        json_response([
            'ok' => true,
            'configured' => count($missing) === 0,
            'missing' => $missing,
            'clientId' => amazon_client_id(),
            'marketplace' => amazon_marketplace_id(),
            'marketplaceUrl' => amazon_marketplace_url(),
            'endpoint' => amazon_api_endpoint(),
            'redirectUri' => amazon_redirect_uri(),
        ]);
        return;
    }

    if ($path === '/api/amazon/enrich') {
        if (require_user() === null) {
            return;
        }

        try {
            $payload = read_json_body();
            json_response(['ok' => true, 'enrichment' => enrich_amazon_gift($payload)]);
        } catch (InvalidArgumentException $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 400);
        } catch (Throwable $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 422);
        }
        return;
    }

    if ($path === '/api/amazon/oauth/start') {
        if (require_user() === null) {
            return;
        }

        if (!amazon_oauth_configured()) {
            amazon_oauth_result_page([
                'type' => 'giftflow-amazon-oauth',
                'ok' => false,
                'error' => 'Amazon Business connection is not configured. Add AMAZON_BUSINESS_APPLICATION_ID, AMAZON_BUSINESS_CLIENT_ID, and AMAZON_BUSINESS_CLIENT_SECRET on Forge.',
            ]);
            return;
        }

        $state = base64url_encode(random_bytes(32));
        set_amazon_oauth_state_cookie($state);
        redirect_response(amazon_authorization_url($state));
        return;
    }

    if ($path === '/api/amazon/oauth/callback') {
        try {
            amazon_oauth_result_page(amazon_oauth_callback_payload());
        } catch (Throwable $error) {
            amazon_oauth_result_page([
                'type' => 'giftflow-amazon-oauth',
                'ok' => false,
                'error' => $error->getMessage(),
            ]);
        }
        return;
    }

    if ($path === '/api/amazon/oauth/exchange') {
        if (require_user() === null) {
            return;
        }

        try {
            if (!amazon_oauth_configured()) {
                json_response([
                    'type' => 'giftflow-amazon-oauth',
                    'ok' => false,
                    'errors' => ['Amazon Business connection is not configured. Add the Amazon Business application ID, client ID, and client secret on Forge.'],
                ], 422);
                return;
            }

            $payload = read_json_body();
            $code = trim((string) ($payload['code'] ?? ''));
            if ($code === '') {
                json_response([
                    'type' => 'giftflow-amazon-oauth',
                    'ok' => false,
                    'errors' => ['Paste the temporary code from the Amazon callback URL.'],
                ], 400);
                return;
            }

            $token = exchange_amazon_oauth_code($code);
            $refreshToken = trim((string) ($token['refresh_token'] ?? ''));
            if ($refreshToken === '') {
                throw new RuntimeException('Amazon did not approve a reusable workspace connection.');
            }

            json_response([
                'type' => 'giftflow-amazon-oauth',
                'ok' => true,
                'refreshToken' => $refreshToken,
                'accessToken' => trim((string) ($token['access_token'] ?? '')),
                'expiresIn' => (int) ($token['expires_in'] ?? 3600),
                'clientId' => amazon_client_id(),
                'marketplace' => amazon_marketplace_id(),
                'endpoint' => amazon_api_endpoint(),
            ]);
        } catch (InvalidArgumentException $error) {
            json_response(['type' => 'giftflow-amazon-oauth', 'ok' => false, 'errors' => [$error->getMessage()]], 400);
        } catch (Throwable $error) {
            json_response(['type' => 'giftflow-amazon-oauth', 'ok' => false, 'errors' => [$error->getMessage()]], 422);
        }
        return;
    }

    if ($path === '/api/gift-ideas') {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method === 'GET') {
            json_response(['ok' => true, 'ideas' => read_gift_ideas()]);
            return;
        }

        if ($method !== 'POST' && $method !== 'PUT') {
            json_response(['ok' => false, 'errors' => ['Method not allowed.']], 405);
            return;
        }

        if (require_gift_idea_admin() === null) {
            return;
        }

        try {
            $payload = read_json_body();
            if (!isset($payload['ideas']) || !is_array($payload['ideas'])) {
                json_response(['ok' => false, 'errors' => ['Missing required field: ideas']], 422);
                return;
            }
            json_response(['ok' => true, 'ideas' => write_gift_ideas($payload['ideas'])]);
        } catch (InvalidArgumentException $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 400);
        } catch (Throwable $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 422);
        }
        return;
    }

    if ($path === '/api/orders/process') {
        if (require_user() === null) {
            return;
        }

        try {
            $payload = read_json_body();
            if (!isset($payload['state']) || !is_array($payload['state'])) {
                json_response(['ok' => false, 'errors' => ['Missing required field: state']], 422);
                return;
            }
            json_response(process_orders($payload['state'], $payload['runDate'] ?? today_iso()));
        } catch (InvalidArgumentException $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 400);
        } catch (Throwable $error) {
            json_response(['ok' => false, 'errors' => [$error->getMessage()]], 500);
        }
        return;
    }

    serve_public_file($path);
}

function serve_public_file(string $path): void
{
    $requestPath = $path === '/' ? '/index.html' : $path;
    $publicRoot = realpath(GIFT_PUBLIC_ROOT);
    $filePath = realpath(GIFT_PUBLIC_ROOT . '/' . ltrim($requestPath, '/'));

    if ($publicRoot !== false &&
        $filePath !== false &&
        strncmp($filePath, $publicRoot . DIRECTORY_SEPARATOR, strlen($publicRoot) + 1) === 0 &&
        strtolower(pathinfo($filePath, PATHINFO_EXTENSION)) !== 'php' &&
        is_file($filePath)) {
        header('Content-Type: ' . mime_type($filePath));
        header('Content-Length: ' . filesize($filePath));
        readfile($filePath);
        return;
    }

    http_response_code(404);
    header('Content-Type: text/plain');
    echo 'Not found';
}

function mime_type(string $filePath): string
{
    $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    $types = [
        'html' => 'text/html; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'js' => 'application/javascript; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'ico' => 'image/x-icon',
    ];

    return $types[$extension] ?? 'application/octet-stream';
}
