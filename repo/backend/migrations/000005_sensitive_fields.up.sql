-- Add encrypted sensitive fields to members table
ALTER TABLE members ADD COLUMN IF NOT EXISTS verification_status_encrypted BYTEA;
ALTER TABLE members ADD COLUMN IF NOT EXISTS deposits_encrypted BYTEA;
ALTER TABLE members ADD COLUMN IF NOT EXISTS violation_notes_encrypted BYTEA;
