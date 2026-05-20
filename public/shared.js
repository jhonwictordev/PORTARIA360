const state = {
  session: null,
  tenantId: null,
  stream: null
};

const LABELS = {
  roles: {
    administrator: "Administrador",
    syndic: "Síndico",
    doorman: "Porteiro",
    resident: "Morador"
  },
  visitTypes: {
    visitor: "Visitante",
    service: "Prestador"
  },
  statuses: {
    active: "Ativo",
    allowed: "Liberado",
    approved: "Autorizada",
    configured: "Configurado",
    delivered: "Entregue",
    denied: "Negado",
    in_progress: "Em andamento",
    "in-progress": "Em andamento",
    maintenance: "Em manutenção",
    offline: "Offline",
    online: "Online",
    pending: "Pendente",
    resolved: "Resolvido",
    scheduled: "Agendada",
    trialing: "Período de teste"
  },
  methods: {
    BIOMETRY: "Biometria",
    MANUAL: "Manual",
    QR_CODE: "QR Code",
    REMOTE_APP: "App do morador",
    REMOTE_DESK: "Portaria remota",
    RFID: "RFID",
    TEMP_CODE: "Código temporário",
    biometric: "Biometria",
    manual: "Manual",
    qr_code: "QR Code",
    remote_app: "App do morador",
    remote_desk: "Portaria remota",
    rfid: "RFID",
    temp_code: "Código temporário"
  },
  channels: {
    email: "E-mail",
    push: "Push",
    sms: "SMS",
    whatsapp: "WhatsApp"
  },
  deviceTypes: {
    biometric: "Biometria",
    camera: "Câmera",
    controller: "Controladora",
    gate: "Portão",
    "iot-gateway": "Gateway IoT",
    intercom: "Interfone",
    qr: "QR Code",
    "qr-rfid": "QR Code + RFID",
    reader: "Leitor",
    rfid: "RFID",
    "rfid-reader": "Leitor RFID",
    "rfid_reader": "Leitor RFID"
  },
  modes: {
    automated: "Automatizado",
    hybrid: "Híbrido",
    manual: "Manual",
    remote: "Remoto"
  }
};

function toast(message) {
  window.alert(message);
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function titleize(value) {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function normalizeCopy(value) {
  if (value == null) return "-";

  return String(value)
    .replace(/\bSao\b/g, "São")
    .replace(/\bnao\b/g, "não")
    .replace(/\bNao\b/g, "Não")
    .replace(/\bcondominio\b/g, "condomínio")
    .replace(/\bcondominios\b/g, "condomínios")
    .replace(/\bCondominio\b/g, "Condomínio")
    .replace(/\bCondominios\b/g, "Condomínios")
    .replace(/\bcondominial\b/g, "condominial")
    .replace(/\bcomercio\b/g, "comércio")
    .replace(/\bComercio\b/g, "Comércio")
    .replace(/\bRecepcao\b/g, "Recepção")
    .replace(/\bVeiculos\b/g, "Veículos")
    .replace(/\bCodigo\b/g, "Código")
    .replace(/\bcodigo\b/g, "código")
    .replace(/\bInicio\b/g, "Início")
    .replace(/\binicio\b/g, "início")
    .replace(/\bAcao\b/g, "Ação")
    .replace(/\bacao\b/g, "ação")
    .replace(/\bAcoes\b/g, "Ações")
    .replace(/\bacoes\b/g, "ações")
    .replace(/\bOperacao\b/g, "Operação")
    .replace(/\boperacao\b/g, "operação")
    .replace(/\bSeguranca\b/g, "Segurança")
    .replace(/\bseguranca\b/g, "segurança")
    .replace(/\bHistorico\b/g, "Histórico")
    .replace(/\bhistorico\b/g, "histórico")
    .replace(/\bRelatorios\b/g, "Relatórios")
    .replace(/\brelatorios\b/g, "relatórios")
    .replace(/\bIntegracao\b/g, "Integração")
    .replace(/\bintegracao\b/g, "integração")
    .replace(/\bIntegracoes\b/g, "Integrações")
    .replace(/\bintegracoes\b/g, "integrações")
    .replace(/\bConfigurado\b/g, "Configurado")
    .replace(/\btemporario\b/g, "temporário")
    .replace(/\bTemporario\b/g, "Temporário")
    .replace(/\btemporaria\b/g, "temporária")
    .replace(/\bTemporaria\b/g, "Temporária")
    .replace(/\bAutorizacao\b/g, "Autorização")
    .replace(/\bautorizacao\b/g, "autorização")
    .replace(/\bAutorizacoes\b/g, "Autorizações")
    .replace(/\bautorizacoes\b/g, "autorizações")
    .replace(/\bObservacao\b/g, "Observação")
    .replace(/\bObservacoes\b/g, "Observações")
    .replace(/\bobservacoes\b/g, "observações")
    .replace(/\bValido\b/g, "Válido")
    .replace(/\bvalido\b/g, "válido")
    .replace(/\bProxima\b/g, "Próxima")
    .replace(/\bproxima\b/g, "próxima")
    .replace(/\bUltimo\b/g, "�sltimo")
    .replace(/\bultimo\b/g, "último")
    .replace(/\bconexao\b/g, "conexão")
    .replace(/\bConexao\b/g, "Conexão")
    .replace(/\bconfigurado\b/g, "configurado")
    .replace(/\bperiodo\b/g, "período")
    .replace(/\bPeriodo\b/g, "Período")
    .replace(/\bservico\b/g, "serviço")
    .replace(/\bServico\b/g, "Serviço")
    .replace(/\bprestacao\b/g, "prestação")
    .replace(/\bPrestacao\b/g, "Prestação")
    .replace(/\bmanutencao\b/g, "manutenção")
    .replace(/\bManutencao\b/g, "Manutenção")
    .replace(/\bsincronizacao\b/g, "sincronização")
    .replace(/\bSincronizacao\b/g, "Sincronização")
    .replace(/\bportao\b/g, "portão")
    .replace(/\bPortao\b/g, "Portão")
    .replace(/\bBiometrico\b/g, "Biométrico")
    .replace(/\bbiometrico\b/g, "biométrico")
    .replace(/\breuniao\b/g, "reunião")
    .replace(/\bReuniao\b/g, "Reunião")
    .replace(/\balmoco\b/g, "almoço")
    .replace(/\bAlmoco\b/g, "Almoço")
    .replace(/\bfamilia\b/g, "família")
    .replace(/\bFamilia\b/g, "Família")
    .replace(/\bavancados\b/g, "avançados")
    .replace(/\bAvancados\b/g, "Avançados")
    .replace(/\bMulti-condominio\b/g, "Multi-condomínio")
    .replace(/\bmulti-condominio\b/g, "multi-condomínio")
    .replace(/\bFace recognition\b/g, "Reconhecimento facial")
    .replace(/\bcondominio\(s\)\b/g, "condomínio(s)")
    .replace(/\bate\b/g, "até")
    .replace(/\bAte\b/g, "Até");
}

function formatLabel(value, group) {
  if (value == null || value === "") return "-";

  const normalized = String(value).trim();
  const lookup = LABELS[group] ?? {};

  return (
    lookup[normalized] ??
    lookup[normalized.toLowerCase()] ??
    normalizeCopy(titleize(normalized.replace(/[_-]+/g, " ").toLowerCase()))
  );
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers ?? {})
  };
  if (state.tenantId) headers["x-tenant-id"] = state.tenantId;

  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(payload?.error ?? payload?.message ?? "Falha na requisição.");
  }
  return payload;
}

async function loadSession() {
  try {
    const session = await api("/api/session");
    state.session = session;
    state.tenantId = session.activeTenant.id;
    return session;
  } catch {
    return null;
  }
}

function setTenant(tenantId) {
  state.tenantId = tenantId;
}

function tenantOptionsHtml(tenants, activeId) {
  return tenants
    .map((tenant) => `<option value="${tenant.id}" ${tenant.id === activeId ? "selected" : ""}>${normalizeCopy(tenant.name)}</option>`)
    .join("");
}

function startStream(onMessage) {
  if (state.stream) state.stream.close();
  state.stream = new EventSource(`/api/events/stream?tenantId=${encodeURIComponent(state.tenantId)}`, { withCredentials: true });
  state.stream.addEventListener("update", (event) => {
    const payload = JSON.parse(event.data);
    onMessage(payload);
  });
  state.stream.onerror = () => {
    if (state.stream) state.stream.close();
    state.stream = null;
  };
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("/sw.js");
  }
}

window.PortariaShared = {
  api,
  formatDate,
  formatLabel,
  loadSession,
  normalizeCopy,
  registerServiceWorker,
  setTenant,
  startStream,
  state,
  tenantOptionsHtml,
  toast
};

registerServiceWorker().catch(() => {});
