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
    const [sourceCols] = await connection.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tff_dealer_scans'
       ORDER BY ORDINAL_POSITION`
    );
    const [sourceRows] = await connection.query(
      `SELECT * FROM tff_dealer_scans ORDER BY id DESC LIMIT 10`
    );
    const [eventRows] = await connection.query(
      `SELECT * FROM scan_out_events WHERE scan_type = 'TFF_DEALER' ORDER BY id DESC LIMIT 10`
    );
    const [archiveRows] = await connection.query(
      `SELECT * FROM archive_records WHERE scan_type = 'TFF_DEALER' ORDER BY id DESC LIMIT 10`
    );

    console.log('\n=== tff_dealer_scans columns ===');
    console.log(sourceCols);
    console.log('\n=== tff_dealer_scans rows ===');
    console.log(sourceRows);
    console.log('\n=== scan_out_events TFF_DEALER rows ===');
    console.log(eventRows);
    console.log('\n=== archive_records TFF_DEALER rows ===');
    console.log(archiveRows);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('inspect_tff_dealer failed:', error.message);
  process.exit(1);
});
