-- Print all table data in alphabetical order.
--
-- HOW TO RUN:
-- From project root folder, run psql. Then:
--
-- \set ON_ERROR_STOP on
-- \i sql_scripts/print_all_data.sql

\echo '===== active_materials ====='
SELECT * FROM active_materials;

\echo '===== batteries ====='
SELECT * FROM batteries;

\echo '===== battery_coin_config ====='
SELECT * FROM battery_coin_config;

\echo '===== battery_cyl_config ====='
SELECT * FROM battery_cyl_config;

\echo '===== battery_electrochem ====='
SELECT * FROM battery_electrochem;

\echo '===== battery_electrode_sources ====='
SELECT * FROM battery_electrode_sources;

\echo '===== battery_electrodes ====='
SELECT * FROM battery_electrodes;

\echo '===== battery_electrolyte ====='
SELECT * FROM battery_electrolyte;

\echo '===== battery_pouch_config ====='
SELECT * FROM battery_pouch_config;

\echo '===== battery_qc ====='
SELECT * FROM battery_qc;

\echo '===== battery_sep_config ====='
SELECT * FROM battery_sep_config;

\echo '===== coating_methods ====='
SELECT * FROM coating_methods;

\echo '===== dry_mixing_methods ====='
SELECT * FROM dry_mixing_methods;

\echo '===== drying_atmospheres ====='
SELECT * FROM drying_atmospheres;

\echo '===== electrode_cut_batches ====='
SELECT * FROM electrode_cut_batches;

\echo '===== electrode_drying ====='
SELECT * FROM electrode_drying;

\echo '===== electrode_status ====='
SELECT * FROM electrode_status;

\echo '===== electrodes ====='
SELECT * FROM electrodes;

\echo '===== electrolytes ====='
SELECT * FROM electrolytes;

\echo '===== foil_mass_measurements ====='
SELECT * FROM foil_mass_measurements;

\echo '===== foils ====='
SELECT * FROM foils;

\echo '===== material_instance_components ====='
SELECT * FROM material_instance_components;

\echo '===== material_instances ====='
SELECT * FROM material_instances;

\echo '===== materials ====='
SELECT * FROM materials;

\echo '===== module_batteries ====='
SELECT * FROM module_batteries;

\echo '===== module_qc ====='
SELECT * FROM module_qc;

\echo '===== modules ====='
SELECT * FROM modules;

\echo '===== operation_types ====='
SELECT * FROM operation_types;

\echo '===== projects ====='
SELECT * FROM projects;

\echo '===== separator_structure ====='
SELECT * FROM separator_structure;

\echo '===== separators ====='
SELECT * FROM separators;

\echo '===== tape_process_steps ====='
SELECT * FROM tape_process_steps;

\echo '===== tape_recipe_line_actuals ====='
SELECT * FROM tape_recipe_line_actuals;

\echo '===== tape_recipe_lines ====='
SELECT * FROM tape_recipe_lines;

\echo '===== tape_recipes ====='
SELECT * FROM tape_recipes;

\echo '===== tape_step_calendering ====='
SELECT * FROM tape_step_calendering;

\echo '===== tape_step_coating ====='
SELECT * FROM tape_step_coating;

\echo '===== tape_step_drying ====='
SELECT * FROM tape_step_drying;

\echo '===== tape_step_mixing ====='
SELECT * FROM tape_step_mixing;

\echo '===== tapes ====='
SELECT * FROM tapes;

\echo '===== users ====='
SELECT * FROM users;

\echo '===== wet_mixing_methods ====='
SELECT * FROM wet_mixing_methods;
