-- Add must_change_password flag to auth_users.
-- When true the user is forced to change their password before accessing any feature.
-- The seed admin account ships with this flag set so fresh installs require an immediate
-- password change, removing the risk from the published default credential.

ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- Force password change for the default admin user on first login.
UPDATE auth_users SET must_change_password = true WHERE username = 'admin';
