const express = require('express');

const baseController = express.Router();

const accountsController = require('./accounts/accountsController');
const telestrationsController = require('./telestrations/telestrationsController');

baseController.use('/accounts', accountsController);
baseController.use('/telestrations', telestrationsController);

module.exports = baseController;