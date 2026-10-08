const express = require('express');
const authenticate = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const PartyService = require('../services/PartyService');
const createPartyController = require('../controllers/party');

// Any signed-in user can view, create and change; only admins can archive ("delete") and restore (matches Material Master). Nothing is permanently deleted.
const buildPartyRouter = (serviceOptions, label) => {
  const router = express.Router();
  const controller = createPartyController(new PartyService(serviceOptions), label);

  router.use(authenticate);
  router.get('/', controller.list);
  router.post('/', controller.create);
  // Archived routes must come before /:id so "archived" is not read as an id.
  router.get('/archived', controller.listArchived);
  router.post('/archived/:id/restore', adminOnly, controller.restore);
  router.get('/:id', controller.getById);
  router.put('/:id', controller.update);
  router.post('/:id/archive', adminOnly, controller.archive);

  return router;
};

module.exports = {
  customerRoutes: buildPartyRouter({ collectionName: 'customers', archiveCollectionName: 'customers_archive', counterName: 'customer', firstNumber: 50001 }, 'Customer'),
  supplierRoutes: buildPartyRouter({ collectionName: 'suppliers', archiveCollectionName: 'suppliers_archive', counterName: 'supplier', firstNumber: 60001 }, 'Supplier')
};
