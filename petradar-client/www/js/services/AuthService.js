angular.module('starter.services')
  .factory('AuthService', function($http, Store, API) {
    function field(name, fallback) { var auth = Store.get('auth', null); return auth ? auth[name] : fallback; }

    return {
      login: function(username, password) {
        return $http.post(API.url + '/api/login', { username: username, password: password }).then(function(response) {
          Store.set('auth', response.data);
          return response.data;
        });
      },
      token: function() { return field('token', null); },
      userId: function() { return field('id', null); },
      username: function() { return field('username', ''); },
      isLoggedIn: function() { return !!field('token', null); },
      clear: function() { Store.remove('auth'); }
    };
  })

  // Pune tokenul pe fiecare cerere, raporteaza starea retelei si delogheaza la 401
  // ($injector, ca sa nu depindem de servicii care la randul lor folosesc $http)
  .factory('AuthInterceptor', function($q, $injector) {
    return {
      request: function(config) {
        var token = $injector.get('AuthService').token();
        if (token) { config.headers.Authorization = 'Bearer ' + token; }
        return config;
      },
      response: function(response) {
        $injector.get('NetworkService').markOnline();
        return response;
      },
      responseError: function(response) {
        var network = $injector.get('NetworkService');
        if (response.status <= 0) { network.markOffline(); } else { network.markOnline(); }   // <= 0: nu am ajuns la server
        if (response.status === 401 && response.config.url.indexOf('/api/login') === -1) {
          $injector.get('SessionService').logout();
        }
        return $q.reject(response);
      }
    };
  })

  // Logout complet: token, socket, ecranele din cache ale utilizatorului vechi
  .factory('SessionService', function($state, $ionicHistory, AuthService, SocketService) {
    return {
      logout: function() {
        AuthService.clear();
        SocketService.disconnect();
        $ionicHistory.clearCache();
        $ionicHistory.clearHistory();
        $state.go('login');
      }
    };
  })
