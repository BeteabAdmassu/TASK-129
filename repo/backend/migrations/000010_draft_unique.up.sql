-- Normalize any existing NULL form_id rows to 'default' so the unique index can be created.
UPDATE draft_checkpoints SET form_id = 'default' WHERE form_id IS NULL;

-- Drop the non-unique index and replace with a unique index.
DROP INDEX IF EXISTS idx_drafts_user_form;
CREATE UNIQUE INDEX idx_drafts_user_form ON draft_checkpoints(user_id, form_type, form_id);
