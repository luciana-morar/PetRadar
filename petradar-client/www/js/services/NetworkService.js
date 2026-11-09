angular.module('starter.services')
  .factory('NetworkService', function($window, $rootScope, $interval, $http, API) {
    var nav = $window.navigator;
    var state = { online: nav.onLine !== false };
    var probe;

    function ping() {
      if (nav.onLine !== false) { $http.get(API.url + '/api/ping', { timeout: 3000 }).catch(angular.noop); }
    }

    function set(value) {
      $rootScope.$evalAsync(function() {
        if (state.online === value) { return; }
        state.online = value;
        if (value) { if (probe) { $interval.cancel(probe); probe = null; } }
        else { if (!probe) { probe = $interval(ping, 4000); } }
        $rootScope.$broadcast(value ? 'network:online' : 'network:offline');
      });
    }

    state.markOnline = function() { if (nav.onLine !== false) { set(true); } };
    state.markOffline = function() { set(false); };

    $window.addEventListener('online', function() { set(true); });
    $window.addEventListener('offline', function() { set(false); });

    if (!state.online) { probe = $interval(ping, 4000); }
    return state;
  });
