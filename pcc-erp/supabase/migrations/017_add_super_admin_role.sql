-- ============================================================
-- Migration: 017_add_super_admin_role.sql
-- Description: Add 'super_admin' to user_role ENUM and update wittawut.abm user
-- ============================================================

-- 1. Safely add 'super_admin' to user_role ENUM if not already present
DO $$ 
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
EXCEPTION
  WHEN undefined_object THEN
    -- If user_role is text check constraint instead of enum
    NULL;
END $$;

-- 2. Update user profile for 'wittawut.abm@gmail.com' to super_admin
UPDATE public.profiles 
SET role = 'super_admin'
WHERE email = 'wittawut.abm@gmail.com' 
   OR email LIKE 'wittawut.abm%';

-- 3. Also update auth.users raw_user_meta_data if user exists
UPDATE auth.users 
SET raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', '"super_admin"')
WHERE email = 'wittawut.abm@gmail.com'
   OR email LIKE 'wittawut.abm%';
