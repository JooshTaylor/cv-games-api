const express = require('express');
const shortid = require('shortid');

const telestrationsController = express.Router();

const TelestrationsService = require('../../services/TelestrationsService');

telestrationsController.get('/lobby', async (req, res) => {
  try {
    const lobbies = await TelestrationsService.getJoinableLobbies();
    res.json(lobbies);
  } catch (err) {
    res.status(500).json(err);
  }
});

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
    const lobby = await TelestrationsService.createLobby(req.body.name);
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

telestrationsController.post(`/lobby/:lobby_id/players/:player_id/round/:round_number/drawing`, async (req, res) => {
  try {
    await TelestrationsService.setDrawing(req.params.lobby_id, req.params.player_id, req.params.round_number, req.body.drawing);
    res.json('Success');
  } catch (err) {
    res.status(500).json(err);
  }
});

telestrationsController.post(`/lobby/:lobby_id/players/:player_id/round/:round_number/guess`, async (req, res) => {
  try {
    await TelestrationsService.setGuess(req.params.lobby_id, req.params.player_id, req.params.round_number, req.body.guess);
    res.json('Success');
  } catch (err) {
    res.status(500).json(err);
  }
});

telestrationsController.get(`/lobby/:lobby_id/players/:player_id/results`, async (req, res) => {
  try {
    const results = await TelestrationsService.getGameResultsForPlayer(req.params.lobby_id, req.params.player_id);
    res.json(results);
  } catch (err) {
    res.status(500).json(err);
  }
});

telestrationsController.get(`/lobby/:lobby_id/chain`, async (req, res) => {
  try {
    const chain = await TelestrationsService.getChain(req.params.lobby_id);
    res.json(chain);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = telestrationsController;