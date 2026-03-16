require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = Number(process.env.PORT || process.env.API_PORT || 5000);
const buildPath = path.join(__dirname, '..', 'build');
const buildIndexPath = path.join(buildPath, 'index.html');

app.use(cors());
app.use(express.json());

const SCAN_TYPES = {
  ACTUAL_SALE: 'ACTUAL_SALE',
  TFFW_EXCHANGE: 'TFFW_EXCHANGE',
  INHOUSE_EXCHANGE: 'INHOUSE_EXCHANGE',
  TAKEALOT: 'TAKEALOT',
  TFF_DEALER: 'TFF_DEALER',
};

const scanRules = {
  [SCAN_TYPES.ACTUAL_SALE]: {
    required: ['invoiceType', 'invoiceNumber', 'clientName'],
    paymentStatus: 'UNPAID_TFFW',
    includeWeeklyReport: 1,
    sourceTable: 'sales',
  },
  [SCAN_TYPES.TFFW_EXCHANGE]: {
    required: ['ioNumber', 'clientName'],
    paymentStatus: 'PAID_TFFW',
    includeWeeklyReport: 0,
    sourceTable: 'tffw_exchanges',
  },
  [SCAN_TYPES.INHOUSE_EXCHANGE]: {
    required: ['clientName'],
    paymentStatus: 'UNPAID_TFFW',
    includeWeeklyReport: 1,
    sourceTable: 'inhouse_exchanges',
  },
  [SCAN_TYPES.TAKEALOT]: {
    required: ['poNumber'],
    paymentStatus: 'PENDING_IO',
    includeWeeklyReport: 0,
    sourceTable: 'takealot_scans',
  },
  [SCAN_TYPES.TFF_DEALER]: {
    required: ['ioNumber', 'clientName'],
    paymentStatus: 'PAID_TFFW',
    includeWeeklyReport: 0,
    sourceTable: 'tff_dealer_scans',
  },
};

const AUTO_ARCHIVE_SCAN_TYPES = new Set([
  SCAN_TYPES.TFFW_EXCHANGE,
  SCAN_TYPES.TFF_DEALER,
]);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const tableColumnCache = new Map();

const getTableColumns = async (connection, tableName) => {
  const cacheKey = `${process.env.DB_NAME}.${tableName}`;
  if (tableColumnCache.has(cacheKey)) {
    return tableColumnCache.get(cacheKey);
  }

  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [process.env.DB_NAME, tableName]
  );

  const columns = new Set(rows.map((row) => row.COLUMN_NAME));
  tableColumnCache.set(cacheKey, columns);
  return columns;
};

const chooseExistingColumn = (columns, candidates) => {
  return candidates.find((columnName) => columns.has(columnName));
};

const getPreferredOrderColumn = (columns) => {
  const preferredOrder = ['created_at', 'date_received', 'id'];
  return preferredOrder.find((columnName) => columns.has(columnName));
};

const getTableRows = async (tableName) => {
  const connection = await pool.getConnection();
  try {
    const columns = await getTableColumns(connection, tableName);
    const orderColumn = getPreferredOrderColumn(columns);
    const orderClause = orderColumn ? ` ORDER BY \`${orderColumn}\` DESC` : '';
    const [rows] = await connection.query(`SELECT * FROM \`${tableName}\`${orderClause}`);
    return rows;
  } finally {
    connection.release();
  }
};

const getUnitsRows = async (sourceId = null, warehouseId = null, options = {}) => {
  const [modelColumns, unitColumns] = await Promise.all([
    pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'models'
       AND COLUMN_NAME IN ('model_code', 'model_name', 'model_number', 'model_no', 'model', 'name')`,
    [process.env.DB_NAME]
    ),
    pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'units'
       AND COLUMN_NAME IN ('supplier_status', 'stock_status', 'warehouse_id', 'source_id')`,
    [process.env.DB_NAME]
    ),
  ]);

  const preferredOrder = ['model_code', 'model_name', 'model_number', 'model_no', 'model', 'name'];
  const availableColumns = new Set(modelColumns[0].map((column) => column.COLUMN_NAME));
  const chosenModelColumn = preferredOrder.find((column) => availableColumns.has(column));

  const modelSelect = chosenModelColumn
    ? `m.\`${chosenModelColumn}\``
    : 'CAST(u.model_id AS CHAR)';
  const unitColumnNames = new Set(unitColumns[0].map((column) => column.COLUMN_NAME));
  const hasSupplierStatus = unitColumnNames.has('supplier_status');
  const hasStockStatus = unitColumnNames.has('stock_status');
  const hasWarehouseId = unitColumnNames.has('warehouse_id');
  const hasSourceId = unitColumnNames.has('source_id');
  const supplierStatusSelect = hasSupplierStatus ? 'u.supplier_status' : 'NULL';
  const stockStatusSelect = hasStockStatus ? 'u.stock_status' : 'NULL';
  const warehouseIdSelect = hasWarehouseId ? 'u.warehouse_id' : 'NULL';
  const sourceIdSelect = hasSourceId ? 'u.source_id' : 'NULL';

  const conditions = [];
  const queryParams = [];
  const inStockOnly = options?.inStockOnly === true;
  if (sourceId !== null && hasSourceId) {
    conditions.push('u.source_id = ?');
    queryParams.push(sourceId);
  }
  if (warehouseId !== null && hasWarehouseId) {
    conditions.push('u.warehouse_id = ?');
    queryParams.push(warehouseId);
  }
  if (inStockOnly) {
    if (hasSupplierStatus) {
      conditions.push("REPLACE(UPPER(TRIM(COALESCE(u.supplier_status, ''))), ' ', '_') = 'IN_STOCK'");
    } else if (hasStockStatus) {
      conditions.push("REPLACE(UPPER(TRIM(COALESCE(u.stock_status, ''))), ' ', '_') = 'IN_STOCK'");
    }
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.model_id,
       ${modelSelect} AS model,
       ${supplierStatusSelect} AS supplier_status,
       ${stockStatusSelect} AS stock_status,
       ${warehouseIdSelect} AS warehouse_id,
       ${sourceIdSelect} AS source_id,
       u.serial_number,
       u.stock_type,
       u.status,
       u.delivered,
       u.date_received,
       u.created_at
     FROM units u
     LEFT JOIN models m ON m.id = u.model_id
     ${whereClause}
     ORDER BY u.created_at DESC`,
    queryParams
  );

  return rows;
};

const buildInsertFromLogicalFields = async (connection, tableName, dataByLogicalField) => {
  const columns = await getTableColumns(connection, tableName);
  if (!columns.size) {
    return { inserted: false, reason: 'table-not-found' };
  }

  const concreteData = {};

  Object.entries(dataByLogicalField).forEach(([logicalKey, logicalValue]) => {
    const match = chooseExistingColumn(columns, {
      unitId: ['unit_id', 'units_id'],
      modelId: ['model_id'],
      warehouseId: ['warehouse_id'],
      serialNumber: ['serial_number', 'serial'],
      scanType: ['scan_type', 'sale_type', 'type'],
      invoiceType: ['invoice_type'],
      invoiceNumber: ['invoice_number', 'invoice_no'],
      ioNumber: ['io_number', 'io_no'],
      poNumber: ['po_number', 'po_no'],
      clientName: ['client_name', 'client'],
      paymentStatus: ['payment_status'],
      includeWeeklyReport: ['include_weekly_report', 'weekly_report'],
      status: ['status'],
      scannedBy: ['scanned_by', 'user_name'],
      scannedAt: ['scanned_at', 'created_at'],
      createdAt: ['created_at'],
    }[logicalKey] || []);

    if (match && logicalValue !== undefined) {
      concreteData[match] = logicalValue;
    }
  });

  const concreteEntries = Object.entries(concreteData);
  if (!concreteEntries.length) {
    return { inserted: false, reason: 'no-matching-columns' };
  }

  const columnSql = concreteEntries.map(([columnName]) => `\`${columnName}\``).join(', ');
  const placeholderSql = concreteEntries.map(() => '?').join(', ');
  const values = concreteEntries.map(([, value]) => value);

  const [result] = await connection.query(
    `INSERT INTO \`${tableName}\` (${columnSql}) VALUES (${placeholderSql})`,
    values
  );

  return { inserted: true, insertId: result.insertId };
};

const ensureScanOutEventsTable = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS scan_out_events (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    // Migrate existing tables that were created before warehouse_id was added
    const [cols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scan_out_events' AND COLUMN_NAME = 'warehouse_id'`
    );
    if (!cols.length) {
      await connection.query(
        `ALTER TABLE scan_out_events ADD COLUMN warehouse_id INT NULL AFTER model_id`
      );
    }
  } finally {
    connection.release();
  }
};

const ensureRareCaseStockChangesTable = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS rare_case_stock_changes (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } finally {
    connection.release();
  }
};

const ensureWeeklyPaymentHistoryTable = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS weekly_payment_history (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } finally {
    connection.release();
  }
};

const ensureArchiveRecordsTable = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS archive_records (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } finally {
    connection.release();
  }
};

const insertArchiveRecordIfMissing = async (connection, payload) => {
  const normalizedSerialNumber = String(payload?.serialNumber || '').trim();
  const normalizedScanType = String(payload?.scanType || '').trim().toUpperCase();
  const normalizedIoNumber = String(payload?.ioNumber || '').trim();
  const sourceEventId = Number.isInteger(payload?.sourceEventId) ? payload.sourceEventId : null;

  if (!normalizedSerialNumber || !normalizedScanType || !normalizedIoNumber) {
    return false;
  }

  if (sourceEventId) {
    const [existingByEvent] = await connection.query(
      'SELECT id FROM archive_records WHERE source_event_id = ? LIMIT 1',
      [sourceEventId]
    );

    if (existingByEvent.length) {
      return false;
    }
  } else {
    const [existingByComposite] = await connection.query(
      `SELECT id
       FROM archive_records
       WHERE serial_number = ? AND scan_type = ? AND io_number = ?
       LIMIT 1`,
      [normalizedSerialNumber, normalizedScanType, normalizedIoNumber]
    );

    if (existingByComposite.length) {
      return false;
    }
  }

  await connection.query(
    `INSERT INTO archive_records (
      serial_number,
      scan_type,
      io_number,
      source_event_id,
      client_name,
      archived_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      normalizedSerialNumber,
      normalizedScanType,
      normalizedIoNumber,
      sourceEventId,
      payload?.clientName || null,
    ]
  );

  return true;
};

const syncTffwExchangeFromSource = async (connection) => {
  const sourceColumns = await getTableColumns(connection, 'tffw_exchanges');
  const serialColumn = chooseExistingColumn(sourceColumns, ['serial_number', 'serial']);
  if (!serialColumn) {
    return 0;
  }

  const modelColumn = chooseExistingColumn(sourceColumns, ['model_id']);
  const warehouseColumn = chooseExistingColumn(sourceColumns, ['warehouse_id']);
  const clientColumn = chooseExistingColumn(sourceColumns, ['client_name', 'client']);
  const ioColumn = chooseExistingColumn(sourceColumns, ['io_number', 'io_no']);
  const createdAtColumn = chooseExistingColumn(sourceColumns, ['timestamp', 'created_at', 'scanned_at', 'date']);

  const [missingRows] = await connection.query(
    `SELECT
       s.\`${serialColumn}\` AS serial_number,
       ${modelColumn ? `s.\`${modelColumn}\`` : 'NULL'} AS model_id,
       ${warehouseColumn ? `s.\`${warehouseColumn}\`` : 'NULL'} AS warehouse_id,
       ${clientColumn ? `s.\`${clientColumn}\`` : 'NULL'} AS client_name,
       ${ioColumn ? `s.\`${ioColumn}\`` : 'NULL'} AS io_number,
       ${createdAtColumn ? `s.\`${createdAtColumn}\`` : 'NOW()'} AS source_created_at
     FROM tffw_exchanges s
     WHERE s.\`${serialColumn}\` IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM scan_out_events e
         WHERE e.scan_type = 'TFFW_EXCHANGE'
           AND e.serial_number = s.\`${serialColumn}\`
       )
     ORDER BY ${createdAtColumn ? `s.\`${createdAtColumn}\`` : 's.id'} DESC`
  );

  let syncedCount = 0;
  for (const row of missingRows) {
    const serialNumber = String(row.serial_number || '').trim();
    if (!serialNumber) {
      continue;
    }

    const [unitRows] = await connection.query(
      'SELECT id, model_id, warehouse_id FROM units WHERE serial_number = ? LIMIT 1',
      [serialNumber]
    );

    const unit = unitRows[0] || {};
    const eventTimestamp = row.source_created_at || new Date();
    const ioNumber = String(row.io_number || '').trim() || null;

    const insertResult = await buildInsertFromLogicalFields(connection, 'scan_out_events', {
      unitId: unit.id || null,
      modelId: row.model_id || unit.model_id || null,
      warehouseId: row.warehouse_id || unit.warehouse_id || null,
      serialNumber,
      scanType: SCAN_TYPES.TFFW_EXCHANGE,
      ioNumber,
      clientName: row.client_name || null,
      paymentStatus: ioNumber ? 'PAID_TFFW' : 'UNPAID_TFFW',
      includeWeeklyReport: 0,
      status: 'SOLD',
      scannedAt: eventTimestamp,
      createdAt: eventTimestamp,
    });

    const sourceEventId = Number.isInteger(insertResult?.insertId) ? insertResult.insertId : null;

    if (ioNumber) {
      await insertArchiveRecordIfMissing(connection, {
        serialNumber,
        scanType: SCAN_TYPES.TFFW_EXCHANGE,
        ioNumber,
        sourceEventId,
        clientName: row.client_name || null,
      });
    }

    syncedCount += 1;
  }

  return syncedCount;
};

const syncInhouseExchangeFromSource = async (connection) => {
  const sourceColumns = await getTableColumns(connection, 'inhouse_exchanges');
  const serialColumn = chooseExistingColumn(sourceColumns, ['serial_number', 'serial']);
  if (!serialColumn) {
    return 0;
  }

  const modelColumn = chooseExistingColumn(sourceColumns, ['model_id']);
  const warehouseColumn = chooseExistingColumn(sourceColumns, ['warehouse_id']);
  const clientColumn = chooseExistingColumn(sourceColumns, ['client_name', 'client']);
  const ioColumn = chooseExistingColumn(sourceColumns, ['io_number', 'io_no']);
  const createdAtColumn = chooseExistingColumn(sourceColumns, ['timestamp', 'created_at', 'scanned_at', 'date']);

  const [missingRows] = await connection.query(
    `SELECT
       s.\`${serialColumn}\` AS serial_number,
       ${modelColumn ? `s.\`${modelColumn}\`` : 'NULL'} AS model_id,
       ${warehouseColumn ? `s.\`${warehouseColumn}\`` : 'NULL'} AS warehouse_id,
       ${clientColumn ? `s.\`${clientColumn}\`` : 'NULL'} AS client_name,
       ${ioColumn ? `s.\`${ioColumn}\`` : 'NULL'} AS io_number,
       ${createdAtColumn ? `s.\`${createdAtColumn}\`` : 'NOW()'} AS source_created_at
     FROM inhouse_exchanges s
     WHERE s.\`${serialColumn}\` IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM scan_out_events e
         WHERE e.scan_type = 'INHOUSE_EXCHANGE'
           AND e.serial_number = s.\`${serialColumn}\`
       )
     ORDER BY ${createdAtColumn ? `s.\`${createdAtColumn}\`` : 's.id'} DESC`
  );

  let syncedCount = 0;
  for (const row of missingRows) {
    const serialNumber = String(row.serial_number || '').trim();
    if (!serialNumber) {
      continue;
    }

    const [unitRows] = await connection.query(
      'SELECT id, model_id, warehouse_id FROM units WHERE serial_number = ? LIMIT 1',
      [serialNumber]
    );

    const unit = unitRows[0] || {};
    const eventTimestamp = row.source_created_at || new Date();
    const ioNumber = String(row.io_number || '').trim() || null;

    await buildInsertFromLogicalFields(connection, 'scan_out_events', {
      unitId: unit.id || null,
      modelId: row.model_id || unit.model_id || null,
      warehouseId: row.warehouse_id || unit.warehouse_id || null,
      serialNumber,
      scanType: SCAN_TYPES.INHOUSE_EXCHANGE,
      ioNumber,
      clientName: row.client_name || null,
      paymentStatus: 'UNPAID_TFFW',
      includeWeeklyReport: 1,
      status: 'SOLD',
      scannedAt: eventTimestamp,
      createdAt: eventTimestamp,
    });

    syncedCount += 1;
  }

  return syncedCount;
};

const syncTakealotFromSource = async (connection) => {
  const sourceColumns = await getTableColumns(connection, 'takealot_scans');
  const serialColumn = chooseExistingColumn(sourceColumns, ['serial_number', 'serial']);
  if (!serialColumn) {
    return 0;
  }

  const modelColumn = chooseExistingColumn(sourceColumns, ['model_id']);
  const warehouseColumn = chooseExistingColumn(sourceColumns, ['warehouse_id']);
  const poColumn = chooseExistingColumn(sourceColumns, ['po_number', 'po_no']);
  const createdAtColumn = chooseExistingColumn(sourceColumns, ['timestamp', 'created_at', 'scanned_at', 'date']);

  const [missingRows] = await connection.query(
    `SELECT
       s.\`${serialColumn}\` AS serial_number,
       ${modelColumn ? `s.\`${modelColumn}\`` : 'NULL'} AS model_id,
       ${warehouseColumn ? `s.\`${warehouseColumn}\`` : 'NULL'} AS warehouse_id,
       ${poColumn ? `s.\`${poColumn}\`` : 'NULL'} AS po_number,
       ${createdAtColumn ? `s.\`${createdAtColumn}\`` : 'NOW()'} AS source_created_at
     FROM takealot_scans s
     WHERE s.\`${serialColumn}\` IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM scan_out_events e
         WHERE e.scan_type = 'TAKEALOT'
           AND e.serial_number = s.\`${serialColumn}\`
       )
     ORDER BY ${createdAtColumn ? `s.\`${createdAtColumn}\`` : 's.id'} DESC`
  );

  let syncedCount = 0;
  for (const row of missingRows) {
    const serialNumber = String(row.serial_number || '').trim();
    if (!serialNumber) {
      continue;
    }

    const [unitRows] = await connection.query(
      'SELECT id, model_id, warehouse_id FROM units WHERE serial_number = ? LIMIT 1',
      [serialNumber]
    );

    const unit = unitRows[0] || {};
    const eventTimestamp = row.source_created_at || new Date();

    await buildInsertFromLogicalFields(connection, 'scan_out_events', {
      unitId: unit.id || null,
      modelId: row.model_id || unit.model_id || null,
      warehouseId: row.warehouse_id || unit.warehouse_id || null,
      serialNumber,
      scanType: SCAN_TYPES.TAKEALOT,
      poNumber: row.po_number || null,
      paymentStatus: 'PENDING_IO',
      includeWeeklyReport: 0,
      status: 'SOLD',
      scannedAt: eventTimestamp,
      createdAt: eventTimestamp,
    });

    syncedCount += 1;
  }

  return syncedCount;
};

const syncTffDealerFromSource = async (connection) => {
  const sourceColumns = await getTableColumns(connection, 'tff_dealer_scans');
  const serialColumn = chooseExistingColumn(sourceColumns, ['serial_number', 'serial']);
  if (!serialColumn) {
    return 0;
  }

  const modelColumn = chooseExistingColumn(sourceColumns, ['model_id']);
  const warehouseColumn = chooseExistingColumn(sourceColumns, ['warehouse_id']);
  const clientColumn = chooseExistingColumn(sourceColumns, ['client_name', 'client']);
  const ioColumn = chooseExistingColumn(sourceColumns, ['io_number', 'io_no']);
  const createdAtColumn = chooseExistingColumn(sourceColumns, ['timestamp', 'created_at', 'scanned_at', 'date']);

  const [missingRows] = await connection.query(
    `SELECT
       s.\`${serialColumn}\` AS serial_number,
       ${modelColumn ? `s.\`${modelColumn}\`` : 'NULL'} AS model_id,
       ${warehouseColumn ? `s.\`${warehouseColumn}\`` : 'NULL'} AS warehouse_id,
       ${clientColumn ? `s.\`${clientColumn}\`` : 'NULL'} AS client_name,
       ${ioColumn ? `s.\`${ioColumn}\`` : 'NULL'} AS io_number,
       ${createdAtColumn ? `s.\`${createdAtColumn}\`` : 'NOW()'} AS source_created_at
     FROM tff_dealer_scans s
     WHERE s.\`${serialColumn}\` IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM scan_out_events e
         WHERE e.scan_type = 'TFF_DEALER'
           AND e.serial_number = s.\`${serialColumn}\`
       )
     ORDER BY ${createdAtColumn ? `s.\`${createdAtColumn}\`` : 's.id'} DESC`
  );

  let syncedCount = 0;
  for (const row of missingRows) {
    const serialNumber = String(row.serial_number || '').trim();
    if (!serialNumber) {
      continue;
    }

    const [unitRows] = await connection.query(
      'SELECT id, model_id, warehouse_id FROM units WHERE serial_number = ? LIMIT 1',
      [serialNumber]
    );

    const unit = unitRows[0] || {};
    const eventTimestamp = row.source_created_at || new Date();
    const ioNumber = String(row.io_number || '').trim() || null;

    const insertResult = await buildInsertFromLogicalFields(connection, 'scan_out_events', {
      unitId: unit.id || null,
      modelId: row.model_id || unit.model_id || null,
      warehouseId: row.warehouse_id || unit.warehouse_id || null,
      serialNumber,
      scanType: SCAN_TYPES.TFF_DEALER,
      ioNumber,
      clientName: row.client_name || null,
      paymentStatus: ioNumber ? 'PAID_TFFW' : 'UNPAID_TFFW',
      includeWeeklyReport: 0,
      status: 'SOLD',
      scannedAt: eventTimestamp,
      createdAt: eventTimestamp,
    });

    const sourceEventId = Number.isInteger(insertResult?.insertId) ? insertResult.insertId : null;

    if (ioNumber) {
      await insertArchiveRecordIfMissing(connection, {
        serialNumber,
        scanType: SCAN_TYPES.TFF_DEALER,
        ioNumber,
        sourceEventId,
        clientName: row.client_name || null,
      });
    }

    syncedCount += 1;
  }

  return syncedCount;
};

const validateScanPayload = (payload) => {
  const { scanType, serialNumber } = payload;

  if (!scanType || !scanRules[scanType]) {
    return 'Invalid scanType';
  }

  if (!serialNumber) {
    return 'serialNumber is required';
  }

  const missingField = scanRules[scanType].required.find((fieldName) => !payload[fieldName]);
  if (missingField) {
    return `${missingField} is required for ${scanType}`;
  }

  return null;
};

const updateUnitAsSold = async (connection, unit) => {
  const unitColumns = await getTableColumns(connection, 'units');
  const updates = [];
  const values = [];

  if (unitColumns.has('status')) {
    updates.push('`status` = ?');
    values.push('SOLD');
  }
  if (unitColumns.has('delivered')) {
    updates.push('`delivered` = ?');
    values.push(1);
  }
  if (unitColumns.has('updated_at')) {
    updates.push('`updated_at` = NOW()');
  }

  if (!updates.length) {
    return;
  }

  values.push(unit.id);
  await connection.query(`UPDATE units SET ${updates.join(', ')} WHERE id = ?`, values);
};

const logUnitHistoryIfAvailable = async (connection, eventPayload) => {
  try {
    const historyColumns = await getTableColumns(connection, 'unit_history');
    if (!historyColumns.size) {
      return;
    }

    await buildInsertFromLogicalFields(connection, 'unit_history', {
      unitId: eventPayload.unit_id,
      serialNumber: eventPayload.serial_number,
      scanType: eventPayload.scan_type,
      status: eventPayload.status,
      clientName: eventPayload.client_name,
      invoiceNumber: eventPayload.invoice_number,
      ioNumber: eventPayload.io_number,
      poNumber: eventPayload.po_number,
      paymentStatus: eventPayload.payment_status,
      scannedBy: eventPayload.scanned_by,
      scannedAt: eventPayload.scanned_at,
      createdAt: eventPayload.created_at,
    });
  } catch (error) {
    console.error('unit_history logging skipped:', error.message);
  }
};

app.get('/api/health', async (_req, res) => {
  const health = {
    ok: true,
    api: 'up',
    db: false,
  };

  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    health.db = rows?.[0]?.ok === 1;
    return res.status(200).json(health);
  } catch (error) {
    health.error = 'Database connection failed';
    return res.status(200).json(health);
  }
});

app.get('/api/dashboard/summary', async (_req, res) => {
  try {
    const [unitsRows] = await pool.query('SELECT COUNT(*) AS value FROM units');
    const [salesRows] = await pool.query('SELECT COUNT(*) AS value FROM sales');
    const [modelsRows] = await pool.query('SELECT COUNT(*) AS value FROM models');
    const [warehousesRows] = await pool.query('SELECT COUNT(*) AS value FROM warehouses');
    const [deliveredRows] = await pool.query('SELECT COUNT(*) AS value FROM units WHERE delivered = 1');
    const [weeklyRows] = await pool.query(
      `SELECT COUNT(*) AS value
       FROM scan_out_events
       WHERE include_weekly_report = 1
         AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)`
    );

    res.json({
      totalUnits: unitsRows[0]?.value || 0,
      totalSales: salesRows[0]?.value || 0,
      totalModels: modelsRows[0]?.value || 0,
      totalWarehouses: warehousesRows[0]?.value || 0,
      deliveredUnits: deliveredRows[0]?.value || 0,
      weeklyReportCount: weeklyRows[0]?.value || 0,
    });
  } catch (error) {
    console.error('Summary query failed:', error);
    res.status(500).json({ error: 'Failed to load dashboard summary' });
  }
});

app.get('/api/dashboard/warehouse-breakdown', async (_req, res) => {
  const connection = await pool.getConnection();
  try {
    const [unitColumns, warehouseColumns] = await Promise.all([
      getTableColumns(connection, 'units'),
      getTableColumns(connection, 'warehouses'),
    ]);

    const unitWarehouseColumn = chooseExistingColumn(unitColumns, ['warehouse_id', 'warehouse', 'warehouse_name']);
    const warehouseIdColumn = chooseExistingColumn(warehouseColumns, ['id', 'warehouse_id']);
    const warehouseNameColumn = chooseExistingColumn(warehouseColumns, ['name', 'warehouse_name', 'warehouse', 'title']);
    const unitSupplierStatusColumn = chooseExistingColumn(unitColumns, ['supplier_status']);
    const unitStockStatusColumn = chooseExistingColumn(unitColumns, ['stock_status']);

    if (!unitWarehouseColumn) {
      return res.json({ rows: [] });
    }

    const inStockCondition = unitSupplierStatusColumn
      ? `REPLACE(UPPER(TRIM(COALESCE(u.\`${unitSupplierStatusColumn}\`, ''))), ' ', '_') = 'IN_STOCK'`
      : (unitStockStatusColumn
        ? `REPLACE(UPPER(TRIM(COALESCE(u.\`${unitStockStatusColumn}\`, ''))), ' ', '_') = 'IN_STOCK'`
        : '1=1');

    if (warehouseIdColumn && warehouseNameColumn && unitWarehouseColumn === 'warehouse_id') {
      const [rows] = await connection.query(
        `SELECT
           w.\`${warehouseIdColumn}\` AS warehouse_id,
           COALESCE(w.\`${warehouseNameColumn}\`, 'Unassigned') AS warehouse,
           COUNT(*) AS total_units
         FROM units u
         LEFT JOIN warehouses w ON w.\`${warehouseIdColumn}\` = u.\`${unitWarehouseColumn}\`
         WHERE ${inStockCondition}
         GROUP BY w.\`${warehouseIdColumn}\`, COALESCE(w.\`${warehouseNameColumn}\`, 'Unassigned')
         ORDER BY total_units DESC, warehouse ASC`
      );

      return res.json({ rows });
    }

    const [rows] = await connection.query(
      `SELECT
         NULL AS warehouse_id,
         COALESCE(NULLIF(TRIM(CAST(u.\`${unitWarehouseColumn}\` AS CHAR)), ''), 'Unassigned') AS warehouse,
         COUNT(*) AS total_units
       FROM units u
       WHERE ${inStockCondition}
       GROUP BY COALESCE(NULLIF(TRIM(CAST(u.\`${unitWarehouseColumn}\` AS CHAR)), ''), 'Unassigned')
       ORDER BY total_units DESC, warehouse ASC`
    );

    return res.json({ rows });
  } catch (error) {
    console.error('Warehouse breakdown query failed:', error);
    return res.status(500).json({ error: 'Failed to load warehouse breakdown' });
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard/units-in-stock-by-warehouse/:warehouseId', async (req, res) => {
  try {
    const warehouseId = Number.parseInt(req.params.warehouseId, 10);
    if (Number.isNaN(warehouseId)) {
      return res.status(400).json({ error: 'Invalid warehouseId' });
    }

    const rows = await getUnitsRows(null, warehouseId, { inStockOnly: true });
    return res.json({ rows });
  } catch (error) {
    console.error('Units in stock by warehouse query failed:', error);
    return res.status(500).json({ error: 'Failed to load units in stock by warehouse' });
  }
});

app.get('/api/dashboard/scanned-in-warehouse-breakdown', async (_req, res) => {
  const connection = await pool.getConnection();
  try {
    const [unitColumns, warehouseColumns] = await Promise.all([
      getTableColumns(connection, 'units'),
      getTableColumns(connection, 'warehouses'),
    ]);

    const unitWarehouseColumn = chooseExistingColumn(unitColumns, ['warehouse_id', 'warehouse', 'warehouse_name']);
    const warehouseIdColumn = chooseExistingColumn(warehouseColumns, ['id', 'warehouse_id']);
    const warehouseNameColumn = chooseExistingColumn(warehouseColumns, ['name', 'warehouse_name', 'warehouse', 'title']);
    const hasSourceId = unitColumns.has('source_id');

    if (!unitWarehouseColumn || !hasSourceId) {
      return res.json({ rows: [] });
    }

    if (warehouseIdColumn && warehouseNameColumn && unitWarehouseColumn === 'warehouse_id') {
      const [rows] = await connection.query(
        `SELECT
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
           COALESCE(w.\`${warehouseNameColumn}\`, 'Unassigned') AS warehouse_name,
           COUNT(*) AS total_units
         FROM units u
         LEFT JOIN warehouses w ON w.\`${warehouseIdColumn}\` = u.\`${unitWarehouseColumn}\`
         WHERE u.source_id IN (1, 2, 3, 4, 5, 6)
         GROUP BY
           u.source_id,
           CASE
             WHEN u.source_id = 4 THEN 'TFFW Exchange'
             WHEN u.source_id = 5 THEN 'Inhouse Exchange'
             WHEN u.source_id = 6 THEN 'Bought Back'
             WHEN u.source_id = 1 THEN 'TFFW Swaziland'
             WHEN u.source_id = 2 THEN 'TFFW Durban'
             WHEN u.source_id = 3 THEN 'TFFW Midrand'
             ELSE CONCAT('Source ', u.source_id)
           END,
           COALESCE(w.\`${warehouseNameColumn}\`, 'Unassigned')
         ORDER BY warehouse_name ASC, u.source_id ASC, total_units DESC`
      );

      return res.json({ rows });
    }

    const [rows] = await connection.query(
      `SELECT
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
         COALESCE(NULLIF(TRIM(CAST(u.\`${unitWarehouseColumn}\` AS CHAR)), ''), 'Unassigned') AS warehouse_name,
         COUNT(*) AS total_units
       FROM units u
       WHERE u.source_id IN (1, 2, 3, 4, 5, 6)
       GROUP BY
         u.source_id,
         CASE
           WHEN u.source_id = 4 THEN 'TFFW Exchange'
           WHEN u.source_id = 5 THEN 'Inhouse Exchange'
           WHEN u.source_id = 6 THEN 'Bought Back'
           WHEN u.source_id = 1 THEN 'TFFW Swaziland'
           WHEN u.source_id = 2 THEN 'TFFW Durban'
           WHEN u.source_id = 3 THEN 'TFFW Midrand'
           ELSE CONCAT('Source ', u.source_id)
         END,
         COALESCE(NULLIF(TRIM(CAST(u.\`${unitWarehouseColumn}\` AS CHAR)), ''), 'Unassigned')
       ORDER BY warehouse_name ASC, u.source_id ASC, total_units DESC`
    );

    return res.json({ rows });
  } catch (error) {
    console.error('Scanned in warehouse breakdown query failed:', error);
    return res.status(500).json({ error: 'Failed to load scanned in warehouse breakdown' });
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard/recent-units', async (_req, res) => {
  try {
    const [modelColumns, unitColumns] = await Promise.all([
      pool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'models'
         AND COLUMN_NAME IN ('model_code', 'model_name', 'model_number', 'model_no', 'model', 'name')`,
      [process.env.DB_NAME]
      ),
      pool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'units'
         AND COLUMN_NAME IN ('supplier_status', 'stock_status', 'warehouse_id')`,
      [process.env.DB_NAME]
      ),
    ]);

    const preferredOrder = ['model_code', 'model_name', 'model_number', 'model_no', 'model', 'name'];
    const availableColumns = new Set(modelColumns[0].map((column) => column.COLUMN_NAME));
    const chosenModelColumn = preferredOrder.find((column) => availableColumns.has(column));

    const modelSelect = chosenModelColumn
      ? `m.\`${chosenModelColumn}\``
      : 'CAST(u.model_id AS CHAR)';
    const unitColumnNames = new Set(unitColumns[0].map((column) => column.COLUMN_NAME));
    const hasSupplierStatus = unitColumnNames.has('supplier_status');
    const hasStockStatus = unitColumnNames.has('stock_status');
    const hasWarehouseId = unitColumnNames.has('warehouse_id');
    const supplierStatusSelect = hasSupplierStatus ? 'u.supplier_status' : 'NULL';
    const stockStatusSelect = hasStockStatus ? 'u.stock_status' : 'NULL';
    const warehouseIdSelect = hasWarehouseId ? 'u.warehouse_id' : 'NULL';

    const [rows] = await pool.query(
      `SELECT
         u.id,
         u.model_id,
         ${modelSelect} AS model,
         ${supplierStatusSelect} AS supplier_status,
         ${stockStatusSelect} AS stock_status,
         ${warehouseIdSelect} AS warehouse_id,
         u.serial_number,
         u.stock_type,
         u.status,
         u.delivered,
         u.date_received,
         u.created_at
       FROM units u
       LEFT JOIN models m ON m.id = u.model_id
       ORDER BY u.created_at DESC`
    );

    res.json({ units: rows });
  } catch (error) {
    console.error('Recent units query failed:', error);
    res.status(500).json({ error: 'Failed to load recent units' });
  }
});

app.get('/api/dashboard/units', async (_req, res) => {
  try {
    const rows = await getUnitsRows();

    res.json({ rows });
  } catch (error) {
    console.error('Units query failed:', error);
    res.status(500).json({ error: 'Failed to load units' });
  }
});

app.get('/api/dashboard/units-by-source/:sourceId', async (req, res) => {
  try {
    const sourceId = Number.parseInt(req.params.sourceId, 10);
    if (Number.isNaN(sourceId)) {
      res.status(400).json({ error: 'Invalid source ID' });
      return;
    }

    const rows = await getUnitsRows(sourceId);
    res.json({ rows });
  } catch (error) {
    console.error('Units by source query failed:', error);
    res.status(500).json({ error: 'Failed to load units by source' });
  }
});

app.get('/api/dashboard/quarantine', async (_req, res) => {
  try {
    const [modelColumns, unitColumns] = await Promise.all([
      pool.query(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'models'
           AND COLUMN_NAME IN ('model_code', 'model_name', 'model_number', 'model_no', 'model', 'name')`,
        [process.env.DB_NAME]
      ),
      pool.query(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'units'
           AND COLUMN_NAME IN ('supplier_status', 'stock_status', 'warehouse_id', 'source_id', 'stock_type', 'updated_at')`,
        [process.env.DB_NAME]
      ),
    ]);

    const unitColumnNames = new Set(unitColumns[0].map((column) => column.COLUMN_NAME));
    if (!unitColumnNames.has('stock_type')) {
      return res.json({ rows: [] });
    }

    const preferredOrder = ['model_code', 'model_name', 'model_number', 'model_no', 'model', 'name'];
    const availableModelColumns = new Set(modelColumns[0].map((column) => column.COLUMN_NAME));
    const chosenModelColumn = preferredOrder.find((column) => availableModelColumns.has(column));
    const modelSelect = chosenModelColumn ? `m.\`${chosenModelColumn}\`` : 'CAST(u.model_id AS CHAR)';

    const supplierStatusSelect = unitColumnNames.has('supplier_status') ? 'u.supplier_status' : 'NULL';
    const stockStatusSelect = unitColumnNames.has('stock_status') ? 'u.stock_status' : 'NULL';
    const warehouseIdSelect = unitColumnNames.has('warehouse_id') ? 'u.warehouse_id' : 'NULL';
    const sourceIdSelect = unitColumnNames.has('source_id') ? 'u.source_id' : 'NULL';

    const conditions = ["UPPER(TRIM(COALESCE(u.stock_type, ''))) = 'Q'"];
    if (unitColumnNames.has('source_id')) {
      conditions.push('u.source_id = 4');
    }

    const [rows] = await pool.query(
      `SELECT
         u.id,
         u.model_id,
         ${modelSelect} AS model,
         ${supplierStatusSelect} AS supplier_status,
         ${stockStatusSelect} AS stock_status,
         ${warehouseIdSelect} AS warehouse_id,
         ${sourceIdSelect} AS source_id,
         u.serial_number,
         u.stock_type,
         u.status,
         u.delivered,
         u.date_received,
         u.created_at
       FROM units u
       LEFT JOIN models m ON m.id = u.model_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.created_at DESC`
    );

    return res.json({ rows });
  } catch (error) {
    console.error('Quarantine query failed:', error);
    return res.status(500).json({ error: 'Failed to load quarantine units' });
  }
});

app.post('/api/dashboard/quarantine/release', async (req, res) => {
  const { unitId, stockType, docsReceived } = req.body || {};
  const parsedUnitId = Number.parseInt(unitId, 10);
  const nextStockType = String(stockType || '').trim().toUpperCase();
  const docsConfirmed = docsReceived === true || docsReceived === 1 || docsReceived === '1';

  if (Number.isNaN(parsedUnitId) || parsedUnitId <= 0) {
    return res.status(400).json({ error: 'Valid unitId is required' });
  }

  if (!['B', 'Y'].includes(nextStockType)) {
    return res.status(400).json({ error: 'stockType must be B or Y' });
  }

  if (!docsConfirmed) {
    return res.status(400).json({ error: 'docsReceived must be confirmed before release' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const unitColumns = await getTableColumns(connection, 'units');
    if (!unitColumns.has('stock_type')) {
      await connection.rollback();
      return res.status(400).json({ error: 'units.stock_type column does not exist' });
    }

    const selectColumns = ['id', 'serial_number', 'stock_type'];
    if (unitColumns.has('source_id')) {
      selectColumns.push('source_id');
    }

    const [unitRows] = await connection.query(
      `SELECT ${selectColumns.map((columnName) => `\`${columnName}\``).join(', ')} FROM units WHERE id = ? LIMIT 1 FOR UPDATE`,
      [parsedUnitId]
    );

    if (!unitRows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Unit not found' });
    }

    const unit = unitRows[0];
    const currentStockType = String(unit.stock_type || '').trim().toUpperCase();
    if (currentStockType !== 'Q') {
      await connection.rollback();
      return res.status(400).json({ error: 'Only units with stock_type Q can be released from quarantine' });
    }

    const updateStatements = ['`stock_type` = ?'];
    const updateValues = [nextStockType];

    if (unitColumns.has('status')) {
      updateStatements.push('`status` = ?');
      updateValues.push('TFFW_Exchange');
    }

    if (unitColumns.has('source_id')) {
      updateStatements.push('`source_id` = 4');
    }

    const docsFlagColumn = chooseExistingColumn(unitColumns, ['docs_received', 'documents_received', 'documentation_received']);
    if (docsFlagColumn) {
      updateStatements.push(`\`${docsFlagColumn}\` = 1`);
    }

    const docsAtColumn = chooseExistingColumn(unitColumns, ['docs_received_at', 'documents_received_at', 'documentation_received_at']);
    if (docsAtColumn) {
      updateStatements.push(`\`${docsAtColumn}\` = NOW()`);
    }

    if (unitColumns.has('updated_at')) {
      updateStatements.push('`updated_at` = NOW()');
    }

    updateValues.push(parsedUnitId);

    await connection.query(
      `UPDATE units SET ${updateStatements.join(', ')} WHERE id = ?`,
      updateValues
    );

    await connection.commit();
    return res.json({
      ok: true,
      unitId: parsedUnitId,
      serialNumber: unit.serial_number || null,
      previousStockType: currentStockType,
      newStockType: nextStockType,
      movedToSourceId: unitColumns.has('source_id') ? 4 : null,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Quarantine release failed:', error);
    return res.status(500).json({ error: 'Failed to release unit from quarantine' });
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard/rare-cases', async (_req, res) => {
  try {
    const [modelColumns, unitColumns] = await Promise.all([
      pool.query(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'models'
           AND COLUMN_NAME IN ('model_code', 'model_name', 'model_number', 'model_no', 'model', 'name')`,
        [process.env.DB_NAME]
      ),
      pool.query(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'units'
           AND COLUMN_NAME IN ('supplier_status', 'stock_status', 'warehouse_id', 'source_id', 'stock_type', 'updated_at')`,
        [process.env.DB_NAME]
      ),
    ]);

    const unitColumnNames = new Set(unitColumns[0].map((column) => column.COLUMN_NAME));
    if (!unitColumnNames.has('stock_type')) {
      return res.json({ rows: [] });
    }

    const preferredOrder = ['model_code', 'model_name', 'model_number', 'model_no', 'model', 'name'];
    const availableModelColumns = new Set(modelColumns[0].map((column) => column.COLUMN_NAME));
    const chosenModelColumn = preferredOrder.find((column) => availableModelColumns.has(column));
    const modelSelect = chosenModelColumn ? `m.\`${chosenModelColumn}\`` : 'CAST(u.model_id AS CHAR)';

    const supplierStatusSelect = unitColumnNames.has('supplier_status') ? 'u.supplier_status' : 'NULL';
    const stockStatusSelect = unitColumnNames.has('stock_status') ? 'u.stock_status' : 'NULL';
    const warehouseIdSelect = unitColumnNames.has('warehouse_id') ? 'u.warehouse_id' : 'NULL';
    const sourceIdSelect = unitColumnNames.has('source_id') ? 'u.source_id' : 'NULL';

    const conditions = ["UPPER(TRIM(COALESCE(u.stock_type, ''))) = 'A'"];
    if (unitColumnNames.has('supplier_status')) {
      conditions.push("REPLACE(UPPER(TRIM(COALESCE(u.supplier_status, ''))), ' ', '_') = 'IN_STOCK'");
    } else if (unitColumnNames.has('stock_status')) {
      conditions.push("REPLACE(UPPER(TRIM(COALESCE(u.stock_status, ''))), ' ', '_') = 'IN_STOCK'");
    }

    const [rows] = await pool.query(
      `SELECT
         u.id,
         u.model_id,
         ${modelSelect} AS model,
         ${supplierStatusSelect} AS supplier_status,
         ${stockStatusSelect} AS stock_status,
         ${warehouseIdSelect} AS warehouse_id,
         ${sourceIdSelect} AS source_id,
         u.serial_number,
         u.stock_type,
         u.status,
         u.delivered,
         u.date_received,
         u.created_at
       FROM units u
       LEFT JOIN models m ON m.id = u.model_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.created_at DESC`
    );

    return res.json({ rows });
  } catch (error) {
    console.error('Rare cases query failed:', error);
    return res.status(500).json({ error: 'Failed to load rare case units' });
  }
});

app.get('/api/dashboard/rare-cases-history', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         id,
         unit_id,
         serial_number,
         previous_stock_type,
         new_stock_type,
         ic_number,
         changed_by,
         changed_at,
         created_at
       FROM rare_case_stock_changes
       ORDER BY changed_at DESC, id DESC`
    );

    return res.json({ rows });
  } catch (error) {
    console.error('Rare cases history query failed:', error);
    return res.status(500).json({ error: 'Failed to load rare cases history' });
  }
});

app.post('/api/dashboard/rare-cases/update-stock-type', async (req, res) => {
  const { unitId, stockType, icNumber, changedBy } = req.body || {};
  const parsedUnitId = Number.parseInt(unitId, 10);
  const nextStockType = String(stockType || '').trim().toUpperCase();
  const normalizedIcNumber = String(icNumber || '').trim();

  if (Number.isNaN(parsedUnitId) || parsedUnitId <= 0) {
    return res.status(400).json({ error: 'Valid unitId is required' });
  }

  if (!['B', 'Y'].includes(nextStockType)) {
    return res.status(400).json({ error: 'stockType must be B or Y' });
  }

  if (!normalizedIcNumber) {
    return res.status(400).json({ error: 'icNumber is required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const unitColumns = await getTableColumns(connection, 'units');
    if (!unitColumns.has('stock_type')) {
      await connection.rollback();
      return res.status(400).json({ error: 'units.stock_type column does not exist' });
    }

    const [unitRows] = await connection.query(
      'SELECT id, serial_number, stock_type FROM units WHERE id = ? LIMIT 1 FOR UPDATE',
      [parsedUnitId]
    );

    if (!unitRows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Unit not found' });
    }

    const unit = unitRows[0];
    const currentStockType = String(unit.stock_type || '').trim().toUpperCase();
    if (currentStockType !== 'A') {
      await connection.rollback();
      return res.status(400).json({ error: 'Only units with stock_type A can be changed here' });
    }

    const updateStatements = ['`stock_type` = ?'];
    const updateValues = [nextStockType];
    if (unitColumns.has('updated_at')) {
      updateStatements.push('`updated_at` = NOW()');
    }
    updateValues.push(parsedUnitId);

    await connection.query(
      `UPDATE units SET ${updateStatements.join(', ')} WHERE id = ?`,
      updateValues
    );

    await connection.query(
      `INSERT INTO rare_case_stock_changes (
        unit_id,
        serial_number,
        previous_stock_type,
        new_stock_type,
        ic_number,
        changed_by,
        changed_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        parsedUnitId,
        unit.serial_number || '',
        currentStockType,
        nextStockType,
        normalizedIcNumber,
        changedBy || null,
      ]
    );

    await connection.commit();
    return res.json({
      ok: true,
      unitId: parsedUnitId,
      serialNumber: unit.serial_number || null,
      previousStockType: currentStockType,
      newStockType: nextStockType,
      icNumber: normalizedIcNumber,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Rare case stock type update failed:', error);
    return res.status(500).json({ error: 'Failed to update stock type' });
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard/units-by-warehouse-source/:warehouseId/:sourceId', async (req, res) => {
  try {
    const warehouseId = parseInt(req.params.warehouseId, 10);
    const sourceId = parseInt(req.params.sourceId, 10);
    if (Number.isNaN(warehouseId) || Number.isNaN(sourceId)) {
      res.status(400).json({ error: 'Invalid warehouseId or sourceId' });
      return;
    }
    const rows = await getUnitsRows(sourceId, warehouseId);
    res.json({ rows });
  } catch (error) {
    console.error('Units by warehouse+source query failed:', error);
    res.status(500).json({ error: 'Failed to load units' });
  }
});

app.get('/api/dashboard/scan-out-by-warehouse-type/:warehouseId/:scanType', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const warehouseId = Number.parseInt(req.params.warehouseId, 10);
    const scanType = String(req.params.scanType || '').trim().toUpperCase();

    if (Number.isNaN(warehouseId) || !scanType) {
      res.status(400).json({ error: 'Invalid warehouseId or scanType' });
      return;
    }

    if (scanType === SCAN_TYPES.TFFW_EXCHANGE) {
      await syncTffwExchangeFromSource(connection);
    }
    if (scanType === SCAN_TYPES.INHOUSE_EXCHANGE) {
      await syncInhouseExchangeFromSource(connection);
    }
    if (scanType === SCAN_TYPES.TAKEALOT) {
      await syncTakealotFromSource(connection);
    }
    if (scanType === SCAN_TYPES.TFF_DEALER) {
      await syncTffDealerFromSource(connection);
    }

    if (scanType === SCAN_TYPES.TFFW_EXCHANGE) {
      await syncTffwExchangeFromSource(connection);
    }

    const unitColumns = await getTableColumns(connection, 'units');
    if (!unitColumns.has('warehouse_id')) {
      res.json({ rows: [] });
      return;
    }

    const [eventRows] = await connection.query(
      `SELECT
         soe.id,
         soe.unit_id,
         soe.model_id,
         soe.serial_number,
         soe.scan_type,
         soe.invoice_type,
         soe.invoice_number,
         COALESCE(ar.io_number, soe.io_number) AS io_number,
         soe.po_number,
         soe.client_name,
         CASE
           WHEN ar.id IS NOT NULL THEN 'PAID_TFFW'
           ELSE soe.payment_status
         END AS payment_status,
         soe.source_table,
         soe.status,
         soe.scanned_by,
         soe.scanned_at,
         soe.created_at,
         COALESCE(u.warehouse_id, us.warehouse_id) AS warehouse_id
       FROM scan_out_events soe
       LEFT JOIN archive_records ar ON ar.serial_number = soe.serial_number AND ar.scan_type = soe.scan_type
       LEFT JOIN units u ON u.id = soe.unit_id
       LEFT JOIN units us ON us.serial_number = soe.serial_number
       WHERE soe.scan_type = ?
         AND COALESCE(soe.warehouse_id, u.warehouse_id, us.warehouse_id) = ?
       ORDER BY soe.created_at DESC`,
      [scanType, warehouseId]
    );

    let rows = eventRows;

    if (scanType === SCAN_TYPES.ACTUAL_SALE) {
      const salesColumns = await getTableColumns(connection, 'sales');
      const salesSerialColumn = chooseExistingColumn(salesColumns, ['serial_number', 'serial']);
      const salesInvoiceTypeColumn = chooseExistingColumn(salesColumns, ['invoice_type']);
      const salesInvoiceNumberColumn = chooseExistingColumn(salesColumns, ['invoice_number', 'invoice_no']);
      const salesIoColumn = chooseExistingColumn(salesColumns, ['io_number', 'io_no']);
      const salesClientColumn = chooseExistingColumn(salesColumns, ['client_name', 'client']);
      const salesPaymentColumn = chooseExistingColumn(salesColumns, ['payment_status', 'status']);
      const salesCreatedAtColumn = chooseExistingColumn(salesColumns, ['created_at', 'date_sold', 'sale_date', 'date', 'scanned_at']);

      if (salesSerialColumn) {
        const [salesFallbackRows] = await connection.query(
          `SELECT
             CONCAT('sales-', COALESCE(s.id, s.\`${salesSerialColumn}\`)) AS id,
             u.id AS unit_id,
             u.model_id AS model_id,
             s.\`${salesSerialColumn}\` AS serial_number,
             'ACTUAL_SALE' AS scan_type,
             ${salesInvoiceTypeColumn ? `s.\`${salesInvoiceTypeColumn}\`` : 'NULL'} AS invoice_type,
             ${salesInvoiceNumberColumn ? `s.\`${salesInvoiceNumberColumn}\`` : 'NULL'} AS invoice_number,
             COALESCE(ar.io_number, ${salesIoColumn ? `s.\`${salesIoColumn}\`` : 'NULL'}) AS io_number,
             NULL AS po_number,
             ${salesClientColumn ? `s.\`${salesClientColumn}\`` : 'NULL'} AS client_name,
             CASE
               WHEN ar.id IS NOT NULL THEN 'PAID_TFFW'
               ELSE ${salesPaymentColumn ? `s.\`${salesPaymentColumn}\`` : "'UNPAID_TFFW'"}
             END AS payment_status,
             'sales' AS source_table,
             'SOLD' AS status,
             NULL AS scanned_by,
             ${salesCreatedAtColumn ? `s.\`${salesCreatedAtColumn}\`` : 'NOW()'} AS scanned_at,
             ${salesCreatedAtColumn ? `s.\`${salesCreatedAtColumn}\`` : 'NOW()'} AS created_at,
             u.warehouse_id AS warehouse_id
           FROM sales s
           LEFT JOIN units u ON u.serial_number = s.\`${salesSerialColumn}\`
           LEFT JOIN archive_records ar ON ar.serial_number = s.\`${salesSerialColumn}\` AND ar.scan_type = 'ACTUAL_SALE'
           WHERE u.warehouse_id = ?
             AND NOT EXISTS (
               SELECT 1
               FROM scan_out_events soe
               WHERE soe.scan_type = 'ACTUAL_SALE'
                 AND soe.serial_number = s.\`${salesSerialColumn}\`
             )
           ORDER BY ${salesCreatedAtColumn ? `s.\`${salesCreatedAtColumn}\`` : 's.id'} DESC`,
          [warehouseId]
        );

        rows = [...eventRows, ...salesFallbackRows];
      }
    }

    res.json({ rows });
  } catch (error) {
    console.error('Scan-out by warehouse/type query failed:', error);
    res.status(500).json({ error: 'Failed to load scan-out rows' });
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard/sales', async (_req, res) => {
  try {
    const rows = await getTableRows('sales');
    res.json({ rows });
  } catch (error) {
    console.error('Sales query failed:', error);
    res.status(500).json({ error: 'Failed to load sales' });
  }
});

app.get('/api/dashboard/inhouse-exchanges', async (_req, res) => {
  try {
    const rows = await getTableRows('inhouse_exchanges');
    res.json({ rows });
  } catch (error) {
    console.error('Inhouse exchanges query failed:', error);
    res.status(500).json({ error: 'Failed to load inhouse exchanges' });
  }
});

app.get('/api/dashboard/takealot', async (_req, res) => {
  const connection = await pool.getConnection();
  try {
    await syncTakealotFromSource(connection);

    const [unitColumns] = await Promise.all([
      getTableColumns(connection, 'units'),
    ]);
    const unitsSupplierStatusColumn = chooseExistingColumn(unitColumns, ['supplier_status']);

    const [rows] = await connection.query(
      `SELECT
         e.id,
         e.serial_number,
         e.scan_type,
         ${unitsSupplierStatusColumn ? `u.\`${unitsSupplierStatusColumn}\`` : 'NULL'} AS supplier_status,
         e.payment_status,
         e.io_number,
         e.po_number,
         e.created_at,
         e.warehouse_id
       FROM scan_out_events e
       ${unitsSupplierStatusColumn ? 'LEFT JOIN units u ON u.`serial_number` = e.serial_number' : ''}
       WHERE e.scan_type = 'TAKEALOT'
         AND NOT EXISTS (
           SELECT 1
           FROM archive_records ar
           WHERE ar.source_event_id = e.id
              OR (ar.serial_number = e.serial_number AND ar.scan_type = e.scan_type)
         )
       ORDER BY e.created_at DESC, e.id DESC`
    );

    return res.json({ rows });
  } catch (error) {
    console.error('Takealot query failed:', error);
    return res.status(500).json({ error: 'Failed to load Takealot rows' });
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard/units-inhouse-exchanges', async (_req, res) => {
  try {
    const rows = await getUnitsRows(5);
    res.json({ rows });
  } catch (error) {
    console.error('Units inhouse exchanges query failed:', error);
    res.status(500).json({ error: 'Failed to load inhouse exchanges units' });
  }
});

app.get('/api/dashboard/bought-back', async (_req, res) => {
  try {
    const rows = await getUnitsRows(6);
    res.json({ rows });
  } catch (error) {
    console.error('Bought back query failed:', error);
    res.status(500).json({ error: 'Failed to load bought back units' });
  }
});

app.get('/api/dashboard/models', async (_req, res) => {
  try {
    const rows = await getTableRows('models');
    res.json({ rows });
  } catch (error) {
    console.error('Models query failed:', error);
    res.status(500).json({ error: 'Failed to load models' });
  }
});

app.get('/api/dashboard/warehouses', async (_req, res) => {
  const connection = await pool.getConnection();
  try {
    const columns = await getTableColumns(connection, 'warehouses');
    const orderBy = columns.has('id')
      ? ' ORDER BY `id` ASC'
      : (columns.has('name') ? ' ORDER BY `name` ASC' : '');
    const [rows] = await connection.query(`SELECT * FROM \`warehouses\`${orderBy}`);
    res.json({ rows });
  } catch (error) {
    console.error('Warehouses query failed:', error);
    res.status(500).json({ error: 'Failed to load warehouses' });
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard/weekly-report', async (_req, res) => {
  const connection = await pool.getConnection();
  try {
    await syncTffwExchangeFromSource(connection);
    await syncInhouseExchangeFromSource(connection);
    await syncTakealotFromSource(connection);

    const [eventSummaryRows] = await connection.query(
      `SELECT
         e.scan_type,
         COUNT(*) AS total
       FROM scan_out_events e
       WHERE e.include_weekly_report = 1
         AND YEARWEEK(e.created_at, 1) = YEARWEEK(CURDATE(), 1)
         AND NOT EXISTS (
           SELECT 1
           FROM archive_records ar
           WHERE ar.source_event_id = e.id
              OR (ar.serial_number = e.serial_number AND ar.scan_type = e.scan_type)
         )
       GROUP BY e.scan_type
       ORDER BY total DESC`
    );

    const [unitColumns, salesColumns] = await Promise.all([
      getTableColumns(connection, 'units'),
      getTableColumns(connection, 'sales'),
    ]);

    const salesSerialColumn = chooseExistingColumn(salesColumns, ['serial_number', 'serial']);
    const salesDateColumn = chooseExistingColumn(salesColumns, [
      'date_sold',
      'sale_date',
      'created_at',
      'date_received',
      'scanned_at',
      'sold_at',
      'date',
    ]);
    const salesClientColumn = chooseExistingColumn(salesColumns, ['client_name', 'client']);
    const salesIoColumn = chooseExistingColumn(salesColumns, ['io_number', 'io_no']);
    const unitsSupplierStatusColumn = chooseExistingColumn(unitColumns, ['supplier_status']);

    const salesCanJoinUnits = Boolean(unitsSupplierStatusColumn && salesSerialColumn && unitColumns.has('serial_number'));

    let salesSummaryRows = [];
    let salesRecentRows = [];

    if (salesSerialColumn) {
      const salesClientSelect = salesClientColumn
        ? `s.\`${salesClientColumn}\``
        : 'NULL';

      const salesIoSelect = salesIoColumn
        ? `s.\`${salesIoColumn}\``
        : 'NULL';

      const supplierStatusSelect = salesCanJoinUnits
        ? `u.\`${unitsSupplierStatusColumn}\``
        : 'NULL';

      const unitJoin = salesCanJoinUnits
        ? `LEFT JOIN units u ON u.\`serial_number\` = s.\`${salesSerialColumn}\``
        : '';

      const salesWeekFilter = salesDateColumn
        ? `YEARWEEK(s.\`${salesDateColumn}\`, 1) = YEARWEEK(CURDATE(), 1)`
        : '1=1';

      const [summaryRows] = await connection.query(
        `SELECT
           'ACTUAL_SALE' AS scan_type,
           COUNT(*) AS total
         FROM sales s
         ${unitJoin}
         WHERE ${salesWeekFilter}
           AND NOT EXISTS (
             SELECT 1
             FROM archive_records ar
             WHERE ar.serial_number = s.\`${salesSerialColumn}\`
               AND ar.scan_type = 'ACTUAL_SALE'
           )
           AND NOT EXISTS (
             SELECT 1
             FROM scan_out_events e
             WHERE e.scan_type = 'ACTUAL_SALE'
               AND YEARWEEK(e.created_at, 1) = YEARWEEK(CURDATE(), 1)
               AND e.serial_number = s.\`${salesSerialColumn}\`
           )`
      );
      salesSummaryRows = summaryRows;

      const salesCreatedAtSelect = salesDateColumn
        ? `s.\`${salesDateColumn}\``
        : 'NOW()';

      const [recentRows] = await connection.query(
        `SELECT
           s.\`${salesSerialColumn}\` AS serial_number,
           'ACTUAL_SALE' AS scan_type,
           ${salesClientSelect} AS client_name,
           ${supplierStatusSelect} AS supplier_status,
           ${salesIoSelect} AS io_number,
           ${salesCreatedAtSelect} AS created_at
         FROM sales s
         ${unitJoin}
         WHERE ${salesWeekFilter}
           AND NOT EXISTS (
             SELECT 1
             FROM archive_records ar
             WHERE ar.serial_number = s.\`${salesSerialColumn}\`
               AND ar.scan_type = 'ACTUAL_SALE'
           )
           AND NOT EXISTS (
             SELECT 1
             FROM scan_out_events e
             WHERE e.scan_type = 'ACTUAL_SALE'
               AND YEARWEEK(e.created_at, 1) = YEARWEEK(CURDATE(), 1)
               AND e.serial_number = s.\`${salesSerialColumn}\`
           )
         ORDER BY ${salesCreatedAtSelect} DESC
         LIMIT 100`
      );
      salesRecentRows = recentRows;
    }

    const [eventRecentRows] = await connection.query(
      `SELECT
         e.serial_number,
         e.scan_type,
         e.client_name,
         ${unitsSupplierStatusColumn ? `u.\`${unitsSupplierStatusColumn}\`` : 'NULL'} AS supplier_status,
         e.io_number,
         e.created_at
      FROM scan_out_events e
       ${unitsSupplierStatusColumn ? 'LEFT JOIN units u ON u.`serial_number` = e.serial_number' : ''}
       WHERE e.include_weekly_report = 1
         AND YEARWEEK(e.created_at, 1) = YEARWEEK(CURDATE(), 1)
         AND NOT EXISTS (
           SELECT 1
           FROM archive_records ar
           WHERE ar.source_event_id = e.id
              OR (ar.serial_number = e.serial_number AND ar.scan_type = e.scan_type)
         )
       ORDER BY e.created_at DESC
       LIMIT 25`
    );

    const summaryMap = new Map();
    [...eventSummaryRows, ...salesSummaryRows].forEach((row) => {
      const scanType = row.scan_type || 'UNKNOWN';
      const key = `${scanType}`;
      const current = summaryMap.get(key) || { scan_type: scanType, total: 0 };
      current.total += Number(row.total || 0);
      summaryMap.set(key, current);
    });

    const mergedSummaryRows = Array.from(summaryMap.values()).sort(
      (left, right) => Number(right.total || 0) - Number(left.total || 0)
    );

    const mergedRecentRows = [...eventRecentRows, ...salesRecentRows]
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
      .slice(0, 25);

    res.json({ summary: mergedSummaryRows, recent: mergedRecentRows });
  } catch (error) {
    console.error('Weekly report query failed:', error);
    res.status(500).json({ error: 'Failed to load weekly report' });
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard/archive', async (_req, res) => {
  const connection = await pool.getConnection();
  try {
    await syncTffwExchangeFromSource(connection);
    await syncTffDealerFromSource(connection);

    const [salesColumns, unitColumns] = await Promise.all([
      getTableColumns(connection, 'sales'),
      getTableColumns(connection, 'units'),
    ]);

    const salesSerialColumn = chooseExistingColumn(salesColumns, ['serial_number', 'serial']);
    const salesClientColumn = chooseExistingColumn(salesColumns, ['client_name', 'client']);
    const salesPaymentColumn = chooseExistingColumn(salesColumns, ['payment_status', 'status']);
    const salesSupplierStatusColumn = chooseExistingColumn(salesColumns, ['supplier_status']);
    const salesIoColumn = chooseExistingColumn(salesColumns, ['io_number', 'io_no']);
    const salesDateColumn = chooseExistingColumn(salesColumns, ['created_at', 'date_sold', 'sale_date', 'date', 'scanned_at']);

    const unitsSupplierStatusColumn = chooseExistingColumn(unitColumns, ['supplier_status']);

    const [rows] = await connection.query(
      `SELECT
         ar.id,
         ar.serial_number,
         ar.scan_type,
         ar.io_number,
         COALESCE(e.client_name, ar.client_name, ${salesClientColumn ? `s.\`${salesClientColumn}\`` : 'NULL'}) AS client_name,
         COALESCE(e.payment_status, ${salesPaymentColumn ? `s.\`${salesPaymentColumn}\`` : 'NULL'}) AS payment_status,
         COALESCE(${unitsSupplierStatusColumn ? `u.\`${unitsSupplierStatusColumn}\`` : 'NULL'}, ${salesSupplierStatusColumn ? `s.\`${salesSupplierStatusColumn}\`` : 'NULL'}) AS supplier_status,
         COALESCE(e.io_number, ${salesIoColumn ? `s.\`${salesIoColumn}\`` : 'NULL'}, ar.io_number) AS uploaded_io_number,
         e.invoice_type,
         e.invoice_number,
         e.po_number,
         COALESCE(e.created_at, ${salesDateColumn ? `s.\`${salesDateColumn}\`` : 'NULL'}, ar.created_at) AS scanned_at,
         ar.source_event_id,
         ar.archived_at,
         ar.created_at
       FROM archive_records ar
       LEFT JOIN scan_out_events e ON e.id = ar.source_event_id
       LEFT JOIN units u ON u.serial_number = ar.serial_number
       ${salesSerialColumn ? `LEFT JOIN sales s ON s.\`${salesSerialColumn}\` = ar.serial_number` : 'LEFT JOIN sales s ON 1=0'}
       ORDER BY ar.archived_at DESC, ar.id DESC`
    );

    res.json({ rows });
  } catch (error) {
    console.error('Archive query failed:', error);
    res.status(500).json({ error: 'Failed to load archive rows' });
  } finally {
    connection.release();
  }
});

app.post('/api/dashboard/weekly-report/archive-item', async (req, res) => {
  const { serialNumber, scanType, ioNumber } = req.body || {};

  const normalizedSerialNumber = String(serialNumber || '').trim();
  const normalizedScanType = String(scanType || '').trim().toUpperCase();
  const normalizedIoNumber = String(ioNumber || '').trim();

  if (!normalizedSerialNumber) {
    return res.status(400).json({ error: 'serialNumber is required' });
  }

  if (!normalizedScanType) {
    return res.status(400).json({ error: 'scanType is required' });
  }

  if (!normalizedIoNumber) {
    return res.status(400).json({ error: 'ioNumber is required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [eventRows] = await connection.query(
      `SELECT id, serial_number, scan_type, client_name
       FROM scan_out_events
       WHERE serial_number = ?
         AND scan_type = ?
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [normalizedSerialNumber, normalizedScanType]
    );

    let eventId = null;
    let clientName = null;

    if (eventRows.length) {
      eventId = eventRows[0].id;
      clientName = eventRows[0].client_name || null;

      await connection.query(
        `UPDATE scan_out_events
         SET io_number = ?,
             payment_status = 'PAID_TFFW'
         WHERE serial_number = ?
           AND scan_type = ?`,
        [normalizedIoNumber, normalizedSerialNumber, normalizedScanType]
      );
    }

    const sourceTableByScanType = {
      [SCAN_TYPES.ACTUAL_SALE]: 'sales',
      [SCAN_TYPES.TFFW_EXCHANGE]: 'tffw_exchanges',
      [SCAN_TYPES.TFF_DEALER]: 'tff_dealer_scans',
      [SCAN_TYPES.INHOUSE_EXCHANGE]: 'inhouse_exchanges',
      [SCAN_TYPES.TAKEALOT]: 'takealot_scans',
    };

    const updateTableBySerial = async (tableName, options = {}) => {
      if (!tableName) {
        return;
      }

      const columns = await getTableColumns(connection, tableName);
      const serialColumn = chooseExistingColumn(columns, ['serial_number', 'serial']);
      if (!serialColumn) {
        return;
      }

      const ioColumn = chooseExistingColumn(columns, ['io_number', 'io_no']);
      const paymentColumn = chooseExistingColumn(columns, ['payment_status']);
      const supplierStatusColumn = chooseExistingColumn(columns, ['supplier_status']);

      const updates = [];
      const values = [];

      if (ioColumn) {
        updates.push(`\`${ioColumn}\` = ?`);
        values.push(normalizedIoNumber);
      }

      if (paymentColumn) {
        updates.push(`\`${paymentColumn}\` = 'PAID_TFFW'`);
      }

      if (options.updateSupplierStatus && supplierStatusColumn) {
        updates.push(`\`${supplierStatusColumn}\` = 'PAID_TFFW'`);
      }

      if (!updates.length) {
        return;
      }

      values.push(normalizedSerialNumber);
      await connection.query(
        `UPDATE \`${tableName}\`
         SET ${updates.join(', ')}
         WHERE \`${serialColumn}\` = ?`,
        values
      );
    };

    await updateTableBySerial('units', { updateSupplierStatus: true });
    await updateTableBySerial(sourceTableByScanType[normalizedScanType], { updateSupplierStatus: true });

    const salesColumns = await getTableColumns(connection, 'sales');
    const salesSerialColumn = chooseExistingColumn(salesColumns, ['serial_number', 'serial']);
    const salesIoColumn = chooseExistingColumn(salesColumns, ['io_number', 'io_no']);
    const salesPaymentColumn = chooseExistingColumn(salesColumns, ['payment_status', 'status']);
    const salesSupplierStatusColumn = chooseExistingColumn(salesColumns, ['supplier_status']);
    const salesClientColumn = chooseExistingColumn(salesColumns, ['client_name', 'client']);

    if (salesSerialColumn) {
      const salesUpdateFragments = [];
      const salesUpdateValues = [];

      if (salesIoColumn) {
        salesUpdateFragments.push(`\`${salesIoColumn}\` = ?`);
        salesUpdateValues.push(normalizedIoNumber);
      }

      if (salesPaymentColumn) {
        salesUpdateFragments.push(`\`${salesPaymentColumn}\` = 'PAID_TFFW'`);
      }

      if (salesSupplierStatusColumn) {
        salesUpdateFragments.push(`\`${salesSupplierStatusColumn}\` = 'PAID'`);
      }

      if (salesUpdateFragments.length) {
        salesUpdateValues.push(normalizedSerialNumber);
        await connection.query(
          `UPDATE sales
           SET ${salesUpdateFragments.join(', ')}
           WHERE \`${salesSerialColumn}\` = ?`,
          salesUpdateValues
        );
      }

      if (!clientName && salesClientColumn) {
        const [salesRows] = await connection.query(
          `SELECT \`${salesClientColumn}\` AS client_name
           FROM sales
           WHERE \`${salesSerialColumn}\` = ?
           ORDER BY id DESC
           LIMIT 1`,
          [normalizedSerialNumber]
        );
        clientName = salesRows[0]?.client_name || null;
      }
    }

    await insertArchiveRecordIfMissing(connection, {
      serialNumber: normalizedSerialNumber,
      scanType: normalizedScanType,
      ioNumber: normalizedIoNumber,
      sourceEventId: eventId,
      clientName,
    });

    await connection.commit();
    return res.json({
      ok: true,
      serialNumber: normalizedSerialNumber,
      scanType: normalizedScanType,
      ioNumber: normalizedIoNumber,
      archived: true,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Archive item from weekly report failed:', error);
    return res.status(500).json({ error: 'Failed to archive weekly report item' });
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard/weekly-report-payment-history', async (_req, res) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT
         id,
         serial_number,
         scan_type,
         previous_payment_status,
         new_payment_status,
         io_number,
         changed_at,
         created_at
       FROM weekly_payment_history
       WHERE YEARWEEK(changed_at, 1) = YEARWEEK(CURDATE(), 1)
       ORDER BY changed_at DESC, id DESC`
    );

    return res.json({ rows });
  } catch (error) {
    console.error('Weekly payment history query failed:', error);
    return res.status(500).json({ error: 'Failed to load weekly payment history' });
  } finally {
    connection.release();
  }
});

app.post('/api/dashboard/weekly-report/mark-paid', async (req, res) => {
  const { serialNumber, ioNumber, scanType } = req.body || {};

  const normalizedSerialNumber = String(serialNumber || '').trim();
  const normalizedIoNumber = String(ioNumber || '').trim();
  const normalizedScanType = String(scanType || '').trim().toUpperCase() || null;

  if (!normalizedSerialNumber) {
    return res.status(400).json({ error: 'serialNumber is required' });
  }

  if (!normalizedIoNumber) {
    return res.status(400).json({ error: 'ioNumber is required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [scanOutResult] = await connection.query(
      `UPDATE scan_out_events
       SET payment_status = 'PAID_TFFW',
           io_number = ?
       WHERE serial_number = ?
         AND include_weekly_report = 1
         AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
         AND payment_status = 'UNPAID_TFFW'`,
      [normalizedIoNumber, normalizedSerialNumber]
    );

    const salesColumns = await getTableColumns(connection, 'sales');
    const salesSerialColumn = chooseExistingColumn(salesColumns, ['serial_number', 'serial']);
    const salesPaymentColumn = chooseExistingColumn(salesColumns, ['payment_status', 'status']);
    const salesIoColumn = chooseExistingColumn(salesColumns, ['io_number', 'io_no']);
    const salesDateColumn = chooseExistingColumn(salesColumns, [
      'date_sold',
      'sale_date',
      'created_at',
      'date_received',
      'scanned_at',
      'sold_at',
      'date',
    ]);

    let salesUpdatedCount = 0;
    if (salesSerialColumn && salesPaymentColumn) {
      const salesSetFragments = [`\`${salesPaymentColumn}\` = 'PAID_TFFW'`];
      const salesValues = [];

      if (salesIoColumn) {
        salesSetFragments.push(`\`${salesIoColumn}\` = ?`);
        salesValues.push(normalizedIoNumber);
      }

      const salesWhereFragments = [
        `\`${salesSerialColumn}\` = ?`,
        `COALESCE(NULLIF(TRIM(CAST(\`${salesPaymentColumn}\` AS CHAR)), ''), '-') = 'UNPAID_TFFW'`,
      ];

      salesValues.push(normalizedSerialNumber);

      if (salesDateColumn) {
        salesWhereFragments.push(`YEARWEEK(\`${salesDateColumn}\`, 1) = YEARWEEK(CURDATE(), 1)`);
      }

      const [salesResult] = await connection.query(
        `UPDATE sales
         SET ${salesSetFragments.join(', ')}
         WHERE ${salesWhereFragments.join(' AND ')}`,
        salesValues
      );

      salesUpdatedCount = Number(salesResult.affectedRows || 0);
    }

    const totalUpdated = Number(scanOutResult.affectedRows || 0) + salesUpdatedCount;
    if (!totalUpdated) {
      await connection.rollback();
      return res.status(404).json({ error: 'No UNPAID_TFFW weekly record found for this serial number' });
    }

    await connection.query(
      `INSERT INTO weekly_payment_history (
        serial_number,
        scan_type,
        previous_payment_status,
        new_payment_status,
        io_number,
        changed_at,
        created_at
      ) VALUES (?, ?, 'UNPAID_TFFW', 'PAID_TFFW', ?, NOW(), NOW())`,
      [normalizedSerialNumber, normalizedScanType, normalizedIoNumber]
    );

    await connection.commit();
    return res.json({
      ok: true,
      serialNumber: normalizedSerialNumber,
      ioNumber: normalizedIoNumber,
      updatedRows: totalUpdated,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Weekly report mark paid failed:', error);
    return res.status(500).json({ error: 'Failed to mark record as paid' });
  } finally {
    connection.release();
  }
});

app.post('/api/scanout/process', async (req, res) => {
  const payload = req.body || {};
  const validationError = validateScanPayload(payload);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const {
    scanType,
    serialNumber,
    invoiceType,
    invoiceNumber,
    ioNumber,
    poNumber,
    clientName,
    scannedBy,
  } = payload;

  const rule = scanRules[scanType];
  const paymentStatus = scanType === SCAN_TYPES.TAKEALOT
    ? (ioNumber ? 'UNPAID_TFFW' : 'PENDING_IO')
    : rule.paymentStatus;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [unitRows] = await connection.query(
      'SELECT id, model_id, warehouse_id, serial_number, status FROM units WHERE serial_number = ? LIMIT 1 FOR UPDATE',
      [serialNumber]
    );

    if (!unitRows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Unit not found by serial number' });
    }

    const unit = unitRows[0];
    await updateUnitAsSold(connection, unit);

    const now = new Date();
    const eventPayload = {
      unit_id: unit.id,
      model_id: unit.model_id || null,
      warehouse_id: unit.warehouse_id || null,
      serial_number: unit.serial_number,
      scan_type: scanType,
      invoice_type: invoiceType || null,
      invoice_number: invoiceNumber || null,
      io_number: ioNumber || null,
      po_number: poNumber || null,
      client_name: clientName || null,
      payment_status: paymentStatus,
      include_weekly_report: rule.includeWeeklyReport,
      source_table: rule.sourceTable,
      status: 'SOLD',
      scanned_by: scannedBy || null,
      scanned_at: now,
      created_at: now,
    };

    const sourceInsertResult = await buildInsertFromLogicalFields(connection, rule.sourceTable, {
      unitId: eventPayload.unit_id,
      modelId: eventPayload.model_id,
      serialNumber: eventPayload.serial_number,
      scanType: eventPayload.scan_type,
      invoiceType: eventPayload.invoice_type,
      invoiceNumber: eventPayload.invoice_number,
      ioNumber: eventPayload.io_number,
      poNumber: eventPayload.po_number,
      clientName: eventPayload.client_name,
      paymentStatus: eventPayload.payment_status,
      includeWeeklyReport: eventPayload.include_weekly_report,
      status: eventPayload.status,
      scannedBy: eventPayload.scanned_by,
      scannedAt: eventPayload.scanned_at,
      createdAt: eventPayload.created_at,
    });

    const eventInsertResult = await buildInsertFromLogicalFields(connection, 'scan_out_events', {
      unitId: eventPayload.unit_id,
      modelId: eventPayload.model_id,
      warehouseId: eventPayload.warehouse_id,
      serialNumber: eventPayload.serial_number,
      scanType: eventPayload.scan_type,
      invoiceType: eventPayload.invoice_type,
      invoiceNumber: eventPayload.invoice_number,
      ioNumber: eventPayload.io_number,
      poNumber: eventPayload.po_number,
      clientName: eventPayload.client_name,
      paymentStatus: eventPayload.payment_status,
      includeWeeklyReport: eventPayload.include_weekly_report,
      status: eventPayload.status,
      scannedBy: eventPayload.scanned_by,
      scannedAt: eventPayload.scanned_at,
      createdAt: eventPayload.created_at,
    });

    const eventInsertId = Number.isInteger(eventInsertResult?.insertId)
      ? eventInsertResult.insertId
      : null;

    if (AUTO_ARCHIVE_SCAN_TYPES.has(scanType) && String(ioNumber || '').trim()) {
      const normalizedAutoIo = String(ioNumber || '').trim();

      await insertArchiveRecordIfMissing(connection, {
        serialNumber: eventPayload.serial_number,
        scanType: eventPayload.scan_type,
        ioNumber: normalizedAutoIo,
        sourceEventId: eventInsertId,
        clientName: eventPayload.client_name,
      });

      // Update units and source table with io_number, payment_status, and supplier_status
      const autoArchiveSourceTable = {
        [SCAN_TYPES.TFFW_EXCHANGE]: 'tffw_exchanges',
        [SCAN_TYPES.TFF_DEALER]: 'tff_dealer_scans',
      }[scanType];

      for (const tbl of ['units', autoArchiveSourceTable].filter(Boolean)) {
        const tblColumns = await getTableColumns(connection, tbl);
        const tblSerial = chooseExistingColumn(tblColumns, ['serial_number', 'serial']);
        if (!tblSerial) continue;
        const tblIo = chooseExistingColumn(tblColumns, ['io_number', 'io_no']);
        const tblPayment = chooseExistingColumn(tblColumns, ['payment_status']);
        const tblSupplier = chooseExistingColumn(tblColumns, ['supplier_status']);
        const sets = [];
        const vals = [];
        if (tblIo) { sets.push(`\`${tblIo}\` = ?`); vals.push(normalizedAutoIo); }
        if (tblPayment) { sets.push(`\`${tblPayment}\` = 'PAID_TFFW'`); }
        if (tblSupplier) { sets.push(`\`${tblSupplier}\` = 'PAID'`); }
        if (sets.length) {
          vals.push(eventPayload.serial_number);
          await connection.query(
            `UPDATE \`${tbl}\` SET ${sets.join(', ')} WHERE \`${tblSerial}\` = ?`,
            vals
          );
        }
      }
    }

    await logUnitHistoryIfAvailable(connection, eventPayload);
    await connection.commit();

    return res.json({
      ok: true,
      scanType,
      serialNumber,
      paymentStatus,
      includeWeeklyReport: rule.includeWeeklyReport,
      sourceInsert: sourceInsertResult,
      eventInsert: eventInsertResult,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Scan-out process failed:', error);
    return res.status(500).json({ error: 'Failed to process scan-out' });
  } finally {
    connection.release();
  }
});

ensureScanOutEventsTable().catch((error) => {
  console.error('Could not ensure scan_out_events table:', error.message);
});

ensureRareCaseStockChangesTable().catch((error) => {
  console.error('Could not ensure rare_case_stock_changes table:', error.message);
});

ensureWeeklyPaymentHistoryTable().catch((error) => {
  console.error('Could not ensure weekly_payment_history table:', error.message);
});

ensureArchiveRecordsTable().catch((error) => {
  console.error('Could not ensure archive_records table:', error.message);
});

if (fs.existsSync(buildIndexPath)) {
  app.use(express.static(buildPath));

  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(buildIndexPath);
  });
}

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
