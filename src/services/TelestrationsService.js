const shortid = require('shortid');

const db = require('../data/knex');

const LobbyStatus = require('../constants/LobbyStatus');
const socketEvents = require('../sockets/events');
const ArrayHelper = require('../utils/ArrayHelper');
const TelestrationsRoundType = require('../constants/TelestrationsRoundType');
const SocketHelper = require('../utils/SocketHelper');

const TelestrationsService = {
  async getLobby(id) {
    const lobby = await db('lobby').where({ id }).first();
    const lobbyPlayers = await db('lobby_player').where({ lobby_id: id });
    const players = await db('user').whereIn('id', lobbyPlayers.map(row => row.playerId));
  
    lobby.players = players;
  
    return lobby;
  },

  async createLobby() {
    try {
      const row = {
        id: shortid.generate(),
        status: 'WaitingForPlayers'
      }
  
      const lobbies = await db('lobby').insert(row).returning('*');
      const lobby = lobbies[0];
  
      lobby.players = [];
  
      return lobby;
    } catch (err) {
      console.log('err', err);
    }
  },

  async addOrRemovePlayerFromLobby(lobby_id, players) {
    const lobby = await TelestrationsService.getLobby(lobby_id);

    if (lobby.status !== LobbyStatus.WaitingForPlayers)
      throw new Error('Game already started');

    for (const player of players) {
      if (lobby.players.find(p => p.id === player.id)) { // If the player is already in the lobby, remove them
        await db('lobby_player').where({ lobby_id }).andWhere({ player_id: player.id }).del();
      } else { // If they aren't in the lobby, add them
        const row = {
          id: shortid.generate(),
          lobby_id,
          player_id: player.id
        };
    
        await db('lobby_player').insert(row);
      }
    }

    return await TelestrationsService.getLobby(lobby_id);
  },

  async startGame(lobby_id) {
    const lobby = await TelestrationsService.getLobby(lobby_id);

    const updateData = {
      status: LobbyStatus.InProgress,
      total_rounds: lobby.players.length,
      current_round: 1
    };

    await db('lobby').where({ id: lobby_id }).update(updateData);

    const shuffledPlayers = ArrayHelper.shuffle(lobby.players);

    for (const player of shuffledPlayers) {
      const index = shuffledPlayers.findIndex(p => p.id === player.id);

      let previousPlayer;

      if (index > 0)
        previousPlayer = shuffledPlayers[index - 1];
      else
        previousPlayer = shuffledPlayers[shuffledPlayers.length - 1];

      await db('lobby_player').where({ lobby_id }).andWhere({ player_id: player.id }).update({ previous_player_id: previousPlayer.id });

      await TelestrationsService.addRound(lobby_id, player.id, 1, TelestrationsRoundType.SelectWord);
    }

    global.io.in(lobby_id).emit(socketEvents.Telestrations.START_GAME);
  },

  async addRound(lobby_id, player_id, round_number, round_type, word = null, image_url = null) {
    const row = {
      id: shortid.generate(),
      lobby_id,
      player_id,
      round_type,
      round_number
    };

    if (word)
      row.word = word;

    if (image_url)
      row.image_url = image_url;

    await db('lobby_round').insert(row);
  },

  async getLobbyPlayer(lobby_id, player_id) {
    const lobbyPlayer = await db('lobby_player').where({ lobby_id }).andWhere({ player_id }).first();
    return lobbyPlayer;
  },

  async getPlayerWord(lobby_id, player_id) {
    const lobbyPlayer = await TelestrationsService.getLobbyPlayer(lobby_id, player_id);
    return lobbyPlayer.word;
  },

  async setPlayerWord(lobby_id, player_id, word) {
    await db('lobby_player').where({ lobby_id }).andWhere({ player_id }).update({ word });
    await db('lobby_round').where({ lobby_id }).andWhere({ player_id }).andWhere({ round_type: TelestrationsRoundType.SelectWord }).update({ word });

    const lobbyPlayerWords = await db('lobby_player').where({ lobby_id }).select('word');

    if (!lobbyPlayerWords.find(row => !row.word)) {
      await TelestrationsService.startNextRound(lobby_id);
    }
  },

  async startNextRound(lobby_id) {
    try {
      let lobby = await TelestrationsService.getLobby(lobby_id);
  
      const nextRoundNumber = lobby.currentRound + 1;
  
      // End game if the next round number is greater than the total rounds for the game
      if (nextRoundNumber > lobby.totalRounds) {
        await TelestrationsService.endGame(lobby_id);
        return;
      }
  
      await db('lobby').where({ id: lobby_id }).update({ current_round: nextRoundNumber });
  
      const nextRoundType = nextRoundNumber % 2 === 0
        ? TelestrationsRoundType.DrawWord
        : TelestrationsRoundType.GuessWord;

      const lobbyPlayers = await db('lobby_player').where({ lobby_id });

      for (const player of lobbyPlayers) {
        const previousRound = await TelestrationsService.getLobbyRoundForPlayer(lobby_id, player.previousPlayerId, lobby.currentRound);

        await TelestrationsService.addRound(lobby_id, player.playerId, nextRoundNumber, nextRoundType, previousRound.word);
      }
  
      lobby.currentRound++;
      // When the round is changed, emit an update event to all players
      SocketHelper.emitToLobby(lobby_id, socketEvents.Telestrations.UPDATE_LOBBY, lobby);
    } catch (err) {
      console.log('error', err);
    }
  },

  async endGame(lobby_id) {
    const lobby = await db('lobby').where({ id: lobby_id }).update({ status: LobbyStatus.Complete }).returning('*');
    SocketHelper.emitToLobby(lobby_id, socketEvents.Telestrations.UPDATE_LOBBY, lobby);
  },

  async getSiblingPlayers(lobby_id, player_id) {
    const lobbyPlayer = await TelestrationsHelper.getLobbyPlayer(lobby_id, player_id);
    const lobby = await TelestrationsHelper.getLobby(lobby_id);

    const nextPlayer = lobby.players.find(p => p.id === lobbyPlayer.nextPlayerId);
    const previousPlayer = lobby.players.find(p => p.id === lobbyPlayer.previousPlayerId);

    return { nextPlayer, previousPlayer };
  },

  async getLobbyRoundForPlayer(lobby_id, player_id, round_number) {
    const round = await db('lobby_round').where({ lobby_id }).andWhere({ player_id }).andWhere({ round_number }).first();
    return round;
  }
};

module.exports = TelestrationsService;