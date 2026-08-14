import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env and fill it in.');
}

export const pool = mysql.createPool(databaseUrl);

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bills (
      short_code  VARCHAR(12)  PRIMARY KEY,
      data        JSON         NOT NULL,
      created_at  BIGINT       NOT NULL,
      expires_at  BIGINT       NOT NULL,
      INDEX idx_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      short_code      VARCHAR(12) NOT NULL,
      participant_id  VARCHAR(64) NOT NULL,
      status          ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
      updated_at      BIGINT      NOT NULL,
      PRIMARY KEY (short_code, participant_id),
      FOREIGN KEY (short_code) REFERENCES bills(short_code) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
