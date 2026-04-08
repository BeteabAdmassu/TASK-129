DROP INDEX IF EXISTS idx_drafts_user_form;
CREATE INDEX idx_drafts_user_form ON draft_checkpoints(user_id, form_type, form_id);
