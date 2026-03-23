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
  let updated = 0;
  try {
    const [result] = await connection.query(
      `UPDATE scan_out_events
       SET include_weekly_report = 1
       WHERE scan_type = 'INHOUSE_EXCHANGE'
         AND (include_weekly_report IS NULL OR include_weekly_report = 0)`
    );
    updated = result.affectedRows;
    console.log(`Updated scan_out_events (include_weekly_report=1): ${updated}`);
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
