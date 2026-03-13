const users = require('./users');
const separators = require('./separators');
const structures = require('./structures');
const projects = require('./projects');
const materials = require('./materials');
const { materialsRouter: materialInstancesMat, materialInstancesRouter } = require('./materialInstances');
const { instanceRouter: micInstance, componentRouter: micComponent } = require('./materialInstanceComponents');
const { recipesRouter, tapeActualsRouter } = require('./recipes');
const electrolytes = require('./electrolytes');
const tapes = require('./tapes');
const tapeSteps = require('./tapeSteps');
const {
  dryingAtmospheresRouter,
  dryMixingMethodsRouter,
  wetMixingMethodsRouter,
  coatingMethodsRouter,
  foilsRouter
} = require('./references');
const { tapesRouter: electrodeCutTapes, batchesRouter, foilMeasurementsRouter } = require('./electrodeCutBatches');
const { electrodesRouter, batchElectrodesRouter, electrodeDryingRouter } = require('./electrodes');


module.exports = function registerRoutes(app) {
  // --- Simple CRUD ---
  app.use('/api/users', users);
  app.use('/api/separators', separators);
  app.use('/api/structures', structures);
  app.use('/api/projects', projects);
  app.use('/api/materials', materials);

  // --- Material instances (nested under /api/materials + /api/material-instances) ---
  app.use('/api/materials', materialInstancesMat);
  app.use('/api/material-instances', materialInstancesRouter);

  // --- Material instance components ---
  app.use('/api/material-instances', micInstance);
  app.use('/api/material-instance-components', micComponent);

  // --- Recipes ---
  app.use('/api/recipes', recipesRouter);

  // --- Electrolytes ---
  app.use('/api/electrolytes', electrolytes);

  // --- Tapes ---
  // IMPORTANT: /api/tapes/for-electrodes must be mounted BEFORE tapes CRUD
  // (otherwise "for-electrodes" would match /:id)
  app.use('/api/tapes', electrodeCutTapes);
  app.use('/api/tapes', tapeSteps);
  app.use('/api/tapes', tapeActualsRouter);
  app.use('/api/tapes', tapes);

  // --- Reference tables ---
  app.use('/api/drying-atmospheres', dryingAtmospheresRouter);
  app.use('/api/dry-mixing-methods', dryMixingMethodsRouter);
  app.use('/api/wet-mixing-methods', wetMixingMethodsRouter);
  app.use('/api/coating-methods', coatingMethodsRouter);
  app.use('/api/foils', foilsRouter);

  // --- Electrode cut batches + foil mass measurements ---
  app.use('/api/electrode-cut-batches', batchesRouter);
  app.use('/api/electrode-cut-batches', batchElectrodesRouter);
  app.use('/api/foil-measurements', foilMeasurementsRouter);

  // --- Electrodes + electrode drying ---
  app.use('/api/electrodes', electrodesRouter);
  app.use('/api/electrode-drying', electrodeDryingRouter);
};
