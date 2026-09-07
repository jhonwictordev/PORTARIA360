CREATE TABLE IF NOT EXISTS app_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_state IS
  'Transactional Portaria360 aggregate. Tenant-scoped domain objects retain tenantId and are updated under a row lock.';
