module.exports = {
  port: process.env.PORT || 3000,
  db: {
    user: process.env.DB_USER || 'Dalia',
    database: process.env.DB_NAME || 'badb_v1'
    // , host: 'localhost',   // optional, default is 'localhost'
    // port: 5432             // optional, default is 5432
  }
};
