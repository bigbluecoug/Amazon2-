<?php
declare(strict_types=1);

define('GIFT_ROOT', __DIR__);
define('GIFT_PUBLIC_ROOT', GIFT_ROOT . '/public');
define('DEFAULT_AUTH_EMAIL', 'team@giftflow.local');
define('DEFAULT_AUTH_PASSWORD', 'giftflow-demo');
define('SESSION_COOKIE', 'giftflow_session');
define('SESSION_MAX_AGE', 60 * 60 * 24 * 7);

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
    return strtolower(trim(env_value('AUTH_EMAIL', DEFAULT_AUTH_EMAIL)));
}

function auth_password(): string
{
    return env_value('AUTH_PASSWORD', DEFAULT_AUTH_PASSWORD);
}

function auth_name(): string
{
    return trim(env_value('AUTH_NAME', 'GiftFlow Team'));
}

function session_secret(): string
{
    return env_value('SESSION_SECRET', 'development-only-change-me');
}

function using_default_credentials(): bool
{
    return getenv('AUTH_EMAIL') === false || getenv('AUTH_PASSWORD') === false;
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

function authenticate_user($email, $password): array
{
    if (!present(auth_email()) || !present(auth_password())) {
        throw new RuntimeException('Authentication is not configured. Set AUTH_EMAIL and AUTH_PASSWORD before starting the server.');
    }

    $normalizedEmail = strtolower(trim((string) $email));
    $passwordValue = (string) $password;
    if (!hash_equals(auth_email(), $normalizedEmail) || !hash_equals(auth_password(), $passwordValue)) {
        throw new RuntimeException('Email or password is incorrect.');
    }

    $name = auth_name();
    return [
        'sub' => 'local-auth:' . auth_email(),
        'email' => auth_email(),
        'name' => $name === '' ? explode('@', auth_email())[0] : $name,
        'picture' => '',
        'hostedDomain' => '',
        'onboarded' => false,
        'signedInAt' => iso_now(),
    ];
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
        json_response([
            'ok' => true,
            'configured' => present(auth_email()) && present(auth_password()),
            'authMode' => 'password',
            'usingDefaultCredentials' => using_default_credentials(),
            'user' => current_user(),
        ]);
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
            $updatedUser = array_merge($user, ['onboarded' => true, 'onboarding' => $onboarding]);
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
