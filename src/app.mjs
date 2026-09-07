import crypto from "node:crypto";
import path from "node:path";
import { createDatabase } from "./services/database.mjs";
import { buildFlowReport, buildSimplePdf, filterTenantRecords, toCsv } from "./services/reports.mjs";
import { createRealtimeHub } from "./services/realtime.mjs";
import {
  buildProvisioningUri,
  decryptSensitive,
  encryptSensitive,
  generateTemporaryCode,
  generateTotpSecret,
  hashPassword,
  maskValue,
  randomId,
  signToken,
  verifyPassword,
  verifyToken,
  verifyTotp
} from "./utils/security.mjs";
import {
  badRequest,
  binary,
  conflict,
  forbidden,
  json,
  matchesRoute,
  noContent,
  notFound,
  parseCookies,
  parseJsonBody,
  safeJoin,
  sendStaticFile,
  serverError,
  unauthorized
} from "./utils/http.mjs";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const DOCS_DIR = path.resolve(process.cwd(), "docs");

const PERMISSIONS = {
  administrator: [
    "dashboard:read",
    "users:read",
    "users:write",
    "units:read",
    "units:write",
    "visits:read",
    "visits:write",
    "contacts:read",
    "contacts:write",
    "allowlists:read",
    "allowlists:write",
    "access:read",
    "access:write",
    "access:remote",
    "reports:read",
    "alerts:read",
    "alerts:write",
    "integrations:read",
    "integrations:write",
    "billing:read",
    "billing:write",
    "assistant:use",
    "settings:write"
  ],
  syndic: [
    "dashboard:read",
    "users:read",
    "users:write",
    "units:read",
    "units:write",
    "visits:read",
    "visits:write",
    "contacts:read",
    "contacts:write",
    "allowlists:read",
    "allowlists:write",
    "access:read",
    "access:write",
    "access:remote",
    "reports:read",
    "alerts:read",
    "integrations:read",
    "assistant:use"
  ],
  doorman: [
    "dashboard:read",
    "units:read",
    "visits:read",
    "visits:write",
    "contacts:read",
    "contacts:write",
    "allowlists:read",
    "access:read",
    "access:write",
    "access:remote",
    "alerts:read",
    "integrations:read",
    "assistant:use"
  ],
  resident: ["dashboard:read", "units:read", "visits:read", "visits:write", "allowlists:read", "allowlists:write", "contacts:read", "contacts:write", "access:remote"]
};

function uniqueTenantIds(user) {
  return [...new Set((user.memberships ?? []).map((membership) => membership.tenantId))];
}

function getMembership(user, tenantId) {
  return (user.memberships ?? []).find((membership) => membership.tenantId === tenantId) ?? null;
}

function hasPermission(auth, permission) {
  const rolePermissions = PERMISSIONS[auth.membership.role] ?? [];
  return rolePermissions.includes(permission);
}

function assertPermission(res, auth, permission) {
  if (!hasPermission(auth, permission)) {
    forbidden(res, "Sua funcao nao possui permissao para esta operacao.");
    return false;
  }
  return true;
}

function sanitizeUser(user, tenantId) {
  const membership = getMembership(user, tenantId);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    role: membership?.role ?? null,
    unitIds: membership?.unitIds ?? [],
    phoneMasked: maskValue(decryptSensitive(user.phoneEnc)),
    documentMasked: maskValue(decryptSensitive(user.documentEnc)),
    twoFactorEnabled: user.twoFactorEnabled,
    defaultTenantId: user.defaultTenantId,
    tenantIds: uniqueTenantIds(user),
    lastLoginAt: user.lastLoginAt
  };
}

function sanitizeContact(contact) {
  return {
    ...contact,
    phoneMasked: maskValue(decryptSensitive(contact.phoneEnc)),
    documentMasked: maskValue(decryptSensitive(contact.documentEnc))
  };
}

function findTenant(db, tenantId) {
  return db.condos.find((condo) => condo.id === tenantId) ?? null;
}

function findUnit(db, unitId) {
  return db.units.find((unit) => unit.id === unitId) ?? null;
}

function findUser(db, userId) {
  return db.users.find((user) => user.id === userId) ?? null;
}

function findContact(db, contactId) {
  return db.contacts.find((contact) => contact.id === contactId) ?? null;
}

function findResidentForUnit(db, tenantId, unitId) {
  return db.users.find((user) => {
    const membership = getMembership(user, tenantId);
    return membership?.role === "resident" && membership.unitIds.includes(unitId);
  });
}

function sanitizeVisit(db, visit) {
  const contact = findContact(db, visit.contactId);
  const unit = findUnit(db, visit.unitId);
  const resident = findUser(db, visit.residentUserId);
  return {
    ...visit,
    contact: contact ? sanitizeContact(contact) : null,
    unit,
    resident: resident ? sanitizeUser(resident, visit.tenantId) : null
  };
}

function sanitizeAccessEvent(db, event) {
  return {
    ...event,
    unit: event.unitId ? findUnit(db, event.unitId) : null,
    gate: findTenant(db, event.tenantId)?.gates.find((gate) => gate.id === event.gateId) ?? null
  };
}

function buildSession(db, user, tenantId) {
  const accessibleTenants = uniqueTenantIds(user)
    .map((id) => findTenant(db, id))
    .filter(Boolean)
    .map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      kind: tenant.kind,
      color: tenant.config.brandColor
    }));

  return {
    user: sanitizeUser(user, tenantId),
    activeTenant: findTenant(db, tenantId),
    memberships: (user.memberships ?? []).map((membership) => ({
      tenantId: membership.tenantId,
      role: membership.role,
      unitIds: membership.unitIds
    })),
    permissions: PERMISSIONS[getMembership(user, tenantId)?.role ?? "resident"] ?? [],
    tenants: accessibleTenants
  };
}

function createAuditLog(db, entry) {
  db.auditLogs.unshift({
    id: randomId("audit"),
    createdAt: new Date().toISOString(),
    ...entry
  });
  db.auditLogs = db.auditLogs.slice(0, 500);
}

function pushRealtime(hub, tenantId, type, payload) {
  hub.broadcast({
    tenantId,
    type,
    createdAt: new Date().toISOString(),
    payload
  });
}

function emitNotification(db, tenantId, channel, to, message) {
  const record = {
    id: randomId("notif"),
    tenantId,
    channel,
    to,
    message,
    status: "delivered",
    createdAt: new Date().toISOString()
  };
  db.notificationLog.unshift(record);
  db.notificationLog = db.notificationLog.slice(0, 200);
  return record;
}

function createAlert(db, hub, alertInput) {
  const alert = {
    id: randomId("alert"),
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    ...alertInput
  };
  db.alerts.unshift(alert);
  db.alerts = db.alerts.slice(0, 200);
  pushRealtime(hub, alert.tenantId, "alert.created", alert);
  return alert;
}

async function deliverWebhooks(db, tenantId, eventType, payload) {
  const subscribers = db.webhooks.filter((webhook) => webhook.tenantId === tenantId && webhook.eventTypes.includes(eventType));
  for (const webhook of subscribers) {
    webhook.lastDeliveryAt = new Date().toISOString();
    webhook.lastPayload = { eventType, payload };
    try {
      await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": webhook.secret
        },
        body: JSON.stringify({ eventType, payload }),
        signal: AbortSignal.timeout(3000)
      });
      webhook.status = "delivered";
    } catch {
      webhook.status = "pending-retry";
    }
  }
}

function recentDeniedAttempts(db, tenantId, subjectId) {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  return db.accessEvents.filter(
    (event) =>
      event.tenantId === tenantId &&
      event.subjectId === subjectId &&
      event.status === "denied" &&
      new Date(event.createdAt).getTime() >= tenMinutesAgo
  ).length;
}

function evaluateSuspiciousActivity(db, hub, event) {
  const tenant = findTenant(db, event.tenantId);
  if (!tenant) return;

  if (event.status === "denied") {
    const deniedCount = recentDeniedAttempts(db, event.tenantId, event.subjectId);
    if (deniedCount >= tenant.config.suspiciousDeniedThreshold) {
      createAlert(db, hub, {
        tenantId: event.tenantId,
        type: "security",
        severity: "high",
        title: "Tentativas repetidas de acesso negado",
        description: `${event.displayName} acumulou ${deniedCount} tentativas negadas em menos de 10 minutos.`
      });
    }
  }
}

function isResidentManagingOwnUnit(auth, unitId) {
  return auth.membership.role === "resident" && auth.membership.unitIds.includes(unitId);
}

function checkUnitAccess(res, auth, unitId) {
  if (hasPermission(auth, "units:read")) return true;
  if (isResidentManagingOwnUnit(auth, unitId)) return true;
  forbidden(res, "A unidade informada nao pertence ao usuario autenticado.");
  return false;
}

function resolveAuth(req, db, url) {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization ?? "";
  const token =
    (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "") ||
    cookies.session ||
    "";
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = findUser(db, payload.sub);
  if (!user || user.status !== "active") return null;
  const requestedTenantId = req.headers["x-tenant-id"] || url.searchParams.get("tenantId") || payload.defaultTenantId || user.defaultTenantId;
  const membership = getMembership(user, requestedTenantId);
  if (!membership) return null;
  return {
    payload,
    user,
    tenantId: requestedTenantId,
    membership
  };
}

function summarizeDashboard(db, tenantId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const accessEvents = db.accessEvents.filter((event) => event.tenantId === tenantId);
  const todayAccesses = accessEvents.filter((event) => new Date(event.createdAt) >= startOfDay);
  const pendingVisits = db.visits.filter((visit) => visit.tenantId === tenantId && ["scheduled", "approved"].includes(visit.status));
  const alerts = db.alerts.filter((alert) => alert.tenantId === tenantId && !alert.resolvedAt);
  const devices = db.deviceIntegrations.filter((device) => device.tenantId === tenantId);
  const gates = findTenant(db, tenantId)?.gates ?? [];

  return {
    cards: {
      accessesToday: todayAccesses.length,
      pendingVisits: pendingVisits.length,
      activeAlerts: alerts.length,
      onlineDevices: devices.filter((device) => device.status === "online").length
    },
    recentAccesses: accessEvents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10).map((event) => sanitizeAccessEvent(db, event)),
    pendingVisits: pendingVisits.sort((a, b) => new Date(a.scheduledStartAt) - new Date(b.scheduledStartAt)).slice(0, 8).map((visit) => sanitizeVisit(db, visit)),
    alerts: alerts.slice(0, 8),
    gates,
    cameras: findTenant(db, tenantId)?.cameras ?? [],
    devices,
    subscription: db.subscriptions.find((subscription) => subscription.tenantId === tenantId) ?? null
  };
}

function createOpenApiDescription() {
  return {
    openapi: "3.0.3",
    info: {
      title: "App Portaria360 API",
      version: "1.0.0",
      description: "API-first para controle de acesso de condominios multi-tenant."
    },
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "session",
          description: "Sessao autenticada emitida pelo endpoint de login."
        },
        tenantHeader: {
          type: "apiKey",
          in: "header",
          name: "x-tenant-id",
          description: "Identificador do condominio ativo para a requisicao."
        }
      }
    },
    security: [{ sessionCookie: [], tenantHeader: [] }],
    paths: {
      "/api/auth/login": {
        post: {
          summary: "Autentica um usuario",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password", "tenantId"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", format: "password" },
                    tenantId: { type: "string" }
                  }
                },
                example: {
                  email: "usuario@empresa.com",
                  password: "<senha-do-usuario>",
                  tenantId: "tenant_exemplo"
                }
              }
            }
          }
        }
      },
      "/api/session": { get: { summary: "Retorna a sessao atual" } },
      "/api/dashboard/overview": { get: { summary: "Resumo operacional do condominio" } },
      "/api/users": { get: { summary: "Lista usuarios" }, post: { summary: "Cria usuario" } },
      "/api/contacts": { get: { summary: "Lista visitantes e prestadores" }, post: { summary: "Cria visitante ou prestador" } },
      "/api/visits": { get: { summary: "Lista visitas" }, post: { summary: "Agenda visita" } },
      "/api/access-events": { get: { summary: "Lista acessos" }, post: { summary: "Registra entrada ou saida" } },
      "/api/reports/flow": { get: { summary: "Relatorio de fluxo" } },
      "/api/billing/subscribe": { post: { summary: "Assina um plano" } },
      "/api/integrations/webhooks": { get: { summary: "Lista webhooks" }, post: { summary: "Cria webhook" } }
    }
  };
}

function canSeeUnit(auth, unitId) {
  return hasPermission(auth, "units:read") || isResidentManagingOwnUnit(auth, unitId);
}

function findVisitByCode(db, tenantId, temporaryCode) {
  const now = Date.now();
  return db.visits.find((visit) => {
    if (visit.tenantId !== tenantId || visit.temporaryCode !== temporaryCode) return false;
    const start = new Date(visit.scheduledStartAt).getTime();
    const end = new Date(visit.scheduledEndAt).getTime();
    return ["approved", "scheduled", "in-progress"].includes(visit.status) && now >= start - 60 * 60 * 1000 && now <= end + 60 * 60 * 1000;
  });
}

function canResidentChangeUnit(auth, unitId) {
  return auth.membership.role === "resident" && auth.membership.unitIds.includes(unitId);
}

export function createApp(options = {}) {
  const database = options.database ?? createDatabase({
    dataFile: options.dataFile,
    connectionString: options.connectionString,
    persist: options.persist ?? true
  });
  const hub = createRealtimeHub();

  return async function handler(req, res) {
    try {
      await database.ready();
      const url = new URL(req.url, "http://localhost");
      const pathname = url.pathname;

      if (pathname === "/api/health") {
        return json(res, 200, {
          status: "ok",
          realtimeClients: hub.count(),
          persistence: database.kind,
          databaseFile: database.file
        });
      }

      const db = database.get();
      const auth = resolveAuth(req, db, url);

      if (pathname === "/api/docs/openapi" || pathname === "/docs/api") {
        if (!auth) return unauthorized(res, "Autentique-se para acessar a documentacao.");

        if (pathname === "/api/docs/openapi") {
          return json(res, 200, createOpenApiDescription());
        }

        const docsPath = path.join(DOCS_DIR, "api.md");
        return sendStaticFile(res, docsPath) || notFound(res);
      }

      if (pathname === "/api/auth/login" && req.method === "POST") {
        const body = await parseJsonBody(req);
        if (!body) return badRequest(res, "JSON invalido.");
        const user = db.users.find((item) => item.email.toLowerCase() === String(body.email ?? "").toLowerCase());
        if (!user || !verifyPassword(String(body.password ?? ""), user.passwordHash)) {
          return unauthorized(res, "Email ou senha invalidos.");
        }
        if (user.twoFactorEnabled && !verifyTotp(String(body.otp ?? ""), user.twoFactorSecret)) {
          return json(res, 202, {
            requiresTwoFactor: true,
            message: "Informe o codigo TOTP para concluir a autenticacao."
          });
        }

        const tenantId = body.tenantId ?? user.defaultTenantId ?? uniqueTenantIds(user)[0];
        const membership = getMembership(user, tenantId);
        if (!membership) return forbidden(res, "Usuario sem acesso ao condominio informado.");

        await database.mutate((db) => {
          const target = findUser(db, user.id);
          target.lastLoginAt = new Date().toISOString();
        });

        const token = signToken({
          sub: user.id,
          defaultTenantId: tenantId,
          tenantIds: uniqueTenantIds(user)
        });

        return json(
          res,
          200,
          {
            message: "Autenticado com sucesso.",
            session: buildSession(database.get(), findUser(database.get(), user.id), tenantId)
          },
          {
            "Set-Cookie": `session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`
          }
        );
      }

      if (pathname === "/api/auth/logout" && req.method === "POST") {
        return noContent(res, {
          "Set-Cookie": "session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
        });
      }

      if (!pathname.startsWith("/api")) {
        const staticPath =
          pathname === "/"
            ? path.join(PUBLIC_DIR, "index.html")
            : pathname === "/app"
              ? path.join(PUBLIC_DIR, "app.html")
              : pathname === "/segmentos"
                ? path.join(PUBLIC_DIR, "segmentos.html")
              : safeJoin(PUBLIC_DIR, pathname);

        if (sendStaticFile(res, staticPath)) return;
        return notFound(res);
      }

      if (pathname === "/api/session" && req.method === "GET") {
        if (!auth) return unauthorized(res);
        return json(res, 200, buildSession(db, auth.user, auth.tenantId));
      }

      if (pathname === "/api/events/stream" && req.method === "GET") {
        if (!auth) return unauthorized(res);
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive"
        });
        const client = {
          res,
          tenantIds: uniqueTenantIds(auth.user)
        };
        hub.add(client);
        res.write(`event: update\ndata: ${JSON.stringify({ tenantId: auth.tenantId, type: "stream.ready", createdAt: new Date().toISOString() })}\n\n`);
        req.on("close", () => {
          hub.remove(client);
        });
        return;
      }

      if (!auth) return unauthorized(res);

      if (pathname === "/api/condos" && req.method === "GET") {
        return json(
          res,
          200,
          uniqueTenantIds(auth.user)
            .map((tenantId) => findTenant(db, tenantId))
            .filter(Boolean)
        );
      }

      if (pathname === "/api/condos" && req.method === "POST") {
        if (!assertPermission(res, auth, "settings:write")) return;
        const body = await parseJsonBody(req);
        if (!body?.name || !body?.kind) return badRequest(res, "Informe nome e tipo do condominio.");
        const condo = await database.mutate((mutableDb) => {
          const created = {
            id: randomId("tenant"),
            name: body.name,
            kind: body.kind,
            address: body.address ?? "",
            timezone: body.timezone ?? "America/Sao_Paulo",
            config: {
              brandColor: body.brandColor ?? "#184e3b",
              freeTrialDays: 14,
              visitorCodeTtlMinutes: 240,
              allowOfflineMode: true,
              suspiciousDeniedThreshold: 3,
              notifications: ["push", "whatsapp"],
              biometricEnabled: true,
              facialRecognitionEnabled: false,
              remoteGateProviders: ["rest-relay"]
            },
            gates: [],
            cameras: []
          };
          mutableDb.condos.push(created);
          const owner = findUser(mutableDb, auth.user.id);
          owner.memberships.push({ tenantId: created.id, role: "administrator", unitIds: [] });
          return created;
        });
        pushRealtime(hub, condo.id, "tenant.created", condo);
        return json(res, 201, condo);
      }

      if (pathname === "/api/dashboard/overview" && req.method === "GET") {
        if (!assertPermission(res, auth, "dashboard:read")) return;
        return json(res, 200, summarizeDashboard(db, auth.tenantId));
      }

      if (pathname === "/api/users" && req.method === "GET") {
        if (!assertPermission(res, auth, "users:read")) return;
        const users = db.users.filter((user) => getMembership(user, auth.tenantId)).map((user) => sanitizeUser(user, auth.tenantId));
        return json(res, 200, users);
      }

      if (pathname === "/api/users" && req.method === "POST") {
        if (!assertPermission(res, auth, "users:write")) return;
        const body = await parseJsonBody(req);
        if (!body?.name || !body?.email || !body?.password || !body?.role) {
          return badRequest(res, "Campos obrigatorios: name, email, password, role.");
        }
        const allowedRoles = ["administrator", "syndic", "doorman", "resident"];
        if (!allowedRoles.includes(body.role)) return badRequest(res, "Role invalida.");

        const created = await database.mutate((mutableDb) => {
          if (mutableDb.users.some((user) => user.email.toLowerCase() === body.email.toLowerCase())) {
            throw new Error("Ja existe um usuario com este email.");
          }
          const prepared = {
            id: randomId("user"),
            name: body.name,
            email: body.email,
            passwordHash: hashPassword(body.password),
            phoneEnc: encryptSensitive(body.phone ?? ""),
            documentEnc: encryptSensitive(body.document ?? ""),
            status: body.status ?? "active",
            twoFactorEnabled: Boolean(body.twoFactorEnabled),
            twoFactorSecret: body.twoFactorEnabled ? generateTotpSecret() : "",
            twoFactorProvisioningUri: "",
            defaultTenantId: auth.tenantId,
            memberships: [
              {
                tenantId: auth.tenantId,
                role: body.role,
                unitIds: body.unitIds ?? []
              }
            ],
            createdAt: new Date().toISOString(),
            lastLoginAt: null
          };
          if (prepared.twoFactorEnabled) {
            prepared.twoFactorProvisioningUri = buildProvisioningUri({
              secret: prepared.twoFactorSecret,
              email: prepared.email
            });
          }
          mutableDb.users.push(prepared);
          createAuditLog(mutableDb, {
            tenantId: auth.tenantId,
            actorId: auth.user.id,
            action: "user.created",
            targetType: "user",
            targetId: prepared.id,
            details: { role: body.role, email: body.email }
          });
          return sanitizeUser(prepared, auth.tenantId);
        });
        return json(res, 201, created);
      }

      if (matchesRoute(pathname, /^\/api\/users\/([^/]+)$/) && req.method === "PATCH") {
        if (!assertPermission(res, auth, "users:write")) return;
        const [userId] = matchesRoute(pathname, /^\/api\/users\/([^/]+)$/);
        const body = await parseJsonBody(req);
        if (!body) return badRequest(res, "JSON invalido.");
        const updated = await database.mutate((mutableDb) => {
          const user = findUser(mutableDb, userId);
          if (!user || !getMembership(user, auth.tenantId)) throw new Error("Usuario nao encontrado.");
          if (body.name) user.name = body.name;
          if (body.status) user.status = body.status;
          if (body.phone) user.phoneEnc = encryptSensitive(body.phone);
          if (body.document) user.documentEnc = encryptSensitive(body.document);
          if (body.twoFactorEnabled !== undefined) {
            user.twoFactorEnabled = Boolean(body.twoFactorEnabled);
            if (user.twoFactorEnabled && !user.twoFactorSecret) {
              user.twoFactorSecret = generateTotpSecret();
              user.twoFactorProvisioningUri = buildProvisioningUri({ secret: user.twoFactorSecret, email: user.email });
            }
          }
          return sanitizeUser(user, auth.tenantId);
        });
        return json(res, 200, updated);
      }

      if (pathname === "/api/units" && req.method === "GET") {
        const units = db.units.filter((unit) => unit.tenantId === auth.tenantId && canSeeUnit(auth, unit.id));
        return json(res, 200, units);
      }

      if (pathname === "/api/units" && req.method === "POST") {
        if (!assertPermission(res, auth, "units:write")) return;
        const body = await parseJsonBody(req);
        if (!body?.label) return badRequest(res, "Informe ao menos o identificador da unidade.");
        const unit = await database.mutate((mutableDb) => {
          const created = {
            id: randomId("unit"),
            tenantId: auth.tenantId,
            label: body.label,
            block: body.block ?? "",
            floor: Number(body.floor ?? 0),
            type: body.type ?? "apartment"
          };
          mutableDb.units.push(created);
          createAuditLog(mutableDb, {
            tenantId: auth.tenantId,
            actorId: auth.user.id,
            action: "unit.created",
            targetType: "unit",
            targetId: created.id,
            details: { label: created.label }
          });
          return created;
        });
        return json(res, 201, unit);
      }

      if (pathname === "/api/contacts" && req.method === "GET") {
        if (!assertPermission(res, auth, "contacts:read")) return;
        return json(res, 200, db.contacts.filter((contact) => contact.tenantId === auth.tenantId).map(sanitizeContact));
      }

      if (pathname === "/api/contacts" && req.method === "POST") {
        if (!assertPermission(res, auth, "contacts:write")) return;
        const body = await parseJsonBody(req);
        if (!body?.name || !body?.type) return badRequest(res, "Campos obrigatorios: name e type.");
        const created = await database.mutate((mutableDb) => {
          const contact = {
            id: randomId("contact"),
            tenantId: auth.tenantId,
            type: body.type,
            name: body.name,
            company: body.company ?? "",
            phoneEnc: encryptSensitive(body.phone ?? ""),
            documentEnc: encryptSensitive(body.document ?? ""),
            notes: body.notes ?? "",
            approvedUnitIds: body.approvedUnitIds ?? [],
            lastVisitAt: null,
            createdAt: new Date().toISOString()
          };
          mutableDb.contacts.unshift(contact);
          createAuditLog(mutableDb, {
            tenantId: auth.tenantId,
            actorId: auth.user.id,
            action: "contact.created",
            targetType: "contact",
            targetId: contact.id,
            details: { type: contact.type, name: contact.name }
          });
          return sanitizeContact(contact);
        });
        pushRealtime(hub, auth.tenantId, "contact.created", created);
        return json(res, 201, created);
      }

      if (pathname === "/api/allowlists" && req.method === "GET") {
        if (!assertPermission(res, auth, "allowlists:read")) return;
        const allowLists = db.allowLists.filter((item) => item.tenantId === auth.tenantId && canSeeUnit(auth, item.unitId));
        return json(res, 200, allowLists);
      }

      if (pathname === "/api/allowlists" && req.method === "POST") {
        if (!assertPermission(res, auth, "allowlists:write")) return;
        const body = await parseJsonBody(req);
        if (!body?.unitId || !body?.contactId || !body?.validTo) {
          return badRequest(res, "Campos obrigatorios: unitId, contactId e validTo.");
        }
        if (auth.membership.role === "resident" && !canResidentChangeUnit(auth, body.unitId)) {
          return forbidden(res, "Somente moradores da unidade ou administradores podem criar autorizacoes.");
        }
        const created = await database.mutate((mutableDb) => {
          const item = {
            id: randomId("allow"),
            tenantId: auth.tenantId,
            unitId: body.unitId,
            residentUserId: body.residentUserId ?? auth.user.id,
            contactId: body.contactId,
            validFrom: body.validFrom ?? new Date().toISOString(),
            validTo: body.validTo,
            notes: body.notes ?? "",
            createdAt: new Date().toISOString()
          };
          mutableDb.allowLists.unshift(item);
          createAuditLog(mutableDb, {
            tenantId: auth.tenantId,
            actorId: auth.user.id,
            action: "allowlist.created",
            targetType: "allowlist",
            targetId: item.id,
            details: { unitId: item.unitId, contactId: item.contactId }
          });
          return item;
        });
        pushRealtime(hub, auth.tenantId, "allowlist.created", created);
        return json(res, 201, created);
      }

      if (pathname === "/api/visits" && req.method === "GET") {
        if (!assertPermission(res, auth, "visits:read")) return;
        const unitId = url.searchParams.get("unitId");
        const visits = db.visits.filter((visit) => visit.tenantId === auth.tenantId && (!unitId || visit.unitId === unitId) && canSeeUnit(auth, visit.unitId));
        return json(res, 200, visits.map((visit) => sanitizeVisit(db, visit)));
      }

      if (pathname === "/api/visits" && req.method === "POST") {
        if (!assertPermission(res, auth, "visits:write")) return;
        const body = await parseJsonBody(req);
        if (!body?.unitId || !body?.contactId || !body?.scheduledStartAt || !body?.scheduledEndAt) {
          return badRequest(res, "Campos obrigatorios: unitId, contactId, scheduledStartAt, scheduledEndAt.");
        }
        if (auth.membership.role === "resident" && !canResidentChangeUnit(auth, body.unitId)) {
          return forbidden(res, "Sem permissao para agendar nesta unidade.");
        }
        const created = await database.mutate((mutableDb) => {
          const resident = body.residentUserId ? findUser(mutableDb, body.residentUserId) : findResidentForUnit(mutableDb, auth.tenantId, body.unitId);
          const visit = {
            id: randomId("visit"),
            tenantId: auth.tenantId,
            unitId: body.unitId,
            residentUserId: resident?.id ?? auth.user.id,
            contactId: body.contactId,
            type: body.type ?? "visitor",
            scheduledStartAt: body.scheduledStartAt,
            scheduledEndAt: body.scheduledEndAt,
            status: body.status ?? (auth.membership.role === "resident" ? "approved" : "scheduled"),
            temporaryCode: generateTemporaryCode(),
            notes: body.notes ?? "",
            channelsNotified: body.channelsNotified ?? ["push", "whatsapp"],
            approvedByUserId: auth.user.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          mutableDb.visits.unshift(visit);

          const contact = findContact(mutableDb, visit.contactId);
          if (contact) contact.lastVisitAt = visit.createdAt;

          const tenant = findTenant(mutableDb, auth.tenantId);
          const residentUser = resident ?? auth.user;
          for (const channel of tenant.config.notifications) {
            emitNotification(mutableDb, auth.tenantId, channel, residentUser.name, `Nova visita agendada para a unidade ${findUnit(mutableDb, visit.unitId)?.label ?? visit.unitId}.`);
          }

          createAuditLog(mutableDb, {
            tenantId: auth.tenantId,
            actorId: auth.user.id,
            action: "visit.created",
            targetType: "visit",
            targetId: visit.id,
            details: { unitId: visit.unitId, contactId: visit.contactId }
          });
          return sanitizeVisit(mutableDb, visit);
        });
        pushRealtime(hub, auth.tenantId, "visit.created", created);
        await deliverWebhooks(database.get(), auth.tenantId, "visit.created", created);
        return json(res, 201, created);
      }

      if (matchesRoute(pathname, /^\/api\/visits\/([^/]+)\/authorize$/) && req.method === "POST") {
        if (!assertPermission(res, auth, "visits:write")) return;
        const [visitId] = matchesRoute(pathname, /^\/api\/visits\/([^/]+)\/authorize$/);
        const body = await parseJsonBody(req);
        const updated = await database.mutate((mutableDb) => {
          const visit = mutableDb.visits.find((item) => item.id === visitId && item.tenantId === auth.tenantId);
          if (!visit) throw new Error("Visita nao encontrada.");
          if (!canResidentChangeUnit(auth, visit.unitId) && !hasPermission(auth, "visits:write")) {
            throw new Error("Sem permissao para autorizar esta visita.");
          }
          visit.status = body?.status ?? "approved";
          visit.approvedByUserId = auth.user.id;
          visit.updatedAt = new Date().toISOString();
          return sanitizeVisit(mutableDb, visit);
        });
        pushRealtime(hub, auth.tenantId, "visit.updated", updated);
        await deliverWebhooks(database.get(), auth.tenantId, "visit.updated", updated);
        return json(res, 200, updated);
      }

      if (pathname === "/api/access-events" && req.method === "GET") {
        if (!assertPermission(res, auth, "access:read")) return;
        const events = filterTenantRecords(db.accessEvents, auth.tenantId, {
          startDate: url.searchParams.get("startDate"),
          endDate: url.searchParams.get("endDate"),
          unitId: url.searchParams.get("unitId"),
          userType: url.searchParams.get("userType")
        }).filter((event) => canSeeUnit(auth, event.unitId));
        return json(res, 200, events.map((event) => sanitizeAccessEvent(db, event)));
      }

      if (pathname === "/api/access-events" && req.method === "POST") {
        if (!assertPermission(res, auth, "access:write")) return;
        const body = await parseJsonBody(req);
        if (!body?.gateId || !body?.direction) return badRequest(res, "Campos obrigatorios: gateId e direction.");
        const tenant = findTenant(db, auth.tenantId);
        const gate = tenant?.gates.find((item) => item.id === body.gateId);
        if (!gate) return badRequest(res, "Gate invalido para o condominio atual.");

        const preparedEvent = await database.mutate((mutableDb) => {
          let status = body.status ?? "allowed";
          let displayName = body.displayName ?? "Acesso manual";
          let unitId = body.unitId ?? null;
          let subjectId = body.subjectId ?? auth.user.id;
          let userType = body.userType ?? auth.membership.role;
          let metadata = body.metadata ?? {};

          if (body.temporaryCode) {
            const visit = findVisitByCode(mutableDb, auth.tenantId, body.temporaryCode);
            if (!visit) {
              status = "denied";
              displayName = body.displayName ?? "Codigo temporario invalido";
              metadata = { ...metadata, reason: "temporary_code_invalid" };
            } else {
              status = "allowed";
              displayName = findContact(mutableDb, visit.contactId)?.name ?? displayName;
              unitId = visit.unitId;
              subjectId = visit.contactId;
              userType = visit.type;
              visit.status = body.direction === "entry" ? "in-progress" : "completed";
              visit.updatedAt = new Date().toISOString();
            }
          }

          const event = {
            id: randomId("event"),
            tenantId: auth.tenantId,
            gateId: body.gateId,
            unitId,
            userType,
            subjectId,
            displayName,
            direction: body.direction,
            method: body.method ?? "MANUAL",
            status,
            createdAt: new Date().toISOString(),
            metadata
          };
          mutableDb.accessEvents.unshift(event);
          mutableDb.accessEvents = mutableDb.accessEvents.slice(0, 1000);
          evaluateSuspiciousActivity(mutableDb, hub, event);
          createAuditLog(mutableDb, {
            tenantId: auth.tenantId,
            actorId: auth.user.id,
            action: "access.created",
            targetType: "access-event",
            targetId: event.id,
            details: { gateId: event.gateId, status: event.status, method: event.method }
          });
          return sanitizeAccessEvent(mutableDb, event);
        });

        pushRealtime(hub, auth.tenantId, "access.created", preparedEvent);
        await deliverWebhooks(database.get(), auth.tenantId, "access.created", preparedEvent);
        return json(res, 201, preparedEvent);
      }

      if (matchesRoute(pathname, /^\/api\/gates\/([^/]+)\/open$/) && req.method === "POST") {
        if (!assertPermission(res, auth, "access:remote")) return;
        const [gateId] = matchesRoute(pathname, /^\/api\/gates\/([^/]+)\/open$/);
        const gate = findTenant(db, auth.tenantId)?.gates.find((item) => item.id === gateId);
        if (!gate) return notFound(res, "Gate nao encontrado no condominio ativo.");

        const idempotencyKey = String(req.headers["idempotency-key"] ?? "").trim();
        if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
          return badRequest(res, "Envie um Idempotency-Key entre 8 e 128 caracteres.");
        }
        const body = await parseJsonBody(req);
        if (body === null) return badRequest(res, "JSON invalido.");
        const ttlSeconds = Number(body.expiresInSeconds ?? 10);
        if (!Number.isInteger(ttlSeconds) || ttlSeconds < 3 || ttlSeconds > 30) {
          return badRequest(res, "expiresInSeconds deve ser um inteiro entre 3 e 30.");
        }
        const issuedAt = body.issuedAt ? new Date(body.issuedAt) : new Date();
        if (Number.isNaN(issuedAt.getTime()) || Math.abs(Date.now() - issuedAt.getTime()) > 30_000) {
          return badRequest(res, "Comando expirado ou com horario de emissao invalido.");
        }

        const result = await database.mutate((mutableDb) => {
          mutableDb.gateCommands ??= [];
          const existing = mutableDb.gateCommands.find(
            (item) => item.tenantId === auth.tenantId && item.gateId === gateId && item.idempotencyKey === idempotencyKey
          );
          if (existing) return { command: existing, replayed: true };

          const cooldownCutoff = Date.now() - 5_000;
          const duplicate = mutableDb.gateCommands.find(
            (item) =>
              item.tenantId === auth.tenantId &&
              item.gateId === gateId &&
              item.actorId === auth.user.id &&
              new Date(item.createdAt).getTime() >= cooldownCutoff
          );
          if (duplicate) return { blocked: true };

          const createdAt = new Date().toISOString();
          const command = {
            id: randomId("gatecmd"),
            tenantId: auth.tenantId,
            gateId,
            actorId: auth.user.id,
            actorRole: auth.membership.role,
            idempotencyKey,
            status: "simulated",
            integrationMode: "simulation",
            createdAt,
            expiresAt: new Date(Date.now() + ttlSeconds * 1_000).toISOString()
          };
          mutableDb.gateCommands.unshift(command);
          mutableDb.gateCommands = mutableDb.gateCommands.slice(0, 1000);
          createAuditLog(mutableDb, {
            tenantId: auth.tenantId,
            actorId: auth.user.id,
            action: "gate.open_command.created",
            targetType: "gate-command",
            targetId: command.id,
            details: {
              gateId,
              gateName: gate.name,
              actorRole: auth.membership.role,
              expiresAt: command.expiresAt,
              integrationMode: command.integrationMode
            }
          });
          return { command, replayed: false };
        });
        if (result.blocked) return conflict(res, "Comando repetido bloqueado pelo intervalo de seguranca de 5 segundos.");
        if (!result.replayed) pushRealtime(hub, auth.tenantId, "gate.open_command.created", result.command);
        return json(res, result.replayed ? 200 : 202, {
          message: result.replayed ? "Resultado idempotente recuperado." : `Comando simulado registrado para ${gate.name}.`,
          command: result.command,
          replayed: result.replayed,
          warning: "Nenhum equipamento fisico foi acionado: o provedor atual e uma simulacao."
        });
      }

      if (pathname === "/api/alerts" && req.method === "GET") {
        if (!assertPermission(res, auth, "alerts:read")) return;
        return json(res, 200, db.alerts.filter((alert) => alert.tenantId === auth.tenantId));
      }

      if (pathname === "/api/integrations/devices" && req.method === "GET") {
        if (!assertPermission(res, auth, "integrations:read")) return;
        return json(res, 200, db.deviceIntegrations.filter((device) => device.tenantId === auth.tenantId));
      }

      if (pathname === "/api/integrations/devices" && req.method === "POST") {
        if (!assertPermission(res, auth, "integrations:write")) return;
        const body = await parseJsonBody(req);
        if (!body?.name || !body?.type) return badRequest(res, "Campos obrigatorios: name e type.");
        const device = await database.mutate((mutableDb) => {
          const created = {
            id: randomId("device"),
            tenantId: auth.tenantId,
            name: body.name,
            type: body.type,
            protocol: body.protocol ?? "REST",
            status: body.status ?? "online",
            ipAddress: body.ipAddress ?? "",
            lastSeenAt: new Date().toISOString()
          };
          mutableDb.deviceIntegrations.unshift(created);
          return created;
        });
        pushRealtime(hub, auth.tenantId, "device.created", device);
        return json(res, 201, device);
      }

      if (pathname === "/api/integrations/webhooks" && req.method === "GET") {
        if (!assertPermission(res, auth, "integrations:read")) return;
        return json(res, 200, db.webhooks.filter((webhook) => webhook.tenantId === auth.tenantId));
      }

      if (pathname === "/api/integrations/webhooks" && req.method === "POST") {
        if (!assertPermission(res, auth, "integrations:write")) return;
        const body = await parseJsonBody(req);
        if (!body?.url || !Array.isArray(body.eventTypes)) {
          return badRequest(res, "Campos obrigatorios: url e eventTypes.");
        }
        const webhook = await database.mutate((mutableDb) => {
          const created = {
            id: randomId("wh"),
            tenantId: auth.tenantId,
            url: body.url,
            eventTypes: body.eventTypes,
            secret: body.secret ?? randomId("secret"),
            status: "configured",
            lastDeliveryAt: null,
            lastPayload: null
          };
          mutableDb.webhooks.unshift(created);
          return created;
        });
        return json(res, 201, webhook);
      }

      if (matchesRoute(pathname, /^\/api\/integrations\/webhooks\/([^/]+)\/test$/) && req.method === "POST") {
        if (!assertPermission(res, auth, "integrations:write")) return;
        const [webhookId] = matchesRoute(pathname, /^\/api\/integrations\/webhooks\/([^/]+)\/test$/);
        const webhook = db.webhooks.find((item) => item.id === webhookId && item.tenantId === auth.tenantId);
        if (!webhook) return notFound(res, "Webhook nao encontrado.");
        await deliverWebhooks(database.get(), auth.tenantId, webhook.eventTypes[0], {
          test: true,
          webhookId: webhook.id
        });
        return json(res, 200, { message: "Entrega de teste disparada." });
      }

      if (pathname === "/api/billing/plans" && req.method === "GET") {
        return json(res, 200, db.plans);
      }

      if (pathname === "/api/billing/subscription" && req.method === "GET") {
        if (!assertPermission(res, auth, "billing:read")) return;
        return json(res, 200, db.subscriptions.find((subscription) => subscription.tenantId === auth.tenantId) ?? null);
      }

      if (pathname === "/api/billing/subscribe" && req.method === "POST") {
        if (!assertPermission(res, auth, "billing:write")) return;
        const body = await parseJsonBody(req);
        if (!body?.planId) return badRequest(res, "Informe o planId.");
        const plan = db.plans.find((item) => item.id === body.planId);
        if (!plan) return badRequest(res, "Plano nao encontrado.");
        const subscription = await database.mutate((mutableDb) => {
          const existing = mutableDb.subscriptions.find((item) => item.tenantId === auth.tenantId);
          if (existing) {
            existing.planId = plan.id;
            existing.status = existing.status === "trialing" ? "trialing" : "active";
            existing.nextBillingAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            return existing;
          }
          const created = {
            id: randomId("sub"),
            tenantId: auth.tenantId,
            planId: plan.id,
            status: "trialing",
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            nextBillingAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            unitCount: db.units.filter((unit) => unit.tenantId === auth.tenantId).length,
            accessVolume: db.accessEvents.filter((event) => event.tenantId === auth.tenantId).length
          };
          mutableDb.subscriptions.push(created);
          return created;
        });
        pushRealtime(hub, auth.tenantId, "billing.updated", subscription);
        return json(res, 200, subscription);
      }

      if (pathname === "/api/reports/flow" && req.method === "GET") {
        if (!assertPermission(res, auth, "reports:read")) return;
        const report = buildFlowReport(db.accessEvents, auth.tenantId, {
          startDate: url.searchParams.get("startDate"),
          endDate: url.searchParams.get("endDate"),
          unitId: url.searchParams.get("unitId"),
          userType: url.searchParams.get("userType")
        });
        report.rows = report.rows.filter((row) => canSeeUnit(auth, row.unitId));
        return json(res, 200, report);
      }

      if (pathname === "/api/exports/access-events.csv" && req.method === "GET") {
        if (!assertPermission(res, auth, "reports:read")) return;
        const rows = filterTenantRecords(db.accessEvents, auth.tenantId, {
          startDate: url.searchParams.get("startDate"),
          endDate: url.searchParams.get("endDate"),
          unitId: url.searchParams.get("unitId"),
          userType: url.searchParams.get("userType")
        }).filter((row) => canSeeUnit(auth, row.unitId));
        const csv = toCsv(rows, [
          { key: "createdAt", label: "Data" },
          { key: "displayName", label: "Pessoa" },
          { key: "userType", label: "Tipo" },
          { key: "direction", label: "Direcao" },
          { key: "method", label: "Metodo" },
          { key: "status", label: "Status" }
        ]);
        return binary(res, 200, Buffer.from(csv, "utf8"), "text/csv; charset=utf-8", {
          "Content-Disposition": "attachment; filename=acessos.csv"
        });
      }

      if (pathname === "/api/exports/access-events.pdf" && req.method === "GET") {
        if (!assertPermission(res, auth, "reports:read")) return;
        const rows = filterTenantRecords(db.accessEvents, auth.tenantId, {
          startDate: url.searchParams.get("startDate"),
          endDate: url.searchParams.get("endDate"),
          unitId: url.searchParams.get("unitId"),
          userType: url.searchParams.get("userType")
        })
          .filter((row) => canSeeUnit(auth, row.unitId))
          .slice(0, 25);
        const pdf = buildSimplePdf(
          `Relatorio de acessos - ${findTenant(db, auth.tenantId)?.name ?? auth.tenantId}`,
          rows.map((row) => `${row.createdAt} | ${row.displayName} | ${row.method} | ${row.status}`)
        );
        return binary(res, 200, pdf, "application/pdf", {
          "Content-Disposition": "attachment; filename=acessos.pdf"
        });
      }

      if (pathname === "/api/notifications" && req.method === "GET") {
        return json(res, 200, db.notificationLog.filter((item) => item.tenantId === auth.tenantId));
      }

      if (pathname === "/api/assistant/triage" && req.method === "POST") {
        if (!assertPermission(res, auth, "assistant:use")) return;
        const body = await parseJsonBody(req);
        const dashboard = summarizeDashboard(db, auth.tenantId);
        const hints = [];
        if (dashboard.alerts.length) {
          hints.push("Ha alertas abertos. Priorize a verificacao das tentativas negadas e dispositivos em manutencao.");
        }
        if (dashboard.pendingVisits.length) {
          hints.push(`Existem ${dashboard.pendingVisits.length} visitas pendentes ou aprovadas aguardando fluxo.`);
        }
        if (dashboard.gates.some((gate) => gate.status !== "online")) {
          hints.push("Pelo menos um ponto de acesso esta fora do estado ideal; operar em contingencia manual pode ser necessario.");
        }
        if (body?.message) {
          hints.push(`Pergunta do operador: ${body.message}`);
        }
        return json(res, 200, {
          summary: "Assistente operacional pronto para orientar a portaria.",
          hints,
          suggestedActions: [
            "Validar se o visitante possui visita ativa ou autorizacao recorrente.",
            "Conferir se a camera vinculada ao gate esta online antes da liberacao remota.",
            "Registrar toda decisao manual para manter trilha de auditoria completa."
          ]
        });
      }

      if (pathname === "/api/recognition/mock-verify" && req.method === "POST") {
        const body = await parseJsonBody(req);
        if (!body?.subjectId || !body?.faceSignature) return badRequest(res, "Campos obrigatorios: subjectId e faceSignature.");
        const score = Number.parseInt(crypto.createHash("sha1").update(`${body.subjectId}:${body.faceSignature}`).digest("hex").slice(0, 2), 16) / 255;
        return json(res, 200, {
          matched: score > 0.62,
          confidence: Number(score.toFixed(2)),
          provider: "mock-face-engine",
          note: "Endpoint de simulacao para futuras integracoes de reconhecimento facial."
        });
      }
      return notFound(res);
    } catch (error) {
      return serverError(res, error);
    }
  };
}
