const { api, formatDate, formatLabel, loadSession, normalizeCopy, setTenant, startStream, state, toast } = window.PortariaShared;

const loginPanel = document.querySelector("#residentLoginPanel");
const workspace = document.querySelector("#residentWorkspace");
const loginForm = document.querySelector("#residentLoginForm");
const logoutButton = document.querySelector("#residentLogout");
const allowlistForm = document.querySelector("#allowlistForm");
const visitForm = document.querySelector("#residentVisitForm");
const openGateButton = document.querySelector("#openGateButton");
const syncQueueButton = document.querySelector("#syncQueueButton");
const offlineBadge = document.querySelector("#offlineBadge");

let residentUnitId = null;
let residentGateId = null;
let cachedContacts = [];

function formatRoleLabel(value) {
  return formatLabel(value, "roles");
}

function formatVisitTypeLabel(value) {
  return formatLabel(value, "visitTypes");
}

function formatStatusLabel(value) {
  return formatLabel(value, "statuses");
}

function formatChannelLabel(value) {
  return formatLabel(value, "channels");
}

function queueKey() {
  return `app-portaria360-offline-${state.tenantId ?? "default"}`;
}

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(queueKey()) ?? "[]");
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue) {
  localStorage.setItem(queueKey(), JSON.stringify(queue));
  renderQueueInfo();
}

function enqueueOfflineAction(entry) {
  const queue = getOfflineQueue();
  queue.push({ ...entry, queuedAt: new Date().toISOString() });
  saveOfflineQueue(queue);
}

async function flushQueue() {
  if (!navigator.onLine) {
    toast("A sincronização depende de conexão.");
    return;
  }
  const queue = getOfflineQueue();
  const remaining = [];
  for (const item of queue) {
    try {
      await api(item.path, {
        method: item.method,
        body: JSON.stringify(item.body)
      });
    } catch {
      remaining.push(item);
    }
  }
  saveOfflineQueue(remaining);
  toast(remaining.length ? "Parte da fila ainda aguarda sincronização." : "Fila offline sincronizada.");
  await hydrate();
}

function renderQueueInfo() {
  const queue = getOfflineQueue();
  document.querySelector("#queueInfo").innerHTML = queue.length
    ? `${queue.length} ação(ões) aguardando sincronização posterior.`
    : "Nenhuma ação pendente na fila offline.";
}

function updateOnlineStatus() {
  offlineBadge.textContent = navigator.onLine ? "Online" : "Offline";
  offlineBadge.style.background = navigator.onLine ? "rgba(36, 90, 73, 0.12)" : "rgba(177, 82, 53, 0.16)";
  offlineBadge.style.color = navigator.onLine ? "var(--success)" : "var(--accent-strong)";
}

function defaultVisitDates() {
  const start = new Date();
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  visitForm.scheduledStartAt.value = start.toISOString().slice(0, 16);
  visitForm.scheduledEndAt.value = end.toISOString().slice(0, 16);
  allowlistForm.validTo.value = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function renderHeader(session, overview) {
  document.querySelector("#residentTitle").textContent = session.user.name;
  document.querySelector("#residentSubtitle").textContent = `${normalizeCopy(session.activeTenant.name)} | ${formatRoleLabel(session.user.role)} | Unidade ${session.user.unitIds.join(", ") || "-"}`;
  residentGateId = overview.gates[0]?.id ?? null;
}

function renderContacts(contacts) {
  cachedContacts = contacts;
  document.querySelector("#allowContactId").innerHTML = contacts
    .map((contact) => `<option value="${contact.id}">${normalizeCopy(contact.name)} (${formatVisitTypeLabel(contact.type)})</option>`)
    .join("");
}

function renderVisits(visits) {
  document.querySelector("#residentVisitsList").innerHTML =
    visits
      .map(
        (visit) => `
          <article class="visit-card">
            <strong>${normalizeCopy(visit.contact?.name ?? "-")}</strong>
            <div class="feed-meta">${formatVisitTypeLabel(visit.type)} | Unidade ${visit.unit?.label ?? "-"}</div>
            <div class="feed-meta">Janela: ${formatDate(visit.scheduledStartAt)} até ${formatDate(visit.scheduledEndAt)}</div>
            <div class="feed-meta">Código temporário: ${visit.temporaryCode}</div>
            <div class="feed-meta">Status: ${formatStatusLabel(visit.status)}</div>
          </article>
        `
      )
      .join("") || `<div class="muted-text">Nenhuma visita cadastrada.</div>`;
}

function renderNotifications(notifications) {
  document.querySelector("#residentNotifications").innerHTML =
    notifications
      .slice(0, 6)
      .map(
        (notification) => `
        <article class="notification-card">
          <strong>${formatChannelLabel(notification.channel)}</strong>
          <div class="feed-meta">${normalizeCopy(notification.message)}</div>
        </article>
      `
      )
      .join("") || `<div class="muted-text">Sem notificações recentes.</div>`;
}

async function hydrate() {
  const [session, overview, contacts, visits, notifications] = await Promise.all([
    api("/api/session"),
    api("/api/dashboard/overview"),
    api("/api/contacts"),
    api("/api/visits"),
    api("/api/notifications")
  ]);
  state.session = session;
  residentUnitId = session.user.unitIds[0] ?? null;
  renderHeader(session, overview);
  renderContacts(contacts);
  renderVisits(visits.filter((visit) => visit.unitId === residentUnitId));
  renderNotifications(notifications);
  renderQueueInfo();
}

async function login(payload) {
  const result = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  state.session = result.session;
  setTenant(result.session.activeTenant.id);
  loginPanel.classList.add("hidden");
  workspace.classList.remove("hidden");
  await hydrate();
  startStream(() => hydrate().catch(() => {}));
}

async function postOrQueue(path, body) {
  if (!navigator.onLine) {
    enqueueOfflineAction({ path, method: "POST", body });
    toast("Sem conexão: ação salva para sincronização posterior.");
    return null;
  }
  return api(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await login(Object.fromEntries(new FormData(loginForm).entries()));
  } catch (error) {
    toast(error.message);
  }
});

allowlistForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(allowlistForm).entries());
  try {
    const result = await postOrQueue("/api/allowlists", {
      unitId: residentUnitId,
      contactId: data.contactId,
      validTo: new Date(data.validTo).toISOString(),
      notes: data.notes
    });
    if (result) await hydrate();
  } catch (error) {
    toast(error.message);
  }
});

visitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(visitForm).entries());
  try {
    let contact = cachedContacts.find((item) => item.name.toLowerCase() === data.name.toLowerCase());
    if (!contact) {
      contact = await postOrQueue("/api/contacts", {
        name: data.name,
        type: data.type,
        phone: data.phone,
        document: data.document
      });
      if (!contact) return;
    }
    const result = await postOrQueue("/api/visits", {
      unitId: residentUnitId,
      contactId: contact.id,
      type: data.type,
      scheduledStartAt: new Date(data.scheduledStartAt).toISOString(),
      scheduledEndAt: new Date(data.scheduledEndAt).toISOString(),
      notes: data.notes,
      status: "approved"
    });
    visitForm.reset();
    defaultVisitDates();
    if (result) await hydrate();
  } catch (error) {
    toast(error.message);
  }
});

openGateButton.addEventListener("click", async () => {
  if (!residentGateId) {
    toast("Nenhum portão configurado para este condomínio.");
    return;
  }
  try {
    const result = await postOrQueue(`/api/gates/${residentGateId}/open`, {});
    if (result) await hydrate();
  } catch (error) {
    toast(error.message);
  }
});

syncQueueButton.addEventListener("click", () => {
  flushQueue().catch((error) => toast(error.message));
});

logoutButton.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.reload();
});

window.addEventListener("online", () => {
  updateOnlineStatus();
  flushQueue().catch(() => {});
});
window.addEventListener("offline", updateOnlineStatus);

defaultVisitDates();
updateOnlineStatus();

loadSession().then(async (session) => {
  if (!session) return;
  if (session.user.role !== "resident") return;
  setTenant(session.activeTenant.id);
  loginPanel.classList.add("hidden");
  workspace.classList.remove("hidden");
  await hydrate();
  startStream(() => hydrate().catch(() => {}));
});
