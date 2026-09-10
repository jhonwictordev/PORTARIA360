# Changelog

## v1.0.0 — 2026-09-10

- Adds PostgreSQL persistence with transactions and versioned migrations.
- Verifies tenant- and role-scoped authorization.
- Introduces expiring, auditable, replay-protected simulated gate commands.

### Running the project

Configure `DATABASE_URL`, run migrations, and start the application as described in the README.

### Known limitations

- Gate operations are simulated; no physical hardware integration is included.
- The public demo contains fictional condominium data only.
