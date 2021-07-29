const SocketHelper = {
  emitToLobby(lobbyId, eventName, ...args) {
    global.io.in(lobbyId).emit(eventName, ...args);
  }
};

module.exports = SocketHelper;