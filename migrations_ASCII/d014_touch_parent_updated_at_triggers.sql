-- d014: keep tapes.updated_at and batteries.updated_at current on real writes
-- Reads must never change updated_at.

-- -----------------------------
-- Parent row timestamp setters
-- -----------------------------

CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------
-- Battery touch helpers
-- -----------------------------

CREATE OR REPLACE FUNCTION touch_parent_battery_from_battery_id()
RETURNS trigger AS $$
DECLARE
  target_battery_id integer;
BEGIN
  target_battery_id := COALESCE(NEW.battery_id, OLD.battery_id);

  IF target_battery_id IS NOT NULL THEN
    UPDATE batteries
    SET updated_at = now()
    WHERE battery_id = target_battery_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;


-- -----------------------------
-- Tape touch helpers
-- -----------------------------

CREATE OR REPLACE FUNCTION touch_parent_tape_from_tape_id()
RETURNS trigger AS $$
DECLARE
  target_tape_id integer;
BEGIN
  target_tape_id := COALESCE(NEW.tape_id, OLD.tape_id);

  IF target_tape_id IS NOT NULL THEN
    UPDATE tapes
    SET updated_at = now()
    WHERE tape_id = target_tape_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION touch_parent_tape_from_step_id()
RETURNS trigger AS $$
DECLARE
  target_step_id integer;
  target_tape_id integer;
BEGIN
  target_step_id := COALESCE(NEW.step_id, OLD.step_id);

  IF target_step_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT tape_id
  INTO target_tape_id
  FROM tape_process_steps
  WHERE step_id = target_step_id;

  IF target_tape_id IS NOT NULL THEN
    UPDATE tapes
    SET updated_at = now()
    WHERE tape_id = target_tape_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;


-- -----------------------------
-- Batteries table trigger
-- -----------------------------

DROP TRIGGER IF EXISTS trg_batteries_set_updated_at ON batteries;

CREATE TRIGGER trg_batteries_set_updated_at
BEFORE UPDATE ON batteries
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();


-- -----------------------------
-- Battery child table triggers
-- -----------------------------

DROP TRIGGER IF EXISTS trg_battery_coin_config_touch_parent ON battery_coin_config;
CREATE TRIGGER trg_battery_coin_config_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON battery_coin_config
FOR EACH ROW
EXECUTE FUNCTION touch_parent_battery_from_battery_id();

DROP TRIGGER IF EXISTS trg_battery_pouch_config_touch_parent ON battery_pouch_config;
CREATE TRIGGER trg_battery_pouch_config_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON battery_pouch_config
FOR EACH ROW
EXECUTE FUNCTION touch_parent_battery_from_battery_id();

DROP TRIGGER IF EXISTS trg_battery_cyl_config_touch_parent ON battery_cyl_config;
CREATE TRIGGER trg_battery_cyl_config_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON battery_cyl_config
FOR EACH ROW
EXECUTE FUNCTION touch_parent_battery_from_battery_id();

DROP TRIGGER IF EXISTS trg_battery_electrode_sources_touch_parent ON battery_electrode_sources;
CREATE TRIGGER trg_battery_electrode_sources_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON battery_electrode_sources
FOR EACH ROW
EXECUTE FUNCTION touch_parent_battery_from_battery_id();

DROP TRIGGER IF EXISTS trg_battery_electrodes_touch_parent ON battery_electrodes;
CREATE TRIGGER trg_battery_electrodes_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON battery_electrodes
FOR EACH ROW
EXECUTE FUNCTION touch_parent_battery_from_battery_id();

DROP TRIGGER IF EXISTS trg_battery_sep_config_touch_parent ON battery_sep_config;
CREATE TRIGGER trg_battery_sep_config_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON battery_sep_config
FOR EACH ROW
EXECUTE FUNCTION touch_parent_battery_from_battery_id();

DROP TRIGGER IF EXISTS trg_battery_electrolyte_touch_parent ON battery_electrolyte;
CREATE TRIGGER trg_battery_electrolyte_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON battery_electrolyte
FOR EACH ROW
EXECUTE FUNCTION touch_parent_battery_from_battery_id();

DROP TRIGGER IF EXISTS trg_battery_qc_touch_parent ON battery_qc;
CREATE TRIGGER trg_battery_qc_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON battery_qc
FOR EACH ROW
EXECUTE FUNCTION touch_parent_battery_from_battery_id();

DROP TRIGGER IF EXISTS trg_battery_electrochem_touch_parent ON battery_electrochem;
CREATE TRIGGER trg_battery_electrochem_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON battery_electrochem
FOR EACH ROW
EXECUTE FUNCTION touch_parent_battery_from_battery_id();


-- -----------------------------
-- Tapes table trigger
-- -----------------------------

DROP TRIGGER IF EXISTS trg_tapes_set_updated_at ON tapes;

CREATE TRIGGER trg_tapes_set_updated_at
BEFORE UPDATE ON tapes
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();


-- -----------------------------
-- Tape child table triggers
-- -----------------------------

DROP TRIGGER IF EXISTS trg_tape_process_steps_touch_parent ON tape_process_steps;
CREATE TRIGGER trg_tape_process_steps_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON tape_process_steps
FOR EACH ROW
EXECUTE FUNCTION touch_parent_tape_from_tape_id();

DROP TRIGGER IF EXISTS trg_tape_recipe_line_actuals_touch_parent ON tape_recipe_line_actuals;
CREATE TRIGGER trg_tape_recipe_line_actuals_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON tape_recipe_line_actuals
FOR EACH ROW
EXECUTE FUNCTION touch_parent_tape_from_tape_id();

DROP TRIGGER IF EXISTS trg_tape_step_drying_touch_parent ON tape_step_drying;
CREATE TRIGGER trg_tape_step_drying_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON tape_step_drying
FOR EACH ROW
EXECUTE FUNCTION touch_parent_tape_from_step_id();

DROP TRIGGER IF EXISTS trg_tape_step_mixing_touch_parent ON tape_step_mixing;
CREATE TRIGGER trg_tape_step_mixing_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON tape_step_mixing
FOR EACH ROW
EXECUTE FUNCTION touch_parent_tape_from_step_id();

DROP TRIGGER IF EXISTS trg_tape_step_coating_touch_parent ON tape_step_coating;
CREATE TRIGGER trg_tape_step_coating_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON tape_step_coating
FOR EACH ROW
EXECUTE FUNCTION touch_parent_tape_from_step_id();

DROP TRIGGER IF EXISTS trg_tape_step_calendering_touch_parent ON tape_step_calendering;
CREATE TRIGGER trg_tape_step_calendering_touch_parent
AFTER INSERT OR UPDATE OR DELETE ON tape_step_calendering
FOR EACH ROW
EXECUTE FUNCTION touch_parent_tape_from_step_id();
