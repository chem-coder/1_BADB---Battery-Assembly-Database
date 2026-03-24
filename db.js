// Re-export the config-aware pool from db/pool.js
// All routes (Dalia's and ours) resolve here via require('../db')
module.exports = require('./db/pool');
