import fs from "node:fs";
import path from "node:path";
import { createDemoDatabase } from "../seed.mjs";

function clone(value) {
  return structuredClone(value);
}

export function createDatabase({ dataFile, persist = true } = {}) {
  const resolvedFile = dataFile ?? path.resolve(process.cwd(), "data", "database.json");
  let db;

  if (persist) {
    fs.mkdirSync(path.dirname(resolvedFile), { recursive: true });
  }

  if (persist && fs.existsSync(resolvedFile)) {
    db = JSON.parse(fs.readFileSync(resolvedFile, "utf8"));
  } else {
    db = createDemoDatabase();
    if (persist) {
      fs.writeFileSync(resolvedFile, JSON.stringify(db, null, 2));
    }
  }

  function save() {
    db.meta.updatedAt = new Date().toISOString();
    if (persist) {
      fs.writeFileSync(resolvedFile, JSON.stringify(db, null, 2));
    }
  }

  return {
    get() {
      return db;
    },
    mutate(callback) {
      const result = callback(db);
      save();
      return result;
    },
    snapshot() {
      return clone(db);
    },
    reset(nextDb = createDemoDatabase()) {
      db = clone(nextDb);
      save();
    },
    file: resolvedFile
  };
}
