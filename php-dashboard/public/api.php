<?php

declare(strict_types=1);

require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/http.php';
require_once __DIR__ . '/../lib/helpers.php';

$config = require __DIR__ . '/../config.php';
date_default_timezone_set($config['app']['timezone'] ?? 'Africa/Johannesburg');

$pdo = null;
$dbBootstrapError = null;
try {
    $pdo = db();
    ensure_aux_tables($pdo);
} catch (Throwable $e) {
    $dbBootstrapError = $e->getMessage();
}

$scanTypes = [
    'ACTUAL_SALE',
    'TFFW_EXCHANGE',
    'INHOUSE_EXCHANGE',
    'TAKEALOT',
    'TFF_DEALER',
];

$scanRules = [
    'ACTUAL_SALE' => [
        'required' => ['invoiceType', 'invoiceNumber', 'clientName'],
        'paymentStatus' => 'UNPAID_TFFW',
        'includeWeeklyReport' => 1,
        'sourceTable' => 'sales',
    ],
    'TFFW_EXCHANGE' => [
        'required' => ['ioNumber', 'clientName'],
        'paymentStatus' => 'PAID_TFFW',
        'includeWeeklyReport' => 0,
        'sourceTable' => 'tffw_exchanges',
    ],
    'INHOUSE_EXCHANGE' => [
        'required' => ['clientName'],
        'paymentStatus' => 'UNPAID_TFFW',
        'includeWeeklyReport' => 1,
        'sourceTable' => 'inhouse_exchanges',
    ],
    'TAKEALOT' => [
        'required' => ['poNumber'],
        'paymentStatus' => 'PENDING_IO',
        'includeWeeklyReport' => 0,
        'sourceTable' => 'takealot_scans',
    ],
    'TFF_DEALER' => [
        'required' => ['ioNumber', 'clientName'],
        'paymentStatus' => 'PAID_TFFW',
        'includeWeeklyReport' => 0,
        'sourceTable' => 'tff_dealer_scans',
    ],
];

$path = $_GET['path'] ?? '';

$startsWith = static function (string $value, string $prefix): bool {
    return $prefix === '' || strpos($value, $prefix) === 0;
};

if (!is_string($path) || trim($path) === '') {
    $pathInfo = trim((string) ($_SERVER['PATH_INFO'] ?? ''), '/');
    if ($pathInfo !== '') {
        $path = $pathInfo;
    } else {
        $requestPath = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?? '');
        $requestPath = trim($requestPath, '/');

        $scriptName = trim(str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        if ($scriptName !== '' && $startsWith($requestPath, $scriptName . '/')) {
            $requestPath = substr($requestPath, strlen($scriptName) + 1);
        }

        $scriptDir = trim(str_replace('\\', '/', dirname('/' . $scriptName)), '/');
        if ($scriptDir !== '' && $startsWith($requestPath, $scriptDir . '/')) {
            $requestPath = substr($requestPath, strlen($scriptDir) + 1);
        }

        $path = $requestPath;
    }
}

$path = trim((string) $path, '/');
if ($startsWith($path, 'api.php/')) {
    $path = substr($path, strlen('api.php/'));
}
if ($startsWith($path, 'api/')) {
    $path = substr($path, strlen('api/'));
}
if ($startsWith($path, 'dashboard-api/')) {
    $path = substr($path, strlen('dashboard-api/'));
}

$path = trim($path, '/');
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

function insert_archive_record_if_missing(PDO $pdo, string $serialNumber, string $scanType, string $ioNumber, ?int $sourceEventId, ?string $clientName): bool
{
    if ($serialNumber === '' || $scanType === '' || $ioNumber === '') {
        return false;
    }

    if ($sourceEventId) {
        $exists = fetch_one($pdo, 'SELECT id FROM archive_records WHERE source_event_id = :id LIMIT 1', ['id' => $sourceEventId]);
        if ($exists) {
            return false;
        }
    } else {
        $exists = fetch_one(
            $pdo,
            'SELECT id FROM archive_records WHERE serial_number = :serial AND scan_type = :scan AND io_number = :io LIMIT 1',
            ['serial' => $serialNumber, 'scan' => $scanType, 'io' => $ioNumber]
        );
        if ($exists) {
            return false;
        }
    }

    execute_stmt(
        $pdo,
        'INSERT INTO archive_records (serial_number, scan_type, io_number, source_event_id, client_name, archived_at, created_at) VALUES (:serial, :scan, :io, :event_id, :client, NOW(), NOW())',
        [
            'serial' => $serialNumber,
            'scan' => $scanType,
            'io' => $ioNumber,
            'event_id' => $sourceEventId,
            'client' => $clientName,
        ]
    );

    return true;
}

function update_table_by_serial(PDO $pdo, string $tableName, string $serialNumber, string $ioNumber, bool $updateSupplierStatus = false): void
{
    $serialColumn = choose_existing_column($pdo, $tableName, ['serial_number', 'serial']);
    if (!$serialColumn) {
        return;
    }

    $ioColumn = choose_existing_column($pdo, $tableName, ['io_number', 'io_no']);
    $paymentColumn = choose_existing_column($pdo, $tableName, ['payment_status']);
    $supplierStatusColumn = choose_existing_column($pdo, $tableName, ['supplier_status']);

    $updates = [];
    $params = ['serial' => $serialNumber];

    if ($ioColumn) {
        $updates[] = "`{$ioColumn}` = :io_number";
        $params['io_number'] = $ioNumber;
    }

    if ($paymentColumn) {
        $updates[] = "`{$paymentColumn}` = 'PAID_TFFW'";
    }

    if ($updateSupplierStatus && $supplierStatusColumn) {
        $updates[] = "`{$supplierStatusColumn}` = 'PAID_TFFW'";
    }

    if (!$updates) {
        return;
    }

    execute_stmt(
        $pdo,
        sprintf('UPDATE `%s` SET %s WHERE `%s` = :serial', $tableName, implode(', ', $updates), $serialColumn),
        $params
    );
}

function sync_tffw_exchange_from_source(PDO $pdo): int
{
    $sourceSerialCol = choose_existing_column($pdo, 'tffw_exchanges', ['serial_number', 'serial']);
    if (!$sourceSerialCol) {
        return 0;
    }

    $sourceModelCol = choose_existing_column($pdo, 'tffw_exchanges', ['model_id']);
    $sourceWarehouseCol = choose_existing_column($pdo, 'tffw_exchanges', ['warehouse_id']);
    $sourceClientCol = choose_existing_column($pdo, 'tffw_exchanges', ['client_name', 'client']);
    $sourceIoCol = choose_existing_column($pdo, 'tffw_exchanges', ['io_number', 'io_no']);
    $sourceCreatedAtCol = choose_existing_column($pdo, 'tffw_exchanges', ['timestamp', 'created_at', 'scanned_at', 'date']);

    $modelSelect = $sourceModelCol ? "s.`{$sourceModelCol}`" : 'NULL';
    $warehouseSelect = $sourceWarehouseCol ? "s.`{$sourceWarehouseCol}`" : 'NULL';
    $clientSelect = $sourceClientCol ? "s.`{$sourceClientCol}`" : 'NULL';
    $ioSelect = $sourceIoCol ? "s.`{$sourceIoCol}`" : 'NULL';
    $createdAtSelect = $sourceCreatedAtCol ? "s.`{$sourceCreatedAtCol}`" : 'NOW()';

    $rows = fetch_all(
        $pdo,
        "SELECT
            s.`{$sourceSerialCol}` AS serial_number,
            {$modelSelect} AS model_id,
            {$warehouseSelect} AS warehouse_id,
            {$clientSelect} AS client_name,
            {$ioSelect} AS io_number,
            {$createdAtSelect} AS source_created_at
         FROM tffw_exchanges s
         WHERE s.`{$sourceSerialCol}` IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM scan_out_events e
             WHERE e.scan_type = 'TFFW_EXCHANGE' AND e.serial_number = s.`{$sourceSerialCol}`
           )
         ORDER BY {$createdAtSelect} DESC"
    );

    $syncedCount = 0;
    foreach ($rows as $row) {
        $serialNumber = trim((string) ($row['serial_number'] ?? ''));
        if ($serialNumber === '') {
            continue;
        }

        $unit = fetch_one($pdo, 'SELECT id, model_id, warehouse_id FROM units WHERE serial_number = :serial LIMIT 1', ['serial' => $serialNumber]);
        $unitId = $unit ? $unit['id'] : null;
        $modelId = $row['model_id'] ?: ($unit ? $unit['model_id'] : null);
        $warehouseId = $row['warehouse_id'] ?: ($unit ? $unit['warehouse_id'] : null);
        $eventTimestamp = $row['source_created_at'] ?? date('Y-m-d H:i:s');
        $ioNumber = trim((string) ($row['io_number'] ?? ''));

        execute_stmt(
            $pdo,
            'INSERT INTO scan_out_events (unit_id, model_id, warehouse_id, serial_number, scan_type, io_number, client_name, payment_status, include_weekly_report, status, scanned_at, created_at) VALUES (:unit_id, :model_id, :warehouse_id, :serial, :scan_type, :io, :client, :payment, :weekly, :status, :scanned_at, :created_at)',
            [
                'unit_id' => $unitId,
                'model_id' => $modelId,
                'warehouse_id' => $warehouseId,
                'serial' => $serialNumber,
                'scan_type' => 'TFFW_EXCHANGE',
                'io' => ($ioNumber !== '' ? $ioNumber : null),
                'client' => $row['client_name'] ?? null,
                'payment' => ($ioNumber !== '' ? 'PAID_TFFW' : 'UNPAID_TFFW'),
                'weekly' => 0,
                'status' => 'SOLD',
                'scanned_at' => $eventTimestamp,
                'created_at' => $eventTimestamp,
            ]
        );

        $eventId = (int) $pdo->lastInsertId();

        if ($ioNumber !== '') {
            insert_archive_record_if_missing($pdo, $serialNumber, 'TFFW_EXCHANGE', $ioNumber, $eventId, $row['client_name'] ?? null);
        }

        $syncedCount++;
    }

    return $syncedCount;
}

function sync_inhouse_exchange_from_source(PDO $pdo): int
{
    $sourceSerialCol = choose_existing_column($pdo, 'inhouse_exchanges', ['serial_number', 'serial']);
    if (!$sourceSerialCol) {
        return 0;
    }

    $sourceModelCol = choose_existing_column($pdo, 'inhouse_exchanges', ['model_id']);
    $sourceWarehouseCol = choose_existing_column($pdo, 'inhouse_exchanges', ['warehouse_id']);
    $sourceClientCol = choose_existing_column($pdo, 'inhouse_exchanges', ['client_name', 'client']);
    $sourceCreatedAtCol = choose_existing_column($pdo, 'inhouse_exchanges', ['timestamp', 'created_at', 'scanned_at', 'date']);

    $modelSelect = $sourceModelCol ? "s.`{$sourceModelCol}`" : 'NULL';
    $warehouseSelect = $sourceWarehouseCol ? "s.`{$sourceWarehouseCol}`" : 'NULL';
    $clientSelect = $sourceClientCol ? "s.`{$sourceClientCol}`" : 'NULL';
    $createdAtSelect = $sourceCreatedAtCol ? "s.`{$sourceCreatedAtCol}`" : 'NOW()';

    $rows = fetch_all(
        $pdo,
        "SELECT
            s.`{$sourceSerialCol}` AS serial_number,
            {$modelSelect} AS model_id,
            {$warehouseSelect} AS warehouse_id,
            {$clientSelect} AS client_name,
            {$createdAtSelect} AS source_created_at
         FROM inhouse_exchanges s
         WHERE s.`{$sourceSerialCol}` IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM scan_out_events e
             WHERE e.scan_type = 'INHOUSE_EXCHANGE' AND e.serial_number = s.`{$sourceSerialCol}`
           )
         ORDER BY {$createdAtSelect} DESC"
    );

    $syncedCount = 0;
    foreach ($rows as $row) {
        $serialNumber = trim((string) ($row['serial_number'] ?? ''));
        if ($serialNumber === '') {
            continue;
        }

        $unit = fetch_one($pdo, 'SELECT id, model_id, warehouse_id FROM units WHERE serial_number = :serial LIMIT 1', ['serial' => $serialNumber]);

        execute_stmt(
            $pdo,
            'INSERT INTO scan_out_events (unit_id, model_id, warehouse_id, serial_number, scan_type, client_name, payment_status, include_weekly_report, status, scanned_at, created_at) VALUES (:unit_id, :model_id, :warehouse_id, :serial, :scan_type, :client, :payment, :weekly, :status, :scanned_at, :created_at)',
            [
                'unit_id' => $unit ? $unit['id'] : null,
                'model_id' => $row['model_id'] ?: ($unit ? $unit['model_id'] : null),
                'warehouse_id' => $row['warehouse_id'] ?: ($unit ? $unit['warehouse_id'] : null),
                'serial' => $serialNumber,
                'scan_type' => 'INHOUSE_EXCHANGE',
                'client' => $row['client_name'] ?? null,
                'payment' => 'UNPAID_TFFW',
                'weekly' => 1,
                'status' => 'SOLD',
                'scanned_at' => $row['source_created_at'] ?? date('Y-m-d H:i:s'),
                'created_at' => $row['source_created_at'] ?? date('Y-m-d H:i:s'),
            ]
        );

        $syncedCount++;
    }

    return $syncedCount;
}

function sync_takealot_from_source(PDO $pdo): int
{
    $sourceSerialCol = choose_existing_column($pdo, 'takealot_scans', ['serial_number', 'serial']);
    if (!$sourceSerialCol) {
        return 0;
    }

    $sourceModelCol = choose_existing_column($pdo, 'takealot_scans', ['model_id']);
    $sourceWarehouseCol = choose_existing_column($pdo, 'takealot_scans', ['warehouse_id']);
    $sourcePoCol = choose_existing_column($pdo, 'takealot_scans', ['po_number', 'po_no']);
    $sourceCreatedAtCol = choose_existing_column($pdo, 'takealot_scans', ['timestamp', 'created_at', 'scanned_at', 'date']);

    $modelSelect = $sourceModelCol ? "s.`{$sourceModelCol}`" : 'NULL';
    $warehouseSelect = $sourceWarehouseCol ? "s.`{$sourceWarehouseCol}`" : 'NULL';
    $poSelect = $sourcePoCol ? "s.`{$sourcePoCol}`" : 'NULL';
    $createdAtSelect = $sourceCreatedAtCol ? "s.`{$sourceCreatedAtCol}`" : 'NOW()';

    $rows = fetch_all(
        $pdo,
        "SELECT
            s.`{$sourceSerialCol}` AS serial_number,
            {$modelSelect} AS model_id,
            {$warehouseSelect} AS warehouse_id,
            {$poSelect} AS po_number,
            {$createdAtSelect} AS source_created_at
         FROM takealot_scans s
         WHERE s.`{$sourceSerialCol}` IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM scan_out_events e
             WHERE e.scan_type = 'TAKEALOT' AND e.serial_number = s.`{$sourceSerialCol}`
           )
         ORDER BY {$createdAtSelect} DESC"
    );

    $syncedCount = 0;
    foreach ($rows as $row) {
        $serialNumber = trim((string) ($row['serial_number'] ?? ''));
        if ($serialNumber === '') {
            continue;
        }

        $unit = fetch_one($pdo, 'SELECT id, model_id, warehouse_id FROM units WHERE serial_number = :serial LIMIT 1', ['serial' => $serialNumber]);

        execute_stmt(
            $pdo,
            'INSERT INTO scan_out_events (unit_id, model_id, warehouse_id, serial_number, scan_type, po_number, payment_status, include_weekly_report, status, scanned_at, created_at) VALUES (:unit_id, :model_id, :warehouse_id, :serial, :scan_type, :po, :payment, :weekly, :status, :scanned_at, :created_at)',
            [
                'unit_id' => $unit ? $unit['id'] : null,
                'model_id' => $row['model_id'] ?: ($unit ? $unit['model_id'] : null),
                'warehouse_id' => $row['warehouse_id'] ?: ($unit ? $unit['warehouse_id'] : null),
                'serial' => $serialNumber,
                'scan_type' => 'TAKEALOT',
                'po' => $row['po_number'] ?? null,
                'payment' => 'PENDING_IO',
                'weekly' => 0,
                'status' => 'SOLD',
                'scanned_at' => $row['source_created_at'] ?? date('Y-m-d H:i:s'),
                'created_at' => $row['source_created_at'] ?? date('Y-m-d H:i:s'),
            ]
        );

        $syncedCount++;
    }

    return $syncedCount;
}

function sync_tff_dealer_from_source(PDO $pdo): int
{
    $sourceSerialCol = choose_existing_column($pdo, 'tff_dealer_scans', ['serial_number', 'serial']);
    if (!$sourceSerialCol) {
        return 0;
    }

    $sourceModelCol = choose_existing_column($pdo, 'tff_dealer_scans', ['model_id']);
    $sourceWarehouseCol = choose_existing_column($pdo, 'tff_dealer_scans', ['warehouse_id']);
    $sourceClientCol = choose_existing_column($pdo, 'tff_dealer_scans', ['client_name', 'client']);
    $sourceIoCol = choose_existing_column($pdo, 'tff_dealer_scans', ['io_number', 'io_no']);
    $sourceCreatedAtCol = choose_existing_column($pdo, 'tff_dealer_scans', ['timestamp', 'created_at', 'scanned_at', 'date']);

    $modelSelect = $sourceModelCol ? "s.`{$sourceModelCol}`" : 'NULL';
    $warehouseSelect = $sourceWarehouseCol ? "s.`{$sourceWarehouseCol}`" : 'NULL';
    $clientSelect = $sourceClientCol ? "s.`{$sourceClientCol}`" : 'NULL';
    $ioSelect = $sourceIoCol ? "s.`{$sourceIoCol}`" : 'NULL';
    $createdAtSelect = $sourceCreatedAtCol ? "s.`{$sourceCreatedAtCol}`" : 'NOW()';

    $rows = fetch_all(
        $pdo,
        "SELECT
            s.`{$sourceSerialCol}` AS serial_number,
            {$modelSelect} AS model_id,
            {$warehouseSelect} AS warehouse_id,
            {$clientSelect} AS client_name,
            {$ioSelect} AS io_number,
            {$createdAtSelect} AS source_created_at
         FROM tff_dealer_scans s
         WHERE s.`{$sourceSerialCol}` IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM scan_out_events e
             WHERE e.scan_type = 'TFF_DEALER' AND e.serial_number = s.`{$sourceSerialCol}`
           )
         ORDER BY {$createdAtSelect} DESC"
    );

    $syncedCount = 0;
    foreach ($rows as $row) {
        $serialNumber = trim((string) ($row['serial_number'] ?? ''));
        if ($serialNumber === '') {
            continue;
        }

        $unit = fetch_one($pdo, 'SELECT id, model_id, warehouse_id FROM units WHERE serial_number = :serial LIMIT 1', ['serial' => $serialNumber]);
        $ioNumber = trim((string) ($row['io_number'] ?? ''));
        $eventTimestamp = $row['source_created_at'] ?? date('Y-m-d H:i:s');

        execute_stmt(
            $pdo,
            'INSERT INTO scan_out_events (unit_id, model_id, warehouse_id, serial_number, scan_type, io_number, client_name, payment_status, include_weekly_report, status, scanned_at, created_at) VALUES (:unit_id, :model_id, :warehouse_id, :serial, :scan_type, :io, :client, :payment, :weekly, :status, :scanned_at, :created_at)',
            [
                'unit_id' => $unit ? $unit['id'] : null,
                'model_id' => $row['model_id'] ?: ($unit ? $unit['model_id'] : null),
                'warehouse_id' => $row['warehouse_id'] ?: ($unit ? $unit['warehouse_id'] : null),
                'serial' => $serialNumber,
                'scan_type' => 'TFF_DEALER',
                'io' => ($ioNumber !== '' ? $ioNumber : null),
                'client' => $row['client_name'] ?? null,
                'payment' => ($ioNumber !== '' ? 'PAID_TFFW' : 'UNPAID_TFFW'),
                'weekly' => 0,
                'status' => 'SOLD',
                'scanned_at' => $eventTimestamp,
                'created_at' => $eventTimestamp,
            ]
        );

        $eventId = (int) $pdo->lastInsertId();

        if ($ioNumber !== '') {
            insert_archive_record_if_missing($pdo, $serialNumber, 'TFF_DEALER', $ioNumber, $eventId, $row['client_name'] ?? null);
        }

        $syncedCount++;
    }

    return $syncedCount;
}

function sync_actual_sales_from_source(PDO $pdo): int
{
    $salesSerialCol = choose_existing_column($pdo, 'sales', ['serial_number', 'serial']);
    if (!$salesSerialCol) {
        return 0;
    }

    $salesInvoiceTypeCol = choose_existing_column($pdo, 'sales', ['invoice_type']);
    $salesInvoiceNumberCol = choose_existing_column($pdo, 'sales', ['invoice_number', 'invoice_no']);
    $salesClientCol = choose_existing_column($pdo, 'sales', ['client_name', 'client']);
    $salesPaymentCol = choose_existing_column($pdo, 'sales', ['payment_status', 'status']);
    $salesIoCol = choose_existing_column($pdo, 'sales', ['io_number', 'io_no']);
    $salesDateCol = choose_existing_column($pdo, 'sales', ['created_at', 'date_sold', 'sale_date', 'date', 'scanned_at']);

    $invoiceTypeSelect = $salesInvoiceTypeCol ? "s.`{$salesInvoiceTypeCol}`" : 'NULL';
    $invoiceNumberSelect = $salesInvoiceNumberCol ? "s.`{$salesInvoiceNumberCol}`" : 'NULL';
    $clientSelect = $salesClientCol ? "s.`{$salesClientCol}`" : 'NULL';
    $paymentSelect = $salesPaymentCol ? "s.`{$salesPaymentCol}`" : "'UNPAID_TFFW'";
    $ioSelect = $salesIoCol ? "s.`{$salesIoCol}`" : 'NULL';
    $createdAtSelect = $salesDateCol ? "s.`{$salesDateCol}`" : 'NOW()';

    $rows = fetch_all(
        $pdo,
        "SELECT
            s.`{$salesSerialCol}` AS serial_number,
            {$invoiceTypeSelect} AS invoice_type,
            {$invoiceNumberSelect} AS invoice_number,
            {$clientSelect} AS client_name,
            {$paymentSelect} AS payment_status,
            {$ioSelect} AS io_number,
            {$createdAtSelect} AS source_created_at,
            u.id AS unit_id,
            u.model_id,
            u.warehouse_id
         FROM sales s
         LEFT JOIN units u ON u.serial_number = s.`{$salesSerialCol}`
         WHERE s.`{$salesSerialCol}` IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM scan_out_events e
             WHERE e.scan_type = 'ACTUAL_SALE' AND e.serial_number = s.`{$salesSerialCol}`
           )
         ORDER BY {$createdAtSelect} DESC"
    );

    $syncedCount = 0;
    foreach ($rows as $row) {
        $serialNumber = trim((string) ($row['serial_number'] ?? ''));
        if ($serialNumber === '') {
            continue;
        }

        $eventTimestamp = (string) ($row['source_created_at'] ?? date('Y-m-d H:i:s'));
        $ioNumber = trim((string) ($row['io_number'] ?? ''));
        $paymentStatus = strtoupper(trim((string) ($row['payment_status'] ?? 'UNPAID_TFFW')));
        if ($paymentStatus === '') {
            $paymentStatus = 'UNPAID_TFFW';
        }

        execute_stmt(
            $pdo,
            'INSERT INTO scan_out_events (unit_id, model_id, warehouse_id, serial_number, scan_type, invoice_type, invoice_number, io_number, client_name, payment_status, include_weekly_report, source_table, status, scanned_at, created_at) VALUES (:unit_id, :model_id, :warehouse_id, :serial, :scan_type, :invoice_type, :invoice_number, :io_number, :client_name, :payment_status, :weekly, :source_table, :status, :scanned_at, :created_at)',
            [
                'unit_id' => $row['unit_id'] ?? null,
                'model_id' => $row['model_id'] ?? null,
                'warehouse_id' => $row['warehouse_id'] ?? null,
                'serial' => $serialNumber,
                'scan_type' => 'ACTUAL_SALE',
                'invoice_type' => $row['invoice_type'] ?? null,
                'invoice_number' => $row['invoice_number'] ?? null,
                'io_number' => ($ioNumber !== '' ? $ioNumber : null),
                'client_name' => $row['client_name'] ?? null,
                'payment_status' => $paymentStatus,
                'weekly' => 1,
                'source_table' => 'sales',
                'status' => 'SOLD',
                'scanned_at' => $eventTimestamp,
                'created_at' => $eventTimestamp,
            ]
        );

        $eventId = (int) $pdo->lastInsertId();
        if ($ioNumber !== '') {
            insert_archive_record_if_missing($pdo, $serialNumber, 'ACTUAL_SALE', $ioNumber, $eventId, $row['client_name'] ?? null);
        }

        $syncedCount++;
    }

    return $syncedCount;
}

function scan_payload_error(array $payload, array $rules): ?string
{
    $scanType = strtoupper(trim((string) ($payload['scanType'] ?? '')));
    $serialNumber = trim((string) ($payload['serialNumber'] ?? ''));

    if ($scanType === '' || !isset($rules[$scanType])) {
        return 'Invalid scanType';
    }

    if ($serialNumber === '') {
        return 'serialNumber is required';
    }

    foreach ($rules[$scanType]['required'] as $field) {
        $value = trim((string) ($payload[$field] ?? ''));
        if ($value === '') {
            return sprintf('%s is required for %s', $field, $scanType);
        }
    }

    return null;
}

function normalized_login_identifier(string $value): string
{
    return strtolower(trim($value));
}

function current_session_user_id(): int
{
    return (int) ($_SESSION['user_id'] ?? 0);
}

function require_authenticated_user(): void
{
    if (current_session_user_id() <= 0) {
        json_response(['error' => 'Authentication required'], 401);
    }
}

function validate_password_strength(string $password): ?string
{
    if (strlen($password) < 8) {
        return 'Password must be at least 8 characters long';
    }

    return null;
}

function output_excel_csv(string $filename, array $headers, array $rows): void
{
    header('Content-Type: application/vnd.ms-excel; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . str_replace('"', '', $filename) . '"');
    header('Pragma: no-cache');
    header('Expires: 0');

    $handle = fopen('php://output', 'wb');
    if ($handle === false) {
        json_response(['error' => 'Could not generate export'], 500);
    }

    fwrite($handle, "\xEF\xBB\xBF");
    fputcsv($handle, $headers);

    foreach ($rows as $row) {
        fputcsv($handle, $row);
    }

    fclose($handle);
    exit;
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

try {
    if (!($pdo instanceof PDO) && !($method === 'GET' && $path === 'health')) {
        json_response([
            'error' => 'Database connection failed',
            'message' => $dbBootstrapError ?: 'Unknown database error',
        ], 500);
    }

    // AUTH ENDPOINTS
    if ($method === 'POST' && $path === 'auth/login') {
        $payload = request_json_body();
        $identifier = normalized_login_identifier((string) ($payload['email'] ?? ''));
        $password = (string) ($payload['password'] ?? '');

        if ($identifier === '' || $password === '') {
            json_response(['error' => 'Email/username and password are required'], 400);
        }

        $fullNameSelect = table_has($pdo, 'users', 'full_name')
            ? 'full_name'
            : (table_has($pdo, 'users', 'name') ? 'name' : "''");
        $usernameSelect = table_has($pdo, 'users', 'username')
            ? 'username'
            : (table_has($pdo, 'users', 'user_name') ? 'user_name' : 'email');
        $emailSelect = table_has($pdo, 'users', 'email')
            ? 'email'
            : (table_has($pdo, 'users', 'username') ? 'username' : "''");
        $passwordSelect = table_has($pdo, 'users', 'password_hash')
            ? 'password_hash'
            : (table_has($pdo, 'users', 'password') ? 'password' : "''");
        $isActiveSelect = table_has($pdo, 'users', 'is_active') ? 'is_active' : '1';

        $user = fetch_one(
            $pdo,
            "SELECT id, {$fullNameSelect} AS full_name, {$usernameSelect} AS username, {$emailSelect} AS email, {$passwordSelect} AS password_hash, {$isActiveSelect} AS is_active FROM users WHERE LOWER({$usernameSelect}) = :identifier_username OR LOWER({$emailSelect}) = :identifier_email LIMIT 1",
            [
                'identifier_username' => $identifier,
                'identifier_email' => $identifier,
            ]
        );

        $storedPassword = (string) ($user['password_hash'] ?? '');
        $passwordValid = $storedPassword !== '' && (password_verify($password, $storedPassword) || hash_equals($storedPassword, $password));

        if (!$user || (int) ($user['is_active'] ?? 0) !== 1 || !$passwordValid) {
            json_response(['error' => 'Invalid email/username or password'], 401);
        }

        $_SESSION['user_id'] = (int) $user['id'];
        $_SESSION['user_email'] = (string) $user['email'];
        $_SESSION['user_name'] = (string) $user['full_name'];
        $_SESSION['login_time'] = time();

        if (table_has($pdo, 'users', 'last_login_at')) {
            execute_stmt($pdo, 'UPDATE users SET last_login_at = NOW() WHERE id = :id', ['id' => $user['id']]);
        }

        json_response([
            'success' => true,
            'message' => 'Login successful',
            'user' => [
                'id' => (int) $user['id'],
                'fullName' => (string) $user['full_name'],
                'username' => (string) $user['username'],
                'email' => (string) $user['email'],
            ],
        ]);
    }

    if ($method === 'POST' && $path === 'auth/logout') {
        session_unset();
        session_destroy();
        json_response(['success' => true, 'message' => 'Logged out']);
    }

    if ($method === 'GET' && $path === 'auth/me') {
        require_authenticated_user();

        $user = fetch_one(
            $pdo,
            'SELECT id, full_name, username, email, is_active, last_login_at, created_at, updated_at FROM users WHERE id = :id LIMIT 1',
            ['id' => current_session_user_id()]
        );

        if (!$user) {
            json_response(['error' => 'User not found'], 404);
        }

        json_response(['user' => $user]);
    }
    // END AUTH ENDPOINTS

    $isPublicEndpoint = ($method === 'GET' && $path === 'health');
    if (!$isPublicEndpoint) {
        require_authenticated_user();
    }

    if ($method === 'GET' && $path === 'users') {
        $rows = fetch_all(
            $pdo,
            'SELECT id, full_name, username, email, is_active, last_login_at, created_at, updated_at FROM users ORDER BY full_name ASC, username ASC'
        );
        json_response(['rows' => $rows]);
    }

    if ($method === 'POST' && $path === 'users') {
        $body = request_json_body();
        $fullName = trim((string) ($body['fullName'] ?? ''));
        $username = trim((string) ($body['username'] ?? ''));
        $email = trim((string) ($body['email'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $isActive = ($body['isActive'] ?? true) === true || (string) ($body['isActive'] ?? '1') === '1';

        if ($fullName === '' || $username === '' || $email === '' || $password === '') {
            json_response(['error' => 'fullName, username, email and password are required'], 400);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_response(['error' => 'Valid email is required'], 400);
        }

        $passwordError = validate_password_strength($password);
        if ($passwordError) {
            json_response(['error' => $passwordError], 400);
        }

        try {
            execute_stmt(
                $pdo,
                'INSERT INTO users (full_name, username, email, password_hash, is_active, created_at, updated_at) VALUES (:full_name, :username, :email, :password_hash, :is_active, NOW(), NOW())',
                [
                    'full_name' => $fullName,
                    'username' => $username,
                    'email' => $email,
                    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                    'is_active' => $isActive ? 1 : 0,
                ]
            );
        } catch (PDOException $e) {
            if ((string) $e->getCode() === '23000') {
                json_response(['error' => 'Username or email already exists'], 409);
            }
            throw $e;
        }

        json_response(['success' => true, 'id' => (int) $pdo->lastInsertId()], 201);
    }

    if ($method === 'PUT' && preg_match('#^users/(\d+)$#', $path, $matches)) {
        $userId = (int) $matches[1];
        $body = request_json_body();
        $fullName = trim((string) ($body['fullName'] ?? ''));
        $username = trim((string) ($body['username'] ?? ''));
        $email = trim((string) ($body['email'] ?? ''));
        $isActive = ($body['isActive'] ?? true) === true || (string) ($body['isActive'] ?? '1') === '1';

        if ($userId <= 0 || $fullName === '' || $username === '' || $email === '') {
            json_response(['error' => 'Valid user id, fullName, username and email are required'], 400);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_response(['error' => 'Valid email is required'], 400);
        }

        if ($userId === current_session_user_id() && !$isActive) {
            json_response(['error' => 'You cannot deactivate your own user account'], 400);
        }

        try {
            $affected = execute_stmt(
                $pdo,
                'UPDATE users SET full_name = :full_name, username = :username, email = :email, is_active = :is_active, updated_at = NOW() WHERE id = :id',
                [
                    'full_name' => $fullName,
                    'username' => $username,
                    'email' => $email,
                    'is_active' => $isActive ? 1 : 0,
                    'id' => $userId,
                ]
            );
        } catch (PDOException $e) {
            if ((string) $e->getCode() === '23000') {
                json_response(['error' => 'Username or email already exists'], 409);
            }
            throw $e;
        }

        if ($affected === 0) {
            json_response(['error' => 'User not found or unchanged'], 404);
        }

        json_response(['success' => true]);
    }

    if ($method === 'PUT' && preg_match('#^users/(\d+)/password$#', $path, $matches)) {
        $userId = (int) $matches[1];
        $body = request_json_body();
        $newPassword = (string) ($body['password'] ?? '');

        if ($userId <= 0) {
            json_response(['error' => 'Valid user id is required'], 400);
        }

        $passwordError = validate_password_strength($newPassword);
        if ($passwordError) {
            json_response(['error' => $passwordError], 400);
        }

        $affected = execute_stmt(
            $pdo,
            'UPDATE users SET password_hash = :password_hash, updated_at = NOW() WHERE id = :id',
            [
                'password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
                'id' => $userId,
            ]
        );

        if ($affected === 0) {
            json_response(['error' => 'User not found'], 404);
        }

        json_response(['success' => true]);
    }

    if ($method === 'GET' && $path === 'downloads/apks') {
        $apkDir = __DIR__ . '/uploads/apks';
        if (!is_dir($apkDir)) {
            @mkdir($apkDir, 0775, true);
        }

        $rows = [];
        if (is_dir($apkDir)) {
            $files = scandir($apkDir);
            if (is_array($files)) {
                foreach ($files as $file) {
                    if ($file === '.' || $file === '..') {
                        continue;
                    }

                    $fullPath = $apkDir . DIRECTORY_SEPARATOR . $file;
                    if (!is_file($fullPath)) {
                        continue;
                    }

                    if (strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'apk') {
                        continue;
                    }

                    $rows[] = [
                        'name' => $file,
                        'size' => (int) (filesize($fullPath) ?: 0),
                        'modifiedAt' => date('Y-m-d H:i:s', (int) (filemtime($fullPath) ?: time())),
                        'downloadUrl' => 'api/downloads/apks/file?name=' . rawurlencode($file),
                    ];
                }
            }
        }

        usort(
            $rows,
            static fn(array $a, array $b): int => strcmp((string) ($b['modifiedAt'] ?? ''), (string) ($a['modifiedAt'] ?? ''))
        );

        json_response(['rows' => $rows]);
    }

    if ($method === 'POST' && $path === 'downloads/apks/upload') {
        if (!isset($_FILES['apk']) || !is_array($_FILES['apk'])) {
            json_response(['error' => 'APK file is required'], 400);
        }

        $file = $_FILES['apk'];
        $uploadError = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($uploadError !== UPLOAD_ERR_OK) {
            json_response(['error' => 'Upload failed with code ' . $uploadError], 400);
        }

        $originalName = trim((string) ($file['name'] ?? ''));
        $safeName = preg_replace('/[^A-Za-z0-9._-]/', '_', basename($originalName));
        if ($safeName === null || $safeName === '') {
            json_response(['error' => 'Invalid file name'], 400);
        }

        if (strtolower(pathinfo($safeName, PATHINFO_EXTENSION)) !== 'apk') {
            json_response(['error' => 'Only .apk files are allowed'], 400);
        }

        $tmpName = (string) ($file['tmp_name'] ?? '');
        if ($tmpName === '' || !is_uploaded_file($tmpName)) {
            json_response(['error' => 'No uploaded file found'], 400);
        }

        $apkDir = __DIR__ . '/uploads/apks';
        if (!is_dir($apkDir) && !@mkdir($apkDir, 0775, true)) {
            json_response(['error' => 'Could not create APK storage directory'], 500);
        }

        $targetPath = $apkDir . DIRECTORY_SEPARATOR . $safeName;
        if (!move_uploaded_file($tmpName, $targetPath)) {
            json_response(['error' => 'Could not save uploaded APK'], 500);
        }

        json_response([
            'success' => true,
            'name' => $safeName,
            'size' => (int) (filesize($targetPath) ?: 0),
        ], 201);
    }

    if ($method === 'GET' && $path === 'downloads/apks/file') {
        $name = trim((string) ($_GET['name'] ?? ''));
        $safeName = basename($name);

        if ($safeName === '' || strtolower(pathinfo($safeName, PATHINFO_EXTENSION)) !== 'apk') {
            json_response(['error' => 'Invalid APK file name'], 400);
        }

        $fullPath = __DIR__ . '/uploads/apks/' . $safeName;
        if (!is_file($fullPath)) {
            json_response(['error' => 'APK not found'], 404);
        }

        header('Content-Type: application/vnd.android.package-archive');
        header('Content-Disposition: attachment; filename="' . str_replace('"', '', $safeName) . '"');
        header('Content-Length: ' . (string) (filesize($fullPath) ?: 0));
        readfile($fullPath);
        exit;
    }

    if ($method === 'GET' && $path === 'health') {
        $dbOk = false;
        try {
            if ($pdo instanceof PDO) {
                $row = fetch_one($pdo, 'SELECT 1 AS ok');
                $dbOk = ((int) ($row['ok'] ?? 0) === 1);
            }
        } catch (Throwable $e) {
            $dbOk = false;
        }

        json_response([
            'ok' => true,
            'api' => 'up',
            'db' => $dbOk,
            'dbError' => $dbOk ? null : ($dbBootstrapError ?: null),
        ]);
    }

    if ($method === 'GET' && $path === 'dashboard/summary') {
        $units = (int) (fetch_one($pdo, 'SELECT COUNT(*) AS value FROM units')['value'] ?? 0);
        $sales = (int) (fetch_one($pdo, 'SELECT COUNT(*) AS value FROM sales')['value'] ?? 0);
        $models = (int) (fetch_one($pdo, 'SELECT COUNT(*) AS value FROM models')['value'] ?? 0);
        $warehouses = (int) (fetch_one($pdo, 'SELECT COUNT(*) AS value FROM warehouses')['value'] ?? 0);
        $delivered = (int) (fetch_one($pdo, 'SELECT COUNT(*) AS value FROM units WHERE delivered = 1')['value'] ?? 0);
        $weekly = (int) (fetch_one($pdo, 'SELECT COUNT(*) AS value FROM scan_out_events WHERE include_weekly_report = 1 AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)')['value'] ?? 0);

        json_response([
            'totalUnits' => $units,
            'totalSales' => $sales,
            'totalModels' => $models,
            'totalWarehouses' => $warehouses,
            'deliveredUnits' => $delivered,
            'weeklyReportCount' => $weekly,
        ]);
    }

    if ($method === 'GET' && $path === 'dashboard/warehouse-breakdown') {
        $unitWarehouseCol = choose_existing_column($pdo, 'units', ['warehouse_id']);
        $warehouseIdCol = choose_existing_column($pdo, 'warehouses', ['id', 'warehouse_id']);
        $warehouseNameCol = choose_existing_column($pdo, 'warehouses', ['name', 'warehouse_name', 'title']);
        $hasDelivered = table_has($pdo, 'units', 'delivered');
        $hasStatus = table_has($pdo, 'units', 'status');
        $hasSupplierStatus = table_has($pdo, 'units', 'supplier_status');
        $hasStockStatus = table_has($pdo, 'units', 'stock_status');

        if (!$unitWarehouseCol) {
            json_response(['rows' => []]);
        }

        $warehouseNameExpr = $warehouseNameCol
            ? sprintf("w.`%s`", $warehouseNameCol)
            : 'NULL';
        $joinClause = $warehouseIdCol
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = u.`%s`', $warehouseIdCol, $unitWarehouseCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';
        $warehouseDisplayExpr = sprintf("COALESCE(%s, CONCAT('Warehouse ', COALESCE(u.`%s`, 0)))", $warehouseNameExpr, $unitWarehouseCol);

        $whereParts = [];
        if ($hasDelivered) {
            $whereParts[] = 'COALESCE(u.delivered, 0) = 0';
        }
        if ($hasStatus) {
            $whereParts[] = "UPPER(TRIM(COALESCE(u.status, ''))) <> 'SOLD'";
        }

        $whereSql = count($whereParts) > 0 ? ('WHERE ' . implode(' AND ', $whereParts)) : '';

        $rows = fetch_all(
            $pdo,
            "SELECT
                u.`{$unitWarehouseCol}` AS warehouse_id,
                {$warehouseDisplayExpr} AS warehouse,
                COUNT(*) AS total_units
            FROM units u
            {$joinClause}
            {$whereSql}
            GROUP BY u.`{$unitWarehouseCol}`, {$warehouseDisplayExpr}
            ORDER BY total_units DESC, warehouse ASC"
        );

        json_response(['rows' => $rows]);
    }

    if ($method === 'GET' && $path === 'dashboard/scanned-in-warehouse-breakdown') {
        $unitWarehouseCol = choose_existing_column($pdo, 'units', ['warehouse_id']);
        $warehouseIdCol = choose_existing_column($pdo, 'warehouses', ['id', 'warehouse_id']);
        $warehouseNameCol = choose_existing_column($pdo, 'warehouses', ['name', 'warehouse_name', 'title']);

        $warehouseNameExpr = $warehouseNameCol
            ? sprintf("w.`%s`", $warehouseNameCol)
            : 'NULL';
        $joinClause = ($unitWarehouseCol && $warehouseIdCol)
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = u.`%s`', $warehouseIdCol, $unitWarehouseCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';

        $rows = fetch_all(
            $pdo,
            "SELECT
                u.source_id,
                CASE
                    WHEN u.source_id = 4 THEN 'TFFW Exchange'
                    WHEN u.source_id = 5 THEN 'Inhouse Exchange'
                    WHEN u.source_id = 6 THEN 'Bought Back'
                    WHEN u.source_id = 1 THEN 'TFFW Swaziland'
                    WHEN u.source_id = 2 THEN 'TFFW Durban'
                    WHEN u.source_id = 3 THEN 'TFFW Midrand'
                    ELSE CONCAT('Source ', u.source_id)
                END AS source_name,
                COALESCE({$warehouseNameExpr}, 'Unassigned') AS warehouse_name,
                COUNT(*) AS total_units
            FROM units u
            {$joinClause}
            WHERE u.source_id IN (1, 2, 3, 4, 5, 6)
            GROUP BY u.source_id, source_name, warehouse_name
            ORDER BY warehouse_name ASC, u.source_id ASC, total_units DESC"
        );
        json_response(['rows' => $rows]);
    }

    if ($method === 'GET' && $path === 'dashboard/recent-units') {
        $rows = get_units_rows($pdo);
        json_response(['units' => $rows]);
    }

    if ($method === 'GET' && $path === 'dashboard/units') {
        json_response(['rows' => get_units_rows($pdo)]);
    }

    if ($method === 'GET' && preg_match('#^dashboard/units-by-source/(\d+)$#', $path, $m)) {
        json_response(['rows' => get_units_rows($pdo, (int) $m[1])]);
    }

    if ($method === 'GET' && preg_match('#^dashboard/units-by-warehouse-source/(\d+)/(\d+)$#', $path, $m)) {
        json_response(['rows' => get_units_rows($pdo, (int) $m[2], (int) $m[1])]);
    }

    if ($method === 'GET' && preg_match('#^dashboard/units-in-stock-by-warehouse/(\d+)$#', $path, $m)) {
        json_response(['rows' => get_units_rows($pdo, null, (int) $m[1], true)]);
    }

    if ($method === 'GET' && $path === 'dashboard/sales') {
        json_response(['rows' => table_rows($pdo, 'sales')]);
    }

    if ($method === 'GET' && $path === 'dashboard/inhouse-exchanges') {
        json_response(['rows' => table_rows($pdo, 'inhouse_exchanges')]);
    }

    if ($method === 'GET' && $path === 'dashboard/models') {
        json_response(['rows' => table_rows($pdo, 'models')]);
    }

    if ($method === 'GET' && $path === 'dashboard/models-breakdown') {
        $requestedWarehouseId = isset($_GET['warehouseId']) ? (int) $_GET['warehouseId'] : 0;
        $filterByWarehouse = $requestedWarehouseId > 0;
        $hasWarehouseId = table_has($pdo, 'units', 'warehouse_id');
        $modelColumn = choose_existing_column($pdo, 'models', ['model_code', 'model_name', 'model_number', 'model_no', 'model', 'name']);
        $modelSelect = $modelColumn ? "m.`{$modelColumn}`" : 'CAST(m.id AS CHAR)';
        $joinClause = 'LEFT JOIN units u ON u.model_id = m.id';
        $params = [];

        if ($filterByWarehouse && $hasWarehouseId) {
            $joinClause .= ' AND u.warehouse_id = :warehouse_id';
            $params['warehouse_id'] = $requestedWarehouseId;
        }

        $rows = fetch_all($pdo, "
            SELECT
                m.id AS model_id,
                COALESCE({$modelSelect}, CONCAT('Model ', m.id)) AS model_name,
                COUNT(u.id) AS total_units
            FROM models m
            {$joinClause}
            GROUP BY m.id, model_name
            ORDER BY model_name ASC
        ", $params);
        json_response(['rows' => $rows]);
    }

    if ($method === 'GET' && preg_match('#^dashboard/models-breakdown/(\d+)/branches$#', $path, $m)) {
        $modelId = (int) $m[1];
        $hasWarehouseId = table_has($pdo, 'units', 'warehouse_id');
        $warehouseIdCol = choose_existing_column($pdo, 'warehouses', ['id', 'warehouse_id']);
        $warehouseNameCol = choose_existing_column($pdo, 'warehouses', ['name', 'warehouse_name', 'title']);
        $warehouseNameExpr = $warehouseNameCol ? "w.`{$warehouseNameCol}`" : 'NULL';
        $joinClause = ($hasWarehouseId && $warehouseIdCol)
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = u.warehouse_id', $warehouseIdCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';
        $rows = fetch_all($pdo, "
            SELECT
                COALESCE(u.warehouse_id, 0) AS warehouse_id,
                COALESCE({$warehouseNameExpr}, 'Unassigned') AS warehouse_name,
                COUNT(*) AS total_units
            FROM units u
            {$joinClause}
            WHERE u.model_id = :model_id
            GROUP BY warehouse_id, warehouse_name
            ORDER BY total_units DESC
        ", ['model_id' => $modelId]);
        json_response(['rows' => $rows]);
    }

    if ($method === 'GET' && preg_match('#^dashboard/models-breakdown/(\d+)/branches/(\d+)/units$#', $path, $m)) {
        $modelId   = (int) $m[1];
        $warehouseId = (int) $m[2];
        $modelColumn = choose_existing_column($pdo, 'models', ['model_code', 'model_name', 'model_number', 'model_no', 'model', 'name']);
        $modelSelect = $modelColumn ? "m.`{$modelColumn}`" : 'CAST(u.model_id AS CHAR)';
        $hasSupplierStatus = table_has($pdo, 'units', 'supplier_status');
        $hasStockStatus    = table_has($pdo, 'units', 'stock_status');
        $hasWarehouseId    = table_has($pdo, 'units', 'warehouse_id');
        $hasSourceId       = table_has($pdo, 'units', 'source_id');
        $supplierStatusSel = $hasSupplierStatus ? 'u.supplier_status' : 'NULL';
        $stockStatusSel    = $hasStockStatus    ? 'u.stock_status'    : 'NULL';
        $warehouseIdSel    = $hasWarehouseId    ? 'u.warehouse_id'    : 'NULL';
        $sourceIdSel       = $hasSourceId       ? 'u.source_id'       : 'NULL';
        $where  = ['u.model_id = :model_id'];
        $params = ['model_id' => $modelId];
        if ($hasWarehouseId) {
            if ($warehouseId === 0) {
                $where[] = 'u.warehouse_id IS NULL';
            } else {
                $where[] = 'u.warehouse_id = :warehouse_id';
                $params['warehouse_id'] = $warehouseId;
            }
        }
        $whereClause = 'WHERE ' . implode(' AND ', $where);
        $rows = fetch_all($pdo, "
            SELECT
                u.id,
                u.serial_number,
                {$modelSelect} AS model,
                u.stock_type,
                u.status,
                {$supplierStatusSel} AS supplier_status,
                {$stockStatusSel}    AS stock_status,
                {$warehouseIdSel}    AS warehouse_id,
                {$sourceIdSel}       AS source_id,
                u.date_received,
                u.created_at
            FROM units u
            LEFT JOIN models m ON m.id = u.model_id
            {$whereClause}
            ORDER BY u.created_at DESC
        ", $params);
        json_response(['rows' => $rows]);
    }

    if ($method === 'GET' && $path === 'dashboard/warehouses') {
        json_response(['rows' => fetch_all($pdo, 'SELECT * FROM warehouses ORDER BY id ASC')]);
    }

    if ($method === 'GET' && $path === 'dashboard/units-inhouse-exchanges') {
        json_response(['rows' => get_units_rows($pdo, 5)]);
    }

    if ($method === 'GET' && $path === 'dashboard/bought-back') {
        json_response(['rows' => get_units_rows($pdo, 6)]);
    }

    if ($method === 'GET' && $path === 'dashboard/quarantine') {
        $rows = fetch_all(
            $pdo,
            "SELECT u.*, COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model
             FROM units u
             LEFT JOIN models m ON m.id = u.model_id
             WHERE UPPER(TRIM(COALESCE(u.stock_type, ''))) = 'Q'
               AND (u.source_id = 4 OR u.source_id IS NULL)
             ORDER BY u.created_at DESC"
        );
        json_response(['rows' => $rows]);
    }

    if ($method === 'POST' && $path === 'dashboard/quarantine/release') {
        $body = request_json_body();
        $unitId = (int) ($body['unitId'] ?? 0);
        $stockType = strtoupper(trim((string) ($body['stockType'] ?? '')));
        $docsReceived = ($body['docsReceived'] ?? false) === true || (string) ($body['docsReceived'] ?? '') === '1';
        $ioNumber = trim((string) ($body['ioNumber'] ?? ''));

        if ($unitId <= 0) {
            json_response(['error' => 'Valid unitId is required'], 400);
        }
        if (!in_array($stockType, ['B', 'Y'], true)) {
            json_response(['error' => 'stockType must be B or Y'], 400);
        }
        if (!$docsReceived) {
            json_response(['error' => 'docsReceived must be confirmed before release'], 400);
        }
        if ($ioNumber === '') {
            json_response(['error' => 'ioNumber is required'], 400);
        }

        if (!table_has($pdo, 'units', 'stock_type')) {
            json_response(['error' => 'units.stock_type column does not exist'], 400);
        }

        $pdo->beginTransaction();

        $selectColumns = ['id', 'serial_number', 'stock_type'];
        if (table_has($pdo, 'units', 'source_id')) {
            $selectColumns[] = 'source_id';
        }

        $unit = fetch_one(
            $pdo,
            sprintf(
                'SELECT %s FROM units WHERE id = :id LIMIT 1 FOR UPDATE',
                implode(', ', array_map(static fn(string $column): string => "`{$column}`", $selectColumns))
            ),
            ['id' => $unitId]
        );
        if (!$unit) {
            $pdo->rollBack();
            json_response(['error' => 'Unit not found'], 404);
        }

        if (strtoupper(trim((string) ($unit['stock_type'] ?? ''))) !== 'Q') {
            $pdo->rollBack();
            json_response(['error' => 'Only units with stock_type Q can be released from quarantine'], 400);
        }

        $updateParts = ['`stock_type` = :stock_type'];
        $params = ['stock_type' => $stockType, 'id' => $unitId];

        if (table_has($pdo, 'units', 'status')) {
            $updateParts[] = "`status` = 'TFFW_Exchange'";
        }

        if (table_has($pdo, 'units', 'supplier_status')) {
            $updateParts[] = "`supplier_status` = 'UNPAID_TFFW'";
        }

        if (table_has($pdo, 'units', 'payment_status')) {
            $updateParts[] = "`payment_status` = 'UNPAID_TFFW'";
        }

        $unitIoColumn = choose_existing_column($pdo, 'units', ['io_number', 'io_no']);
        if ($unitIoColumn) {
            $updateParts[] = "`{$unitIoColumn}` = :io_number";
            $params['io_number'] = $ioNumber;
        }

        if (table_has($pdo, 'units', 'source_id')) {
            $updateParts[] = '`source_id` = 4';
        }

        $docsFlagColumn = choose_existing_column($pdo, 'units', ['docs_received', 'documents_received', 'documentation_received']);
        if ($docsFlagColumn) {
            $updateParts[] = "`{$docsFlagColumn}` = 1";
        }

        $docsAtColumn = choose_existing_column($pdo, 'units', ['docs_received_at', 'documents_received_at', 'documentation_received_at']);
        if ($docsAtColumn) {
            $updateParts[] = "`{$docsAtColumn}` = NOW()";
        }

        if (table_has($pdo, 'units', 'updated_at')) {
            $updateParts[] = '`updated_at` = NOW()';
        }

        execute_stmt(
            $pdo,
            sprintf('UPDATE units SET %s WHERE id = :id', implode(', ', $updateParts)),
            $params
        );

        $serialNumber = trim((string) ($unit['serial_number'] ?? ''));
        if ($serialNumber !== '') {
            insert_archive_record_if_missing($pdo, $serialNumber, 'TFFW_EXCHANGE', $ioNumber, null, null);
        }

        $pdo->commit();
        json_response([
            'ok' => true,
            'unitId' => $unitId,
            'serialNumber' => $serialNumber !== '' ? $serialNumber : null,
            'ioNumber' => $ioNumber,
            'paymentStatus' => 'UNPAID_TFFW',
            'previousStockType' => 'Q',
            'newStockType' => $stockType,
            'movedToSourceId' => table_has($pdo, 'units', 'source_id') ? 4 : null,
        ]);
    }

    if ($method === 'GET' && $path === 'dashboard/rare-cases') {
        $rows = fetch_all(
            $pdo,
            "SELECT u.*, COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model
             FROM units u
             LEFT JOIN models m ON m.id = u.model_id
             WHERE UPPER(TRIM(COALESCE(u.stock_type, ''))) = 'A'
             ORDER BY u.created_at DESC"
        );
        json_response(['rows' => $rows]);
    }

    if ($method === 'GET' && $path === 'dashboard/rare-cases-history') {
        json_response(['rows' => table_rows($pdo, 'rare_case_stock_changes')]);
    }

    if ($method === 'POST' && $path === 'dashboard/rare-cases/update-stock-type') {
        $body = request_json_body();
        $unitId = (int) ($body['unitId'] ?? 0);
        $stockType = strtoupper(trim((string) ($body['stockType'] ?? '')));
        $icNumber = trim((string) ($body['icNumber'] ?? ''));
        $changedBy = trim((string) ($body['changedBy'] ?? ''));

        if ($unitId <= 0) {
            json_response(['error' => 'Valid unitId is required'], 400);
        }
        if (!in_array($stockType, ['B', 'Y'], true)) {
            json_response(['error' => 'stockType must be B or Y'], 400);
        }
        if ($icNumber === '') {
            json_response(['error' => 'icNumber is required'], 400);
        }
        if ($changedBy === '') {
            json_response(['error' => 'changedBy is required'], 400);
        }
        if (!table_has($pdo, 'units', 'stock_type')) {
            json_response(['error' => 'units.stock_type column does not exist'], 400);
        }

        $pdo->beginTransaction();
        $unit = fetch_one($pdo, 'SELECT `id`, `serial_number`, `stock_type` FROM units WHERE id = :id LIMIT 1 FOR UPDATE', ['id' => $unitId]);
        if (!$unit) {
            $pdo->rollBack();
            json_response(['error' => 'Unit not found'], 404);
        }

        if (strtoupper(trim((string) ($unit['stock_type'] ?? ''))) !== 'A') {
            $pdo->rollBack();
            json_response(['error' => 'Only units with stock_type A can be changed here'], 400);
        }

        $updateParts = ['`stock_type` = :stock_type'];
        $params = ['stock_type' => $stockType, 'id' => $unitId];

        if (table_has($pdo, 'units', 'updated_at')) {
            $updateParts[] = '`updated_at` = NOW()';
        }

        execute_stmt(
            $pdo,
            sprintf('UPDATE units SET %s WHERE id = :id', implode(', ', $updateParts)),
            $params
        );

        execute_stmt(
            $pdo,
            'INSERT INTO rare_case_stock_changes (unit_id, serial_number, previous_stock_type, new_stock_type, ic_number, changed_by, changed_at, created_at) VALUES (:unit_id, :serial, :prev, :new, :ic, :changed_by, NOW(), NOW())',
            [
                'unit_id' => $unitId,
                'serial' => $unit['serial_number'] ?? '',
                'prev' => 'A',
                'new' => $stockType,
                'ic' => $icNumber,
                'changed_by' => $changedBy !== '' ? $changedBy : null,
            ]
        );

        $pdo->commit();
        json_response(['ok' => true]);
    }

    if ($method === 'GET' && preg_match('#^dashboard/scan-out-by-warehouse-type/(\d+)/([A-Z_]+)$#', $path, $m)) {
        $warehouseId = (int) $m[1];
        $scanType = strtoupper($m[2]);

        $rows = fetch_all(
            $pdo,
            "SELECT
                soe.*,
                COALESCE(ar.io_number, soe.io_number) AS io_number,
                CASE WHEN ar.id IS NOT NULL THEN 'PAID_TFFW' ELSE soe.payment_status END AS payment_status
             FROM scan_out_events soe
             LEFT JOIN archive_records ar ON ar.serial_number = soe.serial_number AND ar.scan_type = soe.scan_type
             WHERE soe.warehouse_id = :warehouse_id
               AND soe.scan_type = :scan_type
             ORDER BY soe.created_at DESC, soe.id DESC",
            ['warehouse_id' => $warehouseId, 'scan_type' => $scanType]
        );

        if ($scanType === 'ACTUAL_SALE') {
            $salesSerialCol = choose_existing_column($pdo, 'sales', ['serial_number', 'serial']);
            $salesInvoiceTypeCol = choose_existing_column($pdo, 'sales', ['invoice_type']);
            $salesInvoiceNumberCol = choose_existing_column($pdo, 'sales', ['invoice_number', 'invoice_no']);
            $salesClientCol = choose_existing_column($pdo, 'sales', ['client_name', 'client']);
            $salesPaymentCol = choose_existing_column($pdo, 'sales', ['payment_status', 'status']);
            $salesIoCol = choose_existing_column($pdo, 'sales', ['io_number', 'io_no']);
            $salesDateCol = choose_existing_column($pdo, 'sales', ['created_at', 'date_sold', 'sale_date', 'date', 'scanned_at']);

            if ($salesSerialCol) {
                $invoiceTypeSelect = $salesInvoiceTypeCol ? "s.`{$salesInvoiceTypeCol}`" : 'NULL';
                $invoiceNumberSelect = $salesInvoiceNumberCol ? "s.`{$salesInvoiceNumberCol}`" : 'NULL';
                $clientSelect = $salesClientCol ? "s.`{$salesClientCol}`" : 'NULL';
                $paymentSelect = $salesPaymentCol ? "s.`{$salesPaymentCol}`" : "'UNPAID_TFFW'";
                $ioSelect = $salesIoCol ? "s.`{$salesIoCol}`" : 'NULL';
                $createdAtSelect = $salesDateCol ? "s.`{$salesDateCol}`" : 'NOW()';

                $salesRows = fetch_all(
                    $pdo,
                    "SELECT
                        NULL AS id,
                        s.`{$salesSerialCol}` AS serial_number,
                        'ACTUAL_SALE' AS scan_type,
                        {$invoiceTypeSelect} AS invoice_type,
                        {$invoiceNumberSelect} AS invoice_number,
                        COALESCE(ar.io_number, {$ioSelect}) AS io_number,
                        NULL AS po_number,
                        {$clientSelect} AS client_name,
                        CASE WHEN ar.id IS NOT NULL THEN 'PAID_TFFW' ELSE {$paymentSelect} END AS payment_status,
                        'sales' AS source_table,
                        'SOLD' AS status,
                        NULL AS scanned_by,
                        {$createdAtSelect} AS scanned_at,
                        {$createdAtSelect} AS created_at,
                        u.warehouse_id
                     FROM sales s
                     LEFT JOIN units u ON u.serial_number = s.`{$salesSerialCol}`
                     LEFT JOIN archive_records ar ON ar.serial_number = s.`{$salesSerialCol}` AND ar.scan_type = 'ACTUAL_SALE'
                     WHERE u.warehouse_id = :warehouse_id
                       AND NOT EXISTS (
                           SELECT 1 FROM scan_out_events soe
                           WHERE soe.scan_type = 'ACTUAL_SALE' AND soe.serial_number = s.`{$salesSerialCol}`
                       )
                     ORDER BY {$createdAtSelect} DESC",
                    ['warehouse_id' => $warehouseId]
                );

                $rows = array_merge($rows, $salesRows);
            }
        }

        json_response(['rows' => $rows]);
    }

    if ($method === 'GET' && $path === 'dashboard/weekly-report') {
        sync_actual_sales_from_source($pdo);
        sync_tffw_exchange_from_source($pdo);
        sync_inhouse_exchange_from_source($pdo);
        sync_takealot_from_source($pdo);

        $serialNumberFilter = strtoupper(trim((string) ($_GET['serialNumber'] ?? '')));
        $stockTypeFilter = strtoupper(trim((string) ($_GET['stockType'] ?? '')));
        $branchFilter = trim((string) ($_GET['branch'] ?? ''));

        $whereParts = [
            'YEARWEEK(e.created_at, 1) = YEARWEEK(CURDATE(), 1)',
            "(e.include_weekly_report = 1 OR e.scan_type IN ('ACTUAL_SALE', 'INHOUSE_EXCHANGE'))",
            'NOT EXISTS (
                SELECT 1 FROM archive_records ar
                WHERE ar.source_event_id = e.id
                   OR (ar.serial_number = e.serial_number AND ar.scan_type = e.scan_type)
            )',
        ];
        $whereParams = [];

        if ($serialNumberFilter !== '') {
            $whereParts[] = "UPPER(COALESCE(e.serial_number, '')) LIKE :serial_number_filter";
            $whereParams['serial_number_filter'] = '%' . $serialNumberFilter . '%';
        }

        if ($stockTypeFilter !== '') {
            $whereParts[] = "UPPER(COALESCE(u.stock_type, '')) = :stock_type_filter";
            $whereParams['stock_type_filter'] = $stockTypeFilter;
        }

        $warehouseIdCol = choose_existing_column($pdo, 'warehouses', ['id', 'warehouse_id']);
        $warehouseNameCol = choose_existing_column($pdo, 'warehouses', ['name', 'warehouse_name', 'title']);

        $warehouseJoin = $warehouseIdCol
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = e.warehouse_id', $warehouseIdCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';
        $warehouseNameExpr = $warehouseNameCol
            ? sprintf('w.`%s`', $warehouseNameCol)
            : 'NULL';
        $branchExpr = sprintf("COALESCE(%s, CONCAT('Warehouse ', COALESCE(e.warehouse_id, 0)))", $warehouseNameExpr);
        $modelExpr = "COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR))";

        if ($branchFilter !== '') {
            $whereParts[] = "{$branchExpr} = :branch_filter";
            $whereParams['branch_filter'] = $branchFilter;
        }

        $whereSql = 'WHERE ' . implode(' AND ', $whereParts);

        // Summary of this week's weekly-report-eligible scans
        $summary = fetch_all(
            $pdo,
            "SELECT e.scan_type, e.payment_status, COUNT(*) AS total
             FROM scan_out_events e
             LEFT JOIN units u ON u.serial_number = e.serial_number
             {$warehouseJoin}
             {$whereSql}
             GROUP BY e.scan_type, e.payment_status
             ORDER BY total DESC, scan_type ASC"
            ,
            $whereParams
        );

        $branchSummary = fetch_all(
            $pdo,
            "SELECT {$branchExpr} AS branch, COUNT(*) AS total
             FROM scan_out_events e
             LEFT JOIN units u ON u.serial_number = e.serial_number
             {$warehouseJoin}
             {$whereSql}
             GROUP BY {$branchExpr}
             ORDER BY total DESC, branch ASC"
            ,
            $whereParams
        );

        // Recent weekly-report-eligible scan-outs
        $recent = fetch_all(
            $pdo,
            "SELECT
                e.id,
                e.serial_number,
                e.scan_type,
                e.client_name,
                COALESCE(u.supplier_status, e.payment_status) AS supplier_status,
                e.payment_status,
                e.io_number,
                     {$modelExpr} AS model,
                u.stock_type,
                {$branchExpr} AS branch,
                e.created_at
             FROM scan_out_events e
             LEFT JOIN units u ON u.serial_number = e.serial_number
                 LEFT JOIN models m ON m.id = u.model_id
             {$warehouseJoin}
             {$whereSql}
             ORDER BY e.created_at DESC
             LIMIT 500"
            ,
            $whereParams
        );

        $availableStockTypes = array_values(array_filter(array_unique(array_map(
            static fn(array $row): string => strtoupper(trim((string) ($row['stock_type'] ?? ''))),
            $recent
        )), static fn(string $value): bool => $value !== ''));

        sort($availableStockTypes);

        json_response([
            'summary' => $summary,
            'branchSummary' => $branchSummary,
            'recent' => $recent,
            'availableStockTypes' => $availableStockTypes,
        ]);
    }

    if ($method === 'GET' && $path === 'dashboard/archive') {
        sync_tffw_exchange_from_source($pdo);
        sync_tff_dealer_from_source($pdo);

        $branchFilter = trim((string) ($_GET['branch'] ?? ''));
        $serialNumberFilter = strtoupper(trim((string) ($_GET['serialNumber'] ?? '')));

        $salesSerialCol = choose_existing_column($pdo, 'sales', ['serial_number', 'serial']);
        $salesClientCol = choose_existing_column($pdo, 'sales', ['client_name', 'client']);
        $salesPaymentCol = choose_existing_column($pdo, 'sales', ['payment_status', 'status']);
        $salesSupplierStatusCol = choose_existing_column($pdo, 'sales', ['supplier_status']);
        $salesIoCol = choose_existing_column($pdo, 'sales', ['io_number', 'io_no']);
        $salesDateCol = choose_existing_column($pdo, 'sales', ['created_at', 'date_sold', 'sale_date', 'date', 'scanned_at']);
        $unitsSupplierStatusCol = choose_existing_column($pdo, 'units', ['supplier_status']);

        $salesJoin = $salesSerialCol
            ? "LEFT JOIN sales s ON s.`{$salesSerialCol}` = ar.serial_number"
            : 'LEFT JOIN sales s ON 1 = 0';

        $warehouseIdCol = choose_existing_column($pdo, 'warehouses', ['id', 'warehouse_id']);
        $warehouseNameCol = choose_existing_column($pdo, 'warehouses', ['name', 'warehouse_name', 'title']);
        $warehouseJoin = $warehouseIdCol
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = COALESCE(e.warehouse_id, u.warehouse_id)', $warehouseIdCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';
        $branchExpr = $warehouseNameCol
            ? sprintf("COALESCE(w.`%s`, CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0)))", $warehouseNameCol)
            : "CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0))";

        $archiveWhereParts = [];
        $archiveWhereParams = [];

        if ($branchFilter !== '') {
            $archiveWhereParts[] = "UPPER({$branchExpr}) LIKE :branch_filter";
            $archiveWhereParams['branch_filter'] = '%' . strtoupper($branchFilter) . '%';
        }

        if ($serialNumberFilter !== '') {
            $archiveWhereParts[] = "UPPER(COALESCE(ar.serial_number, '')) LIKE :serial_number_filter";
            $archiveWhereParams['serial_number_filter'] = '%' . $serialNumberFilter . '%';
        }

        $archiveWhereSql = count($archiveWhereParts) > 0
            ? ('WHERE ' . implode(' AND ', $archiveWhereParts))
            : '';

        $rows = fetch_all(
            $pdo,
            "SELECT
                ar.id,
                ar.serial_number,
                ar.scan_type,
                ar.io_number,
                COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model,
                {$branchExpr} AS branch,
                COALESCE(e.client_name, ar.client_name, " . ($salesClientCol ? "s.`{$salesClientCol}`" : 'NULL') . ") AS client_name,
                COALESCE(e.payment_status, " . ($salesPaymentCol ? "s.`{$salesPaymentCol}`" : 'NULL') . ", " . ($unitsSupplierStatusCol ? "u.`{$unitsSupplierStatusCol}`" : 'NULL') . ", 'UNPAID_TFFW') AS payment_status,
                COALESCE(" . ($unitsSupplierStatusCol ? "u.`{$unitsSupplierStatusCol}`" : 'NULL') . ", " . ($salesSupplierStatusCol ? "s.`{$salesSupplierStatusCol}`" : 'NULL') . ", 'UNPAID_TFFW') AS supplier_status,
                COALESCE(e.io_number, " . ($salesIoCol ? "s.`{$salesIoCol}`" : 'NULL') . ", ar.io_number) AS uploaded_io_number,
                e.invoice_type,
                e.invoice_number,
                e.po_number,
                COALESCE(e.created_at, " . ($salesDateCol ? "s.`{$salesDateCol}`" : 'NULL') . ", ar.created_at) AS scanned_at,
                ar.source_event_id,
                ar.archived_at,
                ar.created_at
             FROM archive_records ar
             LEFT JOIN scan_out_events e ON e.id = ar.source_event_id
             LEFT JOIN units u ON u.serial_number = ar.serial_number
             LEFT JOIN models m ON m.id = u.model_id
             {$warehouseJoin}
             {$salesJoin}
             {$archiveWhereSql}
             ORDER BY ar.archived_at DESC, ar.id DESC"
            ,
            $archiveWhereParams
        );

        json_response(['rows' => $rows]);
    }

    if ($method === 'POST' && $path === 'dashboard/weekly-report/archive-item') {
        $body = request_json_body();
        $serialNumber = trim((string) ($body['serialNumber'] ?? ''));
        $scanType = strtoupper(trim((string) ($body['scanType'] ?? '')));
        $ioNumber = trim((string) ($body['ioNumber'] ?? ''));

        if ($serialNumber === '') {
            json_response(['error' => 'serialNumber is required'], 400);
        }
        if ($scanType === '') {
            json_response(['error' => 'scanType is required'], 400);
        }
        if ($ioNumber === '') {
            json_response(['error' => 'ioNumber is required'], 400);
        }

        $pdo->beginTransaction();

        $event = fetch_one(
            $pdo,
            'SELECT id, client_name FROM scan_out_events WHERE serial_number = :serial AND scan_type = :scan ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
            ['serial' => $serialNumber, 'scan' => $scanType]
        );

        $eventId = $event ? (int) $event['id'] : null;
        $clientName = $event['client_name'] ?? null;

        execute_stmt(
            $pdo,
            "UPDATE scan_out_events SET io_number = :io, payment_status = 'PAID_TFFW' WHERE serial_number = :serial AND scan_type = :scan",
            ['io' => $ioNumber, 'serial' => $serialNumber, 'scan' => $scanType]
        );

        $sourceTableByScanType = [
            'ACTUAL_SALE' => 'sales',
            'TFFW_EXCHANGE' => 'tffw_exchanges',
            'TFF_DEALER' => 'tff_dealer_scans',
            'INHOUSE_EXCHANGE' => 'inhouse_exchanges',
            'TAKEALOT' => 'takealot_scans',
        ];

        update_table_by_serial($pdo, 'units', $serialNumber, $ioNumber, true);

        if (isset($sourceTableByScanType[$scanType])) {
            update_table_by_serial($pdo, $sourceTableByScanType[$scanType], $serialNumber, $ioNumber, true);
        }

        $salesSerialCol = choose_existing_column($pdo, 'sales', ['serial_number', 'serial']);
        $salesIoCol = choose_existing_column($pdo, 'sales', ['io_number', 'io_no']);
        $salesPaymentCol = choose_existing_column($pdo, 'sales', ['payment_status', 'status']);
        $salesSupplierStatusCol = choose_existing_column($pdo, 'sales', ['supplier_status']);
        $salesClientCol = choose_existing_column($pdo, 'sales', ['client_name', 'client']);

        if ($salesSerialCol) {
            $salesUpdates = [];
            $salesParams = ['serial' => $serialNumber];

            if ($salesIoCol) {
                $salesUpdates[] = "`{$salesIoCol}` = :io_number";
                $salesParams['io_number'] = $ioNumber;
            }

            if ($salesPaymentCol) {
                $salesUpdates[] = "`{$salesPaymentCol}` = 'PAID_TFFW'";
            }

            if ($salesSupplierStatusCol) {
                $salesUpdates[] = "`{$salesSupplierStatusCol}` = 'PAID'";
            }

            if ($salesUpdates) {
                execute_stmt(
                    $pdo,
                    sprintf('UPDATE sales SET %s WHERE `%s` = :serial', implode(', ', $salesUpdates), $salesSerialCol),
                    $salesParams
                );
            }

            if ($clientName === null && $salesClientCol) {
                $salesRow = fetch_one(
                    $pdo,
                    sprintf('SELECT `%s` AS client_name FROM sales WHERE `%s` = :serial ORDER BY id DESC LIMIT 1', $salesClientCol, $salesSerialCol),
                    ['serial' => $serialNumber]
                );
                $clientName = $salesRow['client_name'] ?? null;
            }
        }

        insert_archive_record_if_missing($pdo, $serialNumber, $scanType, $ioNumber, $eventId, $clientName);

        if (in_array($scanType, ['ACTUAL_SALE', 'INHOUSE_EXCHANGE'], true)) {
            execute_stmt(
                $pdo,
                'INSERT INTO weekly_payment_history (serial_number, scan_type, previous_payment_status, new_payment_status, io_number, changed_at, created_at) VALUES (:serial, :scan, :prev, :new, :io, NOW(), NOW())',
                ['serial' => $serialNumber, 'scan' => $scanType, 'prev' => 'UNPAID_TFFW', 'new' => 'PAID_TFFW', 'io' => $ioNumber]
            );
        }

        $pdo->commit();
        json_response(['ok' => true, 'serialNumber' => $serialNumber, 'scanType' => $scanType, 'ioNumber' => $ioNumber, 'archived' => true]);
    }

    if ($method === 'GET' && $path === 'dashboard/weekly-report-payment-history') {
        $branchFilter = trim((string) ($_GET['branch'] ?? ''));
        $serialNumberFilter = strtoupper(trim((string) ($_GET['serialNumber'] ?? '')));
        $warehouseIdCol = choose_existing_column($pdo, 'warehouses', ['id', 'warehouse_id']);
        $warehouseNameCol = choose_existing_column($pdo, 'warehouses', ['name', 'warehouse_name', 'title']);
        $warehouseJoin = $warehouseIdCol
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = COALESCE(e.warehouse_id, u.warehouse_id)', $warehouseIdCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';
        $branchExpr = $warehouseNameCol
            ? sprintf("COALESCE(w.`%s`, CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0)))", $warehouseNameCol)
            : "CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0))";

        $historyWhereParts = [];
        $historyWhereParams = [];

        if ($branchFilter !== '') {
            $historyWhereParts[] = "UPPER({$branchExpr}) LIKE :branch_filter";
            $historyWhereParams['branch_filter'] = '%' . strtoupper($branchFilter) . '%';
        }

        if ($serialNumberFilter !== '') {
            $historyWhereParts[] = "UPPER(COALESCE(h.serial_number, '')) LIKE :serial_number_filter";
            $historyWhereParams['serial_number_filter'] = '%' . $serialNumberFilter . '%';
        }

        $historyWhereSql = count($historyWhereParts) > 0
            ? ('WHERE ' . implode(' AND ', $historyWhereParts))
            : '';

        $rows = fetch_all(
            $pdo,
            "SELECT
                h.id,
                h.serial_number,
                h.scan_type,
                h.previous_payment_status,
                h.new_payment_status,
                h.io_number,
                COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model,
                {$branchExpr} AS branch,
                h.changed_at,
                h.created_at
             FROM weekly_payment_history h
                         LEFT JOIN scan_out_events e ON e.id = (
                                SELECT e2.id
                                FROM scan_out_events e2
                                WHERE e2.serial_number = h.serial_number
                                    AND (h.scan_type IS NULL OR e2.scan_type = h.scan_type)
                                ORDER BY e2.created_at DESC, e2.id DESC
                                LIMIT 1
                         )
             LEFT JOIN units u ON u.serial_number = h.serial_number
             LEFT JOIN models m ON m.id = u.model_id
             {$warehouseJoin}
             {$historyWhereSql}
             ORDER BY changed_at DESC, id DESC"
            ,
            $historyWhereParams
        );
        json_response(['rows' => $rows]);
    }

    if ($method === 'GET' && $path === 'dashboard/weekly-report-payment-history/export') {
        $branchFilter = trim((string) ($_GET['branch'] ?? ''));
        $serialNumberFilter = strtoupper(trim((string) ($_GET['serialNumber'] ?? '')));
        $warehouseIdCol = choose_existing_column($pdo, 'warehouses', ['id', 'warehouse_id']);
        $warehouseNameCol = choose_existing_column($pdo, 'warehouses', ['name', 'warehouse_name', 'title']);
        $warehouseJoin = $warehouseIdCol
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = COALESCE(e.warehouse_id, u.warehouse_id)', $warehouseIdCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';
        $branchExpr = $warehouseNameCol
            ? sprintf("COALESCE(w.`%s`, CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0)))", $warehouseNameCol)
            : "CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0))";

        $historyWhereParts = [];
        $historyWhereParams = [];

        if ($branchFilter !== '') {
            $historyWhereParts[] = "UPPER({$branchExpr}) LIKE :branch_filter";
            $historyWhereParams['branch_filter'] = '%' . strtoupper($branchFilter) . '%';
        }

        if ($serialNumberFilter !== '') {
            $historyWhereParts[] = "UPPER(COALESCE(h.serial_number, '')) LIKE :serial_number_filter";
            $historyWhereParams['serial_number_filter'] = '%' . $serialNumberFilter . '%';
        }

        $historyWhereSql = count($historyWhereParts) > 0
            ? ('WHERE ' . implode(' AND ', $historyWhereParts))
            : '';

        $rows = fetch_all(
            $pdo,
            "SELECT
                h.serial_number,
                {$branchExpr} AS branch,
                COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model,
                h.scan_type,
                h.previous_payment_status,
                h.new_payment_status,
                h.io_number,
                h.changed_at
             FROM weekly_payment_history h
             LEFT JOIN scan_out_events e ON e.id = (
                SELECT e2.id
                FROM scan_out_events e2
                WHERE e2.serial_number = h.serial_number
                  AND (h.scan_type IS NULL OR e2.scan_type = h.scan_type)
                ORDER BY e2.created_at DESC, e2.id DESC
                LIMIT 1
             )
             LEFT JOIN units u ON u.serial_number = h.serial_number
             LEFT JOIN models m ON m.id = u.model_id
             {$warehouseJoin}
             {$historyWhereSql}
             ORDER BY h.changed_at DESC, h.id DESC"
            ,
            $historyWhereParams
        );

        $exportRows = array_map(
            static fn(array $row): array => [
                (string) ($row['serial_number'] ?? ''),
                (string) ($row['branch'] ?? ''),
                (string) ($row['model'] ?? ''),
                (string) ($row['scan_type'] ?? ''),
                (string) ($row['previous_payment_status'] ?? ''),
                (string) ($row['new_payment_status'] ?? ''),
                (string) ($row['io_number'] ?? ''),
                (string) ($row['changed_at'] ?? ''),
            ],
            $rows
        );

        output_excel_csv(
            'weekly_paid_export.xls',
            ['Serial Number', 'Branch', 'Model', 'Scan Type', 'Previous Status', 'New Status', 'IO Number', 'Changed At'],
            $exportRows
        );
    }

    if ($method === 'GET' && $path === 'dashboard/archive/export') {
        sync_tffw_exchange_from_source($pdo);
        sync_tff_dealer_from_source($pdo);

        $branchFilter = trim((string) ($_GET['branch'] ?? ''));
        $serialNumberFilter = strtoupper(trim((string) ($_GET['serialNumber'] ?? '')));

        $salesSerialCol = choose_existing_column($pdo, 'sales', ['serial_number', 'serial']);
        $salesClientCol = choose_existing_column($pdo, 'sales', ['client_name', 'client']);
        $salesPaymentCol = choose_existing_column($pdo, 'sales', ['payment_status', 'status']);
        $salesSupplierStatusCol = choose_existing_column($pdo, 'sales', ['supplier_status']);
        $salesIoCol = choose_existing_column($pdo, 'sales', ['io_number', 'io_no']);
        $salesDateCol = choose_existing_column($pdo, 'sales', ['created_at', 'date_sold', 'sale_date', 'date', 'scanned_at']);
        $unitsSupplierStatusCol = choose_existing_column($pdo, 'units', ['supplier_status']);

        $salesJoin = $salesSerialCol
            ? "LEFT JOIN sales s ON s.`{$salesSerialCol}` = ar.serial_number"
            : 'LEFT JOIN sales s ON 1 = 0';

        $warehouseIdCol = choose_existing_column($pdo, 'warehouses', ['id', 'warehouse_id']);
        $warehouseNameCol = choose_existing_column($pdo, 'warehouses', ['name', 'warehouse_name', 'title']);
        $warehouseJoin = $warehouseIdCol
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = COALESCE(e.warehouse_id, u.warehouse_id)', $warehouseIdCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';
        $branchExpr = $warehouseNameCol
            ? sprintf("COALESCE(w.`%s`, CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0)))", $warehouseNameCol)
            : "CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0))";

        $archiveWhereParts = [];
        $archiveWhereParams = [];

        if ($branchFilter !== '') {
            $archiveWhereParts[] = "UPPER({$branchExpr}) LIKE :branch_filter";
            $archiveWhereParams['branch_filter'] = '%' . strtoupper($branchFilter) . '%';
        }

        if ($serialNumberFilter !== '') {
            $archiveWhereParts[] = "UPPER(COALESCE(ar.serial_number, '')) LIKE :serial_number_filter";
            $archiveWhereParams['serial_number_filter'] = '%' . $serialNumberFilter . '%';
        }

        $archiveWhereSql = count($archiveWhereParts) > 0
            ? ('WHERE ' . implode(' AND ', $archiveWhereParts))
            : '';

        $rows = fetch_all(
            $pdo,
            "SELECT
                ar.serial_number,
                {$branchExpr} AS branch,
                COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model,
                ar.scan_type,
                COALESCE(e.client_name, ar.client_name, " . ($salesClientCol ? "s.`{$salesClientCol}`" : 'NULL') . ") AS client_name,
                COALESCE(e.payment_status, " . ($salesPaymentCol ? "s.`{$salesPaymentCol}`" : 'NULL') . ", " . ($unitsSupplierStatusCol ? "u.`{$unitsSupplierStatusCol}`" : 'NULL') . ", 'UNPAID_TFFW') AS payment_status,
                COALESCE(" . ($unitsSupplierStatusCol ? "u.`{$unitsSupplierStatusCol}`" : 'NULL') . ", " . ($salesSupplierStatusCol ? "s.`{$salesSupplierStatusCol}`" : 'NULL') . ", 'UNPAID_TFFW') AS supplier_status,
                COALESCE(e.io_number, " . ($salesIoCol ? "s.`{$salesIoCol}`" : 'NULL') . ", ar.io_number) AS io_number,
                COALESCE(e.invoice_number, e.po_number, NULL) AS invoice_or_po,
                COALESCE(e.created_at, " . ($salesDateCol ? "s.`{$salesDateCol}`" : 'NULL') . ", ar.created_at) AS scanned_at,
                ar.archived_at
             FROM archive_records ar
             LEFT JOIN scan_out_events e ON e.id = ar.source_event_id
             LEFT JOIN units u ON u.serial_number = ar.serial_number
             LEFT JOIN models m ON m.id = u.model_id
             {$warehouseJoin}
             {$salesJoin}
             {$archiveWhereSql}
             ORDER BY ar.archived_at DESC, ar.id DESC"
            ,
            $archiveWhereParams
        );

        $exportRows = array_map(
            static fn(array $row): array => [
                (string) ($row['serial_number'] ?? ''),
                (string) ($row['branch'] ?? ''),
                (string) ($row['model'] ?? ''),
                (string) ($row['scan_type'] ?? ''),
                (string) ($row['client_name'] ?? ''),
                (string) ($row['payment_status'] ?? ''),
                (string) ($row['supplier_status'] ?? ''),
                (string) ($row['io_number'] ?? ''),
                (string) ($row['invoice_or_po'] ?? ''),
                (string) ($row['scanned_at'] ?? ''),
                (string) ($row['archived_at'] ?? ''),
            ],
            $rows
        );

        output_excel_csv(
            'archive_export.xls',
            ['Serial Number', 'Branch', 'Model', 'Scan Type', 'Client', 'Payment Status', 'Supplier Status', 'IO Number', 'Invoice / PO', 'Scanned At', 'Archived At'],
            $exportRows
        );
    }

    if ($method === 'GET' && $path === 'dashboard/serial-master-list') {
        sync_actual_sales_from_source($pdo);
        sync_tffw_exchange_from_source($pdo);
        sync_inhouse_exchange_from_source($pdo);
        sync_takealot_from_source($pdo);
        sync_tff_dealer_from_source($pdo);

        $search = strtoupper(trim((string) ($_GET['search'] ?? '')));

        $salesSerialCol = choose_existing_column($pdo, 'sales', ['serial_number', 'serial']);
        $unitPaymentCol = choose_existing_column($pdo, 'units', ['payment_status']);
        $unitIoCol = choose_existing_column($pdo, 'units', ['io_number', 'io_no']);
        $unitUpdatedAtCol = choose_existing_column($pdo, 'units', ['updated_at']);
        $unitSupplierStatusCol = choose_existing_column($pdo, 'units', ['supplier_status']);
        $unitStatusCol = choose_existing_column($pdo, 'units', ['status']);

        $warehouseIdCol = choose_existing_column($pdo, 'warehouses', ['id', 'warehouse_id']);
        $warehouseNameCol = choose_existing_column($pdo, 'warehouses', ['name', 'warehouse_name', 'title']);
        $warehouseJoin = $warehouseIdCol
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = COALESCE(u.warehouse_id, latest_event.warehouse_id)', $warehouseIdCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';
        $branchExpr = $warehouseNameCol
            ? sprintf("COALESCE(w.`%s`, CONCAT('Warehouse ', COALESCE(u.warehouse_id, latest_event.warehouse_id, 0)))", $warehouseNameCol)
            : "CONCAT('Warehouse ', COALESCE(u.warehouse_id, latest_event.warehouse_id, 0))";
        $modelExpr = "COALESCE(mu.model_code, mu.model_name, me.model_code, me.model_name, CAST(COALESCE(u.model_id, latest_event.model_id) AS CHAR), '-')";
        $statusExpr = "COALESCE(" . ($unitStatusCol ? "u.`{$unitStatusCol}`" : 'NULL') . ", latest_event.status, CASE WHEN latest_archive.id IS NOT NULL THEN 'ARCHIVED' ELSE NULL END, '-')";
        $supplierStatusExpr = "COALESCE(" . ($unitSupplierStatusCol ? "u.`{$unitSupplierStatusCol}`" : 'NULL') . ", latest_event.payment_status, CASE WHEN latest_archive.id IS NOT NULL THEN 'PAID_TFFW' ELSE NULL END, '-')";
        $paymentStatusExpr = "COALESCE(" . ($unitPaymentCol ? "u.`{$unitPaymentCol}`" : 'NULL') . ", latest_event.payment_status, CASE WHEN latest_archive.id IS NOT NULL THEN 'PAID_TFFW' ELSE NULL END, '-')";
        $ioNumberExpr = "COALESCE(" . ($unitIoCol ? "u.`{$unitIoCol}`" : 'NULL') . ", latest_event.io_number, latest_archive.io_number, '-')";

        $serialSources = [
            "SELECT UPPER(TRIM(serial_number)) AS serial_number FROM units WHERE COALESCE(serial_number, '') <> ''",
            "SELECT UPPER(TRIM(serial_number)) AS serial_number FROM scan_out_events WHERE COALESCE(serial_number, '') <> ''",
            "SELECT UPPER(TRIM(serial_number)) AS serial_number FROM archive_records WHERE COALESCE(serial_number, '') <> ''",
            "SELECT UPPER(TRIM(serial_number)) AS serial_number FROM weekly_payment_history WHERE COALESCE(serial_number, '') <> ''",
            "SELECT UPPER(TRIM(serial_number)) AS serial_number FROM rare_case_stock_changes WHERE COALESCE(serial_number, '') <> ''",
        ];

        if ($salesSerialCol) {
            $serialSources[] = "SELECT UPPER(TRIM(`{$salesSerialCol}`)) AS serial_number FROM sales WHERE COALESCE(`{$salesSerialCol}`, '') <> ''";
        }

        $serialUnionSql = implode(' UNION ', $serialSources);
        $whereSql = '';
        $params = [];

        if ($search !== '') {
            $whereSql = "WHERE (
                serials.serial_number LIKE :search
                OR UPPER(COALESCE({$modelExpr}, '')) LIKE :search
                OR UPPER(COALESCE({$branchExpr}, '')) LIKE :search
            )";
            $params['search'] = '%' . $search . '%';
        }

        $rows = fetch_all(
            $pdo,
            "SELECT
                serials.serial_number,
                     {$modelExpr} AS model,
                {$branchExpr} AS branch,
                u.stock_type,
                     {$statusExpr} AS status,
                     {$supplierStatusExpr} AS supplier_status,
                     {$paymentStatusExpr} AS payment_status,
                     {$ioNumberExpr} AS io_number,
                latest_event.scan_type AS last_scan_type,
                COALESCE(latest_event.created_at, latest_archive.archived_at, " . ($unitUpdatedAtCol ? "u.`{$unitUpdatedAtCol}`" : 'NULL') . ", u.created_at) AS last_activity_at,
                (SELECT COUNT(*) FROM scan_out_events e3 WHERE UPPER(COALESCE(e3.serial_number, '')) = serials.serial_number) AS event_count,
                (SELECT COUNT(*) FROM archive_records a3 WHERE UPPER(COALESCE(a3.serial_number, '')) = serials.serial_number) AS archive_count
             FROM (
                SELECT DISTINCT serial_number
                FROM ({$serialUnionSql}) all_serials
             ) serials
             LEFT JOIN scan_out_events latest_event ON latest_event.id = (
                SELECT e2.id
                FROM scan_out_events e2
                WHERE UPPER(COALESCE(e2.serial_number, '')) = serials.serial_number
                ORDER BY COALESCE(e2.scanned_at, e2.created_at) DESC, e2.id DESC
                LIMIT 1
             )
             LEFT JOIN archive_records latest_archive ON latest_archive.id = (
                SELECT a2.id
                FROM archive_records a2
                WHERE UPPER(COALESCE(a2.serial_number, '')) = serials.serial_number
                ORDER BY COALESCE(a2.archived_at, a2.created_at) DESC, a2.id DESC
                LIMIT 1
             )
                 LEFT JOIN units u ON UPPER(COALESCE(u.serial_number, '')) = serials.serial_number
                 LEFT JOIN models mu ON mu.id = u.model_id
                 LEFT JOIN models me ON me.id = latest_event.model_id
                 {$warehouseJoin}
             {$whereSql}
             ORDER BY serials.serial_number ASC",
            $params
        );

        json_response([
            'rows' => $rows,
            'search' => $search,
            'total' => count($rows),
        ]);
    }

    if ($method === 'GET' && $path === 'dashboard/serial-lookup') {
        sync_actual_sales_from_source($pdo);
        sync_tffw_exchange_from_source($pdo);
        sync_inhouse_exchange_from_source($pdo);
        sync_takealot_from_source($pdo);
        sync_tff_dealer_from_source($pdo);

        $serialNumber = trim((string) ($_GET['serialNumber'] ?? ''));
        if ($serialNumber === '') {
            json_response(['error' => 'serialNumber is required'], 400);
        }

        $serialLookup = strtoupper($serialNumber);

        $warehouseIdCol = choose_existing_column($pdo, 'warehouses', ['id', 'warehouse_id']);
        $warehouseNameCol = choose_existing_column($pdo, 'warehouses', ['name', 'warehouse_name', 'title']);
        $unitIoCol = choose_existing_column($pdo, 'units', ['io_number', 'io_no']);
        $unitPaymentCol = choose_existing_column($pdo, 'units', ['payment_status']);
        $unitSourceIdCol = choose_existing_column($pdo, 'units', ['source_id']);
        $unitDateReceivedCol = choose_existing_column($pdo, 'units', ['date_received']);
        $unitUpdatedAtCol = choose_existing_column($pdo, 'units', ['updated_at']);

        $unitWarehouseJoin = $warehouseIdCol
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = u.warehouse_id', $warehouseIdCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';
        $unitBranchExpr = $warehouseNameCol
            ? sprintf("COALESCE(w.`%s`, CONCAT('Warehouse ', COALESCE(u.warehouse_id, 0)))", $warehouseNameCol)
            : "CONCAT('Warehouse ', COALESCE(u.warehouse_id, 0))";
        $eventWarehouseJoin = $warehouseIdCol
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = COALESCE(e.warehouse_id, u.warehouse_id)', $warehouseIdCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';
        $eventBranchExpr = $warehouseNameCol
            ? sprintf("COALESCE(w.`%s`, CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0)))", $warehouseNameCol)
            : "CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0))";
        $archiveWarehouseJoin = $warehouseIdCol
            ? sprintf('LEFT JOIN warehouses w ON w.`%s` = COALESCE(e.warehouse_id, u.warehouse_id)', $warehouseIdCol)
            : 'LEFT JOIN warehouses w ON 1 = 0';
        $archiveBranchExpr = $warehouseNameCol
            ? sprintf("COALESCE(w.`%s`, CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0)))", $warehouseNameCol)
            : "CONCAT('Warehouse ', COALESCE(e.warehouse_id, u.warehouse_id, 0))";

        $current = fetch_one(
            $pdo,
            "SELECT
                u.id,
                u.serial_number,
                COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model,
                {$unitBranchExpr} AS branch,
                u.stock_type,
                u.status,
                " . (table_has($pdo, 'units', 'supplier_status') ? 'u.supplier_status' : 'NULL') . " AS supplier_status,
                " . ($unitPaymentCol ? "u.`{$unitPaymentCol}`" : 'NULL') . " AS payment_status,
                " . ($unitIoCol ? "u.`{$unitIoCol}`" : 'NULL') . " AS io_number,
                " . ($unitSourceIdCol ? "u.`{$unitSourceIdCol}`" : 'NULL') . " AS source_id,
                u.delivered,
                " . ($unitDateReceivedCol ? "u.`{$unitDateReceivedCol}`" : 'NULL') . " AS date_received,
                u.created_at,
                " . ($unitUpdatedAtCol ? "u.`{$unitUpdatedAtCol}`" : 'NULL') . " AS updated_at
             FROM units u
             LEFT JOIN models m ON m.id = u.model_id
             {$unitWarehouseJoin}
             WHERE UPPER(COALESCE(u.serial_number, '')) = :serial
             ORDER BY COALESCE(" . ($unitUpdatedAtCol ? "u.`{$unitUpdatedAtCol}`" : 'u.created_at') . ", u.created_at) DESC, u.id DESC
             LIMIT 1",
            ['serial' => $serialLookup]
        );

        $scanOutEvents = fetch_all(
            $pdo,
            "SELECT
                e.id,
                e.serial_number,
                e.scan_type,
                COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model,
                {$eventBranchExpr} AS branch,
                e.client_name,
                e.payment_status,
                e.io_number,
                e.invoice_type,
                e.invoice_number,
                e.po_number,
                e.source_table,
                e.status,
                e.scanned_by,
                e.scanned_at,
                e.created_at
             FROM scan_out_events e
             LEFT JOIN units u ON u.serial_number = e.serial_number
             LEFT JOIN models m ON m.id = COALESCE(e.model_id, u.model_id)
             {$eventWarehouseJoin}
             WHERE UPPER(COALESCE(e.serial_number, '')) = :serial
             ORDER BY COALESCE(e.scanned_at, e.created_at) DESC, e.id DESC",
            ['serial' => $serialLookup]
        );

        $salesSerialCol = choose_existing_column($pdo, 'sales', ['serial_number', 'serial']);
        $salesClientCol = choose_existing_column($pdo, 'sales', ['client_name', 'client']);
        $salesPaymentCol = choose_existing_column($pdo, 'sales', ['payment_status', 'status']);
        $salesSupplierStatusCol = choose_existing_column($pdo, 'sales', ['supplier_status']);
        $salesIoCol = choose_existing_column($pdo, 'sales', ['io_number', 'io_no']);
        $salesDateCol = choose_existing_column($pdo, 'sales', ['created_at', 'date_sold', 'sale_date', 'date', 'scanned_at']);
        $unitsSupplierStatusCol = choose_existing_column($pdo, 'units', ['supplier_status']);
        $salesJoin = $salesSerialCol
            ? "LEFT JOIN sales s ON s.`{$salesSerialCol}` = ar.serial_number"
            : 'LEFT JOIN sales s ON 1 = 0';

        $archiveRows = fetch_all(
            $pdo,
            "SELECT
                ar.id,
                ar.serial_number,
                ar.scan_type,
                ar.io_number,
                COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model,
                {$archiveBranchExpr} AS branch,
                COALESCE(e.client_name, ar.client_name, " . ($salesClientCol ? "s.`{$salesClientCol}`" : 'NULL') . ") AS client_name,
                COALESCE(e.payment_status, " . ($salesPaymentCol ? "s.`{$salesPaymentCol}`" : 'NULL') . ", " . ($unitsSupplierStatusCol ? "u.`{$unitsSupplierStatusCol}`" : 'NULL') . ", 'UNPAID_TFFW') AS payment_status,
                COALESCE(" . ($unitsSupplierStatusCol ? "u.`{$unitsSupplierStatusCol}`" : 'NULL') . ", " . ($salesSupplierStatusCol ? "s.`{$salesSupplierStatusCol}`" : 'NULL') . ", 'UNPAID_TFFW') AS supplier_status,
                COALESCE(e.io_number, " . ($salesIoCol ? "s.`{$salesIoCol}`" : 'NULL') . ", ar.io_number) AS uploaded_io_number,
                COALESCE(e.invoice_number, e.po_number, NULL) AS invoice_or_po,
                COALESCE(e.created_at, " . ($salesDateCol ? "s.`{$salesDateCol}`" : 'NULL') . ", ar.created_at) AS scanned_at,
                ar.archived_at,
                ar.created_at
             FROM archive_records ar
             LEFT JOIN scan_out_events e ON e.id = ar.source_event_id
             LEFT JOIN units u ON u.serial_number = ar.serial_number
             LEFT JOIN models m ON m.id = u.model_id
             {$archiveWarehouseJoin}
             {$salesJoin}
             WHERE UPPER(COALESCE(ar.serial_number, '')) = :serial
             ORDER BY ar.archived_at DESC, ar.id DESC",
            ['serial' => $serialLookup]
        );

        $paymentHistory = fetch_all(
            $pdo,
            "SELECT
                h.id,
                h.serial_number,
                h.scan_type,
                h.previous_payment_status,
                h.new_payment_status,
                h.io_number,
                COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model,
                {$archiveBranchExpr} AS branch,
                h.changed_at,
                h.created_at
             FROM weekly_payment_history h
             LEFT JOIN scan_out_events e ON e.id = (
                SELECT e2.id
                FROM scan_out_events e2
                WHERE e2.serial_number = h.serial_number
                  AND (h.scan_type IS NULL OR e2.scan_type = h.scan_type)
                ORDER BY e2.created_at DESC, e2.id DESC
                LIMIT 1
             )
             LEFT JOIN units u ON u.serial_number = h.serial_number
             LEFT JOIN models m ON m.id = u.model_id
             {$archiveWarehouseJoin}
             WHERE UPPER(COALESCE(h.serial_number, '')) = :serial
             ORDER BY h.changed_at DESC, h.id DESC",
            ['serial' => $serialLookup]
        );

        $rareCaseHistory = fetch_all(
            $pdo,
            "SELECT
                r.id,
                r.unit_id,
                r.serial_number,
                COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model,
                {$unitBranchExpr} AS branch,
                r.previous_stock_type,
                r.new_stock_type,
                r.ic_number,
                r.changed_by,
                r.changed_at,
                r.created_at
             FROM rare_case_stock_changes r
             LEFT JOIN units u ON u.id = r.unit_id
             LEFT JOIN models m ON m.id = u.model_id
             {$unitWarehouseJoin}
             WHERE UPPER(COALESCE(r.serial_number, '')) = :serial
             ORDER BY r.changed_at DESC, r.id DESC",
            ['serial' => $serialLookup]
        );

        $found = $current !== null
            || count($scanOutEvents) > 0
            || count($archiveRows) > 0
            || count($paymentHistory) > 0
            || count($rareCaseHistory) > 0;

        json_response([
            'serialNumber' => $serialNumber,
            'found' => $found,
            'current' => $current,
            'scanOutEvents' => $scanOutEvents,
            'archiveRows' => $archiveRows,
            'paymentHistory' => $paymentHistory,
            'rareCaseHistory' => $rareCaseHistory,
        ]);
    }

    if ($method === 'POST' && $path === 'dashboard/weekly-report/mark-paid') {
        $body = request_json_body();
        $serialNumber = trim((string) ($body['serialNumber'] ?? ''));
        $ioNumber = trim((string) ($body['ioNumber'] ?? ''));
        $scanType = strtoupper(trim((string) ($body['scanType'] ?? '')));

        if ($serialNumber === '') {
            json_response(['error' => 'serialNumber is required'], 400);
        }
        if ($ioNumber === '') {
            json_response(['error' => 'ioNumber is required'], 400);
        }

        $pdo->beginTransaction();

        $updated = execute_stmt(
            $pdo,
            "UPDATE scan_out_events
             SET payment_status = 'PAID_TFFW', io_number = :io
             WHERE serial_number = :serial
               AND include_weekly_report = 1
               AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
               AND payment_status = 'UNPAID_TFFW'",
            ['io' => $ioNumber, 'serial' => $serialNumber]
        );

        if ($updated < 1) {
            $pdo->rollBack();
            json_response(['error' => 'No UNPAID_TFFW weekly record found for this serial number'], 404);
        }

        execute_stmt(
            $pdo,
            'INSERT INTO weekly_payment_history (serial_number, scan_type, previous_payment_status, new_payment_status, io_number, changed_at, created_at) VALUES (:serial, :scan, :prev, :new, :io, NOW(), NOW())',
            ['serial' => $serialNumber, 'scan' => ($scanType !== '' ? $scanType : null), 'prev' => 'UNPAID_TFFW', 'new' => 'PAID_TFFW', 'io' => $ioNumber]
        );

        $pdo->commit();
        json_response(['ok' => true, 'updatedRows' => $updated, 'serialNumber' => $serialNumber]);
    }

    if ($method === 'GET' && $path === 'dashboard/takealot') {
        sync_takealot_from_source($pdo);

                                $unitsSupplierStatusCol = choose_existing_column($pdo, 'units', ['supplier_status']);

                $warehouseIdCol = choose_existing_column($pdo, 'warehouses', ['id', 'warehouse_id']);
                $warehouseNameCol = choose_existing_column($pdo, 'warehouses', ['name', 'warehouse_name', 'title']);
                $warehouseJoin = $warehouseIdCol
                        ? sprintf('LEFT JOIN warehouses w ON w.`%s` = e.warehouse_id', $warehouseIdCol)
                        : 'LEFT JOIN warehouses w ON 1 = 0';
                $branchExpr = $warehouseNameCol
                        ? sprintf("COALESCE(w.`%s`, CONCAT('Warehouse ', COALESCE(e.warehouse_id, 0)))", $warehouseNameCol)
                        : "CONCAT('Warehouse ', COALESCE(e.warehouse_id, 0))";

        $rows = fetch_all(
            $pdo,
                                                "SELECT e.id, e.serial_number, e.scan_type,
                                                                                COALESCE(m.model_code, m.model_name, CAST(u.model_id AS CHAR)) AS model,
                                                                                {$branchExpr} AS branch,
                                                                                " . ($unitsSupplierStatusCol ? "u.`{$unitsSupplierStatusCol}`" : 'NULL') . " AS supplier_status,
                                                                                e.payment_status, e.io_number, e.po_number, e.created_at, e.warehouse_id
             FROM scan_out_events e
                                                 LEFT JOIN units u ON u.`serial_number` = e.serial_number
                                                 LEFT JOIN models m ON m.id = u.model_id
                                                 {$warehouseJoin}
             WHERE e.scan_type = 'TAKEALOT'
               AND NOT EXISTS (
                 SELECT 1 FROM archive_records ar
                 WHERE ar.source_event_id = e.id
                    OR (ar.serial_number = e.serial_number AND ar.scan_type = e.scan_type)
               )
             ORDER BY e.created_at DESC, e.id DESC"
        );
        json_response(['rows' => $rows]);
    }

    if ($method === 'POST' && $path === 'scanout/process') {
        $payload = request_json_body();
        $error = scan_payload_error($payload, $scanRules);
        if ($error !== null) {
            json_response(['error' => $error], 400);
        }

        $scanType = strtoupper(trim((string) $payload['scanType']));
        $serialNumber = trim((string) $payload['serialNumber']);
        $invoiceType = trim((string) ($payload['invoiceType'] ?? ''));
        $invoiceNumber = trim((string) ($payload['invoiceNumber'] ?? ''));
        $ioNumber = trim((string) ($payload['ioNumber'] ?? ''));
        $poNumber = trim((string) ($payload['poNumber'] ?? ''));
        $clientName = trim((string) ($payload['clientName'] ?? ''));
        $scannedBy = trim((string) ($payload['scannedBy'] ?? ''));

        $rule = $scanRules[$scanType];
        $paymentStatus = $scanType === 'TAKEALOT' ? ($ioNumber !== '' ? 'UNPAID_TFFW' : 'PENDING_IO') : $rule['paymentStatus'];

        $pdo->beginTransaction();

        $unit = fetch_one($pdo, 'SELECT id, model_id, warehouse_id, serial_number FROM units WHERE serial_number = :serial LIMIT 1 FOR UPDATE', ['serial' => $serialNumber]);
        if (!$unit) {
            $pdo->rollBack();
            json_response(['error' => 'Unit not found by serial number'], 404);
        }

        execute_stmt($pdo, "UPDATE units SET status = 'SOLD', delivered = 1, updated_at = NOW() WHERE id = :id", ['id' => $unit['id']]);

        execute_stmt(
            $pdo,
            'INSERT INTO scan_out_events (unit_id, model_id, warehouse_id, serial_number, scan_type, invoice_type, invoice_number, io_number, po_number, client_name, payment_status, include_weekly_report, source_table, status, scanned_by, scanned_at, created_at) VALUES (:unit_id, :model_id, :warehouse_id, :serial_number, :scan_type, :invoice_type, :invoice_number, :io_number, :po_number, :client_name, :payment_status, :include_weekly_report, :source_table, :status, :scanned_by, NOW(), NOW())',
            [
                'unit_id' => $unit['id'],
                'model_id' => $unit['model_id'],
                'warehouse_id' => $unit['warehouse_id'],
                'serial_number' => $serialNumber,
                'scan_type' => $scanType,
                'invoice_type' => ($invoiceType !== '' ? $invoiceType : null),
                'invoice_number' => ($invoiceNumber !== '' ? $invoiceNumber : null),
                'io_number' => ($ioNumber !== '' ? $ioNumber : null),
                'po_number' => ($poNumber !== '' ? $poNumber : null),
                'client_name' => ($clientName !== '' ? $clientName : null),
                'payment_status' => $paymentStatus,
                'include_weekly_report' => (int) $rule['includeWeeklyReport'],
                'source_table' => $rule['sourceTable'],
                'status' => 'SOLD',
                'scanned_by' => ($scannedBy !== '' ? $scannedBy : null),
            ]
        );

        $eventId = (int) $pdo->lastInsertId();

        if (in_array($scanType, ['TFFW_EXCHANGE', 'TFF_DEALER'], true) && $ioNumber !== '') {
            insert_archive_record_if_missing($pdo, $serialNumber, $scanType, $ioNumber, $eventId, $clientName !== '' ? $clientName : null);
        }

        $pdo->commit();

        json_response([
            'ok' => true,
            'scanType' => $scanType,
            'serialNumber' => $serialNumber,
            'paymentStatus' => $paymentStatus,
            'includeWeeklyReport' => (int) $rule['includeWeeklyReport'],
        ]);
    }

    json_response(['error' => 'Endpoint not found', 'path' => $path], 404);
} catch (Throwable $e) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_response(['error' => 'Internal server error', 'message' => $e->getMessage()], 500);
}
