-- Migration 004: rename role 'manager' -> 'lead'
-- Rol "Rukovoditel" teper nazyvaetsya 'lead' vmesto 'manager'
-- Date: 2026-03-17

-- 1. Snyat staroe CHECK-ogranichenie
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 2. Pereimenovat suschestvuyuschie zapisi
UPDATE users SET role = 'lead' WHERE role = 'manager';

-- 3. Postavit novoe CHECK-ogranichenie
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('employee', 'lead', 'admin'));
