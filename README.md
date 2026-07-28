# Portaria360

Access control SaaS MVP for residential and commercial condominiums, with web operations, resident PWA access, audit logs, and multi-tenant support.

## Overview

- API-first architecture for concierge and condominium operations
- Visitor, resident, unit, and service provider management
- Entry and exit logging with real-time activity updates
- Remote gate release and operational dashboard
- Audit trail, CSV and PDF export, webhooks, and billing foundations
- Resident mobile PWA with offline queue and later synchronization

## Stack

- Node.js
- REST API
- Server-Sent Events
- HTML, CSS, and JavaScript frontends
- JSON persistence for MVP data storage

## Structure

- `src/server.mjs`
- `src/app.mjs`
- `src/seed.mjs`
- `src/services/`
- `src/utils/`
- `public/`
- `tests/api.test.mjs`
- `docs/api.md`

## Local Run

```bash
npm install
npm start
npm test
```

## Notes

The seed script creates demo roles for local evaluation. Replace demo data and the storage strategy before production use.
