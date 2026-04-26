-- 015_cycling.sql - Battery cycling/testing data tables
-- Stores charge/discharge test results from cycling equipment

BEGIN;

-- -- Sessions ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS cycling_sessions (
  session_id    SERIAL PRIMARY KEY,
  battery_id    INT NOT NULL REFERENCES batteries(battery_id) ON DELETE CASCADE,
  equipment_type TEXT NOT NULL DEFAULT 'generic',  -- 'neware','arbin','biologic','generic'
  file_name     TEXT,               -- original filename
  file_path     TEXT,               -- server path to raw file
  file_hash     TEXT,               -- SHA-256 for dedup
  channel       INT,                -- equipment channel number
  protocol      TEXT,               -- test protocol name
  started_at    TIMESTAMP,          -- first datapoint timestamp
  ended_at      TIMESTAMP,          -- last datapoint timestamp
  total_cycles  INT DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'processing',  -- 'processing','ready','error'
  error_message TEXT,
  uploaded_by   INT REFERENCES users(user_id),
  uploaded_at   TIMESTAMP DEFAULT now(),
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cycling_sessions_battery ON cycling_sessions(battery_id);
CREATE INDEX IF NOT EXISTS idx_cycling_sessions_status ON cycling_sessions(status);

-- -- Raw datapoints ----------------------------------------------------
CREATE TABLE IF NOT EXISTS cycling_datapoints (
  datapoint_id  BIGSERIAL PRIMARY KEY,
  session_id    INT NOT NULL REFERENCES cycling_sessions(session_id) ON DELETE CASCADE,
  cycle_number  INT NOT NULL DEFAULT 0,
  step_number   INT,
  step_type     TEXT,               -- 'charge','discharge','rest','cccv'
  time_s        DOUBLE PRECISION,   -- seconds from session start
  voltage_v     DOUBLE PRECISION,
  current_a     DOUBLE PRECISION,
  capacity_ah   DOUBLE PRECISION,
  energy_wh     DOUBLE PRECISION,
  temperature_c DOUBLE PRECISION    -- nullable
);

CREATE INDEX IF NOT EXISTS idx_cycling_dp_session_cycle ON cycling_datapoints(session_id, cycle_number);

-- -- Per-cycle summary (pre-computed metrics) --------------------------
CREATE TABLE IF NOT EXISTS cycling_cycle_summary (
  summary_id              SERIAL PRIMARY KEY,
  session_id              INT NOT NULL REFERENCES cycling_sessions(session_id) ON DELETE CASCADE,
  cycle_number            INT NOT NULL,
  charge_capacity_ah      DOUBLE PRECISION,
  discharge_capacity_ah   DOUBLE PRECISION,
  coulombic_efficiency    DOUBLE PRECISION,   -- discharge/charge * 100
  charge_energy_wh        DOUBLE PRECISION,
  discharge_energy_wh     DOUBLE PRECISION,
  max_voltage_v           DOUBLE PRECISION,
  min_voltage_v           DOUBLE PRECISION,
  avg_temperature_c       DOUBLE PRECISION,
  duration_s              DOUBLE PRECISION,

  UNIQUE(session_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS idx_cycling_summary_session ON cycling_cycle_summary(session_id);

-- -- Permissions -------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON cycling_sessions TO "Dalia";
GRANT SELECT, INSERT, UPDATE, DELETE ON cycling_datapoints TO "Dalia";
GRANT SELECT, INSERT, UPDATE, DELETE ON cycling_cycle_summary TO "Dalia";
GRANT USAGE, SELECT ON SEQUENCE cycling_sessions_session_id_seq TO "Dalia";
GRANT USAGE, SELECT ON SEQUENCE cycling_datapoints_datapoint_id_seq TO "Dalia";
GRANT USAGE, SELECT ON SEQUENCE cycling_cycle_summary_summary_id_seq TO "Dalia";

COMMIT;
