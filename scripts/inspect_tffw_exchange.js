require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    waitForConnections: true,
    connectionLimit: 5,
  });

  const connection = await pool.getConnection();

  try {
    console.log('\n========== scan_out_events (TFFW_EXCHANGE) ==========');
    const [soeRows] = await connection.query(
      `SELECT
         soe.id,
         soe.serial_number,
         soe.scan_type,
         soe.warehouse_id,
         soe.unit_id,
         soe.io_number,
         soe.client_name,
         soe.payment_status,
         soe.include_weekly_report,
         soe.scanned_at,
         soe.created_at,
         u.warehouse_id AS unit_warehouse_id,
         u.status AS unit_status,
         u.supplier_status AS unit_supplier_status
       FROM scan_out_events soe
       LEFT JOIN units u ON u.id = soe.unit_id
       WHERE soe.scan_type = 'TFFW_EXCHANGE'
       ORDER BY soe.created_at DESC`
    );
    if (soeRows.length === 0) {
      console.log('  (no rows found)');
    } else {
      soeRows.forEach((row) => console.log('  ', JSON.stringify(row)));
    }

    console.log('\n========== tffw_exchanges table ==========');
    const [tffwRows] = await connection.query(
      `SELECT * FROM tffw_exchanges ORDER BY id DESC LIMIT 50`
    );
    if (tffwRows.length === 0) {
      console.log('  (no rows found)');
    } else {
      tffwRows.forEach((row) => console.log('  ', JSON.stringify(row)));
    }

    console.log('\n========== archive_records (TFFW_EXCHANGE) ==========');
    const [archiveRows] = await connection.query(
      `SELECT * FROM archive_records WHERE scan_type = 'TFFW_EXCHANGE' ORDER BY archived_at DESC`
    );
    if (archiveRows.length === 0) {
      console.log('  (no rows found)');
    } else {
      archiveRows.forEach((row) => console.log('  ', JSON.stringify(row)));
    }

    console.log('\n========== units (TFFW_EXCHANGE serials) ==========');
    if (soeRows.length > 0) {
      const serials = [...new Set(soeRows.map((r) => r.serial_number))];
      const placeholders = serials.map(() => '?').join(', ');
      const [unitRows] = await connection.query(
        `SELECT id, serial_number, warehouse_id, status, supplier_status, stock_type
         FROM units
         WHERE serial_number IN (${placeholders})`,
        serials
      );
      if (unitRows.length === 0) {
        console.log('  (no matching units found)');
      } else {
        unitRows.forEach((row) => console.log('  ', JSON.stringify(row)));
      }
    } else {
      console.log('  (skipped — no scan_out_events serials to look up)');
    }

    console.log('\n========== scan_out_events column list ==========');
    const [colRows] = await connection.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scan_out_events'
       ORDER BY ORDINAL_POSITION`
    );
    colRows.forEach((row) => console.log(`  ${row.COLUMN_NAME} ${row.COLUMN_TYPE} (nullable: ${row.IS_NULLABLE})`));

  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
