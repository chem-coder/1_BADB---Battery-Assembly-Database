-- 010: Departments table + assign users to departments
-- Temporary random assignment - Dima will fix from Excel at home

CREATE TABLE departments (
  department_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  head_user_id INTEGER REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT now()
);

-- 4 departments + director level
INSERT INTO departments (name, head_user_id) VALUES
  ('Otdel 1', 1),   -- Shapovalov V.V.
  ('Otdel 2', 21),  -- Krasenkov S.V.
  ('Otdel 3', 29),  -- Ivanischev A.V.
  ('Otdel 4', 32);  -- Ivanischeva I.A.

-- Grant access to app user (Dalia)
GRANT ALL ON TABLE departments TO "Dalia";
GRANT USAGE, SELECT ON SEQUENCE departments_department_id_seq TO "Dalia";

-- Add department_id to users
ALTER TABLE users ADD COLUMN department_id INTEGER REFERENCES departments(department_id);

-- Director - no department (above all)
UPDATE users SET department_id = NULL WHERE user_id = 20; -- Chudinov (direktor)

-- Department heads
UPDATE users SET department_id = 1 WHERE user_id = 1;   -- Shapovalov
UPDATE users SET department_id = 2 WHERE user_id = 21;  -- Krasenkov
UPDATE users SET department_id = 3 WHERE user_id = 29;  -- Ivanischev
UPDATE users SET department_id = 4 WHERE user_id = 32;  -- Ivanischeva

-- Admins (Dima, Dalya) - department 4 placeholder
UPDATE users SET department_id = 4 WHERE user_id IN (4, 34);

-- Random assignment for everyone else (will be corrected from Excel)
UPDATE users SET department_id = 1 WHERE user_id IN (2, 6, 7, 8, 14, 15, 35);
UPDATE users SET department_id = 2 WHERE user_id IN (5, 9, 10, 11, 22, 23, 24);
UPDATE users SET department_id = 3 WHERE user_id IN (3, 12, 13, 25, 26, 27, 36);
UPDATE users SET department_id = 4 WHERE user_id IN (16, 17, 18, 19, 28, 30, 31, 33);
