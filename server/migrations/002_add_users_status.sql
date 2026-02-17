-- Add status column for user approval workflow
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text;
