import {
  buildProvisioningUri,
  encryptSensitive,
  generateTemporaryCode,
  generateTotpSecret,
  hashPassword
} from "./utils/security.mjs";

function nowIso() {
  return new Date().toISOString();
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function createDemoDatabase() {
  const now = new Date();
  const adminTotpSecret = generateTotpSecret();

  const condos = [
    {
      id: "tenant_solaris",
      name: "Residencial Solaris",
      kind: "residential",
      address: "Av. das Palmeiras, 1100 - Sao Paulo/SP",
      timezone: "America/Sao_Paulo",
      config: {
        brandColor: "#a84f33",
        freeTrialDays: 14,
        visitorCodeTtlMinutes: 240,
        allowOfflineMode: true,
        suspiciousDeniedThreshold: 3,
        notifications: ["push", "whatsapp", "sms"],
        biometricEnabled: true,
        facialRecognitionEnabled: true,
        remoteGateProviders: ["mqtt", "rest-relay"]
      },
      gates: [
        { id: "gate_sol_main", name: "Portaria Principal", mode: "hybrid", status: "online", deviceType: "qr-rfid", lastHeartbeatAt: nowIso() },
        { id: "gate_sol_garage", name: "Garagem", mode: "automated", status: "online", deviceType: "rfid", lastHeartbeatAt: nowIso() }
      ],
      cameras: [
        { id: "cam_sol_1", name: "Hall Principal", provider: "CFTV Local", status: "online" },
        { id: "cam_sol_2", name: "Entrada de Veiculos", provider: "CFTV Local", status: "online" }
      ]
    },
    {
      id: "tenant_atrium",
      name: "Atrium Corporate Towers",
      kind: "commercial",
      address: "Rua do Comercio, 450 - Campinas/SP",
      timezone: "America/Sao_Paulo",
      config: {
        brandColor: "#245a49",
        freeTrialDays: 7,
        visitorCodeTtlMinutes: 180,
        allowOfflineMode: true,
        suspiciousDeniedThreshold: 2,
        notifications: ["push", "whatsapp"],
        biometricEnabled: true,
        facialRecognitionEnabled: false,
        remoteGateProviders: ["rest-relay"]
      },
      gates: [
        { id: "gate_atrium_lobby", name: "Lobby", mode: "manual", status: "online", deviceType: "biometric", lastHeartbeatAt: nowIso() },
        { id: "gate_atrium_service", name: "Carga e Descarga", mode: "hybrid", status: "maintenance", deviceType: "qr-rfid", lastHeartbeatAt: addHours(now, -3) }
      ],
      cameras: [
        { id: "cam_atrium_1", name: "Recepcao", provider: "SecureVision", status: "online" },
        { id: "cam_atrium_2", name: "Doca", provider: "SecureVision", status: "offline" }
      ]
    }
  ];

  const units = [
    { id: "unit_sol_101", tenantId: "tenant_solaris", label: "101", block: "A", floor: 1, type: "apartment" },
    { id: "unit_sol_202", tenantId: "tenant_solaris", label: "202", block: "A", floor: 2, type: "apartment" },
    { id: "unit_atr_1201", tenantId: "tenant_atrium", label: "1201", block: "Tower North", floor: 12, type: "office" },
    { id: "unit_atr_905", tenantId: "tenant_atrium", label: "905", block: "Tower South", floor: 9, type: "office" }
  ];

  const users = [
    {
      id: "user_admin",
      name: "Aline Rocha",
      email: "admin@portaria360.local",
      passwordHash: hashPassword("Admin@123"),
      phoneEnc: encryptSensitive("11999887766"),
      documentEnc: encryptSensitive("12345678900"),
      status: "active",
      twoFactorEnabled: false,
      twoFactorSecret: adminTotpSecret,
      twoFactorProvisioningUri: buildProvisioningUri({ secret: adminTotpSecret, email: "admin@portaria360.local" }),
      defaultTenantId: "tenant_solaris",
      memberships: [
        { tenantId: "tenant_solaris", role: "administrator", unitIds: [] },
        { tenantId: "tenant_atrium", role: "administrator", unitIds: [] }
      ],
      createdAt: nowIso(),
      lastLoginAt: null
    },
    {
      id: "user_sindico",
      name: "Carlos Menezes",
      email: "sindico@solaris.local",
      passwordHash: hashPassword("Sindico@123"),
      phoneEnc: encryptSensitive("11911112222"),
      documentEnc: encryptSensitive("24681012141"),
      status: "active",
      twoFactorEnabled: false,
      twoFactorSecret: "",
      defaultTenantId: "tenant_solaris",
      memberships: [{ tenantId: "tenant_solaris", role: "syndic", unitIds: ["unit_sol_202"] }],
      createdAt: nowIso(),
      lastLoginAt: null
    },
    {
      id: "user_portaria",
      name: "Patricia Lima",
      email: "porteiro@solaris.local",
      passwordHash: hashPassword("Porteiro@123"),
      phoneEnc: encryptSensitive("11933334444"),
      documentEnc: encryptSensitive("99888777666"),
      status: "active",
      twoFactorEnabled: false,
      twoFactorSecret: "",
      defaultTenantId: "tenant_solaris",
      memberships: [{ tenantId: "tenant_solaris", role: "doorman", unitIds: [] }],
      createdAt: nowIso(),
      lastLoginAt: null
    },
    {
      id: "user_moradora",
      name: "Mariana Costa",
      email: "mariana@solaris.local",
      passwordHash: hashPassword("Morador@123"),
      phoneEnc: encryptSensitive("11955556666"),
      documentEnc: encryptSensitive("55044033022"),
      status: "active",
      twoFactorEnabled: false,
      twoFactorSecret: "",
      defaultTenantId: "tenant_solaris",
      memberships: [{ tenantId: "tenant_solaris", role: "resident", unitIds: ["unit_sol_101"] }],
      createdAt: nowIso(),
      lastLoginAt: null
    },
    {
      id: "user_atrium_ops",
      name: "Roberto Alves",
      email: "operacoes@atrium.local",
      passwordHash: hashPassword("Operacoes@123"),
      phoneEnc: encryptSensitive("19977778888"),
      documentEnc: encryptSensitive("33221100448"),
      status: "active",
      twoFactorEnabled: true,
      twoFactorSecret: generateTotpSecret(),
      defaultTenantId: "tenant_atrium",
      memberships: [{ tenantId: "tenant_atrium", role: "administrator", unitIds: [] }],
      createdAt: nowIso(),
      lastLoginAt: null
    }
  ];

  const contacts = [
    {
      id: "contact_visitante_ana",
      tenantId: "tenant_solaris",
      type: "visitor",
      name: "Ana Ribeiro",
      company: "",
      phoneEnc: encryptSensitive("11922223333"),
      documentEnc: encryptSensitive("10120230344"),
      notes: "Visitante recorrente da unidade 101",
      approvedUnitIds: ["unit_sol_101"],
      lastVisitAt: addHours(now, -6),
      createdAt: addHours(now, -240)
    },
    {
      id: "contact_tecnico_lucas",
      tenantId: "tenant_solaris",
      type: "service",
      name: "Lucas Prado",
      company: "Elevadores Atlas",
      phoneEnc: encryptSensitive("11967676767"),
      documentEnc: encryptSensitive("02030405060"),
      notes: "Manutencao preventiva",
      approvedUnitIds: [],
      lastVisitAt: addHours(now, -72),
      createdAt: addHours(now, -200)
    },
    {
      id: "contact_juliana",
      tenantId: "tenant_atrium",
      type: "visitor",
      name: "Juliana Freitas",
      company: "Cliente Externo",
      phoneEnc: encryptSensitive("19912344321"),
      documentEnc: encryptSensitive("78945612300"),
      notes: "Reuniao comercial",
      approvedUnitIds: ["unit_atr_1201"],
      lastVisitAt: addHours(now, -4),
      createdAt: addHours(now, -60)
    }
  ];

  const allowLists = [
    {
      id: "allow_ana_101",
      tenantId: "tenant_solaris",
      unitId: "unit_sol_101",
      residentUserId: "user_moradora",
      contactId: "contact_visitante_ana",
      validFrom: addHours(now, -2),
      validTo: addHours(now, 12),
      notes: "Liberada para almoco de familia",
      createdAt: addHours(now, -2)
    }
  ];

  const visits = [
    {
      id: "visit_ana_today",
      tenantId: "tenant_solaris",
      unitId: "unit_sol_101",
      residentUserId: "user_moradora",
      contactId: "contact_visitante_ana",
      type: "visitor",
      scheduledStartAt: addHours(now, -1),
      scheduledEndAt: addHours(now, 4),
      status: "approved",
      temporaryCode: generateTemporaryCode(),
      notes: "Almoco de familia",
      channelsNotified: ["push", "whatsapp"],
      approvedByUserId: "user_moradora",
      createdAt: addHours(now, -3),
      updatedAt: addHours(now, -2)
    },
    {
      id: "visit_lucas_service",
      tenantId: "tenant_solaris",
      unitId: "unit_sol_202",
      residentUserId: "user_sindico",
      contactId: "contact_tecnico_lucas",
      type: "service",
      scheduledStartAt: addHours(now, 1),
      scheduledEndAt: addHours(now, 5),
      status: "scheduled",
      temporaryCode: generateTemporaryCode(),
      notes: "Troca de sensor do elevador",
      channelsNotified: ["push"],
      approvedByUserId: "user_sindico",
      createdAt: addHours(now, -1),
      updatedAt: addHours(now, -1)
    },
    {
      id: "visit_juliana",
      tenantId: "tenant_atrium",
      unitId: "unit_atr_1201",
      residentUserId: "user_atrium_ops",
      contactId: "contact_juliana",
      type: "visitor",
      scheduledStartAt: addHours(now, -2),
      scheduledEndAt: addHours(now, 1),
      status: "in-progress",
      temporaryCode: generateTemporaryCode(),
      notes: "Reuniao com diretoria",
      channelsNotified: ["push", "whatsapp"],
      approvedByUserId: "user_atrium_ops",
      createdAt: addHours(now, -4),
      updatedAt: addHours(now, -2)
    }
  ];

  const accessEvents = [
    {
      id: "event_1",
      tenantId: "tenant_solaris",
      gateId: "gate_sol_main",
      unitId: "unit_sol_101",
      userType: "visitor",
      subjectId: "contact_visitante_ana",
      displayName: "Ana Ribeiro",
      direction: "entry",
      method: "TEMP_CODE",
      status: "allowed",
      createdAt: addHours(now, -1),
      metadata: { vehiclePlate: "BRA2E19" }
    },
    {
      id: "event_2",
      tenantId: "tenant_solaris",
      gateId: "gate_sol_garage",
      unitId: "unit_sol_101",
      userType: "resident",
      subjectId: "user_moradora",
      displayName: "Mariana Costa",
      direction: "entry",
      method: "REMOTE_APP",
      status: "allowed",
      createdAt: addHours(now, -0.5),
      metadata: {}
    },
    {
      id: "event_3",
      tenantId: "tenant_atrium",
      gateId: "gate_atrium_lobby",
      unitId: "unit_atr_1201",
      userType: "visitor",
      subjectId: "contact_juliana",
      displayName: "Juliana Freitas",
      direction: "entry",
      method: "BIOMETRY",
      status: "allowed",
      createdAt: addHours(now, -1.25),
      metadata: {}
    },
    {
      id: "event_4",
      tenantId: "tenant_atrium",
      gateId: "gate_atrium_service",
      unitId: "unit_atr_905",
      userType: "service",
      subjectId: "unknown",
      displayName: "Tentativa nao autorizada",
      direction: "entry",
      method: "RFID",
      status: "denied",
      createdAt: addHours(now, -0.3),
      metadata: { reason: "Tag nao cadastrada" }
    }
  ];

  const alerts = [
    {
      id: "alert_gate_maintenance",
      tenantId: "tenant_atrium",
      type: "device",
      severity: "medium",
      title: "Leitor da doca em manutencao",
      description: "O gate_atrium_service reportou falha de sincronizacao e opera em modo manual.",
      createdAt: addHours(now, -3),
      resolvedAt: null
    }
  ];

  const notificationLog = [
    {
      id: "notif_1",
      tenantId: "tenant_solaris",
      channel: "whatsapp",
      to: "Mariana Costa",
      message: "Ana Ribeiro foi autorizada para a unidade 101.",
      status: "delivered",
      createdAt: addHours(now, -2)
    }
  ];

  const webhooks = [
    {
      id: "wh_1",
      tenantId: "tenant_solaris",
      url: "https://example.invalid/portaria360",
      eventTypes: ["access.created", "visit.created", "alert.created"],
      secret: "webhook-demo-secret",
      status: "configured",
      lastDeliveryAt: null,
      lastPayload: null
    }
  ];

  const deviceIntegrations = [
    {
      id: "device_sol_reader_1",
      tenantId: "tenant_solaris",
      name: "Leitor Principal QR/RFID",
      type: "reader",
      protocol: "REST",
      status: "online",
      ipAddress: "10.0.0.15",
      lastSeenAt: nowIso()
    },
    {
      id: "device_sol_gate_iot",
      tenantId: "tenant_solaris",
      name: "Controlador do Portao",
      type: "iot-gateway",
      protocol: "MQTT",
      status: "online",
      ipAddress: "10.0.0.31",
      lastSeenAt: nowIso()
    },
    {
      id: "device_atrium_face_1",
      tenantId: "tenant_atrium",
      name: "Terminal Biometrico Lobby",
      type: "biometric",
      protocol: "REST",
      status: "online",
      ipAddress: "10.1.0.12",
      lastSeenAt: nowIso()
    }
  ];

  const plans = [
    {
      id: "plan_start",
      name: "Start",
      maxUnits: 100,
      maxMonthlyAccesses: 10000,
      monthlyPrice: 499,
      features: ["Dashboard em tempo real", "App do morador", "QR e codigo temporario", "Webhooks"]
    },
    {
      id: "plan_scale",
      name: "Scale",
      maxUnits: 500,
      maxMonthlyAccesses: 75000,
      monthlyPrice: 1499,
      features: ["Multi-condominio", "2FA", "Integracao IoT", "Alertas avancados", "CFTV"]
    },
    {
      id: "plan_enterprise",
      name: "Enterprise",
      maxUnits: 5000,
      maxMonthlyAccesses: 1000000,
      monthlyPrice: 4990,
      features: ["White-label", "SLA dedicado", "Fila de eventos", "Portaria remota", "Face recognition"]
    }
  ];

  const subscriptions = [
    {
      id: "sub_solaris",
      tenantId: "tenant_solaris",
      planId: "plan_scale",
      status: "trialing",
      trialEndsAt: addHours(now, 24 * 10),
      nextBillingAt: addHours(now, 24 * 10),
      unitCount: 220,
      accessVolume: 13800
    },
    {
      id: "sub_atrium",
      tenantId: "tenant_atrium",
      planId: "plan_enterprise",
      status: "active",
      trialEndsAt: null,
      nextBillingAt: addHours(now, 24 * 18),
      unitCount: 480,
      accessVolume: 59200
    }
  ];

  return {
    meta: {
      createdAt: nowIso(),
      updatedAt: nowIso(),
      version: 1
    },
    condos,
    units,
    users,
    contacts,
    allowLists,
    visits,
    accessEvents,
    alerts,
    notificationLog,
    webhooks,
    deviceIntegrations,
    plans,
    subscriptions,
    auditLogs: []
  };
}
