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
  let updatedScanOut = 0;
  try {
    // Update scan_out_events only (supplier_status)
    const [scanOutResult] = await connection.query(
      `UPDATE scan_out_events
       SET supplier_status = 'UNPAID_TFFW'
       WHERE scan_type = 'INHOUSE_EXCHANGE'
         AND (supplier_status != 'UNPAID_TFFW' OR supplier_status IS NULL)`
    );
    updatedScanOut = scanOutResult.affectedRows;

    console.log(`Updated scan_out_events (supplier_status): ${updatedScanOut}`);
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
