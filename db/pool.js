const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool(config.db);

// quick check - temporary
pool.query('SELECT 1')
  .then(() => console.log('Postgres connected'))
  .catch(err => console.error('Postgres connection error', err));

module.exports = pool;
