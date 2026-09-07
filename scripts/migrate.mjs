import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new pg.Pool({
  connectionString,
  ssl: process.env.PGSSL === "disable" ? false : undefined
});

const client = await pool.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const directory = path.resolve(process.cwd(), "migrations");
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  const applied = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map((row) => row.version));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(directory, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(360360)");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log("Database is up to date.");
} finally {
  client.release();
  await pool.end();
}
