# Portaria360

> See the [portfolio overview](docs/portfolio-overview.md) for architecture, a safe public walkthrough and production boundaries.

API-first access-control platform for residential and commercial condominiums. The project demonstrates multi-tenant authorization, visitor workflows, auditable gate commands, reporting and a resident PWA.

## Production-oriented persistence

When DATABASE_URL is configured, Portaria360 uses PostgreSQL as its source of truth. Mutations run inside database transactions and lock the application aggregate with SELECT FOR UPDATE, preventing concurrent requests from overwriting one another. Versioned SQL migrations are recorded in schema_migrations.

The in-memory adapter is reserved for automated tests. JSON storage remains available only as a local-development fallback when DATABASE_URL is absent; it is not a production option.

~~~bash
docker compose up -d postgres
cp .env.example .env
# Load the variables from .env in your shell, then:
npm install
npm run db:migrate
npm start
npm test
~~~

Run migrations before every deployment. The health endpoint reports the active persistence mode as `postgresql`, `json-development` or `memory-test`.

## Gate command safety

`POST /api/gates/:id/open` now:

- requires an `Idempotency-Key` between 8 and 128 characters;
- accepts a 3–30 second expiration window and rejects stale client timestamps;
- writes the command and its audit record in the same transaction;
- returns the original command for a repeated idempotency key;
- blocks different commands from the same actor and gate for five seconds;
- resolves gates only inside the authenticated condominium.

The endpoint returns `202 Accepted` for a new command and `200 OK` for an idempotent replay.

## Authorization model

Every authenticated request derives the active condominium from a membership rather than trusting the tenant header alone. Domain queries include the active `tenantId`; residents are additionally constrained to their assigned units. Automated tests cover cross-condominium access and role boundaries.

| Capability | Administrator | Syndic | Doorman | Resident |
| --- | :---: | :---: | :---: | :---: |
| Remote gate command | ✓ | ✓ | ✓ | ✓ |
| Access reports | ✓ | ✓ | — | — |
| User management | ✓ | ✓ | — | — |
| Integrations | manage | view | view | — |
| Billing | manage | — | — | — |

## Integration status

| Feature | Status | What it means |
| --- | --- | --- |
| Gate opening | **Simulation** | A safe, expiring command and audit record are created; no physical relay is activated. |
| Face recognition | **Simulation** | `/api/recognition/mock-verify` returns deterministic mock results. |
| Email/SMS/WhatsApp notifications | **Simulation** | Messages are written to the notification log only. |
| Operational assistant | **Simulation** | Rules-based hints; no external AI provider is called. |
| Outbound webhooks | **Real HTTP integration** | Configured URLs receive signed event payloads. Production deployments must enforce an allowlist and HTTPS. |
| PostgreSQL | **Real infrastructure integration** | Enabled through `DATABASE_URL`; transactions and migrations are included. |
| Server-Sent Events | **Real application integration** | Tenant-scoped events are streamed to authenticated clients. |

Do not connect the gate endpoint to physical hardware without implementing a reviewed provider adapter, delivery acknowledgements, device authentication, network allowlists and operational fail-safe procedures.

## Stack

- Node.js 20+, REST API and Server-Sent Events
- PostgreSQL 17 and versioned SQL migrations
- HTML, CSS and JavaScript frontends
- Node's built-in test runner

See [docs/api.md](docs/api.md) for endpoint details.
