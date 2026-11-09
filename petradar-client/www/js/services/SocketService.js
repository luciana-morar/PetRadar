angular.module('starter.services')

  .factory('SocketService', function($rootScope, API, AuthService, PetRepository) {
    var socket;
    var messages = { 'pet:created': 'Alertă nouă: ', 'pet:updated': 'Alertă actualizată: ', 'pet:deleted': 'Alertă ștearsă: ' };

    return {
      connect: function() {
        if (socket || !AuthService.isLoggedIn() || typeof io === 'undefined') { return; }
        socket = io(API.url, { auth: { token: AuthService.token() } });

        Object.keys(messages).forEach(function(event) {
          socket.on(event, function(pet) {
            $rootScope.$apply(function() {
              PetRepository.applyRemote(event, pet);
              $rootScope.$broadcast('toast', messages[event] + pet.name);
            });
          });
        });
      },
      disconnect: function() {
        if (socket) { socket.disconnect(); socket = null; }
      }
    };
  });
