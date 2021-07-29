const express = require('express');
const shortid = require('shortid');

const telestrationsController = express.Router();

const TelestrationsService = require('../../services/telestrationsService');

telestrationsController.get('/lobby/:id', async (req, res) => {
  try {
    const lobby = await TelestrationsService.getLobby(req.params.id);
    res.json(lobby);
  } catch (err) {
    res.status(500).json(err);
  }
});

telestrationsController.post('/lobby', async (req, res) => {
  try {
    const lobby = await TelestrationsService.createLobby();
    res.json(lobby);
  } catch (err) {
    res.status(500).json(err);
  }
});

telestrationsController.put('/lobby/:id/players', async (req, res) => {
  try {
    const lobby = await TelestrationsService.addOrRemovePlayerFromLobby(req.params.id, req.body);
    res.json(lobby);
  } catch (err) {
    res.status(500).json(err);
  }
});

telestrationsController.post('/lobby/:id/start', async (req, res) => {
  try {
    await TelestrationsService.startGame(req.params.id);
    res.send('Success');
  } catch (err) {
    res.status(500).json(err);
  }
});

telestrationsController.get('/lobby/:lobby_id/players/:player_id/word', async (req, res) => {
  try {
    const word = await TelestrationsService.getPlayerWord(req.params.lobby_id, req.params.player_id);

    if (!word)
      return res.status(404).json({ message: 'No word set' });

    res.send(word);
  } catch (err) {
    res.status(500).json(err);
  }
});

telestrationsController.post('/lobby/:lobby_id/players/:player_id/word', async (req, res) => {
  try {
    await TelestrationsService.setPlayerWord(req.params.lobby_id, req.params.player_id, req.body.word);
    res.send('Success');
  } catch (err) {
    res.status(500).json(err);
  }
});

telestrationsController.get(`/lobby/:id/round/:round_number`, async (req, res) => {
  try {
    const round = await TelestrationsService.getLobbyRoundForPlayer(req.params.id, req.query.playerId, req.params.round_number);
    res.json(round);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = telestrationsController;