const { api, formatDate, formatLabel, loadSession, normalizeCopy, setTenant, startStream, state, tenantOptionsHtml, toast } = window.PortariaShared;

const landingExperience = document.querySelector("#landingExperience");
const loginPanel = document.querySelector("#loginPanel");
const workspace = document.querySelector("#workspace");
const loginForm = document.querySelector("#loginForm");
const logoutButton = document.querySelector("#logoutButton");
const tenantSwitcher = document.querySelector("#tenantSwitcher");
const refreshButton = document.querySelector("#refreshButton");
const visitForm = document.querySelector("#visitForm");
const assistantForm = document.querySelector("#assistantForm");
const exportCsvButton = document.querySelector("#exportCsvButton");
const exportPdfButton = document.querySelector("#exportPdfButton");

let cachedUnits = [];
let cachedVisits = [];
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

function formatMethodLabel(value) {
  return formatLabel(value, "methods");
}

function formatChannelLabel(value) {
  return formatLabel(value, "channels");
}

function formatDeviceTypeLabel(value) {
  return formatLabel(value, "deviceTypes");
}

function formatModeLabel(value) {
  return formatLabel(value, "modes");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(value);
}

function isoFromLocal(localValue) {
  return new Date(localValue).toISOString();
}

function fillDefaultDates() {
  const start = new Date();
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  visitForm.scheduledStartAt.value = start.toISOString().slice(0, 16);
  visitForm.scheduledEndAt.value = end.toISOString().slice(0, 16);
}

function renderSession(session) {
  document.querySelector("#heroTitle").textContent = session.activeTenant.name;
  document.querySelector("#heroSubtitle").textContent = `${session.user.name} | ${formatRoleLabel(session.user.role)} | Conta com acesso a ${session.tenants.length} condomínio(s).`;
  tenantSwitcher.innerHTML = tenantOptionsHtml(session.tenants, state.tenantId);
}

function renderMetrics(overview) {
  document.querySelector("#metricAccesses").textContent = overview.cards.accessesToday;
  document.querySelector("#metricVisits").textContent = overview.cards.pendingVisits;
  document.querySelector("#metricAlerts").textContent = overview.cards.activeAlerts;
  document.querySelector("#metricDevices").textContent = overview.cards.onlineDevices;
}

function renderFeed(overview) {
  const target = document.querySelector("#realtimeFeed");
  target.innerHTML =
    overview.recentAccesses
      .map(
        (event) => `
          <article class="feed-item">
            <strong>${normalizeCopy(event.displayName)}</strong>
            <div class="feed-meta">${formatMethodLabel(event.method)} | ${formatStatusLabel(event.status)} | ${normalizeCopy(event.gate?.name ?? "Portão")} | ${formatDate(event.createdAt)}</div>
          </article>
        `
      )
      .join("") || `<div class="muted-text">Nenhum acesso registrado.</div>`;
}

function renderAlerts(overview) {
  const target = document.querySelector("#alertsList");
  target.innerHTML =
    overview.alerts
      .map(
        (alert) => `
          <article class="alert-card ${alert.severity}">
            <strong>${normalizeCopy(alert.title)}</strong>
            <div class="feed-meta">${normalizeCopy(alert.description)}</div>
          </article>
        `
      )
      .join("") || `<div class="muted-text">Sem alertas abertos.</div>`;

  document.querySelector("#cameraStrip").innerHTML = overview.cameras
    .map(
      (camera) => `
        <article class="camera-card">
          <strong>${normalizeCopy(camera.name)}</strong>
          <span>${normalizeCopy(camera.provider)}</span>
          <span>Status: ${formatStatusLabel(camera.status)}</span>
        </article>
      `
    )
    .join("");
}

function renderUnits(units) {
  cachedUnits = units;
  document.querySelector("#visitUnit").innerHTML = units.map((unit) => `<option value="${unit.id}">${unit.block} ${unit.label}</option>`).join("");
}

function renderVisits(visits) {
  cachedVisits = visits;
  const rows = visits
    .map((visit) => {
      const action =
        visit.status === "scheduled"
          ? `<button class="secondary small authorize-button" data-id="${visit.id}">Autorizar</button>`
          : `<span class="status-pill">${formatStatusLabel(visit.status)}</span>`;
      return `
        <tr>
          <td>${normalizeCopy(visit.contact?.name ?? "-")}</td>
          <td>${visit.unit?.label ?? "-"}</td>
          <td>${formatVisitTypeLabel(visit.type)}</td>
          <td>${visit.temporaryCode}</td>
          <td>${formatDate(visit.scheduledStartAt)}</td>
          <td>${formatDate(visit.scheduledEndAt)}</td>
          <td>${action}</td>
        </tr>
      `;
    })
    .join("");
  document.querySelector("#visitsTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Pessoa</th>
          <th>Unidade</th>
          <th>Tipo</th>
          <th>Código</th>
          <th>Início</th>
          <th>Fim</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  document.querySelectorAll(".authorize-button").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/visits/${button.dataset.id}/authorize`, {
        method: "POST",
        body: JSON.stringify({ status: "approved" })
      });
      await hydrate();
    });
  });
}

function renderGates(overview) {
  document.querySelector("#gatesGrid").innerHTML = overview.gates
    .map(
      (gate) => `
        <article class="gate-card">
          <strong>${normalizeCopy(gate.name)}</strong>
          <p>${formatDeviceTypeLabel(gate.deviceType)} | ${formatModeLabel(gate.mode)}</p>
          <p>Status: ${formatStatusLabel(gate.status)}</p>
          <button class="primary small open-gate" data-id="${gate.id}">Liberar acesso</button>
        </article>
      `
    )
    .join("");

  document.querySelectorAll(".open-gate").forEach((button) => {
    button.addEventListener("click", async () => {
      const result = await api(`/api/gates/${button.dataset.id}/open`, { method: "POST" });
      toast(result.message);
      await hydrate();
    });
  });
}

function renderBilling(plans, subscription) {
  const activePlan = plans.find((plan) => plan.id === subscription?.planId) ?? null;
  document.querySelector("#billingSummary").innerHTML = subscription
    ? `Plano atual: <strong>${normalizeCopy(activePlan?.name ?? subscription.planId)}</strong><br />Status: ${formatStatusLabel(subscription.status)}<br />Próxima cobrança: ${formatDate(subscription.nextBillingAt)}`
    : "Sem assinatura ativa.";

  document.querySelector("#plansGrid").innerHTML = plans
    .map((plan, index) => {
      const isActive = subscription?.planId === plan.id;
      const badge = index === 1 ? `<div class="plan-badge">Operação em escala</div>` : index === 2 ? `<div class="plan-badge">Enterprise</div>` : "";
      return `
        <article class="plan-card ${isActive ? "active current" : ""}">
          ${badge}
          <div class="plan-card-header">
            <div class="plan-name">${normalizeCopy(plan.name)}</div>
            <div class="plan-price">${formatCurrency(plan.monthlyPrice)} <small>/ mês</small></div>
            <div class="plan-meta-grid">
              <span>Até ${plan.maxUnits} unidades</span>
              <span>${plan.maxMonthlyAccesses} acessos mensais</span>
            </div>
          </div>
          <ul class="plan-feature-list">
            ${plan.features.map((feature) => `<li>${normalizeCopy(feature)}</li>`).join("")}
          </ul>
          <button class="${isActive ? "ghost" : "secondary"} small subscribe-button" data-plan="${plan.id}">
            ${isActive ? "Plano atual" : "Assinar plano"}
          </button>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".subscribe-button").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.textContent.includes("Plano atual")) return;
      await api("/api/billing/subscribe", {
        method: "POST",
        body: JSON.stringify({ planId: button.dataset.plan })
      });
      await hydrate();
    });
  });
}

function renderDevices(devices, notifications) {
  document.querySelector("#devicesList").innerHTML = devices
    .map(
      (device) => `
        <article class="device-card">
          <strong>${normalizeCopy(device.name)}</strong>
          <span>${formatDeviceTypeLabel(device.type)} | ${normalizeCopy(device.protocol)}</span>
          <span>Status: ${formatStatusLabel(device.status)} | �sltimo heartbeat: ${formatDate(device.lastSeenAt)}</span>
        </article>
      `
    )
    .join("");

  document.querySelector("#notificationsList").innerHTML = notifications
    .slice(0, 5)
    .map(
      (notification) => `
        <article class="notification-card">
          <strong>${formatChannelLabel(notification.channel)}</strong>
          <div class="feed-meta">${normalizeCopy(notification.message)}</div>
        </article>
      `
    )
    .join("");
}

async function hydrate() {
  const [session, overview, units, contacts, visits, plans, subscription, devices, notifications] = await Promise.all([
    api("/api/session"),
    api("/api/dashboard/overview"),
    api("/api/units"),
    api("/api/contacts"),
    api("/api/visits"),
    api("/api/billing/plans"),
    api("/api/billing/subscription").catch(() => null),
    api("/api/integrations/devices"),
    api("/api/notifications")
  ]);

  cachedContacts = contacts;
  state.session = session;
  renderSession(session);
  renderMetrics(overview);
  renderFeed(overview);
  renderAlerts(overview);
  renderUnits(units);
  renderVisits(visits);
  renderGates(overview);
  renderBilling(plans, subscription);
  renderDevices(devices, notifications);
}

async function login(payload) {
  const result = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  state.session = result.session;
  setTenant(result.session.activeTenant.id);
  landingExperience.classList.add("hidden");
  workspace.classList.remove("hidden");
  await hydrate();
  startStream(() => hydrate().catch(() => {}));
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  try {
    await login(Object.fromEntries(formData.entries()));
  } catch (error) {
    toast(error.message);
  }
});

document.querySelectorAll(".demo-card").forEach((button) => {
  button.addEventListener("click", () => {
    loginForm.email.value = button.dataset.email;
    loginForm.password.value = button.dataset.password;
    loginForm.tenantId.value = button.dataset.tenant;
  });
});

logoutButton.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.reload();
});

tenantSwitcher.addEventListener("change", async () => {
  setTenant(tenantSwitcher.value);
  await hydrate();
});

refreshButton.addEventListener("click", () => {
  hydrate().catch((error) => toast(error.message));
});

visitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(visitForm);
  const data = Object.fromEntries(formData.entries());
  try {
    const contact = await api("/api/contacts", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        type: data.type,
        phone: data.phone,
        document: data.document
      })
    });
    await api("/api/visits", {
      method: "POST",
      body: JSON.stringify({
        unitId: data.unitId,
        contactId: contact.id,
        type: data.type,
        scheduledStartAt: isoFromLocal(data.scheduledStartAt),
        scheduledEndAt: isoFromLocal(data.scheduledEndAt),
        notes: data.notes,
        status: "approved"
      })
    });
    visitForm.reset();
    fillDefaultDates();
    await hydrate();
  } catch (error) {
    toast(error.message);
  }
});

assistantForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(assistantForm);
  const payload = await api("/api/assistant/triage", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(formData.entries()))
  });
  document.querySelector("#assistantOutput").innerHTML = `
    <article class="assistant-card">
      <strong>${normalizeCopy(payload.summary)}</strong>
      <div class="feed-meta">${payload.hints.map((hint) => normalizeCopy(hint)).join("<br />")}</div>
      <div class="feed-meta">${payload.suggestedActions.map((action) => normalizeCopy(action)).join("<br />")}</div>
    </article>
  `;
});

exportCsvButton.addEventListener("click", () => {
  window.open(`/api/exports/access-events.csv?tenantId=${encodeURIComponent(state.tenantId)}`, "_blank");
});

exportPdfButton.addEventListener("click", () => {
  window.open(`/api/exports/access-events.pdf?tenantId=${encodeURIComponent(state.tenantId)}`, "_blank");
});

fillDefaultDates();

loadSession().then(async (session) => {
  if (!session) return;
  setTenant(session.activeTenant.id);
  landingExperience.classList.add("hidden");
  workspace.classList.remove("hidden");
  await hydrate();
  startStream(() => hydrate().catch(() => {}));
});
