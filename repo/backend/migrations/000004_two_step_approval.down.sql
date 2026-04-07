BEGIN;

ALTER TABLE charge_statements ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth_users(id);
UPDATE charge_statements SET approved_by = approved_by_1 WHERE approved_by_1 IS NOT NULL;

ALTER TABLE charge_statements DROP CONSTRAINT IF EXISTS charge_statements_status_check;
ALTER TABLE charge_statements ADD CONSTRAINT charge_statements_status_check
  CHECK (status IN ('pending', 'approved', 'paid'));

ALTER TABLE charge_statements
  ALTER COLUMN status SET DEFAULT 'pending';

UPDATE charge_statements SET status = 'pending' WHERE status = 'reconciled';

ALTER TABLE charge_statements DROP COLUMN IF EXISTS approved_by_1;
ALTER TABLE charge_statements DROP COLUMN IF EXISTS approved_by_2;
ALTER TABLE charge_statements DROP COLUMN IF EXISTS reconciled_at;

COMMIT;
