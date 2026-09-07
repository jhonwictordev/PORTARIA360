import fs from "node:fs";
import path from "node:path";
import { createDemoDatabase } from "../seed.mjs";

const clone = (value) => structuredClone(value);
const ensureShape = (value) => ({ ...value, gateCommands: value.gateCommands ?? [] });

function createJsonDatabase({ dataFile, persist = true } = {}) {
  const resolvedFile = dataFile ?? path.resolve(process.cwd(), "data", "database.json");
  if (persist) fs.mkdirSync(path.dirname(resolvedFile), { recursive: true });
  let db = ensureShape(persist && fs.existsSync(resolvedFile) ? JSON.parse(fs.readFileSync(resolvedFile, "utf8")) : createDemoDatabase());

  function save() {
    db.meta.updatedAt = new Date().toISOString();
    if (persist) fs.writeFileSync(resolvedFile, JSON.stringify(db, null, 2));
  }
  if (persist && !fs.existsSync(resolvedFile)) save();

  return {
    kind: persist ? "json-development" : "memory-test",
    file: persist ? resolvedFile : null,
    async ready() {},
    get: () => db,
    async mutate(callback) {
      const draft = clone(db);
      const result = await callback(draft);
      db = draft;
      save();
      return result;
    },
    snapshot: () => clone(db),
    async reset(nextDb = createDemoDatabase()) {
      db = ensureShape(clone(nextDb));
      save();
    },
    async close() {}
  };
}

function createPostgresDatabase(connectionString) {
  let pool;
  let db = ensureShape(createDemoDatabase());
  let initialization;

  async function connect() {
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString, max: Number(process.env.PG_POOL_MAX ?? 10), ssl: process.env.PGSSL === "disable" ? false : undefined });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(360)");
      const result = await client.query("SELECT document FROM app_state WHERE id = 1");
      if (result.rowCount === 0) await client.query("INSERT INTO app_state (id, document) VALUES (1, $1::jsonb)", [JSON.stringify(db)]);
      else db = ensureShape(result.rows[0].document);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    kind: "postgresql",
    file: null,
    ready() {
      initialization ??= connect();
      return initialization;
    },
    get: () => db,
    async mutate(callback) {
      await this.ready();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query("SELECT document FROM app_state WHERE id = 1 FOR UPDATE");
        const draft = ensureShape(result.rowCount ? result.rows[0].document : createDemoDatabase());
        const value = await callback(draft);
        draft.meta.updatedAt = new Date().toISOString();
        await client.query("INSERT INTO app_state (id, document, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document, updated_at = now()", [JSON.stringify(draft)]);
        await client.query("COMMIT");
        db = draft;
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    snapshot: () => clone(db),
    async reset(nextDb = createDemoDatabase()) {
      await this.mutate((draft) => Object.assign(draft, ensureShape(clone(nextDb))));
    },
    async close() {
      await pool?.end();
    }
  };
}

export function createDatabase(options = {}) {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (connectionString && options.persist !== false) return createPostgresDatabase(connectionString);
  return createJsonDatabase(options);
}
