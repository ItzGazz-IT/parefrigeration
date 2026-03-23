<?php

declare(strict_types=1);

function table_columns(PDO $pdo, string $table): array
{
    static $cache = [];

    if (isset($cache[$table])) {
        return $cache[$table];
    }

    $sql = "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['table' => $table]);
    $rows = $stmt->fetchAll();

    $cache[$table] = array_map(static fn(array $row): string => $row['COLUMN_NAME'], $rows);
    return $cache[$table];
}

function table_has(PDO $pdo, string $table, string $column): bool
{
    return in_array($column, table_columns($pdo, $table), true);
}

function choose_existing_column(PDO $pdo, string $table, array $candidates): ?string
{
    $columns = table_columns($pdo, $table);
    foreach ($candidates as $candidate) {
        if (in_array($candidate, $columns, true)) {
            return $candidate;
        }
    }

    return null;
}

function fetch_all(PDO $pdo, string $sql, array $params = []): array
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function fetch_one(PDO $pdo, string $sql, array $params = []): ?array
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function execute_stmt(PDO $pdo, string $sql, array $params = []): int
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

function get_units_rows(PDO $pdo, ?int $sourceId = null, ?int $warehouseId = null, bool $inStockOnly = false): array
{
    $modelColumn = choose_existing_column($pdo, 'models', ['model_code', 'model_name', 'model_number', 'model_no', 'model', 'name']);
    $modelSelect = $modelColumn ? "m.`{$modelColumn}`" : 'CAST(u.model_id AS CHAR)';

    $hasSupplierStatus = table_has($pdo, 'units', 'supplier_status');
    $hasStockStatus = table_has($pdo, 'units', 'stock_status');
    $hasWarehouseId = table_has($pdo, 'units', 'warehouse_id');
    $hasSourceId = table_has($pdo, 'units', 'source_id');
    $hasDelivered = table_has($pdo, 'units', 'delivered');
    $hasStatus = table_has($pdo, 'units', 'status');

    $supplierStatusSelect = $hasSupplierStatus ? 'u.supplier_status' : 'NULL';
    $stockStatusSelect = $hasStockStatus ? 'u.stock_status' : 'NULL';
    $warehouseIdSelect = $hasWarehouseId ? 'u.warehouse_id' : 'NULL';
    $sourceIdSelect = $hasSourceId ? 'u.source_id' : 'NULL';

    $where = [];
    $params = [];

    if ($sourceId !== null && $hasSourceId) {
        $where[] = 'u.source_id = :source_id';
        $params['source_id'] = $sourceId;
    }

    if ($warehouseId !== null && $hasWarehouseId) {
        $where[] = 'u.warehouse_id = :warehouse_id';
        $params['warehouse_id'] = $warehouseId;
    }

    if ($inStockOnly) {
        if ($hasDelivered) {
            $where[] = 'COALESCE(u.delivered, 0) = 0';
        }

        if ($hasStatus) {
            $where[] = "UPPER(TRIM(COALESCE(u.status, ''))) <> 'SOLD'";
        }
    }

    $whereClause = count($where) ? 'WHERE ' . implode(' AND ', $where) : '';

    $sql = "SELECT
        u.id,
        u.model_id,
        {$modelSelect} AS model,
        {$supplierStatusSelect} AS supplier_status,
        {$stockStatusSelect} AS stock_status,
        {$warehouseIdSelect} AS warehouse_id,
        {$sourceIdSelect} AS source_id,
        u.serial_number,
        u.stock_type,
        u.status,
        u.delivered,
        u.date_received,
        u.created_at
    FROM units u
    LEFT JOIN models m ON m.id = u.model_id
    {$whereClause}
    ORDER BY u.created_at DESC";

    return fetch_all($pdo, $sql, $params);
}

function table_rows(PDO $pdo, string $table): array
{
    $orderColumn = null;
    foreach (['created_at', 'date_received', 'id'] as $candidate) {
        if (table_has($pdo, $table, $candidate)) {
            $orderColumn = $candidate;
            break;
        }
    }

    $orderSql = $orderColumn ? " ORDER BY `{$orderColumn}` DESC" : '';
    return fetch_all($pdo, "SELECT * FROM `{$table}`{$orderSql}");
}

function ensure_aux_tables(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INT NOT NULL AUTO_INCREMENT,
        full_name VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_login_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_users_username (username),
        UNIQUE KEY uniq_users_email (email),
        KEY idx_users_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    if (!table_has($pdo, 'users', 'full_name')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN full_name VARCHAR(255) NOT NULL DEFAULT ""');
    }
    if (!table_has($pdo, 'users', 'username')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN username VARCHAR(100) NOT NULL DEFAULT ""');
    }
    if (!table_has($pdo, 'users', 'email')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT ""');
    }
    if (!table_has($pdo, 'users', 'password_hash')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ""');
    }
    if (!table_has($pdo, 'users', 'is_active')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
    }
    if (!table_has($pdo, 'users', 'last_login_at')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL');
    }
    if (!table_has($pdo, 'users', 'created_at')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    }
    if (!table_has($pdo, 'users', 'updated_at')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    }

    $usersIndexes = fetch_all(
        $pdo,
        'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table',
        ['table' => 'users']
    );
    $usersIndexNames = array_map(static fn(array $row): string => (string) ($row['INDEX_NAME'] ?? ''), $usersIndexes);

    if (!in_array('uniq_users_username', $usersIndexNames, true)) {
        $pdo->exec('CREATE UNIQUE INDEX uniq_users_username ON users (username)');
    }
    if (!in_array('uniq_users_email', $usersIndexNames, true)) {
        $pdo->exec('CREATE UNIQUE INDEX uniq_users_email ON users (email)');
    }
    if (!in_array('idx_users_active', $usersIndexNames, true)) {
        $pdo->exec('CREATE INDEX idx_users_active ON users (is_active)');
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS scan_out_events (
        id INT NOT NULL AUTO_INCREMENT,
        unit_id INT NULL,
        model_id INT NULL,
        warehouse_id INT NULL,
        serial_number VARCHAR(255) NOT NULL,
        scan_type VARCHAR(50) NOT NULL,
        invoice_type VARCHAR(50) NULL,
        invoice_number VARCHAR(100) NULL,
        io_number VARCHAR(100) NULL,
        po_number VARCHAR(100) NULL,
        client_name VARCHAR(255) NULL,
        payment_status VARCHAR(50) NOT NULL,
        include_weekly_report TINYINT(1) NOT NULL DEFAULT 0,
        source_table VARCHAR(100) NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'SOLD',
        scanned_by VARCHAR(255) NULL,
        scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_scan_out_events_weekly (include_weekly_report, created_at),
        KEY idx_scan_out_events_serial (serial_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS rare_case_stock_changes (
        id INT NOT NULL AUTO_INCREMENT,
        unit_id INT NOT NULL,
        serial_number VARCHAR(255) NOT NULL,
        previous_stock_type VARCHAR(10) NOT NULL,
        new_stock_type VARCHAR(10) NOT NULL,
        ic_number VARCHAR(100) NOT NULL,
        changed_by VARCHAR(255) NULL,
        changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_rare_case_stock_changes_unit (unit_id),
        KEY idx_rare_case_stock_changes_ic (ic_number),
        KEY idx_rare_case_stock_changes_changed_at (changed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS weekly_payment_history (
        id INT NOT NULL AUTO_INCREMENT,
        serial_number VARCHAR(255) NOT NULL,
        scan_type VARCHAR(50) NULL,
        previous_payment_status VARCHAR(50) NOT NULL,
        new_payment_status VARCHAR(50) NOT NULL,
        io_number VARCHAR(100) NOT NULL,
        changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_weekly_payment_history_serial (serial_number),
        KEY idx_weekly_payment_history_changed_at (changed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS archive_records (
        id INT NOT NULL AUTO_INCREMENT,
        serial_number VARCHAR(255) NOT NULL,
        scan_type VARCHAR(50) NOT NULL,
        io_number VARCHAR(100) NOT NULL,
        source_event_id INT NULL,
        client_name VARCHAR(255) NULL,
        archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_archive_source_event (source_event_id),
        KEY idx_archive_serial_scan (serial_number, scan_type),
        KEY idx_archive_archived_at (archived_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $defaultUsers = [
        [
            'full_name' => 'Gareth',
            'username' => 'gareth',
            'email' => 'gareth@parefrigeration.co.za',
        ],
        [
            'full_name' => 'Marnus',
            'username' => 'marnus',
            'email' => 'marnus@parefrigeration.co.za',
        ],
        [
            'full_name' => 'Greg',
            'username' => 'greg',
            'email' => 'greg@parefrigeration.co.za',
        ],
    ];

    $temporaryPasswordHash = password_hash('ChangeMe!2026', PASSWORD_DEFAULT);

    foreach ($defaultUsers as $user) {
        $existingUser = fetch_one(
            $pdo,
            'SELECT id FROM users WHERE LOWER(username) = LOWER(:username) OR LOWER(email) = LOWER(:email) LIMIT 1',
            ['username' => $user['username'], 'email' => $user['email']]
        );

        if ($existingUser) {
            continue;
        }

        execute_stmt(
            $pdo,
            'INSERT INTO users (full_name, username, email, password_hash, is_active, created_at, updated_at) VALUES (:full_name, :username, :email, :password_hash, 1, NOW(), NOW())',
            [
                'full_name' => $user['full_name'],
                'username' => $user['username'],
                'email' => $user['email'],
                'password_hash' => $temporaryPasswordHash,
            ]
        );
    }
}

function normalized_path(): string
{
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH) ?: '/';
    return rtrim($path, '/') ?: '/';
}
