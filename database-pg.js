const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id BIGINT PRIMARY KEY,
      first_name TEXT,
      username TEXT,
      invited_count INTEGER DEFAULT 0,
      warnings INTEGER DEFAULT 0,
      allowed INTEGER DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invited_members (
      inviter_id BIGINT,
      member_id BIGINT,
      PRIMARY KEY (inviter_id, member_id)
    )
  `);

  console.log("✅ PostgreSQL tables ready");
}

module.exports = {
  pool,
  initDatabase,
};
