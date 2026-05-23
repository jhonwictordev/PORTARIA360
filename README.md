App Portaria360

Complete SaaS MVP for access control in residential and commercial condominiums, with API-first architecture, real-time operation, multi-condominium support, audit trail, SaaS billing, and a mobile/PWA app for residents.

What’s Ready
User management with profiles administrator, syndic, doorman, and resident
Visitor and service provider registration via contact management
Association of residents with units
Scheduling, recurring authorization, and visit history per unit
Real-time entry and exit logging
Remote gate release via web or resident app
Operational dashboard with alerts, devices, CCTV, and recent activity
Webhooks, plan-based billing, CSV/PDF export, and notification logs
Mobile PWA with offline queue and later synchronization
Sensitive data encryption, password hashing, signed sessions, and optional TOTP 2FA
Architecture
Backend: Pure Node.js with REST API, SSE for real-time updates, and JSON persistence
Web frontend: HTML/CSS/JS without build, with a responsive admin and concierge panel
Mobile frontend: PWA in HTML/CSS/JS for residents
Persistence: data/database.json
Multi-tenant domain: a user can access multiple condominiums with the same account
Structure
src/server.mjs: HTTP bootstrap
src/app.mjs: API, business rules, and static file delivery
src/seed.mjs: multi-condominium demo database
src/services/: persistence, real-time, and reporting
src/utils/: security and HTTP utilities
public/: web panel, mobile/PWA app, CSS, and assets
tests/api.test.mjs: automated API tests
docs/api.md: quick guide for endpoints
Demo Credentials
Administrator: admin@portaria360.local / Admin@123
Syndic: sindico@solaris.local / Sindico@123
Doorman: porteiro@solaris.local / Porteiro@123
Resident: mariana@solaris.local / Morador@123
How to Run

If node is in the PATH:

node --run start

If not, use this workspace launcher:

.\run.ps1 start

Then open:

Web panel: http://localhost:3000/
Resident app: http://localhost:3000/app
Summarized OpenAPI: http://localhost:3000/api/docs/openapi
Tests
.\run.ps1 test
