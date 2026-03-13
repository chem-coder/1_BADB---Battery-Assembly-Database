const { Router } = require('express');
const pool = require('../db/pool');

// Each reference table gets its own router for separate mount paths
const dryingAtmospheresRouter = Router();
const dryMixingMethodsRouter = Router();
const wetMixingMethodsRouter = Router();
const coatingMethodsRouter = Router();
const foilsRouter = Router();


// -------- DRYING ATMOSPHERES (REFERENCE) --------

/*
drying_atmospheres

drying_atmosphere_id |   code   |    display    | ui_order | is_active
----------------------+----------+---------------+----------+-----------
                    1 | air      | Воздух        |        0 | t
                    2 | vacuum   | Вакуум        |        1 | t
                    3 | n2       | Азот (N₂)     |        2 | t
                    4 | ar       | Аргон (Ar)    |        3 | t
                    5 | dry_room | Сухая комната |        4 | t
*/

// READ
dryingAtmospheresRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT drying_atmosphere_id, code, display, ui_order
      FROM drying_atmospheres
      WHERE is_active = true
      ORDER BY ui_order ASC, display ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки атмосфер' });
  }
});


// -------- MIXING METHODS (REFERENCE) --------

/*
dry_mixing_methods
dry_mixing_id |     name      |         description
--------------+---------------+-----------------------------
            1 | none          | Сухую смесь не перемешивали
            2 | mortar_pestle | Вручную: ступка и пестик
            3 | spatula       | Вручную: шпателем
            4 | turbula       | Турбула / смеситель Шатца
*/

// READ: dry mixing methods
dryMixingMethodsRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT dry_mixing_id, name, description
      FROM dry_mixing_methods
      ORDER BY dry_mixing_id ASC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки dry mixing методов' });
  }
});

/*
wet_mixing_methods
wet_mixing_id |   name   |       description
---------------+----------+--------------------------
            1 | by_hand  | Вручную
            2 | mag_stir | Магнитная мешалка
            3 | gn_vm_7  | Вакуумный миксер GN-VM-7
*/

// READ: wet mixing methods
wetMixingMethodsRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT wet_mixing_id, name, description
      FROM wet_mixing_methods
      ORDER BY wet_mixing_id ASC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки wet mixing методов' });
  }
});


// -------- COATING METHODS (REFERENCE) --------

/*
coating_methods

coating_id|      name      | gap_um | coat_temp_c | coat_time_min |            comments
----------+----------------+--------+-------------+---------------+--------------------------------
        1 | dr_blade       |        |             |               | Ракель / Dr. Blade (GN-VC-15H)
        2 | coater_machine |        |             |               | Машина для намазки
*/

// READ
coatingMethodsRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT coating_id, name, gap_um, coat_temp_c, coat_time_min, comments
      FROM coating_methods
      ORDER BY coating_id ASC
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки методов намазки' });
  }
});

// -------- FOILS (REFERENCE) --------

// READ
foilsRouter.get('/', async (req, res) => {
  try {

    const { rows } = await pool.query(`
      SELECT foil_id, type
      FROM foils
      ORDER BY type
    `);

    res.json(rows);

  } catch (err) {
    console.error('Error loading foils:', err);
    res.status(500).json({ error: 'Failed to load foils' });
  }
});


module.exports = {
  dryingAtmospheresRouter,
  dryMixingMethodsRouter,
  wetMixingMethodsRouter,
  coatingMethodsRouter,
  foilsRouter
};
