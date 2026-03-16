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
    const [sourceRows] = await connection.query(
      `SELECT id, serial_number, model_id, warehouse_id, client_name, timestamp
       FROM inhouse_exchanges
       ORDER BY id DESC
       LIMIT 10`
    );

    const [eventRows] = await connection.query(
      `SELECT id, serial_number, scan_type, warehouse_id, include_weekly_report, payment_status, io_number, created_at
       FROM scan_out_events
       WHERE scan_type = 'INHOUSE_EXCHANGE'
       ORDER BY id DESC
       LIMIT 10`
    );

    console.log('\n=== inhouse_exchanges ===');
    console.log(sourceRows);
    console.log('\n=== scan_out_events (INHOUSE_EXCHANGE) ===');
    console.log(eventRows);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('inspect_inhouse_exchange failed:', error.message);
  process.exit(1);
});
