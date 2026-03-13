const express = require('express');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// middleware
app.use(express.json());    // w/o this, req.body would be undefined
app.use(express.static('public'));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Routes
require('./routes')(app);

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
