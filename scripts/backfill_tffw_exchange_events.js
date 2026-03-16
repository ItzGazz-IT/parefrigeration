/**
 * Backfill script: creates scan_out_events (and archive_records) for
 * tffw_exchanges rows that were inserted directly without going through
 * the scan-out process endpoint.
 *
 * Usage: node scripts/backfill_tffw_exchange_events.js
 */
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
  let created = 0;
  let archived = 0;
  let skipped = 0;

  try {
    // Find all tffw_exchanges rows that have no matching scan_out_events row
    const [tffwRows] = await connection.query(
      `SELECT te.*
       FROM tffw_exchanges te
       LEFT JOIN scan_out_events soe
         ON soe.serial_number = te.serial_number
         AND soe.scan_type = 'TFFW_EXCHANGE'
       WHERE soe.id IS NULL`
    );

    console.log(`Found ${tffwRows.length} tffw_exchanges row(s) with no scan_out_events entry.`);

    for (const row of tffwRows) {
      const serial = String(row.serial_number || '').trim();
      if (!serial) {
        console.log(`  Skipping row id=${row.id} — no serial_number`);
        skipped++;
        continue;
      }

      // Look up the unit
      const [unitRows] = await connection.query(
        'SELECT id, model_id, warehouse_id, status FROM units WHERE serial_number = ? LIMIT 1',
        [serial]
      );
      const unit = unitRows[0] || null;

      // Prefer warehouse_id from the tffw_exchanges row, fallback to unit
      const warehouseId = row.warehouse_id || unit?.warehouse_id || null;
      const ioNumber = row.io_number ? String(row.io_number).trim() : null;
      const ts = row.timestamp || row.created_at || row.scanned_at || new Date();

      await connection.beginTransaction();
      try {
        // Insert into scan_out_events
        const [insertResult] = await connection.query(
          `INSERT INTO scan_out_events (
            unit_id, model_id, warehouse_id, serial_number, scan_type,
            io_number, client_name, payment_status,
            include_weekly_report, source_table, status,
            scanned_at, created_at
          ) VALUES (?, ?, ?, ?, 'TFFW_EXCHANGE', ?, ?, ?,
            0, 'tffw_exchanges', 'SOLD', ?, ?)`,
          [
            unit?.id || null,
            row.model_id || unit?.model_id || null,
            warehouseId,
            serial,
            ioNumber,
            row.client_name || null,
            ioNumber ? 'PAID_TFFW' : 'UNPAID_TFFW',
            ts,
            ts,
          ]
        );

        const eventId = insertResult.insertId;
        console.log(`  Created scan_out_events id=${eventId} for serial=${serial} warehouse_id=${warehouseId}`);
        created++;

        // If IO present, insert archive record and update units/tffw_exchanges
        if (ioNumber) {
          const [existingArchive] = await connection.query(
            `SELECT id FROM archive_records WHERE serial_number = ? AND scan_type = 'TFFW_EXCHANGE' LIMIT 1`,
            [serial]
          );

          if (!existingArchive.length) {
            await connection.query(
              `INSERT INTO archive_records (serial_number, scan_type, io_number, source_event_id, client_name, archived_at, created_at)
               VALUES (?, 'TFFW_EXCHANGE', ?, ?, ?, NOW(), NOW())`,
              [serial, ioNumber, eventId, row.client_name || null]
            );
            console.log(`    -> Inserted archive_record for serial=${serial} io=${ioNumber}`);
            archived++;
          }

          // Update units
          if (unit?.id) {
            await connection.query(
              `UPDATE units
               SET status = 'SOLD',
                   payment_status = 'PAID_TFFW',
                   supplier_status = 'PAID',
                   io_number = ?
               WHERE id = ?`,
              [ioNumber, unit.id]
            ).catch(() => {}); // ignore if columns don't exist
          }
        }

        await connection.commit();
      } catch (err) {
        await connection.rollback();
        console.error(`  ERROR for serial=${serial}:`, err.message);
        skipped++;
      }
    }

    console.log(`\nDone. created=${created} archived=${archived} skipped=${skipped}`);
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
