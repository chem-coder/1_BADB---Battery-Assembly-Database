const app    = require('./app');
const pool   = require('./db');
const config = require('./config');

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET must be set in production');
  process.exit(1);
}

pool.query('SELECT 1')
  .then(() => console.log('Postgres connected'))
  .catch(err => console.error('Postgres connection error', err));

app.listen(config.port, () => {
  console.log(`Listening on port ${config.port}`);
});
