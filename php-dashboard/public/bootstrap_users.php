<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/helpers.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = db();
    ensure_aux_tables($pdo);

    $rows = fetch_all(
        $pdo,
        'SELECT id, full_name, username, email, is_active, created_at FROM users ORDER BY id ASC'
    );

    echo json_encode([
        'ok' => true,
        'message' => 'Users bootstrap completed',
        'usersCount' => count($rows),
        'users' => $rows,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
