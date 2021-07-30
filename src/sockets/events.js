const socketEvents = {
  Telestrations: {
    JOIN_LOBBY: 'telestrations:join:lobby',
    STARTING_GAME: 'telestrations:starting:game',
    START_GAME: 'telestrations:start:game',
    UPDATE_LOBBY: 'telestrations:update:lobby',
    WAITING_ON: 'telestrations:waiting:on'
  }
};

module.exports = socketEvents;