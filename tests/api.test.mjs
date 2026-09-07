import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createApp } from "../src/app.mjs";
import { createDatabase } from "../src/services/database.mjs";

let server;
let baseUrl;
let database;

test.before(async () => {
  database = createDatabase({ persist: false });
  server = http.createServer(createApp({ database }));
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function login({ email, password, tenantId }) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, tenantId })
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return { payload, cookie };
}

async function authedFetch(path, cookie, tenantId, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Cookie: cookie,
      "x-tenant-id": tenantId,
      ...(options.headers ?? {})
    }
  });
}

test("autentica administrador e retorna dashboard multi-condominio", async () => {
  const { payload, cookie } = await login({
    email: "admin@portaria360.local",
    password: "Admin@123",
    tenantId: "tenant_solaris"
  });

  assert.equal(payload.session.activeTenant.id, "tenant_solaris");
  assert.equal(payload.session.user.role, "administrator");
  assert.equal(payload.session.tenants.length, 2);

  const dashboardResponse = await authedFetch("/api/dashboard/overview", cookie, "tenant_solaris");
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.ok(dashboard.cards.accessesToday >= 1);
  assert.ok(Array.isArray(dashboard.recentAccesses));
});

test("cria contato, agenda visita e autoriza acesso por codigo temporario", async () => {
  const { cookie } = await login({
    email: "mariana@solaris.local",
    password: "Morador@123",
    tenantId: "tenant_solaris"
  });

  const contactResponse = await authedFetch("/api/contacts", cookie, "tenant_solaris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Bruno Teste",
      type: "visitor",
      phone: "11988887777",
      document: "12312312399"
    })
  });
  assert.equal(contactResponse.status, 201);
  const contact = await contactResponse.json();

  const visitResponse = await authedFetch("/api/visits", cookie, "tenant_solaris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      unitId: "unit_sol_101",
      contactId: contact.id,
      type: "visitor",
      scheduledStartAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      scheduledEndAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: "approved"
    })
  });
  assert.equal(visitResponse.status, 201);
  const visit = await visitResponse.json();
  assert.ok(visit.temporaryCode);

  const { cookie: doormanCookie } = await login({
    email: "porteiro@solaris.local",
    password: "Porteiro@123",
    tenantId: "tenant_solaris"
  });

  const accessResponse = await authedFetch("/api/access-events", doormanCookie, "tenant_solaris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gateId: "gate_sol_main",
      direction: "entry",
      method: "TEMP_CODE",
      temporaryCode: visit.temporaryCode
    })
  });
  assert.equal(accessResponse.status, 201);
  const access = await accessResponse.json();
  assert.equal(access.status, "allowed");
  assert.equal(access.userType, "visitor");
});

test("liberacao remota e exportacao CSV funcionam", async () => {
  const { cookie } = await login({
    email: "admin@portaria360.local",
    password: "Admin@123",
    tenantId: "tenant_solaris"
  });

  const gateResponse = await authedFetch("/api/gates/gate_sol_main/open", cookie, "tenant_solaris", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "test-open-main-001" },
    body: JSON.stringify({ expiresInSeconds: 10 })
  });
  assert.equal(gateResponse.status, 202);
  const gatePayload = await gateResponse.json();
  assert.equal(gatePayload.command.status, "simulated");
  assert.equal(gatePayload.command.integrationMode, "simulation");
  assert.match(gatePayload.warning, /Nenhum equipamento fisico/);

  const exportResponse = await authedFetch("/api/exports/access-events.csv", cookie, "tenant_solaris");
  assert.equal(exportResponse.status, 200);
  const csv = await exportResponse.text();
  assert.match(csv, /Data,Pessoa,Tipo,Direcao,Metodo,Status/);
});

test("isola recursos por condominio e aplica permissoes por funcao", async () => {
  const { cookie: residentCookie } = await login({
    email: "mariana@solaris.local",
    password: "Morador@123",
    tenantId: "tenant_solaris"
  });

  const foreignTenant = await authedFetch("/api/dashboard/overview", residentCookie, "tenant_atrium");
  assert.equal(foreignTenant.status, 401);

  const foreignGate = await authedFetch("/api/gates/gate_atrium_lobby/open", residentCookie, "tenant_solaris", {
    method: "POST",
    headers: { "Idempotency-Key": "foreign-gate-001" }
  });
  assert.equal(foreignGate.status, 404);

  const residentReport = await authedFetch("/api/reports/flow", residentCookie, "tenant_solaris");
  assert.equal(residentReport.status, 403);

  const { cookie: syndicCookie } = await login({
    email: "sindico@solaris.local",
    password: "Sindico@123",
    tenantId: "tenant_solaris"
  });
  const syndicReport = await authedFetch("/api/reports/flow", syndicCookie, "tenant_solaris");
  assert.equal(syndicReport.status, 200);
});

test("comando de portao expira, e idempotente, auditavel e bloqueia repeticao", async () => {
  const { cookie } = await login({
    email: "porteiro@solaris.local",
    password: "Porteiro@123",
    tenantId: "tenant_solaris"
  });
  const headers = { "Content-Type": "application/json", "Idempotency-Key": "gate-safety-001" };
  const first = await authedFetch("/api/gates/gate_sol_garage/open", cookie, "tenant_solaris", {
    method: "POST",
    headers,
    body: JSON.stringify({ expiresInSeconds: 3 })
  });
  assert.equal(first.status, 202);
  const firstPayload = await first.json();
  assert.ok(new Date(firstPayload.command.expiresAt) > new Date(firstPayload.command.createdAt));

  const replay = await authedFetch("/api/gates/gate_sol_garage/open", cookie, "tenant_solaris", {
    method: "POST",
    headers,
    body: JSON.stringify({ expiresInSeconds: 3 })
  });
  assert.equal(replay.status, 200);
  const replayPayload = await replay.json();
  assert.equal(replayPayload.replayed, true);
  assert.equal(replayPayload.command.id, firstPayload.command.id);

  const duplicate = await authedFetch("/api/gates/gate_sol_garage/open", cookie, "tenant_solaris", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "gate-safety-002" },
    body: JSON.stringify({ expiresInSeconds: 3 })
  });
  assert.equal(duplicate.status, 409);

  const expired = await authedFetch("/api/gates/gate_sol_main/open", cookie, "tenant_solaris", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "gate-expired-001" },
    body: JSON.stringify({ issuedAt: new Date(Date.now() - 60_000).toISOString(), expiresInSeconds: 3 })
  });
  assert.equal(expired.status, 400);

  const snapshot = database.snapshot();
  const audits = snapshot.auditLogs.filter((entry) => entry.targetId === firstPayload.command.id);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].tenantId, "tenant_solaris");
  assert.equal(audits[0].action, "gate.open_command.created");
});

test("documentacao exige autenticacao", async () => {
  const openApiResponse = await fetch(`${baseUrl}/api/docs/openapi`);
  assert.equal(openApiResponse.status, 401);

  const markdownResponse = await fetch(`${baseUrl}/docs/api`);
  assert.equal(markdownResponse.status, 401);
});

test("documentacao autenticada nao expoe credenciais de teste", async () => {
  const { cookie } = await login({
    email: "admin@portaria360.local",
    password: "Admin@123",
    tenantId: "tenant_solaris"
  });

  const openApiResponse = await authedFetch("/api/docs/openapi", cookie, "tenant_solaris");
  assert.equal(openApiResponse.status, 200);
  const openApi = await openApiResponse.json();
  const openApiText = JSON.stringify(openApi);
  assert.ok(openApi.components?.securitySchemes?.sessionCookie);
  assert.ok(openApi.security?.length);
  assert.match(openApiText, /usuario@empresa\.com/);
  assert.doesNotMatch(openApiText, /admin@portaria360\.local|Admin@123|Morador@123/);

  const markdownResponse = await authedFetch("/docs/api", cookie, "tenant_solaris");
  assert.equal(markdownResponse.status, 200);
  const markdown = await markdownResponse.text();
  assert.match(markdown, /usuario@empresa\.com/);
  assert.doesNotMatch(markdown, /admin@portaria360\.local|Admin@123|Morador@123/);
});
