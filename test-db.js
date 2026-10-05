require("dotenv").config();

const { pool, initDatabase } = require("./database-pg");

async function testDatabase() {
  try {
    await pool.query("SELECT NOW()");

    console.log("✅ PostgreSQL connection successful");

    await initDatabase();

    await pool.end();

    console.log("✅ Database test completed");
  } catch (error) {
    console.error("❌ Database error:");
    console.error(error.message);

    await pool.end();
  }
}

testDatabase();
