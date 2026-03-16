require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });

  try {
    const [rows] = await connection.query(
      `SELECT
         s.serial_number,
         s.model_id,
         s.warehouse_id,
         s.po_number,
         s.timestamp AS source_created_at
       FROM takealot_scans s
       WHERE s.serial_number IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM scan_out_events e
           WHERE e.scan_type = 'TAKEALOT'
             AND e.serial_number = s.serial_number
         )
       ORDER BY s.timestamp DESC`
    );

    let created = 0;

    for (const row of rows) {
      const serialNumber = String(row.serial_number || '').trim();
      if (!serialNumber) continue;

      const [unitRows] = await connection.query(
        'SELECT id, model_id, warehouse_id FROM units WHERE serial_number = ? LIMIT 1',
        [serialNumber]
      );

      const unit = unitRows[0] || {};
      const createdAt = row.source_created_at || new Date();

      await connection.query(
        `INSERT INTO scan_out_events (
          unit_id,
          model_id,
          warehouse_id,
          serial_number,
          scan_type,
          po_number,
          payment_status,
          include_weekly_report,
          source_table,
          status,
          scanned_at,
          created_at
        ) VALUES (?, ?, ?, ?, 'TAKEALOT', ?, 'PENDING_IO', 0, 'takealot_scans', 'SOLD', ?, ?)`,
        [
          unit.id || null,
          row.model_id || unit.model_id || null,
          row.warehouse_id || unit.warehouse_id || null,
          serialNumber,
          row.po_number || null,
          createdAt,
          createdAt,
        ]
      );

      created += 1;
    }

    console.log(`Backfill complete. created=${created}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('backfill_takealot_events failed:', error.message);
  process.exit(1);
});
