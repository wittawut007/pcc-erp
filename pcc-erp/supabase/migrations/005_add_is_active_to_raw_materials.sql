-- Add is_active column to raw_materials table
ALTER TABLE raw_materials ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
