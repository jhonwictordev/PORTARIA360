# API App Portaria360

## Endpoints principais

- `GET /api/docs/openapi` `autenticado`
- `GET /docs/api` `autenticado`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/session`
- `GET /api/condos`
- `POST /api/condos`
- `GET /api/dashboard/overview`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `GET /api/units`
- `POST /api/units`
- `GET /api/contacts`
- `POST /api/contacts`
- `GET /api/allowlists`
- `POST /api/allowlists`
- `GET /api/visits`
- `POST /api/visits`
- `POST /api/visits/:id/authorize`
- `GET /api/access-events`
- `POST /api/access-events`
- `POST /api/gates/:id/open`
- `GET /api/alerts`
- `GET /api/integrations/devices`
- `POST /api/integrations/devices`
- `GET /api/integrations/webhooks`
- `POST /api/integrations/webhooks`
- `POST /api/integrations/webhooks/:id/test`
- `GET /api/billing/plans`
- `GET /api/billing/subscription`
- `POST /api/billing/subscribe`
- `GET /api/reports/flow`
- `GET /api/exports/access-events.csv`
- `GET /api/exports/access-events.pdf`
- `GET /api/notifications`
- `POST /api/assistant/triage`
- `POST /api/recognition/mock-verify`
- `GET /api/events/stream`

## Headers uteis

- `Content-Type: application/json`
- `x-tenant-id: tenant_solaris`
- `Cookie: session=...`

## Acesso a documentacao

- Os endpoints de documentacao exigem sessao autenticada.
- Use `POST /api/auth/login` para obter o cookie `session` antes de acessar `GET /api/docs/openapi` ou `GET /docs/api`.

## Exemplos rapidos

### Login

```json
{
  "email": "usuario@empresa.com",
  "password": "<senha-do-usuario>",
  "tenantId": "tenant_exemplo"
}
```

### Nova visita

```json
{
  "unitId": "unit_sol_101",
  "contactId": "contact_visitante_ana",
  "type": "visitor",
  "scheduledStartAt": "2026-05-02T15:00:00.000Z",
  "scheduledEndAt": "2026-05-02T18:00:00.000Z",
  "status": "approved"
}
```

### Registro de acesso com codigo temporario

```json
{
  "gateId": "gate_sol_main",
  "direction": "entry",
  "method": "TEMP_CODE",
  "temporaryCode": "AB12CD34"
}
```
