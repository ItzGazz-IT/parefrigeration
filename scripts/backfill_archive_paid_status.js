require('dotenv').config();
const mysql = require('mysql2/promise');

const sourceTableByScanType = {
  ACTUAL_SALE: 'sales',
  TFFW_EXCHANGE: 'tffw_exchanges',
  TFF_DEALER: 'tff_dealer_scans',
  INHOUSE_EXCHANGE: 'inhouse_exchanges',
  TAKEALOT: 'takealot_scans',
};

const chooseExistingColumn = (columns, candidates) => candidates.find((name) => columns.has(name));

const getTableColumns = async (connection, dbName, tableName) => {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, tableName]
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
};

const updateTableBySerial = async ({ connection, dbName, tableName, serial, ioNumber, paidValue = 'PAID_TFFW', updateSupplierStatus = true }) => {
  const columns = await getTableColumns(connection, dbName, tableName);
  if (!columns.size) return 0;

  const serialColumn = chooseExistingColumn(columns, ['serial_number', 'serial']);
  if (!serialColumn) return 0;

  const ioColumn = chooseExistingColumn(columns, ['io_number', 'io_no']);
  const paymentColumn = chooseExistingColumn(columns, ['payment_status', 'status']);
  const supplierStatusColumn = chooseExistingColumn(columns, ['supplier_status']);

  const sets = [];
  const values = [];

  if (ioColumn) {
    sets.push(`\`${ioColumn}\` = ?`);
    values.push(ioNumber);
  }

  if (paymentColumn) {
    sets.push(`\`${paymentColumn}\` = ?`);
    values.push(paidValue);
  }

  if (updateSupplierStatus && supplierStatusColumn) {
    sets.push(`\`${supplierStatusColumn}\` = ?`);
    values.push(paidValue);
  }

  if (!sets.length) return 0;

  values.push(serial);
  const [result] = await connection.query(
    `UPDATE \`${tableName}\`
     SET ${sets.join(', ')}
     WHERE \`${serialColumn}\` = ?`,
    values
  );

  return Number(result.affectedRows || 0);
};

const run = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });

  try {
    await connection.beginTransaction();

    const [archiveRows] = await connection.query(
      `SELECT serial_number, scan_type, io_number
       FROM archive_records
       WHERE COALESCE(NULLIF(TRIM(io_number), ''), '') <> ''`
    );

    let updatedScanOut = 0;
    let updatedUnits = 0;
    let updatedSales = 0;
    let updatedSource = 0;

    for (const row of archiveRows) {
      const serial = String(row.serial_number || '').trim();
      const scanType = String(row.scan_type || '').trim().toUpperCase();
      const ioNumber = String(row.io_number || '').trim();
      if (!serial || !ioNumber) continue;

      const [scanOutResult] = await connection.query(
        `UPDATE scan_out_events
         SET io_number = ?, payment_status = 'PAID_TFFW'
         WHERE serial_number = ?
           AND scan_type = ?`,
        [ioNumber, serial, scanType]
      );
      updatedScanOut += Number(scanOutResult.affectedRows || 0);

      updatedUnits += await updateTableBySerial({
        connection,
        dbName: process.env.DB_NAME,
        tableName: 'units',
        serial,
        ioNumber,
        paidValue: 'PAID_TFFW',
        updateSupplierStatus: true,
      });

      updatedSales += await updateTableBySerial({
        connection,
        dbName: process.env.DB_NAME,
        tableName: 'sales',
        serial,
        ioNumber,
        paidValue: 'PAID_TFFW',
        updateSupplierStatus: true,
      });

      const sourceTable = sourceTableByScanType[scanType];
      if (sourceTable) {
        updatedSource += await updateTableBySerial({
          connection,
          dbName: process.env.DB_NAME,
          tableName: sourceTable,
          serial,
          ioNumber,
          paidValue: 'PAID_TFFW',
          updateSupplierStatus: true,
        });
      }
    }

    await connection.commit();

    console.log(JSON.stringify({
      ok: true,
      archivedRowsProcessed: archiveRows.length,
      updatedScanOut,
      updatedUnits,
      updatedSales,
      updatedSource,
    }, null, 2));
  } catch (error) {
    await connection.rollback();
    console.error('Backfill failed:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
};

run();
