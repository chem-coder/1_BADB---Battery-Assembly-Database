const { Pool } = require('pg');

const pool = new Pool({
  user: 'Dalia',
  database: 'badb_app_v1'
});

module.exports = pool;
