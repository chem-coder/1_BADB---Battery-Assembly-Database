-- 009: Add token_version to users for JWT invalidation on password change
-- When password changes, token_version increments -> old JWTs become invalid

ALTER TABLE users ADD COLUMN token_version integer NOT NULL DEFAULT 1;
