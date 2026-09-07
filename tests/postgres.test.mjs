import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../src/services/database.mjs";
import { createDemoDatabase } from "../src/seed.mjs";

const connectionString = process.env.DATABASE_URL;

test("PostgreSQL commits concurrent mutations and rolls back failures", { skip: !connectionString }, async () => {
  const database = createDatabase({ connectionString });
  await database.ready();
  await database.reset(createDemoDatabase());

  await Promise.all([
    database.mutate((state) => {
      state.gateCommands.push({ id: "transaction-a", tenantId: "tenant_solaris" });
    }),
    database.mutate((state) => {
      state.gateCommands.push({ id: "transaction-b", tenantId: "tenant_solaris" });
    })
  ]);

  const verifier = createDatabase({ connectionString });
  await verifier.ready();
  assert.deepEqual(
    verifier.get().gateCommands.map((command) => command.id).sort(),
    ["transaction-a", "transaction-b"]
  );

  await assert.rejects(
    database.mutate((state) => {
      state.gateCommands.push({ id: "must-roll-back", tenantId: "tenant_solaris" });
      throw new Error("force rollback");
    }),
    /force rollback/
  );

  const rollbackVerifier = createDatabase({ connectionString });
  await rollbackVerifier.ready();
  assert.equal(rollbackVerifier.get().gateCommands.some((command) => command.id === "must-roll-back"), false);

  await Promise.all([database.close(), verifier.close(), rollbackVerifier.close()]);
});
