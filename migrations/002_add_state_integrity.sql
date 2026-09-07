ALTER TABLE app_state
  ADD CONSTRAINT app_state_document_is_object
  CHECK (jsonb_typeof(document) = 'object');

CREATE INDEX IF NOT EXISTS app_state_updated_at_idx ON app_state (updated_at);
