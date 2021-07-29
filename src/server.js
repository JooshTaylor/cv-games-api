const express = require('express');
const cors = require('cors');
const { json } = require('body-parser');

const baseController = require('./controllers/baseController');
const setupSocket = require('./sockets/setupSocket');

require('./data/knex');

(async () => {
  const app = express();

  const PORT = process.env.PORT || 4000;

  const server = app.listen(PORT, () => console.log('Server running on port 4000'));
  
  app.use(cors());
  app.use(json({ limit: '50mb' }));

  app.get('/', (req, res) => res.send('cv games api running'));

  app.use('/api', baseController);
  
  setupSocket(server);
})();

