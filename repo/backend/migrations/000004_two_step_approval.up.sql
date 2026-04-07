-- Restore two-step settlement approval: pending → reconciled → approved → paid
BEGIN;

ALTER TABLE charge_statements ADD COLUMN IF NOT EXISTS approved_by_1 UUID REFERENCES auth_users(id);
ALTER TABLE charge_statements ADD COLUMN IF NOT EXISTS approved_by_2 UUID REFERENCES auth_users(id);
ALTER TABLE charge_statements ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

-- Migrate existing single approved_by → approved_by_1
UPDATE charge_statements SET approved_by_1 = approved_by WHERE approved_by IS NOT NULL;

-- Remap 'approved' that came from reconcile to 'reconciled' (they were only first-step)
-- Leave 'paid' as-is
-- Re-insert reconciled status
ALTER TABLE charge_statements DROP CONSTRAINT IF EXISTS charge_statements_status_check;
ALTER TABLE charge_statements ADD CONSTRAINT charge_statements_status_check
  CHECK (status IN ('pending', 'reconciled', 'approved', 'paid'));

ALTER TABLE charge_statements DROP COLUMN IF EXISTS approved_by;

COMMIT;
