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

  async createLobby(name) {
    try {
      const row = {
        id: shortid.generate(),
        name,
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
      if (index > 0) {
        previousPlayer = shuffledPlayers[index - 1];
      } else {
        previousPlayer = shuffledPlayers[shuffledPlayers.length - 1];
      }

      let nextPlayer;
      if (index < shuffledPlayers.length - 1) {
        nextPlayer = shuffledPlayers[index + 1];
      } else {
        nextPlayer = shuffledPlayers[0];
      }

      await db('lobby_player')
        .where({ lobby_id })
        .andWhere({ player_id: player.id })
        .update({ previous_player_id: previousPlayer.id, next_player_id: nextPlayer.id });

      await TelestrationsService.addRound(lobby_id, player.id, 1, TelestrationsRoundType.SelectWord);
    }

    global.io.in(lobby_id).emit(socketEvents.Telestrations.START_GAME);
  },

  async addRound(lobby_id, player_id, round_number, round_type, word = null, drawing = null) {
    const row = {
      id: shortid.generate(),
      lobby_id,
      player_id,
      round_type,
      round_number
    };

    if (word)
      row.word = word;

    if (drawing)
      row.drawing = drawing;

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

    const lobby = await TelestrationsService.getLobby(lobby_id);
    const lobbyPlayers = await db('lobby_player').where({ lobby_id }).select('*');

    const usersWithoutWord = lobbyPlayers.filter(p => !p.word);

    if (!usersWithoutWord.length) {
      await TelestrationsService.startNextRound(lobby_id);
    } else {
      const waitingOn = lobby.players.filter(p => usersWithoutWord.find(u => u.playerId === p.id));
      SocketHelper.emitToLobby(lobby_id, socketEvents.Telestrations.WAITING_ON, waitingOn);
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

        const word = nextRoundType === TelestrationsRoundType.DrawWord ? previousRound.word : null;
        const drawing = nextRoundType === TelestrationsRoundType.GuessWord ? previousRound.drawing : null;

        await TelestrationsService.addRound(lobby_id, player.playerId, nextRoundNumber, nextRoundType, word, drawing);
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
    SocketHelper.emitToLobby(lobby_id, socketEvents.Telestrations.UPDATE_LOBBY, lobby[0]);
  },

  async getLobbyRoundForPlayer(lobby_id, player_id, round_number) {
    const round = await db('lobby_round').where({ lobby_id }).andWhere({ player_id }).andWhere({ round_number }).first();
    return round;
  },

  async setDrawing(lobby_id, player_id, round_number, drawing) {
    await db('lobby_round').where({ lobby_id }).andWhere({ player_id }).andWhere({ round_number }).update({ drawing });

    const rounds = await db('lobby_round').where({ lobby_id }).andWhere({ round_number }).select('*');

    const playerRoundsWithoutDrawing = rounds.filter(pr => !pr.drawing);

    if (!playerRoundsWithoutDrawing.length) {
      await TelestrationsService.startNextRound(lobby_id);
    } else {
      const lobby = await TelestrationsService.getLobby(lobby_id);
      const waitingOn = lobby.players.filter(p => playerRoundsWithoutDrawing.find(pr => pr.playerId === p.id));
      SocketHelper.emitToLobby(lobby_id, socketEvents.Telestrations.WAITING_ON, waitingOn);
    }
  },

  async setGuess(lobby_id, player_id, round_number, guess) {
    await db('lobby_round').where({ lobby_id }).andWhere({ player_id }).andWhere({ round_number }).update({ word: guess });

    const rounds = await db('lobby_round').where({ lobby_id }).andWhere({ round_number }).select('*');

    const playerRoundsWithoutGuess = rounds.filter(pr => !pr.word);

    if (!playerRoundsWithoutGuess.length) {
      await TelestrationsService.startNextRound(lobby_id);
    } else {
      const lobby = await TelestrationsService.getLobby(lobby_id);
      const waitingOn = lobby.players.filter(p => playerRoundsWithoutGuess.find(pr => pr.playerId === p.id));
      SocketHelper.emitToLobby(lobby_id, socketEvents.Telestrations.WAITING_ON, waitingOn);
    }
  },

  // Results
  async getGameResultsForPlayer(lobby_id, player_id) {
    const results = {
      lobbyId: lobby_id
    };

    const lobby = await TelestrationsService.getLobby(lobby_id);
    const lobbyPlayer = await TelestrationsService.getLobbyPlayer(lobby_id, player_id);

    results.player = lobby.players.find(p => p.id === player_id);
    results.word = lobbyPlayer.word;

    const rounds = [];

    let loop = true;
    let nextPlayerId = lobbyPlayer.nextPlayerId;
    let roundToFetch = 2;
    while (loop) {
      const nextPlayer = await TelestrationsService.getLobbyPlayer(lobby_id, nextPlayerId);
      const round = await TelestrationsService.getLobbyRoundForPlayer(lobby_id, nextPlayerId, roundToFetch);

      rounds.push({
        player: lobby.players.find(p => p.id === nextPlayerId),
        word: round.roundType === TelestrationsRoundType.GuessWord ? round.word : null,
        drawing: round.roundType === TelestrationsRoundType.DrawWord ? round.drawing : null,
      });

      nextPlayerId = nextPlayer.nextPlayerId;
      roundToFetch++;

      if (nextPlayerId === lobbyPlayer.playerId)
        loop = false;
    }

    results.rounds = rounds;

    return results;
  },

  async getJoinableLobbies() {
    const lobbies = await db('lobby').where({ status: LobbyStatus.WaitingForPlayers });
    return lobbies;
  },

  async getChain(lobby_id) {
    const lobby = await TelestrationsService.getLobby(lobby_id);
    const lobbyPlayers = await db('lobby_player').where({ lobby_id });

    const chain = Array.from(lobby.players.map(p => undefined));

    let nextEmptyIndex = 0;
    let currentPlayer = lobbyPlayers[0];
    while (chain.some(p => typeof(p) === 'undefined')) {
      chain[nextEmptyIndex] = lobby.players.find(p => p.id === currentPlayer.playerId);

      nextEmptyIndex++;
      currentPlayer = lobbyPlayers.find(p => p.playerId === currentPlayer.nextPlayerId);
    }

    return chain;
  }
};

module.exports = TelestrationsService;